// Node grader: deterministic per-tool-call diagnostics over the RAW trace
// (rawTrace.ts), complementing traceGrader's fixture-declared assertions.
// traceGrader answers "did this task's behavioral floors/ceilings hold";
// nodeGrader answers "which individual calls were blind / redundant / stuck"
// — no fixture authoring needed, every run gets it for free.
//
// IRON RULE: diagnostics only — a finding NEVER flips trial success. The
// outcome grader owns pass/fail; node verdicts exist to localize efficiency
// and discipline problems inside a trajectory (which call, which turn, why).
//
// Event order: rules walk events in SEQ order (call order — the order the
// agent issued calls), not endSeq (completion order). Causality for
// "did the agent read before patching" is the issuing order; parallel-batch
// completion order is an execution artifact (A1).
//
// Five rules (all deterministic, no model calls):
//   patch-before-read (major)   — submit_patch whose hunk target file
//       (hunk.file ?? mainFile) has NO prior ok read_file /
//       read_file_fragment. Applies whatever the patch's own outcome was:
//       a blind patch attempt is blind even when dry-run rejects it.
//   compile-without-change (minor) — compile_project with no ok (accepted,
//       not dry-run-rejected) submit_patch between it and the previous
//       compile_project (or the trajectory start). Compiling an unchanged
//       project re-measures a known state. (The FIRST compile of a compile
//       task trips this by construction — pre-edit ground truth gathering;
//       it is minor and never flips anything.)
//   repeat-identical-call (major) — same name+argsKey (key-order-insensitive
//       fingerprint, F5) from the 3rd occurrence onward. Same query, same
//       result, no progress = stuck loop.
//   redundant-reread (minor) — same read tool on the same path read again
//       with no ok patch to that file in between (a patch invalidates prior
//       content — re-reading after an edit is legitimate). read_file has no
//       range condition (a limit-ed read still re-costs the call);
//       read_file_fragment requires the line ranges to INTERSECT. Only ok
//       reads participate (an errored read delivered no content).
//   error-ignored (major) — event[i] isError and event[i+1] is a VERBATIM
//       retry (same name, same argsKey). Retrying after changing the args or
//       switching tools is RECOVERY (counts into errorRecoveryRate's
//       numerator), not a finding. An error as the last event is neither.

import type { RawToolEvent } from '../rawTrace.js';

export type NodeRule =
  | 'patch-before-read'
  | 'compile-without-change'
  | 'repeat-identical-call'
  | 'redundant-reread'
  | 'error-ignored';

export type NodeSeverity = 'major' | 'minor';

export interface NodeVerdict {
  seq: number; // the event the finding attaches to
  turn: number;
  tool: string;
  rule: NodeRule;
  severity: NodeSeverity;
  detail: string;
}

export interface NodeRates {
  totalCalls: number;
  necessaryRate: number | null; // calls with NO finding / total (null when 0 calls)
  redundancyRate: number | null; // repeat-identical + redundant-reread / total
  errorRecoveryRate: number | null; // recovered errors / error events (null when none)
  patchBeforeReadCount: number;
}

export interface NodeGradeResult {
  nodes: NodeVerdict[];
  rates: NodeRates;
  findingCounts: Record<string, number>; // '<rule>:<severity>' → count
}

const READ_TOOLS = new Set(['read_file', 'read_file_fragment']);

function normalizePath(p: string): string {
  return String(p || '').replace(/^\//, '');
}

// Files a submit_patch event targets: hunk.file ?? mainFile (patchApplier
// semantics), normalized.
function patchTargets(evt: RawToolEvent, mainFile: string): string[] {
  const hunks = Array.isArray(evt.args?.hunks) ? evt.args.hunks : [];
  const targets = new Set<string>();
  for (const h of hunks) {
    targets.add(normalizePath(typeof h?.file === 'string' && h.file ? h.file : mainFile));
  }
  if (targets.size === 0) targets.add(normalizePath(mainFile));
  return [...targets];
}

export function gradeNodes(events: RawToolEvent[], { mainFile }: { mainFile: string }): NodeGradeResult {
  const ordered = [...(events || [])].sort((a, b) => a.seq - b.seq);
  const nodes: NodeVerdict[] = [];
  const main = normalizePath(mainFile);

  // ---- per-rule walking state ----
  const okReadPaths = new Set<string>(); // patch-before-read
  // redundant-reread: per `${tool}:${path}` the ranges read since the last ok
  // patch to that path (read_file → [null] full-file marker).
  const readHistory = new Map<string, ({ s: number; e: number } | null)[]>();
  const identicalCounts = new Map<string, number>(); // repeat-identical
  let okPatchSinceLastCompile = false; // compile-without-change

  const push = (evt: RawToolEvent, rule: NodeRule, severity: NodeSeverity, detail: string) =>
    nodes.push({ seq: evt.seq, turn: evt.turn, tool: evt.name, rule, severity, detail });

  for (let i = 0; i < ordered.length; i++) {
    const evt = ordered[i];

    // error-ignored: THIS event is a verbatim retry of an errored predecessor.
    if (i > 0) {
      const prev = ordered[i - 1];
      if (prev.isError && prev.name === evt.name && prev.argsKey === evt.argsKey) {
        push(evt, 'error-ignored', 'major', `verbatim retry of the errored ${evt.name} call (seq ${prev.seq}) — the error was not acted on`);
      }
    }

    // repeat-identical-call: 3rd occurrence onward.
    const identKey = `${evt.name} ${evt.argsKey}`;
    const seen = (identicalCounts.get(identKey) || 0) + 1;
    identicalCounts.set(identKey, seen);
    if (seen >= 3) {
      push(evt, 'repeat-identical-call', 'major', `${evt.name} called ${seen}x with identical arguments`);
    }

    if (evt.name === 'submit_patch') {
      // patch-before-read.
      const targets = patchTargets(evt, main);
      const unread = targets.filter(t => !okReadPaths.has(t));
      if (unread.length > 0) {
        push(evt, 'patch-before-read', 'major', `submit_patch targets ${unread.join(', ')} with no prior ok read_file/read_file_fragment of that file`);
      }
      // An accepted patch invalidates read history for its targets.
      if (evt.ok) {
        okPatchSinceLastCompile = true;
        for (const t of targets) {
          readHistory.delete(`read_file:${t}`);
          readHistory.delete(`read_file_fragment:${t}`);
        }
      }
    }

    if (evt.name === 'compile_project') {
      if (!okPatchSinceLastCompile) {
        push(evt, 'compile-without-change', 'minor', 'compile_project with no accepted submit_patch since the previous compile (or trajectory start) — re-measuring an unchanged project');
      }
      okPatchSinceLastCompile = false;
    }

    if (READ_TOOLS.has(evt.name)) {
      const path = normalizePath(evt.args?.path ?? '');
      if (evt.ok) {
        okReadPaths.add(path);
        const key = `${evt.name}:${path}`;
        const history = readHistory.get(key) || [];
        if (evt.name === 'read_file') {
          if (history.length > 0) {
            push(evt, 'redundant-reread', 'minor', `read_file('${path}') again with no accepted patch to it in between (${history.length + 1} reads)`);
          }
          history.push(null); // full-file marker
        } else {
          const s = Number(evt.args?.startLine) || 0;
          const e = Number(evt.args?.endLine) || 0;
          const overlap = history.some(r => r !== null && r.s <= e && s <= r.e);
          if (overlap) {
            push(evt, 'redundant-reread', 'minor', `read_file_fragment('${path}', ${s}-${e}) overlaps an earlier fragment with no accepted patch in between`);
          }
          history.push({ s, e });
        }
        readHistory.set(key, history);
      }
    }
  }

  // ---- rates ----
  const flagged = new Map<number, Set<NodeRule>>();
  for (const n of nodes) {
    const rules = flagged.get(n.seq) || new Set<NodeRule>();
    rules.add(n.rule);
    flagged.set(n.seq, rules);
  }
  const totalCalls = ordered.length;
  const redundantSeqs = [...flagged.entries()].filter(([, rules]) => rules.has('repeat-identical-call') || rules.has('redundant-reread'));

  const errorEvents = ordered.filter(e => e.isError);
  let recovered = 0;
  for (const e of errorEvents) {
    const idx = ordered.indexOf(e);
    const next = ordered[idx + 1];
    if (next && !(next.name === e.name && next.argsKey === e.argsKey)) recovered++;
  }

  const findingCounts: Record<string, number> = {};
  for (const n of nodes) {
    const key = `${n.rule}:${n.severity}`;
    findingCounts[key] = (findingCounts[key] || 0) + 1;
  }

  return {
    nodes,
    rates: {
      totalCalls,
      necessaryRate: totalCalls === 0 ? null : (totalCalls - flagged.size) / totalCalls,
      redundancyRate: totalCalls === 0 ? null : redundantSeqs.length / totalCalls,
      errorRecoveryRate: errorEvents.length === 0 ? null : recovered / errorEvents.length,
      patchBeforeReadCount: nodes.filter(n => n.rule === 'patch-before-read').length,
    },
    findingCounts,
  };
}
