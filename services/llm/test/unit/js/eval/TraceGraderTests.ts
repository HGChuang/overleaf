// Unit tests for trajectory assertions (trace grader) and the efficiency
// headline in the run recorder:
//   trace  — tool-called / tool-call-limit / max-turns / no-repeat-call,
//            plus fixture-schema shape validation
//   efficiency — $/pass, avg turns, avg wall in summary.md / summary.json
// All pure/in-memory — no mongo/clsi/provider.

import { expect } from 'chai';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  evalTraceAssertions,
  stableStringify,
  validateTraceAssertionsShape,
  type TraceAssertion,
} from '../../../../eval/graders/traceGrader.js';
import { writeRunOutputs } from '../../../../eval/metrics/recorder.js';
import { emptyUsage } from '../../../../eval/usageTap.js';
import type { TrialRecord } from '../../../../eval/runner.js';

const ctx = (over: Partial<{ toolCalls: Record<string, number>; turns: number; transcript: any[] }>) => ({
  toolCalls: over.toolCalls ?? {},
  turns: over.turns ?? 0,
  transcript: over.transcript ?? [],
});

// Minimal assistant-message transcript carrying the given tool calls.
const transcriptWithCalls = (calls: { name: string; arguments?: any }[]) =>
  calls.map((c, i) => ({
    role: 'assistant',
    content: [{ type: 'toolCall', id: `call_${i}`, name: c.name, arguments: c.arguments ?? {} }],
  }));

describe('eval harness: trace assertions', function () {
  it('tool-called passes at the default floor of 1 call', function () {
    const r = evalTraceAssertions([{ kind: 'tool-called', tool: 'compile_project' }], ctx({ toolCalls: { compile_project: 2 } }));
    expect(r.firstFailure).to.equal(null);
    expect(r.passed).to.equal(1);
  });

  it('tool-called fails when the tool was never called', function () {
    const r = evalTraceAssertions([{ kind: 'tool-called', tool: 'compile_project' }], ctx({}));
    expect(r.firstFailure).to.include('compile_project');
    expect(r.firstFailure).to.include('0x');
    expect(r.passed).to.equal(0);
  });

  it('tool-called respects an explicit minCalls', function () {
    const assertions: TraceAssertion[] = [{ kind: 'tool-called', tool: 'count_words', minCalls: 2 }];
    expect(evalTraceAssertions(assertions, ctx({ toolCalls: { count_words: 1 } })).firstFailure).to.be.a('string');
    expect(evalTraceAssertions(assertions, ctx({ toolCalls: { count_words: 3 } })).firstFailure).to.equal(null);
  });

  it('tool-call-limit flags flailing, max:0 means "must never call"', function () {
    const limit: TraceAssertion[] = [{ kind: 'tool-call-limit', tool: 'read_file', max: 3 }];
    expect(evalTraceAssertions(limit, ctx({ toolCalls: { read_file: 4 } })).firstFailure).to.include('allowed <=3');
    expect(evalTraceAssertions(limit, ctx({ toolCalls: { read_file: 3 } })).firstFailure).to.equal(null);
    const never: TraceAssertion[] = [{ kind: 'tool-call-limit', tool: 'submit_patch', max: 0 }];
    expect(evalTraceAssertions(never, ctx({ toolCalls: { submit_patch: 1 } })).firstFailure).to.be.a('string');
    expect(evalTraceAssertions(never, ctx({})).firstFailure).to.equal(null);
  });

  it('max-turns bounds the whole trajectory', function () {
    const assertions: TraceAssertion[] = [{ kind: 'max-turns', max: 4 }];
    expect(evalTraceAssertions(assertions, ctx({ turns: 5 })).firstFailure).to.include('5 turns');
    expect(evalTraceAssertions(assertions, ctx({ turns: 4 })).firstFailure).to.equal(null);
  });

  it('no-repeat-call detects a stuck loop with identical arguments', function () {
    // CONSECUTIVE window: 3 identical calls in a row, maxIdentical 2 → fail.
    const transcript = transcriptWithCalls([
      { name: 'search_project', arguments: { query: '1.8' } },
      { name: 'search_project', arguments: { query: '1.8' } },
      { name: 'search_project', arguments: { query: '1.8' } },
    ]);
    const r = evalTraceAssertions([{ kind: 'no-repeat-call', maxIdentical: 2 }], ctx({ transcript }));
    expect(r.firstFailure).to.include('stuck loop');
    expect(r.firstFailure).to.include('search_project');
  });

  it('no-repeat-call resets the streak on any intervening different call', function () {
    // Two identical calls separated by a different one: window resets → pass.
    // (Both a different-args same-tool call and a different-tool call reset.)
    const splitByArgs = transcriptWithCalls([
      { name: 'search_project', arguments: { query: '1.8' } },
      { name: 'search_project', arguments: { query: '2.0' } },
      { name: 'search_project', arguments: { query: '1.8' } },
    ]);
    expect(evalTraceAssertions([{ kind: 'no-repeat-call', maxIdentical: 1 }], ctx({ transcript: splitByArgs })).firstFailure).to.equal(null);
    const splitByTool = transcriptWithCalls([
      { name: 'read_file', arguments: { path: 'main.tex' } },
      { name: 'compile_project' },
      { name: 'read_file', arguments: { path: 'main.tex' } },
    ]);
    expect(evalTraceAssertions([{ kind: 'no-repeat-call', maxIdentical: 1 }], ctx({ transcript: splitByTool })).firstFailure).to.equal(null);
  });

  it('no-repeat-call tolerates non-consecutive cumulative repeats (compile per edit round)', function () {
    // compile_project is a zero-arg tool (args always {}): 4 compiles spread
    // across edit rounds must NOT trip maxIdentical:2 — only a back-to-back
    // streak is a stuck loop.
    const transcript = transcriptWithCalls([
      { name: 'compile_project' },
      { name: 'submit_patch', arguments: { diff: 'a' } },
      { name: 'compile_project' },
      { name: 'submit_patch', arguments: { diff: 'b' } },
      { name: 'compile_project' },
      { name: 'submit_patch', arguments: { diff: 'c' } },
      { name: 'compile_project' },
    ]);
    expect(evalTraceAssertions([{ kind: 'no-repeat-call', maxIdentical: 2 }], ctx({ transcript })).firstFailure).to.equal(null);
  });

  it('no-repeat-call tolerates varied arguments and scopes to one tool', function () {
    const varied = transcriptWithCalls([
      { name: 'search_project', arguments: { query: 'a' } },
      { name: 'search_project', arguments: { query: 'b' } },
      { name: 'read_file', arguments: { path: 'main.tex' } },
      { name: 'read_file', arguments: { path: 'main.tex' } },
    ]);
    expect(evalTraceAssertions([{ kind: 'no-repeat-call', maxIdentical: 2 }], ctx({ transcript: varied })).firstFailure).to.equal(null);
    // Scoped to search_project, the two identical read_file calls are out of scope.
    expect(
      evalTraceAssertions([{ kind: 'no-repeat-call', tool: 'search_project', maxIdentical: 1 }], ctx({ transcript: varied })).firstFailure
    ).to.equal(null);
  });

  it('argument fingerprinting is insensitive to key order', function () {
    expect(stableStringify({ a: 1, b: [2, { c: 3, d: 4 }] })).to.equal(stableStringify({ b: [2, { d: 4, c: 3 }], a: 1 }));
    const transcript = transcriptWithCalls([
      { name: 'read_file', arguments: { path: 'a.tex', offset: 0 } },
      { name: 'read_file', arguments: { offset: 0, path: 'a.tex' } },
    ]);
    const r = evalTraceAssertions([{ kind: 'no-repeat-call', maxIdentical: 1 }], ctx({ transcript }));
    expect(r.firstFailure).to.include('stuck loop');
  });

  it('first failure wins; tally counts every assertion', function () {
    const r = evalTraceAssertions(
      [
        { kind: 'tool-called', tool: 'compile_project' },
        { kind: 'max-turns', max: 10 },
        { kind: 'tool-call-limit', tool: 'read_file', max: 1 },
      ],
      ctx({ turns: 3, toolCalls: { read_file: 5 } })
    );
    expect(r.total).to.equal(3);
    expect(r.passed).to.equal(1); // only max-turns holds
    expect(r.firstFailure).to.include('compile_project');
  });

  it('shape validation reports structural problems, accepts good input', function () {
    expect(validateTraceAssertionsShape([{ kind: 'tool-called', tool: 'compile_project' }])).to.deep.equal([]);
    expect(validateTraceAssertionsShape([{ kind: 'tool-call-limit', tool: 'x', max: 0 }])).to.deep.equal([]);
    expect(validateTraceAssertionsShape([{ kind: 'nope' }])[0]).to.include('unknown kind');
    expect(validateTraceAssertionsShape([{ kind: 'tool-called' }])[0]).to.include('tool');
    expect(validateTraceAssertionsShape([{ kind: 'max-turns', max: 0 }])[0]).to.include('max');
    expect(validateTraceAssertionsShape([{ kind: 'no-repeat-call' }])[0]).to.include('maxIdentical');
  });
});

describe('eval harness: efficiency headline', function () {
  function rec(over: Partial<TrialRecord> & { cost: number }): TrialRecord {
    const agent = { ...emptyUsage(), costTotal: over.cost, totalTokens: 1000 };
    return {
      taskId: over.taskId || 'task-x',
      category: over.category || 'compile',
      difficulty: over.difficulty || 'easy',
      suite: over.suite || 'regression',
      trialIndex: over.trialIndex ?? 0,
      success: over.success ?? true,
      score: over.score ?? 1,
      failureReason: over.success === false ? 'assertion_failed' : null,
      failureDetail: null,
      turns: over.turns ?? 2,
      verifyTurns: 0,
      patchesApplied: 1,
      toolCalls: {},
      usage: { agent, judge: emptyUsage() },
      judgeScore: null,
      assertionsPassed: null,
      assertionsTotal: null,
      tracePassed: null,
      traceTotal: null,
      wallMs: over.wallMs ?? 10_000,
    };
  }

  it('summary.md carries $/pass + avg turns/wall; summary.json carries costPerPass', function () {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-recorder-'));
    // 3 trials: 2 pass ($0.01, $0.03), 1 fail ($0.02) → $/pass = 0.06/2 = $0.03
    const records = [
      rec({ taskId: 't-a', trialIndex: 0, success: true, cost: 0.01, turns: 2, wallMs: 8000 }),
      rec({ taskId: 't-a', trialIndex: 1, success: true, cost: 0.03, turns: 4, wallMs: 12000 }),
      rec({ taskId: 't-b', trialIndex: 0, success: false, cost: 0.02, turns: 3, wallMs: 10000 }),
    ];
    writeRunOutputs(outDir, records, null);

    const md = readFileSync(join(outDir, 'summary.md'), 'utf8');
    expect(md).to.include('$/pass');
    expect(md).to.include('$0.0300/pass'); // (0.01+0.03+0.02)/2 passes
    expect(md).to.include('avg 3.0 turns');
    expect(md).to.include('## Efficiency');
    expect(md).to.include('| regression | 3 | 2 |');

    const json = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(json.overall.costPerPass).to.be.closeTo(0.03, 1e-9);
    expect(json.overall.avgTurnsPerTrial).to.be.closeTo(3, 1e-9);
    expect(json.efficiency).to.have.lengthOf(1);
    expect(json.efficiency[0].costPerPass).to.be.closeTo(0.03, 1e-9);
  });

  it('a zero-pass run reports $/pass as em-dash, not Infinity', function () {
    const outDir = mkdtempSync(join(tmpdir(), 'eval-recorder-zero-'));
    writeRunOutputs(outDir, [rec({ success: false, cost: 0.05 })], null);
    const md = readFileSync(join(outDir, 'summary.md'), 'utf8');
    expect(md).to.include('$—/pass');
    const json = JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8'));
    expect(json.overall.costPerPass).to.equal(null);
  });
});
