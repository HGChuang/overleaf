import redis from '../../config/redis.js';
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';

export class RedisMemoryStore {
  constructor({
    client = redis,
    ttlSeconds = 60 * 60,
    maxMessages = 20,
    keyPrefix = 'copilot:mem',
  } = {}) {
    this.client = client;
    this.ttlSeconds = ttlSeconds;
    this.maxMessages = maxMessages;
    this.keyPrefix = keyPrefix;
  }

  buildKey(threadId) {
    return `${this.keyPrefix}:${threadId}`;
  }

  async load(threadId) {
    if (!threadId) {
      return [];
    }
    const raw = await this.client.get(this.buildKey(threadId));
    if (!raw) {
      return [];
    }
    const storedMessages = JSON.parse(raw);
    return mapStoredMessagesToChatMessages(storedMessages);
  }

  async append(threadId, messages) {
    if (!threadId || !messages || messages.length === 0) {
      return;
    }
    const existing = await this.client.get(this.buildKey(threadId));
    const parsed = existing ? JSON.parse(existing) : [];
    const normalizedMessages = mapChatMessagesToStoredMessages(messages);
    const nextMessages = [...parsed, ...normalizedMessages].slice(-this.maxMessages);
    await this.client.set(this.buildKey(threadId), JSON.stringify(nextMessages), 'EX', this.ttlSeconds);
  }

  async clear(threadId) {
    if (!threadId) {
      return;
    }
    await this.client.del(this.buildKey(threadId));
  }
}
