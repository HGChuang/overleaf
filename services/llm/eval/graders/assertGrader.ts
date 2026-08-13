// Assert grader: deterministic spot-checks on the final file contents for
// structure-rewrite tasks ("所有 \textbf 换 \emph", "label 批量重命名").
//
// Assertion DSL (evaluated in order, first failure wins):
//   {kind:'count', file, pattern, op:'eq'|'gte'|'lte', count}
//       — number of regex (flag 'g') matches vs expected count
//   {kind:'order', file, patterns:[a, b]}
//       — first match of a must exist and precede first match of b
//
// F13 (instruction constraints must be gradeable — Q1 实锤: "不许新建文件"
// was ungradeable with count/order alone):
//   {kind:'file-exists', file}        — file present in the final project
//   {kind:'file-not-exists', file}    — file absent (the "do NOT create" gate)
//   {kind:'file-count', op, count}    — total project file count vs expected
//   {kind:'unchanged-file', file}     — byte-identical to the initial snapshot
//       ("不许动这个文件" / collateral-damage guard; needs originalFiles)
//
// F14 (hard metrics must not be judge-soft — LLM 数数不可靠):
//   {kind:'literal-count', file, literal, op, count}
//       — plain-string occurrences, NO regex semantics (数字/措辞原样保留;
//         avoids F1-style regex-escaping pitfalls)
//   {kind:'word-count', file, op, count, stripLatex?}
//       — deterministic word count (latin token = 1, CJK char = 1)
//   {kind:'sentence-count', file, op, count, stripLatex?}
//       — sentence-ending punctuation groups [.!?。！？]+
//
// The DSL is shared: judge fixtures may also carry `assertions` as a hard
// pre-gate (see judgeGrader) — semantic tasks keep judge for language quality
// but word/sentence/number constraints grade deterministically.
//
// stillCompiles (default true): after assertions pass, the final files must
// also compile clean — a rewrite that breaks the document is a failure
// (compile_still_failing), even if the regex counts look right.
//
// PARTIAL CREDIT: even when a single failing assertion flips binary success,
// GradeResult carries assertionsPassed/assertionsTotal and score (0..1) so
// "2/3 断言通过 → 3/3" 的爬坡进步在指标上可见。

import { gradeCompile } from './compileGrader.js';
import type { GradeResult } from './index.js';

interface CountAssertion {
  kind: 'count';
  file: string;
  pattern: string;
  op: 'eq' | 'gte' | 'lte';
  count: number;
}

interface OrderAssertion {
  kind: 'order';
  file: string;
  patterns: [string, string];
}

interface LiteralCountAssertion {
  kind: 'literal-count';
  file: string;
  literal: string;
  op: 'eq' | 'gte' | 'lte';
  count: number;
}

interface WordCountAssertion {
  kind: 'word-count';
  file: string;
  op: 'eq' | 'gte' | 'lte';
  count: number;
  stripLatex?: boolean; // default true
}

interface SentenceCountAssertion {
  kind: 'sentence-count';
  file: string;
  op: 'eq' | 'gte' | 'lte';
  count: number;
  stripLatex?: boolean; // default true
}

interface FileExistsAssertion {
  kind: 'file-exists';
  file: string;
}

interface FileNotExistsAssertion {
  kind: 'file-not-exists';
  file: string;
}

interface FileCountAssertion {
  kind: 'file-count';
  op: 'eq' | 'gte' | 'lte';
  count: number;
}

interface UnchangedFileAssertion {
  kind: 'unchanged-file';
  file: string;
}

export type Assertion =
  | CountAssertion
  | OrderAssertion
  | LiteralCountAssertion
  | WordCountAssertion
  | SentenceCountAssertion
  | FileExistsAssertion
  | FileNotExistsAssertion
  | FileCountAssertion
  | UnchangedFileAssertion;

function normalizePath(p: string): string {
  return p.replace(/^\//, '');
}

function cmp(op: 'eq' | 'gte' | 'lte', actual: number, expected: number): boolean {
  return op === 'eq' ? actual === expected : op === 'gte' ? actual >= expected : actual <= expected;
}

// Deterministic text metrics (F14). Deliberately simple and documented —
// fixture authors calibrate expected counts against THIS implementation
// (validateFixtures mirrors it via the same functions, no drift).
//
// stripLatex removes: comments (unescaped %), display/inline math, environment
// markers, command names (brace CONTENTS are kept — \section{Intro} → Intro),
// braces and escaped chars. What remains approximates the readable text.
export function stripLatex(text: string): string {
  return text
    .replace(/(?<!\\)%.*/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\\[([\s\S]*?)\\\]/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/\\./g, ' ')
    .replace(/[{}]/g, ' ');
}

export function countWords(text: string): number {
  const latin = text.match(/[A-Za-z0-9]+(?:[’'\-][A-Za-z0-9]+)*/g) || [];
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || [];
  return latin.length + cjk.length;
}

export function countSentences(text: string): number {
  return (text.match(/[.!?。！？]+/g) || []).length;
}

export function countLiteral(text: string, literal: string): number {
  if (!literal) return 0;
  let n = 0;
  let i = 0;
  while ((i = text.indexOf(literal, i)) !== -1) {
    n++;
    i += literal.length;
  }
  return n;
}

// null = holds; string = failure detail.
function evalAssertion(
  assertion: Assertion,
  files: { path: string; content: string }[],
  originalFiles?: { path: string; content: string }[]
): string | null {
  const file = files.find(f => normalizePath(f.path) === normalizePath((assertion as any).file || ''));

  switch (assertion.kind) {
    case 'file-exists':
      return file ? null : `file not found: ${assertion.file}`;
    case 'file-not-exists':
      return file ? `expected absent but exists: ${assertion.file}` : null;
    case 'file-count': {
      const actual = files.length;
      return cmp(assertion.op, actual, assertion.count)
        ? null
        : `project file count ${assertion.op} ${assertion.count} — actual ${actual}`;
    }
    case 'unchanged-file': {
      if (!file) return `file not found: ${assertion.file}`;
      const orig = (originalFiles || []).find(f => normalizePath(f.path) === normalizePath(assertion.file));
      if (!orig) return `${assertion.file}: not present in original snapshot — cannot check unchanged`;
      return file.content === orig.content
        ? null
        : `${assertion.file}: expected unchanged but content differs`;
    }
  }

  if (!file) {
    return `file not found: ${(assertion as any).file}`;
  }
  const content = file.content;

  switch (assertion.kind) {
    case 'count': {
      const actual = (content.match(new RegExp(assertion.pattern, 'g')) || []).length;
      return cmp(assertion.op, actual, assertion.count)
        ? null
        : `${assertion.file}: /${assertion.pattern}/ ${assertion.op} ${assertion.count} — actual ${actual}`;
    }
    case 'order': {
      const [a, b] = assertion.patterns;
      const ia = content.search(new RegExp(a));
      const ib = content.search(new RegExp(b));
      return ia !== -1 && ib !== -1 && ia < ib
        ? null
        : `${assertion.file}: expected /${a}/ before /${b}/ (found at ${ia}, ${ib})`;
    }
    case 'literal-count': {
      const actual = countLiteral(content, assertion.literal);
      return cmp(assertion.op, actual, assertion.count)
        ? null
        : `${assertion.file}: literal "${assertion.literal}" ${assertion.op} ${assertion.count} — actual ${actual}`;
    }
    case 'word-count': {
      const text = assertion.stripLatex === false ? content : stripLatex(content);
      const actual = countWords(text);
      return cmp(assertion.op, actual, assertion.count)
        ? null
        : `${assertion.file}: word count ${assertion.op} ${assertion.count} — actual ${actual}`;
    }
    case 'sentence-count': {
      const text = assertion.stripLatex === false ? content : stripLatex(content);
      const actual = countSentences(text);
      return cmp(assertion.op, actual, assertion.count)
        ? null
        : `${assertion.file}: sentence count ${assertion.op} ${assertion.count} — actual ${actual}`;
    }
  }
}

export interface AssertionEvalSummary {
  passed: number;
  total: number;
  firstFailure: string | null;
}

// Shared by gradeAssert (structure tasks) and gradeJudge (F14 hard pre-gate).
export function evalAssertions(
  assertions: Assertion[],
  files: { path: string; content: string }[],
  originalFiles?: { path: string; content: string }[]
): AssertionEvalSummary {
  let passed = 0;
  let firstFailure: string | null = null;
  for (const assertion of assertions) {
    const failure = evalAssertion(assertion, files, originalFiles);
    if (failure) {
      if (!firstFailure) firstFailure = failure;
    } else {
      passed++;
    }
  }
  return { passed, total: assertions.length, firstFailure };
}

// Initial-snapshot check for validateFixtures: does the assertion already
// hold BEFORE the agent acts? (unchanged-file trivially holds; file-not-exists
// holds when absent — both correct.)
export function assertionHolds(assertion: Assertion, files: { path: string; content: string }[]): boolean {
  try {
    return evalAssertion(assertion, files, files) === null;
  } catch {
    return false;
  }
}

export async function gradeAssert(
  grader: { assertions: Assertion[]; stillCompiles?: boolean },
  filesRef: { current: { path: string; content: string }[] },
  mainFile: string,
  originalFiles?: { path: string; content: string }[]
): Promise<GradeResult> {
  const assertions = grader.assertions || [];
  const { passed, total, firstFailure } = evalAssertions(assertions, filesRef.current, originalFiles);
  const partial: Pick<GradeResult, 'assertionsPassed' | 'assertionsTotal' | 'score'> = {
    assertionsPassed: passed,
    assertionsTotal: total,
    score: total === 0 ? 0 : passed / total,
  };
  if (firstFailure) {
    return {
      success: false,
      failureReason: 'assertion_failed',
      failureDetail: firstFailure,
      ...partial,
    };
  }
  if (grader.stillCompiles !== false) {
    const compileResult = await gradeCompile(filesRef, mainFile);
    if (!compileResult.success) {
      return { ...compileResult, ...partial, score: partial.score };
    }
  }
  return { success: true, ...partial, score: 1 };
}
