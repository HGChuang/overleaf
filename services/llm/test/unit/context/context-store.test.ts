import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { before, after, describe, it } from 'mocha';
import mongoose from 'mongoose';
import settings from '@overleaf/settings';
import { ContextStore } from '../../../app/agent/context/context-store.js';
import { hashMessages, reducePaperState } from '../../../app/agent/context/paper-state.js';
import type { ContextEpoch } from '../../../app/agent/context/types.js';
import { EMPTY_USAGE } from '../../../app/agent/core/llm-types.js';
import { ApiKeyMapper } from '../../../app/mappers/keys.mapper.js';
import { ApiKeyModel } from '../../../app/models/api-key.model.js';

describe('Mongo context journal (isolated database)', function () {
  this.timeout(20000);
  const databaseName = `copilot_context_test_${randomUUID().replaceAll('-', '')}`;
  let connection: mongoose.Connection;
  let store: ContextStore;
  const scope = { userId: 'author', projectId: 'paper', conversationId: 'conversation', source: 'panel' as const };
  before(async () => {
    connection = await mongoose.createConnection(settings.MONGO_URL, { dbName: databaseName }).asPromise();
    const hello = await connection.db!.admin().command({ hello: 1 });
    assert.ok(hello.setName, 'Context journal requires a Mongo replica set');
    store = new ContextStore(connection);
  });
  after(async () => {
    if (connection?.db && connection.db.databaseName === databaseName) await connection.db.dropDatabase();
    await connection?.close();
  });
  it('serializes workers, rejects cross-project reuse and persists large exact artifacts', async () => {
    const session = await store.open(scope);
    await assert.rejects(store.open(scope), /busy/);
    await assert.rejects(store.open({ ...scope, projectId: 'another-paper' }), /another project/);
    const content = '论文、\\cite{a}、may、p99=412 ms\n'.repeat(4000);
    await session.append({ role: 'user', content, timestamp: 1 });
    await session.close();
    const restored = await store.open(scope);
    assert.equal((restored.messages[0] as any).content, content);
    assert.equal(await connection.db!.collection('copilot_context_artifacts.files').countDocuments(), 1);
    assert.equal(await store.history('other-author', scope.conversationId), null);
    await restored.close();
  });
  it('commits a checkpoint without losing events appended while it was prepared', async () => {
    const session = await store.open({ ...scope, conversationId: 'epoch-test' });
    await session.append({ role: 'user', content: 'Keep may and the confidence interval.', timestamp: 1 });
    const epoch: ContextEpoch = { version: 1, generation: 1, coveredMessages: 1,
      coveredHash: hashMessages(session.messages), checkpoint: reducePaperState(session.messages),
      prefix: { role: 'user', content: 'frozen prefix', timestamp: 0 } };
    await session.append({ role: 'user', content: 'New work arrives after the boundary.', timestamp: 2 });
    await session.commit(epoch);
    await assert.rejects(session.commit(epoch), /boundary/);
    await session.close();
    const restored = await store.open({ ...scope, conversationId: 'epoch-test' });
    assert.equal(restored.messages.length, 2);
    assert.deepEqual(restored.epoch, epoch);
    await restored.close();
  });
  it('fences an expired worker even after another worker acquires the conversation', async () => {
    const testScope = { ...scope, conversationId: 'fence-test' };
    const stale = await store.open(testScope);
    await connection.db!.collection('copilot_conversations').updateOne({ 'scope.conversationId': testScope.conversationId }, { $set: { leaseUntil: new Date(0) } });
    const owner = await store.open(testScope);
    await assert.rejects(stale.renew(), /expired/);
    await assert.rejects(stale.append({ role: 'user', content: 'must not commit', timestamp: 1 }), /lease/);
    await stale.close();
    await owner.append({ role: 'user', content: 'current worker', timestamp: 2 });
    assert.equal(owner.messages.length, 1);
    await owner.close();
  });
  it('recovers a completed tool receipt after a crash before the group was appended', async () => {
    const testScope = { ...scope, conversationId: 'receipt-test' };
    const session = await store.open(testScope);
    await session.append({ role: 'user', content: 'inspect source', timestamp: 1 });
    await session.append({ role: 'assistant', content: [{ type: 'toolCall', id: 'read-1', name: 'read_file', arguments: { path: 'main.tex' } }],
      timestamp: 2, api: 'test', provider: 'test', model: 'test', usage: EMPTY_USAGE, stopReason: 'toolUse' });
    const receipt = { role: 'toolResult' as const, toolCallId: 'read-1', toolName: 'read_file', isError: false, timestamp: 3,
      content: [{ type: 'text' as const, text: 'may improve; p99=412 ms' }] };
    await session.recordTool!(receipt);
    await session.close();
    const recovered = await store.open(testScope);
    assert.equal(recovered.messages.length, 2);
    assert.deepEqual(await recovered.recoverTool!('read-1'), receipt);
    await recovered.append(receipt);
    await recovered.close();
  });
  it('paginates at author-turn boundaries without duplicating or omitting events', async () => {
    const testScope = { ...scope, conversationId: 'page-test' };
    const session = await store.open(testScope);
    for (let i = 0; i < 105; i++) await session.append({ role: 'user', content: `request ${i}`, timestamp: i });
    await session.close();
    const page = await store.historyPage(scope.userId, testScope.conversationId);
    assert.equal(page!.messages.length, 100);
    assert.equal(page!.nextBefore, 5);
    const earlier = await store.historyPage(scope.userId, testScope.conversationId, page!.nextBefore!);
    assert.equal(earlier!.messages.length, 5);
    assert.equal(earlier!.nextBefore, null);
    assert.deepEqual([...earlier!.messages, ...page!.messages], session.messages);
  });
  it('lists project conversations by their first author question', async () => {
    const first = await store.open({ ...scope, conversationId: 'list-first' });
    await first.append({ role: 'user', content: JSON.stringify({
      MESSAGE: 'How should I revise the abstract?', MESSAGE_KIND: 'author', CONTEXT: {},
    }), timestamp: 1 });
    await first.close();
    const second = await store.open({ ...scope, conversationId: 'list-second' });
    await second.append({ role: 'user', content: JSON.stringify({
      MESSAGE: '[automatic verification]', MESSAGE_KIND: 'system_event', CONTEXT: {},
    }), timestamp: 2 });
    await second.append({ role: 'assistant', content: [{ type: 'text', text: 'verified' }],
      timestamp: 3, api: 'test', provider: 'test', model: 'test', usage: EMPTY_USAGE, stopReason: 'stop' });
    await second.append({ role: 'user', content: JSON.stringify({
      MESSAGE: 'Fix the syntax error in main.tex', MESSAGE_KIND: 'author', CONTEXT: {},
    }), timestamp: 4 });
    await second.close();

    const conversations = await store.listConversations(scope.userId, scope.projectId);
    assert.deepEqual(conversations.filter(item => item.conversationId.startsWith('list-')).map(item => ({
      conversationId: item.conversationId, firstQuestion: item.firstQuestion,
    })), [
      { conversationId: 'list-second', firstQuestion: 'Fix the syntax error in main.tex' },
      { conversationId: 'list-first', firstQuestion: 'How should I revise the abstract?' },
    ]);
    assert.equal((await store.listConversations('other-author', scope.projectId)).length, 0);
  });
  it('persists limits for only the authenticated user’s named provider and model', async () => {
    const user = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    await connection.db!.collection('users').insertMany([user, other].map(_id => ({ _id,
      llminfo: [{ name: 'provider', apiKey: 'test-only', models: [{ id: 'alpha' }, { id: 'beta' }] }],
    })));
    const mapper = new ApiKeyMapper();
    mapper.model = connection.model('users', ApiKeyModel.getModel().schema) as any;
    await mapper.updateModelLimits(user.toHexString(), 'provider', 'alpha', { contextWindow: 128000, maxTokens: 16000 });
    const saved = await connection.db!.collection('users').findOne({ _id: user });
    const unchanged = await connection.db!.collection('users').findOne({ _id: other });
    assert.equal(saved!.llminfo[0].models[0].contextWindow, 128000);
    assert.equal(saved!.llminfo[0].models[1].contextWindow, undefined);
    assert.equal(unchanged!.llminfo[0].models[0].contextWindow, undefined);
    assert.equal(saved!.llminfo[0].apiKey, 'test-only');
    await assert.rejects(mapper.updateModelLimits(user.toHexString(), 'provider', 'missing', { contextWindow: 128000, maxTokens: 16000 }), /not found/);
  });
});
