// Trace grader: TRAJECTORY assertions — grading how the agent behaved, not
// only what it produced. Outcome graders (compile/assert/judge/noop) judge
// the final file state; trace assertions judge the path taken.
//
// The Anthropic agent-evals article warns "grade what the agent produced,
// not the path it took" — i.e. NEVER script the exact tool sequence. These
// assertions are therefore BEHAVIORAL FLOORS/CEILINGS, not path scripts:
//
//   {kind:'tool-called', tool, minCalls?}   — the tool MUST be called
//       ≥minCalls times (default 1). Floor check the outcome cannot see:
//       "a compile fix must verify via compile_project" — a lucky correct
//       guess is not a repair.
//   {kind:'tool-call-limit', tool, max}     — AT MOST max calls. Anti-flail
//       guard (redundant re-reads/re-compiles). max:0 = "must never call"
//       (e.g. submit_patch on a Q&A task).
//   {kind:'max-turns', max}                 — total agent turns ≤ max.
//   {kind:'no-repeat-call', tool?, maxIdentical}
//       — the same tool called with IDENTICAL arguments >maxIdentical times
//       IN A ROW is a stuck loop (same query, same result, no progress).
//       CONSECUTIVE-window semantics: any intervening call with a different
//       name or different arguments resets the streak — e.g. compile_project
//       (args always {}) once per edit round in a multi-turn dialogue is
//       healthy iteration, not a loop (F26's "zero progress" definition).
//       Reads the toolCall blocks from the transcript; tool omitted →
//       applies to all.
//
// Wiring (runner.ts): trace assertions run AFTER outcome grading and
// transcript readback (no-repeat-call needs the transcript). They only FLIP
// a passing trial to failure (trace_assertion_failed) — an already-failing
// trial keeps its outcome failureReason, since the outcome stays the primary
// attribution; the trace tally is still recorded (tracePassed/traceTotal)
// for analysis either way.
//
// Fixture schema: top-level `traceAssertions` array — orthogonal to
// grader.type, any grader may carry them.

export interface ToolCalledAssertion {
  kind: 'tool-called';
  tool: string;
  minCalls?: number; // default 1
}

export interface ToolCallLimitAssertion {
  kind: 'tool-call-limit';
  tool: string;
  max: number; // 0 = must never call
}

export interface MaxTurnsAssertion {
  kind: 'max-turns';
  max: number;
}

export interface NoRepeatCallAssertion {
  kind: 'no-repeat-call';
  tool?: string; // omitted → any tool
  maxIdentical: number;
}

export type TraceAssertion =
  | ToolCalledAssertion
  | ToolCallLimitAssertion
  | MaxTurnsAssertion
  | NoRepeatCallAssertion;

export interface TraceContext {
  toolCalls: Record<string, number>; // tool_end event tallies from the run
  turns: number;
  transcript: any[]; // memory-store messages; assistant content carries toolCall blocks
}

export interface TraceEvalSummary {
  passed: number;
  total: number;
  firstFailure: string | null;
}

// Key-order-insensitive stable stringify: argument key ORDER must not change
// the fingerprint (the model may emit keys in any order across trials).
export function stableStringify(value: any): string {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

// (name, argsFingerprint) pairs from assistant toolCall blocks. Other roles
// (user, toolResult) carry no call arguments — toolResult.details are
// tool-specific output, not the call.
function extractCalls(transcript: any[]): { name: string; argsKey: string }[] {
  const calls: { name: string; argsKey: string }[] = [];
  for (const m of transcript || []) {
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block?.type === 'toolCall' && typeof block.name === 'string') {
        calls.push({ name: block.name, argsKey: stableStringify(block.arguments ?? {}) });
      }
    }
  }
  return calls;
}

function summarizeArgs(argsKey: string): string {
  return argsKey.length > 80 ? `${argsKey.slice(0, 77)}...` : argsKey;
}

function evalOne(a: TraceAssertion, ctx: TraceContext): string | null {
  switch (a.kind) {
    case 'tool-called': {
      const min = a.minCalls ?? 1;
      const actual = ctx.toolCalls[a.tool] || 0;
      return actual >= min ? null : `tool '${a.tool}' called ${actual}x — required >=${min}`;
    }
    case 'tool-call-limit': {
      const actual = ctx.toolCalls[a.tool] || 0;
      return actual <= a.max ? null : `tool '${a.tool}' called ${actual}x — allowed <=${a.max}`;
    }
    case 'max-turns': {
      return ctx.turns <= a.max ? null : `agent used ${ctx.turns} turns — allowed <=${a.max}`;
    }
    case 'no-repeat-call': {
      // CONSECUTIVE window: a stuck loop is the same (name, args) call
      // repeated >maxIdentical times IN A ROW. Any intervening call with a
      // different name or different argsKey resets the streak — cumulative
      // repeats across the whole run are fine when other work happens in
      // between (compile_project {} once per edit round is the canonical
      // case). When a.tool scopes the assertion, out-of-scope calls still
      // reset the window (they are intervening different-name calls).
      let lastKey: string | null = null;
      let streak = 0;
      for (const c of extractCalls(ctx.transcript)) {
        const key = `${c.name}${c.argsKey}`;
        if (key !== lastKey) {
          lastKey = key;
          streak = 0;
        }
        if (a.tool && c.name !== a.tool) continue;
        streak++;
        if (streak > a.maxIdentical) {
          return `stuck loop: '${c.name}' called ${streak}x consecutively with identical arguments ${summarizeArgs(c.argsKey)} — allowed <=${a.maxIdentical}`;
        }
      }
      return null;
    }
  }
}

export function evalTraceAssertions(assertions: TraceAssertion[], ctx: TraceContext): TraceEvalSummary {
  let passed = 0;
  let firstFailure: string | null = null;
  for (const a of assertions || []) {
    const failure = evalOne(a, ctx);
    if (failure) {
      if (!firstFailure) firstFailure = failure;
    } else {
      passed++;
    }
  }
  return { passed, total: (assertions || []).length, firstFailure };
}

// Structure-only schema check for validateFixtures. Tool-name validity is
// deliberately NOT checked here — the tool set evolves with the agent, and a
// misspelled name surfaces as an always-failing (or always-passing, for
// limits) assertion in the first run, which rule 4 ("0% pass — suspect the
// task first") already covers.
export function validateTraceAssertionsShape(assertions: any[]): string[] {
  const problems: string[] = [];
  for (const [i, a] of assertions.entries()) {
    const where = `traceAssertions[${i}]`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      problems.push(`${where}: must be an object`);
      continue;
    }
    switch (a.kind) {
      case 'tool-called':
        if (typeof a.tool !== 'string' || !a.tool) problems.push(`${where}: tool must be a non-empty string`);
        if (a.minCalls !== undefined && (!Number.isInteger(a.minCalls) || a.minCalls < 1)) {
          problems.push(`${where}: minCalls must be an integer >=1`);
        }
        break;
      case 'tool-call-limit':
        if (typeof a.tool !== 'string' || !a.tool) problems.push(`${where}: tool must be a non-empty string`);
        if (!Number.isInteger(a.max) || a.max < 0) problems.push(`${where}: max must be an integer >=0`);
        break;
      case 'max-turns':
        if (!Number.isInteger(a.max) || a.max < 1) problems.push(`${where}: max must be an integer >=1`);
        break;
      case 'no-repeat-call':
        if (a.tool !== undefined && (typeof a.tool !== 'string' || !a.tool)) {
          problems.push(`${where}: tool, if present, must be a non-empty string`);
        }
        if (!Number.isInteger(a.maxIdentical) || a.maxIdentical < 1) {
          problems.push(`${where}: maxIdentical must be an integer >=1`);
        }
        break;
      default:
        problems.push(`${where}: unknown kind ${JSON.stringify(a.kind)}`);
    }
  }
  return problems;
}
