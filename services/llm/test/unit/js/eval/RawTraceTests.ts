// Unit tests for the raw trace recorder (eval/rawTrace.ts):
//   three execute outcomes — success / throw / details.dryRunRejected
//   dual sequence numbers (call order seq vs completion order endSeq)
//   resultText truncation at RESULT_TEXT_MAX with original length kept
//   errorText capped at ERROR_TEXT_MAX, rethrow passthrough (same object)
//   beginTurn() turn alignment via the wrapping factory's turnRef
// All pure/in-memory — fake AgentTools only, no mongo/clsi/provider.

import { expect } from 'chai';
import {
  RawTraceRecorder,
  wrapTool,
  RESULT_TEXT_MAX,
  ERROR_TEXT_MAX,
} from '../../../../eval/rawTrace.js';
import type { AgentTool, AgentToolResult } from '../../../../app/agent/core/types.js';

const okResult = (text: string, details: any = {}): AgentToolResult<any> => ({
  content: [{ type: 'text', text }],
  details,
});

function fakeTool(name: string, execute: AgentTool<any, any>['execute']): AgentTool<any, any> {
  return {
    name,
    label: name,
    description: `fake ${name}`,
    parameters: { type: 'object', properties: {} } as any,
    execute,
  };
}

const turnOne = { current: 1 };

describe('eval harness: raw trace recorder', function () {
  it('records a successful call with full args and result text', async function () {
    const recorder = new RawTraceRecorder();
    const tool = fakeTool('read_file', async () => okResult('file contents here'));
    const wrapped = wrapTool(tool, recorder, turnOne);
    await wrapped.execute('call_1', { path: 'main.tex', limit: 50 });

    const events = recorder.events();
    expect(events).to.have.length(1);
    const e = events[0];
    expect(e.seq).to.equal(0);
    expect(e.endSeq).to.equal(0);
    expect(e.turn).to.equal(1);
    expect(e.toolCallId).to.equal('call_1');
    expect(e.name).to.equal('read_file');
    expect(e.args).to.deep.equal({ path: 'main.tex', limit: 50 });
    expect(e.argsKey).to.be.a('string').and.include('main.tex');
    expect(e.ok).to.equal(true);
    expect(e.isError).to.equal(false);
    expect(e.errorText).to.equal(undefined);
    expect(e.resultText).to.equal('file contents here');
    expect(e.resultChars).to.equal('file contents here'.length);
    expect(e.details).to.equal(undefined); // empty details are not stored
    expect(e.durationMs).to.be.a('number');
    // wrapTool preserves the tool's static surface
    expect(wrapped.name).to.equal('read_file');
    expect(wrapped.description).to.equal('fake read_file');
  });

  it('argsKey is key-order insensitive', async function () {
    const recorder = new RawTraceRecorder();
    const tool = fakeTool('t', async () => okResult(''));
    const wrapped = wrapTool(tool, recorder, turnOne);
    await wrapped.execute('c1', { a: 1, b: 2 });
    await wrapped.execute('c2', { b: 2, a: 1 });
    expect(recorder.events()[0].argsKey).to.equal(recorder.events()[1].argsKey);
  });

  it('records a thrown error: isError, capped errorText, then rethrows the SAME error', async function () {
    const recorder = new RawTraceRecorder();
    const boom = new Error('e'.repeat(ERROR_TEXT_MAX + 100));
    const tool = fakeTool('submit_patch', async () => {
      throw boom;
    });
    const wrapped = wrapTool(tool, recorder, turnOne);

    let caught: any = null;
    try {
      await wrapped.execute('call_2', { hunks: [] });
    } catch (err: any) {
      caught = err;
    }
    expect(caught).to.equal(boom); // rethrow passthrough — identity preserved

    const e = recorder.events()[0];
    expect(e.isError).to.equal(true);
    expect(e.ok).to.equal(false);
    expect(e.errorText).to.have.length(ERROR_TEXT_MAX);
    expect(e.resultText).to.equal('');
    expect(e.resultChars).to.equal(0);
  });

  it('treats details.dryRunRejected as an error signal without throwing (F4)', async function () {
    const recorder = new RawTraceRecorder();
    const tool = fakeTool('submit_patch', async () =>
      okResult('PATCH REJECTED by server-side validation', { dryRunRejected: true })
    );
    const wrapped = wrapTool(tool, recorder, turnOne);
    const result = await wrapped.execute('call_3', { hunks: [{ oldText: 'a', newText: 'b' }] });
    expect(result.details.dryRunRejected).to.equal(true); // result passes through untouched

    const e = recorder.events()[0];
    expect(e.isError).to.equal(true);
    expect(e.ok).to.equal(false);
    expect(e.errorText).to.equal(undefined); // returned, not thrown — no error message
    expect(e.resultText).to.include('PATCH REJECTED');
    expect(e.details).to.deep.equal({ dryRunRejected: true });
  });

  it('keeps dual sequence numbers when completion order differs from call order (A1)', async function () {
    const recorder = new RawTraceRecorder();
    let resolveA!: (r: AgentToolResult<any>) => void;
    let resolveB!: (r: AgentToolResult<any>) => void;
    const toolA = fakeTool('tool_a', () => new Promise(res => { resolveA = res; }));
    const toolB = fakeTool('tool_b', () => new Promise(res => { resolveB = res; }));

    const pA = wrapTool(toolA, recorder, turnOne).execute('cA', {});
    const pB = wrapTool(toolB, recorder, turnOne).execute('cB', {});
    // B settles first although A was called first.
    resolveB(okResult('b'));
    await pB;
    resolveA(okResult('a'));
    await pA;

    const [eA, eB] = recorder.events();
    expect(eA.name).to.equal('tool_a');
    expect(eA.seq).to.equal(0);
    expect(eA.endSeq).to.equal(1); // finished second
    expect(eB.name).to.equal('tool_b');
    expect(eB.seq).to.equal(1);
    expect(eB.endSeq).to.equal(0); // finished first
  });

  it('truncates resultText at RESULT_TEXT_MAX and keeps the original length', async function () {
    const recorder = new RawTraceRecorder();
    const big = 'x'.repeat(RESULT_TEXT_MAX + 5000);
    const tool = fakeTool('compile_project', async () => okResult(big));
    await wrapTool(tool, recorder, turnOne).execute('c4', {});

    const e = recorder.events()[0];
    expect(e.resultText).to.have.length(RESULT_TEXT_MAX);
    expect(e.resultChars).to.equal(RESULT_TEXT_MAX + 5000);
  });

  it('beginTurn() advances the turn stamp via the factory turnRef', async function () {
    const recorder = new RawTraceRecorder();
    const tool = fakeTool('t', async () => okResult(''));

    recorder.beginTurn();
    await wrapTool(tool, recorder, { current: recorder.turn }).execute('c5', {});
    recorder.beginTurn();
    await wrapTool(tool, recorder, { current: recorder.turn }).execute('c6', {});

    const events = recorder.events();
    expect(events[0].turn).to.equal(1);
    expect(events[1].turn).to.equal(2);
    expect(events[0].seq).to.equal(0);
    expect(events[1].seq).to.equal(1);
  });

  it('concatenates multiple text content blocks', async function () {
    const recorder = new RawTraceRecorder();
    const tool = fakeTool('t', async () => ({
      content: [
        { type: 'text', text: 'part1' },
        { type: 'text', text: 'part2' },
      ],
      details: {},
    }));
    await wrapTool(tool, recorder, turnOne).execute('c7', {});
    expect(recorder.events()[0].resultText).to.equal('part1\npart2');
    expect(recorder.events()[0].resultChars).to.equal('part1\npart2'.length);
  });
});
