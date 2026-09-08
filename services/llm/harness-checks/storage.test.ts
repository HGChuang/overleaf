import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ContextStore } from '../app/agent/context/context-store.js';
import { PaperIndex } from '../app/agent/context/paper-index.js';
import { PaperMemoryStore } from '../app/agent/context/memory-store.js';
import { completeGroupEnds } from '../app/agent/context/budget.js';
import { reducePaperState, hashMessages } from '../app/agent/context/paper-state.js';
import { fixture, assistant, call, userId, projectId, patchArgs } from './helpers.js';

const scope = { userId, projectId, conversationId: 'conv-l0', source: 'panel' as const };
before(async () => {
  assert.equal(process.env.L0_MONGO_URL, 'mongodb://127.0.0.1:27017/copilot_l0?replicaSet=l0');
  await mongoose.connect(process.env.L0_MONGO_URL!, { serverSelectionTimeoutMS: 10000 });
});
beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); });
after(async () => { await mongoose.disconnect(); });
const user = (text = 'Keep measured accuracy 91.2%.') : any => ({ role: 'user', content: text, timestamp: 0 });
const receipt = (id = 'c1') : any => ({ role: 'toolResult', toolName: 'submit_patch', toolCallId: id, content: [{ type: 'text', text: 'persisted' }], details: { patch: { patchId: 'patch_' + 'e'.repeat(24) } }, isError: false, timestamp: 0 });

test('C09: receipt survives interrupted journal append and resumes without repeating proposal', async () => {
  const store = new ContextStore();
  const session = await store.open(scope);
  await session.append(user());
  await session.append(assistant([call('c1', 'submit_patch', patchArgs)], 'toolUse'));
  await session.recordTool!(receipt());
  // Emulate a dead worker by expiring only its isolated database lease.
  await mongoose.connection.db!.collection('copilot_conversations').updateOne({}, { $set: { leaseUntil: new Date(0) } });
  const f = fixture([assistant()], { contextStore: store });
  f.context.conversation.conversationId = scope.conversationId;
  await f.service.chat(userId, f.context);
  assert.equal(f.records.length, 0);
  const history = (await store.history(userId, scope.conversationId))!.messages;
  assert.equal((history[2] as any).content[0].text, 'persisted');
  assert.doesNotThrow(() => completeGroupEnds(history));
});
test('C09: missing receipt becomes UNKNOWN rather than replay', async () => {
  const store = new ContextStore();
  const session = await store.open(scope);
  await session.append(user());
  await session.append(assistant([call('c1', 'submit_patch', patchArgs)], 'toolUse'));
  await session.close();
  const f = fixture([assistant()], { contextStore: store });
  f.context.conversation.conversationId = scope.conversationId;
  await f.service.chat(userId, f.context);
  const messages = (await store.history(userId, scope.conversationId))!.messages;
  assert.match((messages[2] as any).content[0].text, /unknown/);
  assert.equal(reducePaperState(messages).toolLedger[0].outcome, 'unknown');
  assert.equal(f.records.length, 0);
  assert.doesNotThrow(() => completeGroupEnds(messages));
});
test('C09: failed tool-result append cannot persist an assistant error inside an open group', async () => {
  const store = new ContextStore();
  let failOnce = true;
  const injected: any = Object.create(store);
  injected.open = async (scope: any) => {
    const session = await store.open(scope);
    return { ...session, append: async (message: any) => {
      if (message.role === 'toolResult' && failOnce) { failOnce = false; throw new Error('injected append failure'); }
      await session.append(message);
    } };
  };
  const f = fixture([assistant([call('c1', 'submit_patch', patchArgs)], 'toolUse'), assistant()], { contextStore: injected });
  f.context.conversation.conversationId = scope.conversationId;
  await assert.rejects(f.service.chat(userId, f.context), /injected append failure/);
  const interrupted = (await store.history(userId, scope.conversationId))!.messages;
  assert.equal(interrupted.length, 2, 'Only user and durable tool intent should remain');
  await f.service.chat(userId, f.context);
  assert.equal(f.records.length, 1, 'No replay of completed proposal');
  assert.doesNotThrow(() => completeGroupEnds(f.requests.at(-1).messages));
});
test('C12: real lease excludes concurrent writers and fences an expired owner', async () => {
  const store = new ContextStore();
  const old = await store.open(scope);
  await old.append(user());
  await assert.rejects(store.open(scope), (e: any) => e.code === 'COPILOT_CONTEXT_BUSY');
  await mongoose.connection.db!.collection('copilot_conversations').updateOne({}, { $set: { leaseUntil: new Date(0) } });
  const next = await store.open(scope);
  await assert.rejects(old.append(user('stale')));
  await assert.rejects(old.renew());
  await old.close();
  await next.append(user('current'));
  assert.equal(next.messages.length, 2);
  await next.close();
});
test('C12: same conversation cannot switch projects; another user has isolated history', async () => {
  const store = new ContextStore();
  const a = await store.open(scope); await a.append(user()); await a.close();
  await assert.rejects(store.open({ ...scope, projectId: 'f'.repeat(24) }));
  const b = await store.open({ ...scope, userId: '9'.repeat(24) });
  assert.equal(b.messages.length, 0); await b.close();
});
test('C09/C10: GridFS receipt round-trips exact bytes; epoch CAS validates boundary', async () => {
  const store = new ContextStore(); const s = await store.open(scope);
  await s.append(user()); await s.append(assistant([call('c1', 'submit_patch', patchArgs)], 'toolUse'));
  const result = receipt(); result.content[0].text = '中文\\alpha\r\n'.repeat(10000);
  await s.recordTool!(result); await s.append(result);
  assert.deepEqual(await s.recoverTool!('c1'), result);
  const epoch: any = { version: 1, generation: 1, coveredMessages: 3, coveredHash: hashMessages(s.messages), checkpoint: reducePaperState(s.messages), prefix: user('checkpoint') };
  await s.commit(epoch);
  await assert.rejects(s.commit(epoch), /boundary/);
  await s.close();
  const loaded = await store.open(scope);
  assert.deepEqual(loaded.messages[2], result);
  assert.equal(loaded.epoch!.generation, 1); await loaded.close();
});
test('C12: memories require author evidence and explicit confirmation; project/user scopes differ', async () => {
  const store = new PaperMemoryStore();
  const base: any = { userId, projectId, conversationId: scope.conversationId, value: 'Preserve accuracy', scope: 'project', sourceQuote: '91.2%', messages: [user()] };
  const candidate = await store.propose(base);
  assert.deepEqual(await store.list(userId, projectId), []);
  await store.decide(userId, candidate.id, 'confirm');
  assert.equal((await store.list(userId, projectId)).length, 1);
  assert.equal((await store.list(userId, 'other')).length, 0);
  await assert.rejects(store.decide('another-user', candidate.id, 'confirm'));
  for (const message of [assistant([{ type: 'text', text: '91.2%' }]), { role: 'toolResult', content: [{ type: 'text', text: '91.2%' }] }, user(JSON.stringify({ MESSAGE: '91.2%', PROJECT: {}, MESSAGE_KIND: 'system_event' }))]) {
    await assert.rejects(store.propose({ ...base, messages: [message] }), /author/);
  }
  const global = await store.propose({ ...base, scope: 'user' }); await store.decide(userId, global.id, 'confirm');
  assert.equal((await store.list(userId, 'other')).length, 1);
  await store.decide(userId, candidate.id, 'delete');
  assert.equal((await store.list(userId, projectId)).length, 1);
});
test('C01/C12: first-turn paper review belongs to generated conversation; reads alone are not review', async () => {
  const f = fixture([
    assistant([call('s1', 'search_paper', { query: 'Hello' })], 'toolUse'),
    (ctx: any) => {
      const result = JSON.parse(ctx.messages.at(-1).content[0].text);
      assert.ok(result.matches[0]);
      return assistant([call('review1', 'record_paper_review', { nodeId: result.matches[0].id, quote: 'Hello', criterion: 'source wording', verdict: 'pass' })], 'toolUse');
    }, assistant(),
  ]);
  const result = await f.service.chat(userId, f.context);
  const reviews = await mongoose.connection.db!.collection('copilot_paper_reviews').find({}).toArray();
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].conversationId, result.conversationId);
  const index = new PaperIndex({ userId, projectId, conversationId: 'another-conversation' }, f.snapshot, async () => 'Hello world.\n');
  await index.search('Hello');
  assert.equal((await index.status()).reviewedWindows, 0);
  await assert.rejects(index.recordReview({ nodeId: reviews[0].nodeId, quote: 'invented', criterion: 'source', verdict: 'pass' }), /exact evidence/);
});
