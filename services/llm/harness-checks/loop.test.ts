import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../app/agent/core/agent.js';
import { defineTool } from '../app/agent/tools/baseTool.js';
import { completeGroupEnds } from '../app/agent/context/budget.js';
import { scripted, assistant, call, model } from './helpers.js';

async function run(content: any[], tools: any[], stopReason = 'toolUse', options: any = {}) {
  const s = scripted([assistant(content, stopReason), assistant()]);
  const agent = new Agent({ initialState: { model, tools }, streamFn: s.streamFn, ...options });
  await agent.prompt('offline');
  return { agent, ...s };
}
test('C03: unknown tool and invalid schema never execute; numeric strings are supported', async () => {
  const seen: any[] = [];
  const tool = defineTool({ name: 'bounded', description: 'test', parameters: { type: 'object', properties: { n: { type: 'integer', minimum: 1 } }, required: ['n'], additionalProperties: false }, handler: a => { seen.push(a); return 'ok'; } });
  const { agent } = await run([call('x', 'unknown'), call('bad', 'bounded', { n: -1 }), call('ok', 'bounded', { n: '2' })], [tool]);
  assert.deepEqual(seen, [{ n: 2 }]);
  assert.deepEqual(agent.state.messages.filter(m => m.role === 'toolResult').map((m: any) => m.isError), [true, true, false]);
});
test('C03: null cannot be silently coerced to deletion text', async () => {
  let executed = false;
  const tool = defineTool({ name: 'edit', description: 'test', parameters: { type: 'object', properties: { newText: { type: 'string' } }, required: ['newText'] }, handler: () => { executed = true; return 'ok'; } });
  await run([call('x', 'edit', { newText: null })], [tool]);
  assert.equal(executed, false);
});
test('C03: duplicate IDs fail before dispatch and do not poison journal pairing', async () => {
  let count = 0;
  const tool = defineTool({ name: 'read', description: 'test', parameters: { type: 'object' }, handler: () => { count++; return 'ok'; } });
  const { agent } = await run([call('same', 'read'), call('same', 'read')], [tool]);
  assert.equal(count, 0);
  assert.equal((agent.state.messages.at(-1) as any).stopReason, 'error');
  assert.doesNotThrow(() => completeGroupEnds(agent.state.messages));
});
test('C04: length never executes even valid tool arguments', async () => {
  let count = 0;
  const tool = defineTool({ name: 'read', description: 'test', parameters: { type: 'object' }, handler: () => { count++; return 'ok'; } });
  const { agent } = await run([call('x', 'read')], [tool], 'length');
  assert.equal(count, 0);
  assert.ok(agent.state.messages.some((m: any) => m.role === 'toolResult' && m.isError));
});
test('C06: out-of-order parallel completion retains ordered call/result identity', async () => {
  const order: number[] = [];
  let unblock!: () => void;
  const waiting = new Promise<void>(resolve => { unblock = resolve; });
  const tool = defineTool({ name: 'read', description: 'test', parameters: { type: 'object', properties: { n: { type: 'integer' } } }, handler: async ({ n }) => {
    if (n === 1) await waiting;
    order.push(n); if (n === 2) unblock(); return String(n);
  } });
  const { agent } = await run([call('a', 'read', { n: 1 }), call('b', 'read', { n: 2 })], [tool]);
  assert.deepEqual(order, [2, 1]);
  const results = agent.state.messages.filter((m: any) => m.role === 'toolResult') as any[];
  assert.deepEqual(results.map(r => [r.toolCallId, r.content[0].text]), [['a', '1'], ['b', '2']]);
  assert.doesNotThrow(() => completeGroupEnds(agent.state.messages));
});
test('C05/C06: abort in sequential batch closes every unexecuted intent', async () => {
  let agent: Agent;
  let count = 0;
  const tool = defineTool({ name: 'read', description: 'test', executionMode: 'sequential', parameters: { type: 'object' }, handler: () => { count++; agent.abort(); return 'first completed'; } });
  const s = scripted([assistant([call('a', 'read'), call('b', 'read')], 'toolUse')]);
  agent = new Agent({ initialState: { model, tools: [tool] }, streamFn: s.streamFn });
  await agent.prompt('offline');
  assert.equal(count, 1);
  const results = agent.state.messages.filter((m: any) => m.role === 'toolResult') as any[];
  assert.equal(results.length, 2);
  assert.equal(results[1].isError, true);
  assert.doesNotThrow(() => completeGroupEnds(agent.state.messages));
});
