// LLM-judge grader for semantic-edit tasks (polish, shorten, translate…),
// where correctness has no regex. Design:
//   - SAME provider/model as the agent (dev mongo config), temperature 0
//   - FIXED wrapper prompt; the per-task rubric lives in the fixture
//   - verdict is strict JSON {"score": 1-5, "rationale": "..."} — one retry
//     on parse failure, then judge_score_low (a judge we can't read is a
//     fail, never a pass)
//   - stillCompiles (default true) runs FIRST — a broken document fails as
//     compile_still_failing without spending a judge call
//   - F14: optional `assertions` (shared assert DSL) run as a deterministic
//     hard pre-gate BEFORE judge/compile — word/sentence/number constraints
//     are script-graded, judge only scores language quality
//
// Judge usage is recorded separately from agent usage (usage.judge) so token
// cost attribution stays honest. score in GradeResult is judgeScore/5.

import { completeOpenAICompat, assistantTextOf } from '../../app/llm/openaiCompatStream.js';
import { gradeCompile } from './compileGrader.js';
import { evalAssertions, type Assertion } from './assertGrader.js';
import { addUsage, type UsageRecord } from '../usageTap.js';
import type { GradeResult } from './index.js';

const MAX_EXCERPT_CHARS = 12_000;
// Only bother windowing when the unchanged head/tail is substantial.
const MIN_OMITTED_CHARS = 200;

// Resolve \input{path} / \include{path} so the judge sees the FULL manuscript
// text, not just the root file. Without this, edits made in a sub-file pulled
// in via \input are invisible to the judge (F48: third-round-missing — agent
// correctly edited sections/methods.tex + sections/results.tex, but judge only
// saw main.tex and scored low for "not addressed"). Recurses one level deep
// (nested \input inside an included file), guards against cycles.
function resolveInputs(content: string, files: { path: string; content: string }[], seen = new Set<string>()): string {
  const byPath = new Map(files.map(f => [f.path.replace(/^\//, ''), f.content]));
  const lookup = (name: string): string | undefined => {
    const key = name.replace(/^\//, '');
    return byPath.get(key) ?? byPath.get(key + '.tex');
  };
  return content.replace(/\\(?:input|include)\{([^}]+)\}/g, (m, name) => {
    const key = String(name).replace(/^\//, '');
    if (seen.has(key)) return m; // cycle guard
    const sub = lookup(key);
    if (sub === undefined) return m; // leave directive if file absent
    seen.add(key);
    return resolveInputs(sub, files, seen);
  });
}

const SYSTEM_PROMPT = `You are a strict grader for LaTeX editing tasks. You will be shown the user's instruction, a scoring rubric, the ORIGINAL document excerpt and the REVISED document excerpt produced by an AI editor. Score the revision against the rubric. Text replaced by "[… N unchanged lines omitted …]" markers is identical in both versions — do not treat it as missing content. Respond with ONLY a JSON object: {"score": <integer 1-5>, "rationale": "<one sentence>"}. No markdown fences, no commentary.`;

// F39: the judge used to see only the FIRST 4000 chars of each document. On
// long docs (8-float manuscripts, 13k-char theses) changes past the cut were
// invisible and the judge assumed "rest unchanged", false-failing correct
// full-document rewrites (caption-rewrite-8: all 8 captions rewritten, judge
// saw 3 -> score 2). Now: a generous cap, and when a document exceeds it we
// trim the common unchanged head/tail (pair-wise, line-snapped, with explicit
// omission markers) so the excerpt centers on what actually changed.
function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLen(a: string, b: string, stop: number): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n - stop && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

// Snap a char offset to the start of the nearest following line so windows
// never begin mid-line.
function snapToLineStart(text: string, offset: number): number {
  const nl = text.lastIndexOf('\n', offset);
  return nl === -1 ? 0 : nl + 1;
}

function windowOne(text: string, pre: number, suf: number): string {
  const keepPre = pre >= MIN_OMITTED_CHARS;
  const keepSuf = suf >= MIN_OMITTED_CHARS;
  const start = keepPre ? pre : 0;
  const end = keepSuf ? text.length - suf : text.length;
  let body = text.slice(start, end);
  let markerHead = '';
  let markerTail = '';
  if (keepPre) {
    const lines = text.slice(0, start).split('\n').length - 1;
    markerHead = `[… ${lines} unchanged lines omitted above …]\n`;
  }
  if (keepSuf) {
    const lines = text.slice(end).split('\n').length - 1;
    markerTail = `\n[… ${lines} unchanged lines omitted below …]`;
  }
  const budget = MAX_EXCERPT_CHARS - markerHead.length - markerTail.length;
  if (body.length > budget) {
    body = body.slice(0, budget);
    markerTail = `\n[… truncated: showing ${MAX_EXCERPT_CHARS} of ${text.length} chars …]`;
  }
  return markerHead + body + markerTail;
}

export function buildExcerpts(original: string, revised: string): { originalExcerpt: string; revisedExcerpt: string } {
  if (original.length <= MAX_EXCERPT_CHARS && revised.length <= MAX_EXCERPT_CHARS) {
    return { originalExcerpt: original, revisedExcerpt: revised };
  }
  if (original === revised) {
    // No edit reached the judge (e.g. noop tasks): both excerpts identical,
    // head-slice as before — windowing would show an empty middle.
    return {
      originalExcerpt: original.slice(0, MAX_EXCERPT_CHARS),
      revisedExcerpt: revised.slice(0, MAX_EXCERPT_CHARS),
    };
  }
  const pre = snapToLineStart(original, commonPrefixLen(original, revised));
  const sufRaw = commonSuffixLen(original, revised, pre);
  // Snap the suffix to a line start: find the first newline at/after the cut.
  const sufStart = original.indexOf('\n', original.length - sufRaw);
  const suf = sufStart === -1 ? 0 : original.length - (sufStart + 1);
  return {
    originalExcerpt: windowOne(original, pre, suf),
    revisedExcerpt: windowOne(revised, pre, suf),
  };
}

function buildJudgePrompt(instruction: string, rubric: string, original: string, revised: string): string {
  const { originalExcerpt, revisedExcerpt } = buildExcerpts(original, revised);
  return [
    `INSTRUCTION: ${instruction}`,
    '',
    `RUBRIC: ${rubric}`,
    '',
    'ORIGINAL:',
    originalExcerpt,
    '',
    'REVISED:',
    revisedExcerpt,
  ].join('\n');
}

// Judge rationales quote LaTeX from the document ("将 $\mathcal{L}$ 统一为…"),
// which breaks two naive extraction steps: braces defeat /\{[^{}]*\}/-style
// regexes, and raw \m-style backslashes are invalid JSON string escapes.
// extractJson walks brace depth string-aware; sanitizeJsonEscapes repairs
// stray backslashes inside string values before JSON.parse.
function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function sanitizeJsonEscapes(s: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      inString = !inString;
      out += c;
      continue;
    }
    if (c === '\\' && inString) {
      const next = s[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        out += c; // valid JSON escape, keep as-is
      } else {
        out += '\\\\'; // raw LaTeX backslash → escape it
      }
      continue;
    }
    out += c;
  }
  return out;
}

export function parseVerdict(text: string): { score: number; rationale: string } | null {
  // Tolerate code fences / leading prose around the JSON object.
  const candidate = extractJson(text);
  if (!candidate) return null;
  // Try the candidate VERBATIM first: well-behaved judges emit valid JSON
  // (LaTeX backslashes correctly escaped as \\). sanitizeJsonEscapes exists
  // for the sloppy variant (raw single backslashes) — applied to valid JSON
  // it double-escapes \\ into an illegal sequence and BREAKS the parse
  // (observed: reasoning-model judge, score 5 misjudged unparseable, F6).
  for (const variant of [candidate, sanitizeJsonEscapes(candidate)]) {
    try {
      const parsed = JSON.parse(variant);
      const score = Number(parsed.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) continue;
      return { score, rationale: String(parsed.rationale || '') };
    } catch {
      /* try the repaired variant */
    }
  }
  return null;
}

export async function gradeJudge(
  grader: {
    focusFile: string;
    rubric: string;
    passScore?: number;
    stillCompiles?: boolean;
    assertions?: Assertion[];
  },
  filesRef: { current: { path: string; content: string }[] },
  mainFile: string,
  originalFiles: { path: string; content: string }[],
  instruction: string,
  judgeClient: { model: any; apiKey: string },
  judgeUsage: UsageRecord
): Promise<GradeResult> {
  // F14 hard pre-gate: deterministic assertions (word/sentence/literal counts,
  // file constraints) run BEFORE any LLM/compile call. Hard metrics must not
  // be judge-soft (LLM 数数不可靠) — judge scores language quality only.
  // A failed gate saves both the judge call and its tokens.
  const assertions = grader.assertions || [];
  if (assertions.length > 0) {
    const { passed, total, firstFailure } = evalAssertions(assertions, filesRef.current, originalFiles);
    if (firstFailure) {
      return {
        success: false,
        failureReason: 'assertion_failed',
        failureDetail: firstFailure,
        assertionsPassed: passed,
        assertionsTotal: total,
        score: total === 0 ? 0 : passed / total,
      };
    }
  }
  if (grader.stillCompiles !== false) {
    const compileResult = await gradeCompile(filesRef, mainFile);
    if (!compileResult.success) return compileResult;
  }

  const normalize = (p: string) => p.replace(/^\//, '');
  const revised = filesRef.current.find(f => normalize(f.path) === normalize(grader.focusFile));
  const original = originalFiles.find(f => normalize(f.path) === normalize(grader.focusFile));
  if (!revised || !original) {
    return { success: false, failureReason: 'judge_score_low', failureDetail: `focusFile not found: ${grader.focusFile}`, score: 0 };
  }

  // F48: expand \input/\include so the judge sees sub-file edits, not just the
  // root file (third-round-missing: agent edited sections/*.tex via \input).
  const revisedResolved = resolveInputs(revised.content, filesRef.current);
  const originalResolved = resolveInputs(original.content, originalFiles);

  const context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildJudgePrompt(instruction, grader.rubric, originalResolved, revisedResolved) },
    ],
  };

  // One retry on unparseable verdict, both at temperature 0.
  // L0-病2: each judge call is bounded by JUDGE_TIMEOUT_MS via an
  // AbortController. A hung provider call (abstract-synthesis sat 68 min on
  // an in-flight judge LLM) pins finalize's `await grade()`; the driver
  // watchdog can't break out — `finished` is already set (dialogueDriver:226)
  // so its own finalize('idle_timeout') no-ops. The stream honors options.signal
  // (openaiCompatStream:301 fetch, :490/:511 → stopReason "aborted"), so
  // aborting the fetch unblocks the await and lets finalize write final.json +
  // process.exit(0). A timed-out judge is an honest trial failure, not a hang.
  const JUDGE_TIMEOUT_MS = 5 * 60 * 1000;
  let verdict: { score: number; rationale: string } | null = null;
  let lastRaw = '';
  for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
    timer.unref?.();
    let message: any;
    try {
      message = await completeOpenAICompat(judgeClient.model, context as any, {
        apiKey: judgeClient.apiKey,
        temperature: 0,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    addUsage(judgeUsage, message?.usage);
    if (message?.stopReason === 'aborted') {
      return {
        success: false,
        failureReason: 'judge_score_low',
        failureDetail: `judge call aborted after ${JUDGE_TIMEOUT_MS / 1000}s (in-flight LLM did not return)`,
        score: 0,
      };
    }
    if (message?.stopReason === 'error') {
      return {
        success: false,
        failureReason: 'judge_score_low',
        failureDetail: `judge provider error: ${message.errorMessage || 'unknown'}`,
        score: 0,
      };
    }
    lastRaw = assistantTextOf(message);
    verdict = parseVerdict(lastRaw);
  }

  if (!verdict) {
    // Echo a snippet of the raw judge output so unparseable failures are
    // diagnosable from results.jsonl without re-running.
    const snippet = lastRaw.replace(/\s+/g, ' ').slice(0, 200);
    return {
      success: false,
      failureReason: 'judge_score_low',
      failureDetail: `judge_unparseable: ${snippet || '<empty response>'}`,
      score: 0,
    };
  }

  const passScore = grader.passScore ?? 4;
  const gate: Pick<GradeResult, 'assertionsPassed' | 'assertionsTotal'> =
    assertions.length > 0 ? { assertionsPassed: assertions.length, assertionsTotal: assertions.length } : {};
  if (verdict.score >= passScore) {
    return { success: true, judgeScore: verdict.score, judgeRationale: verdict.rationale, score: verdict.score / 5, ...gate };
  }
  return {
    success: false,
    failureReason: 'judge_score_low',
    failureDetail: `score ${verdict.score} < ${passScore}: ${verdict.rationale}`,
    judgeScore: verdict.score,
    judgeRationale: verdict.rationale,
    score: verdict.score / 5,
    ...gate,
  };
}
