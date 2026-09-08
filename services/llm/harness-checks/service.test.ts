import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, assistant, call, patchArgs, userId } from './helpers.js';
import { AGENT_STEP_LIMIT } from '../app/services/copilot.service.js';
import { defineTool } from '../app/agent/tools/baseTool.js';

test('C01: generated conversation identity reaches patch tools and next turn', async () => {
  const f = fixture([assistant([call('p1', 'submit_patch', patchArgs)], 'toolUse'), assistant(), assistant()]);
  const first = await f.service.chat(userId, f.context);
  assert.equal(f.records[0].conversationId, first.conversationId);
  f.context.conversation.conversationId = first.conversationId;
  await f.service.chat(userId, f.context);
  assert.equal(f.context.project.patchRecords.length, 1);
  assert.equal(f.semaphore.current, 0);
});
test('C02: missing snapshot fails explicitly before model/proposal', async () => {
  const f = fixture([assistant([call('p1', 'submit_patch', patchArgs)], 'toolUse'), assistant()]);
  f.context.project.sourceSnapshot = null;
  await assert.rejects(f.service.chat(userId, f.context), /snapshot/i);
  assert.equal(f.requests.length, 0);
  assert.equal(f.records.length, 0);
});
test('C02: stale snapshot stops before model and releases session', async () => {
  const f = fixture([assistant()]);
  f.web.assertSnapshotCurrent = async () => { throw new Error('source changed'); };
  await assert.rejects(f.service.chat(userId, f.context), /source changed/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.semaphore.current, 0);
  assert.ok([...f.journal.sessions.values()].every(s => !s.busy));
});
test('C06: third patch rejection terminates even with another tool in batch', async () => {
  const bad = { hunks: [{ ...patchArgs.hunks[0], oldText: 'absent' }] };
  const f = fixture([
    assistant([call('p1', 'submit_patch', bad)], 'toolUse'),
    assistant([call('p2', 'submit_patch', bad)], 'toolUse'),
    assistant([call('p3', 'submit_patch', bad), call('r3', 'read_file', { path: 'main.tex' })], 'toolUse'),
    assistant(),
  ]);
  await f.service.chat(userId, f.context);
  assert.equal(f.requests.length, 3);
  assert.equal(f.records.length, 0);
  const messages = [...f.journal.sessions.values()][0].messages;
  assert.equal(messages.filter((m: any) => m.role === 'toolResult').length, 4);
});
test('C07: normal completion on final permitted step succeeds', async () => {
  const steps = Array.from({ length: AGENT_STEP_LIMIT - 1 }, (_, i) => assistant([call(`r${i}`, 'list_project_files')], 'toolUse'));
  const f = fixture([...steps, assistant()]);
  await f.service.chat(userId, f.context);
  assert.equal(f.requests.length, AGENT_STEP_LIMIT);
});
test('C07: unfinished work at step limit is retained and reported', async () => {
  const f = fixture(Array.from({ length: AGENT_STEP_LIMIT }, (_, i) => assistant([call(`r${i}`, 'list_project_files')], 'toolUse')));
  await assert.rejects(f.service.chat(userId, f.context), (e: any) => e.code === 'COPILOT_STEP_LIMIT');
  assert.equal(f.semaphore.current, 0);
  assert.equal([...f.journal.sessions.values()][0].messages.length, 1 + AGENT_STEP_LIMIT * 2);
});
test('C10: archived result points to the exact durable receipt and is readable next step', async () => {
  const text = 'exact-evidence:中文'.repeat(1500);
  const f = fixture([
    assistant([call('big1', 'large')], 'toolUse'),
    (ctx: any) => {
      const placeholder = JSON.parse(ctx.messages.at(-1).content[0].text);
      assert.equal(placeholder.archived, true);
      assert.equal(placeholder.resultMessage, 2);
      return assistant([call('h1', 'read_context_history', { message: placeholder.resultMessage })], 'toolUse');
    },
    (ctx: any) => {
      const page = JSON.parse(ctx.messages.at(-1).content[0].text);
      assert.equal(page.historical, true);
      assert.ok(page.content.includes('exact-evidence:中文'));
      assert.ok(page.nextOffset > 0);
      return assistant();
    },
  ], { toolPoolFactory: () => [defineTool({ name: 'large', description: 'offline', parameters: { type: 'object' }, handler: () => text })] });
  await f.service.chat(userId, f.context);
  const state = [...f.journal.sessions.values()][0];
  assert.equal(state.receipts.get('1:big1').content[0].text, text);
});
test('C02: snapshot content hash mismatch never yields source evidence', async () => {
  const f = fixture([assistant([call('r1', 'read_file', { path: 'main.tex' })], 'toolUse'), assistant()]);
  const read = f.web.readSnapshot;
  f.web.readSnapshot = async (...args: any[]) => { const result = await read(...args); return args[3] ? { ...result, content: 'tampered' } : result; };
  await f.service.chat(userId, f.context);
  const result = [...f.journal.sessions.values()][0].messages.find((m: any) => m.role === 'toolResult');
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /integrity/);
});
test('C04/C07: a truncated final text response is not successful completion', async () => {
  const f = fixture([assistant([{ type: 'text', text: 'unfinished answer' }], 'length')]);
  await assert.rejects(f.service.chat(userId, f.context), (e: any) => e.code === 'COPILOT_OUTPUT_LIMIT');
});
test('C06: final result selects latest successful patch within one assistant batch', async () => {
  const second = { hunks: [{ ...patchArgs.hunks[0], newText: 'Welcome' }] };
  const f = fixture([assistant([call('p1', 'submit_patch', patchArgs), call('p2', 'submit_patch', second)], 'toolUse'), assistant()]);
  const result = await f.service.chat(userId, f.context);
  assert.equal((result.message.blocks[0] as any).patch.hunks[0].newText, 'Welcome');
});
test('C10: provider context-limit recovery compacts without replaying user or completed tools', async () => {
  const failed = { ...assistant([], 'error'), errorMessage: 'maximum context length exceeded' };
  const f = fixture([failed, assistant([{ type: 'text', text: JSON.stringify({ observations: [], pending: [] }) }]), assistant()]);
  f.context.conversation.conversationId = 'conv-recovery';
  const session = await f.journal.open({ userId, projectId: f.context.project.projectId, conversationId: 'conv-recovery', source: 'panel' });
  await session.append({ role: 'user', content: 'Preserve measured value 91.2%.', timestamp: 0 });
  for (let i = 0; i < 6; i++) {
    await session.append(assistant([call(`old${i}`, 'read_file', { path: 'main.tex' })], 'toolUse'));
    await session.append({ role: 'toolResult', toolName: 'read_file', toolCallId: `old${i}`, isError: false, timestamp: 0, content: [{ type: 'text', text: 'source'.repeat(1000) }] });
  }
  await session.close();
  await f.service.chat(userId, f.context);
  const state = [...f.journal.sessions.values()][0];
  assert.equal(state.epoch.generation, 1);
  assert.equal(state.messages.filter((m: any) => m.role === 'user').length, 2);
  assert.equal(state.messages.filter((m: any) => m.role === 'toolResult').length, 6);
  assert.equal(f.requests.length, 3, 'one failed call, one summary, one resumed answer');
  assert.ok(JSON.stringify(f.requests.at(-1).messages).includes('91.2%'));
});
