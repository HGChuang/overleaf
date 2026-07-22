import { expect } from 'chai';
import Redis from 'ioredis-mock';
import { RedisMemoryStore } from '../../../../app/agent/memory.js';
import type { AgentMessage } from '../../../../app/agent/core/types.js';

function userMessage(content: string): AgentMessage {
  return { role: 'user', content, timestamp: Date.now() };
}

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
    await this.store.append('thread-1', [userMessage('hello'), userMessage('world')]);

    const messages = await this.store.load('thread-1');
    expect(messages).to.have.length(2);
    expect(messages[0].content).to.equal('hello');
    expect(messages[1].content).to.equal('world');
  });

  it('keeps only the most recent messages up to the configured limit', async function () {
    await this.store.append('thread-2', [
      userMessage('one'),
      userMessage('two'),
      userMessage('three'),
    ]);

    const messages = await this.store.load('thread-2');
    expect(messages.map((m: AgentMessage) => m.content)).to.deep.equal(['two', 'three']);
  });

  it('drops orphaned tool results when loading', async function () {
    // Write a poisoned history directly: an assistant toolCall whose
    // toolResult was truncated away, plus a stray orphan toolResult.
    const poisoned: AgentMessage[] = [
      userMessage('q'),
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'call_1', name: 'read_file', arguments: {} }],
        api: 'openai-completions',
        provider: 'test',
        model: 'm',
        usage: {
          input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: Date.now(),
      },
      {
        role: 'toolResult',
        toolCallId: 'unrelated',
        toolName: 'read_file',
        content: [{ type: 'text', text: 'orphan' }],
        isError: false,
        timestamp: Date.now(),
      },
    ];
    await this.redis.set('test:llm:mem:thread-poison', JSON.stringify(poisoned));

    const messages = await this.store.load('thread-poison');
    // The unpaired assistant (no visible content once toolCalls strip) and
    // the orphan toolResult are both dropped; only the user message survives.
    expect(messages).to.have.length(1);
    expect(messages[0].role).to.equal('user');
  });

  it('replace atomically rewrites a thread history', async function () {
    await this.store.append('thread-4', [userMessage('old')]);
    await this.store.replace('thread-4', [userMessage('new'), userMessage('turn')]);
    const messages = await this.store.load('thread-4');
    expect(messages.map((m: AgentMessage) => m.content)).to.deep.equal(['new', 'turn']);
  });

  it('clears a thread history', async function () {
    await this.store.append('thread-3', [userMessage('persist me')]);
    await this.store.clear('thread-3');
    const messages = await this.store.load('thread-3');
    expect(messages).to.deep.equal([]);
  });
});
