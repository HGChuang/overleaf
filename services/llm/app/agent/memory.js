import redis from '../../config/redis.js';
import settings from '@overleaf/settings';
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';
import { snipCompact, microCompact } from './compact.js';

const DEFAULT_SNIP_MAX = Number(settings.COPILOT_CONTEXT_SNIP_MAX || 50);
const DEFAULT_MICRO_KEEP = Number(settings.COPILOT_CONTEXT_MICRO_KEEP || 3);

export class RedisMemoryStore {
  constructor({
    client = redis,
    ttlSeconds = 60 * 60,
    maxMessages = 20,
    keyPrefix = 'copilot:mem',
    snipMax = DEFAULT_SNIP_MAX,
    microKeep = DEFAULT_MICRO_KEEP,
  } = {}) {
    this.client = client;
    this.ttlSeconds = ttlSeconds;
    this.maxMessages = maxMessages;
    this.keyPrefix = keyPrefix;
    this.snipMax = snipMax;
    this.microKeep = microKeep;
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
    const raw = await this.client.get(this.buildKey(threadId));
    const existingStored = raw ? JSON.parse(raw) : [];
    // Deserialize the stored form to BaseMessage[] so the cheap compaction
    // helpers (which operate on BaseMessage) can run, then re-serialize. The
    // hard `slice(-maxMessages)` cap is preserved as the backstop, so the
    // small-history semantics the tests rely on are unchanged; compaction
    // only does anything once tool results / message count grow.
    const existingMsgs = existingStored.length
      ? mapStoredMessagesToChatMessages(existingStored)
      : [];
    let next = [...existingMsgs, ...messages];
    next = microCompact(next, this.microKeep); // L2: placeholder old tool results
    next = snipCompact(next, this.snipMax); // L1: keep head + tail, drop middle
    next = next.slice(-this.maxMessages); // hard cap (backstop)
    const nextStored = mapChatMessagesToStoredMessages(next);
    await this.client.set(
      this.buildKey(threadId),
      JSON.stringify(nextStored),
      'EX',
      this.ttlSeconds
    );
  }

  async clear(threadId) {
    if (!threadId) {
      return;
    }
    await this.client.del(this.buildKey(threadId));
  }
}
