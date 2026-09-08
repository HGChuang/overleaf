import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextManager } from '../app/agent/context/context-manager.js';
import { completeGroupEnds, requestTokens } from '../app/agent/context/budget.js';
import { reducePaperState, validateSummary } from '../app/agent/context/paper-state.js';
import { sourcePage } from '../app/agent/context/source-evidence.js';
import { assistant, call, hash } from './helpers.js';

const user = (content: string): any => ({ role: 'user', content, timestamp: 0 });
function history() {
  const messages: any[] = [user('Keep 91.2%, do not change citations; only shorten the caption.')];
  for (let i = 0; i < 8; i++) messages.push(assistant([call(`r${i}`, 'read_file', { path: 'main.tex' })], 'toolUse'),
    { role: 'toolResult', toolCallId: `r${i}`, toolName: 'read_file', content: [{ type: 'text', text: 'source'.repeat(1000) }], timestamp: 0, isError: false });
  messages.push(user('Continue within my original restrictions.'), assistant());
  return messages;
}
for (const mode of ['valid', 'invalid', 'throws']) test(`C10: ${mode} summary preserves exact author requirements and complete groups`, async () => {
  let epoch: any;
  const events: any[] = [];
  const messages = history();
  const manager = new ContextManager({ system: '', tools: [], window: 22000, output: 1024,
    commit: async next => { epoch = next; }, onEvent: e => events.push(e), summarize: async () => {
      if (mode === 'throws') throw new Error('summary timeout');
      return JSON.stringify({ observations: [{ message: 0, quote: mode === 'valid' ? 'Keep 91.2%' : 'invented requirement' }], pending: [] });
    } });
  const projected = await manager.prepare(messages);
  assert.ok(epoch);
  assert.equal(epoch.checkpoint.authorRequests[0].text, messages[0].content);
  assert.ok(requestTokens('', [], projected) < requestTokens('', [], messages));
  assert.doesNotThrow(() => completeGroupEnds(projected));
  assert.equal(events.some(e => e.type === 'context_degraded'), mode !== 'valid');
  assert.deepEqual(manager.project(messages), projected);
  assert.throws(() => manager.project([user('tampered'), ...messages.slice(1)]), /immutable journal/);
});
test('C10: failed epoch commit must not publish new projection', async () => {
  const messages = history();
  const manager = new ContextManager({ system: '', tools: [], window: 22000, output: 1024,
    commit: async () => { throw new Error('CAS failure'); }, summarize: async () => null });
  await assert.rejects(manager.prepare(messages), /CAS failure/);
  assert.equal(manager.generation(), 0);
  assert.deepEqual(manager.project(messages), messages);
});
test('C10: oversized indivisible author request fails explicitly, never truncates', async () => {
  const manager = new ContextManager({ system: '', tools: [], window: 5000, output: 1024,
    commit: async () => { assert.fail('must not commit'); }, summarize: async () => null });
  await assert.rejects(manager.prepare([user('x'.repeat(10000))]), (e: any) => e.code === 'COPILOT_CONTEXT_CAPACITY');
});
test('C10: source pagination round-trips long Unicode/CRLF bytes with valid cursor and hash', () => {
  const source = '中文😀\\alpha\r\n'.repeat(1500);
  let cursor = 0; let rebuilt = ''; let pages = 0;
  do {
    const page = sourcePage('main.tex', source, { offsetBytes: cursor });
    assert.equal(page.sourceHash, hash(source));
    assert.ok(Buffer.byteLength(JSON.stringify(page)) + 16 <= 4096);
    assert.equal(page.endByte - page.startByte, Buffer.byteLength(page.content));
    rebuilt += page.content; pages++;
    if (page.nextOffsetBytes === null) break;
    assert.ok(page.nextOffsetBytes > cursor); cursor = page.nextOffsetBytes;
  } while (pages < 100);
  assert.equal(rebuilt, source);
  assert.throws(() => sourcePage('main.tex', source, { offsetBytes: 1 }), /UTF-8/);
});
test('C10: summary cannot cite assistant claims; source freshness follows project delta', () => {
  assert.throws(() => validateSummary(JSON.stringify({ observations: [{ message: 0, quote: 'done' }], pending: [] }), [assistant()], 1));
  const source = 'abc'; const page = sourcePage('main.tex', source);
  const state = reducePaperState([user(JSON.stringify({ MESSAGE: 'read', PROJECT: { sourceManifest: [{ path: 'main.tex', sha256: hash(source) }] } })),
    assistant([call('r', 'read_file', { path: 'main.tex' })], 'toolUse'),
    { role: 'toolResult', toolCallId: 'r', toolName: 'read_file', content: [{ type: 'text', text: JSON.stringify(page) }], timestamp: 0, isError: false }]);
  assert.equal(state.toolLedger[0].source!.freshness, 'matching');
  const next = reducePaperState([user(JSON.stringify({ MESSAGE: 'changed', PROJECT_REF: {}, PROJECT_DELTA: { sourceManifest: [{ path: 'main.tex', sha256: hash('changed') }] } }))], state, 3);
  assert.equal(next.toolLedger[0].source!.freshness, 'stale');
});
