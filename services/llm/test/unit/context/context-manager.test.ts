import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { ContextManager } from '../../../app/agent/context/context-manager.js';
import { completeGroupEnds, inputBudget, estimateTokens } from '../../../app/agent/context/budget.js';
import { validateSummary } from '../../../app/agent/context/paper-state.js';
import { ContextCapacityError, type ContextEpoch } from '../../../app/agent/context/types.js';
import type { AgentMessage } from '../../../app/agent/core/types.js';
import { EMPTY_USAGE } from '../../../app/agent/core/llm-types.js';

const user = (content: string): AgentMessage => ({ role: 'user', content, timestamp: 1 });
const call = (id: string): AgentMessage => ({ role: 'assistant', content: [
  { type: 'toolCall', id, name: 'read_file', arguments: { path: `${id}.tex` } },
], api: 'openai-completions', provider: 'test', model: 'test', usage: EMPTY_USAGE, stopReason: 'toolUse', timestamp: 2 });
const result = (id: string, text = 'source', isError = false): AgentMessage => ({ role: 'toolResult', toolCallId: id,
  toolName: 'read_file', content: [{ type: 'text', text }], isError, timestamp: 3 });
function history() {
  const messages = [user('请保留 p99=412 ms、\\cite{a} 和 may；不得改成 proves。')];
  for (let i = 0; i < 8; i++) messages.push(call(`c${i}`), result(`c${i}`, 'source text '.repeat(1500)));
  messages.push(user('继续检查尚未检查的章节。'));
  return messages;
}
function manager(extra: Record<string, any> = {}) {
  return new ContextManager({ system: 'fixed instructions', tools: [], window: 60000, output: 4096,
    summarize: async () => null, commit: async () => {}, ...extra });
}

describe('paper context epochs', () => {
  it('keeps parallel tool calls and every result in one indivisible group', () => {
    const assistant = call('a') as any;
    assistant.content.push({ type: 'toolCall', id: 'b', name: 'read_file', arguments: {} });
    assert.deepEqual(completeGroupEnds([user('task'), assistant, result('b'), result('a'), user('next')]), [1, 4, 5]);
    assert.deepEqual(completeGroupEnds([user('task'), assistant, result('a')]), [1]);
    assert.throws(() => completeGroupEnds([result('orphan')]));
  });

  it('counts CJK conservatively and reserves output plus safety, including cached input', () => {
    assert.ok(estimateTokens('论文上下文') >= Buffer.byteLength('论文上下文'));
    assert.equal(inputBudget(100000, 16000), 79000);
    assert.throws(() => inputBudget(0, 16000), ContextCapacityError);
  });

  it('retains exact author constraints and failed outcomes if the summary is unavailable', async () => {
    let epoch: ContextEpoch | undefined;
    const messages = history();
    (messages[2] as any).isError = true;
    const output = await manager({ commit: async (value: ContextEpoch) => { epoch = value; } }).prepare(messages);
    assert.ok(epoch);
    assert.equal(epoch.checkpoint.authorRequests[0].text, (messages[0] as any).content);
    assert.equal(epoch.checkpoint.toolLedger[0].outcome, 'failed');
    assert.deepEqual(output.slice(1), messages.slice(epoch.coveredMessages));
    assert.ok(JSON.stringify(output).length < JSON.stringify(messages).length);
    assert.ok(completeGroupEnds(messages).includes(epoch.coveredMessages));
  });

  it('reuses frozen prefix bytes across steps and a process reload', async () => {
    let epoch: ContextEpoch;
    const messages = history();
    const m = manager({ commit: async (value: ContextEpoch) => { epoch = value; } });
    const first = await m.prepare(messages);
    const appended = [...messages, user('保留所有限制。')];
    const next = await m.prepare(appended);
    assert.equal(JSON.stringify(first), JSON.stringify(next.slice(0, -1)));
    const restored = manager({ epoch: JSON.parse(JSON.stringify(epoch!)) });
    assert.deepEqual(restored.project(appended), next);
    const mutated = structuredClone(appended);
    (mutated[0] as any).content = 'different author request';
    assert.throws(() => restored.project(mutated), /immutable journal/);
  });

  it('does not publish a new prefix when epoch commit fails', async () => {
    const messages = history();
    const m = manager({ commit: async () => { throw new Error('CAS failed'); } });
    await assert.rejects(m.prepare(messages), /CAS failed/);
    assert.deepEqual(m.project(messages), messages);
  });

  it('rejects fabricated evidence, assistant claims, out-of-scope references and malformed summaries', () => {
    const messages = [user('may improve'), call('c'), result('c', 'p99=412 ms')];
    assert.deepEqual(validateSummary(JSON.stringify({ observations: [{ message: 2, quote: 'p99=412 ms' }], pending: [] }), messages, 3).observations,
      [{ message: 2, quote: 'p99=412 ms' }]);
    for (const observation of [{ message: 2, quote: 'p99=347 ms' }, { message: 3, quote: 'anything' }, { message: 1, quote: 'claim' }]) {
      assert.throws(() => validateSummary(JSON.stringify({ observations: [observation], pending: [] }), messages, 3));
    }
    assert.throws(() => validateSummary('not JSON', messages, 3));
  });

  it('fails explicitly rather than dropping a single oversized current author request', async () => {
    await assert.rejects(manager().prepare([user('x'.repeat(100000))]), ContextCapacityError);
  });

  it('summarizes a bounded structured cold request and never executes a summary tool', async () => {
    let request: any;
    await manager({ summarize: async (value: unknown) => { request = value; return null; } }).prepare(history());
    assert.equal(request.warm, false);
    assert.ok(request.messages.length);
    assert.ok(request.messages.every((m: AgentMessage) => m.role === 'user'));
    assert.doesNotThrow(() => JSON.parse(request.messages[1].content));
  });
});
