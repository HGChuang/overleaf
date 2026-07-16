import { expect } from 'chai';
import Redis from 'ioredis-mock';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { RedisMemoryStore } from '../../../../app/agent/memory.js';

describe('RedisMemoryStore', function () {
  beforeEach(function () {
    this.redis = new Redis();
    this.store = new RedisMemoryStore({
      client: this.redis,
      ttlSeconds: 60,
      maxMessages: 2,
      keyPrefix: 'test:llm:mem',
    });
  });

  afterEach(async function () {
    await this.redis.flushall();
    this.redis.disconnect();
  });

  it('loads an empty history when thread has no state', async function () {
    const messages = await this.store.load('thread-empty');
    expect(messages).to.deep.equal([]);
  });

  it('appends and restores stored messages', async function () {
    await this.store.append('thread-1', [
      new HumanMessage('hello'),
      new AIMessage('world'),
    ]);

    const messages = await this.store.load('thread-1');
    expect(messages).to.have.length(2);
    expect(messages[0].content).to.equal('hello');
    expect(messages[1].content).to.equal('world');
  });

  it('keeps only the most recent messages up to the configured limit', async function () {
    await this.store.append('thread-2', [
      new HumanMessage('one'),
      new AIMessage('two'),
      new HumanMessage('three'),
    ]);

    const messages = await this.store.load('thread-2');
    expect(messages.map(message => message.content)).to.deep.equal(['two', 'three']);
  });

  it('clears a thread history', async function () {
    await this.store.append('thread-3', [new HumanMessage('persist me')]);
    await this.store.clear('thread-3');
    const messages = await this.store.load('thread-3');
    expect(messages).to.deep.equal([]);
  });
});
