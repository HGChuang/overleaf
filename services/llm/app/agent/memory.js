import redis from '../../config/redis.js';
import settings from '@overleaf/settings';
import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';
import { snipCompact, microCompact, sanitizeToolPairing } from './compact.js';

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
    // Per-thread promise chains serializing read-modify-write cycles. append()
    // is GET→merge→SET; two overlapping turns on the same thread would
    // otherwise lose one of them (last writer wins). Keyed by threadId and
    // cleaned up as chains drain, so this stays O(active threads).
    this._chains = new Map();
  }

  buildKey(threadId) {
    return `${this.keyPrefix}:${threadId}`;
  }

  _enqueue(threadId, fn) {
    const prev = this._chains.get(threadId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this._chains.set(threadId, next);
    const cleanup = () => {
      if (this._chains.get(threadId) === next) {
        this._chains.delete(threadId);
      }
    };
    next.then(cleanup, cleanup);
    return next;
  }

  // The shared compaction pipeline: cheap layers first, then the hard cap,
  // then repair tool-call pairing. ORDER MATTERS: sanitizeToolPairing must
  // run AFTER every truncation step — snipCompact's middle-drop and the
  // slice(-maxMessages) cap can both cut between an AIMessage with tool_calls
  // and its ToolMessages, and a list with such orphans is hard-rejected by
  // OpenAI-compatible providers on the NEXT turn (poisoning the thread for
  // the rest of its sliding TTL).
  _pipeline(messages) {
    let next = microCompact(messages, this.microKeep); // L2: placeholder old tool results
    next = snipCompact(next, this.snipMax); // L1: keep head + tail, drop middle
    next = next.slice(-this.maxMessages); // hard cap (backstop)
    return sanitizeToolPairing(next); // repair any orphaned tool messages
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
    const messages = mapStoredMessagesToChatMessages(storedMessages);
    // Defensive: histories written before sanitizeToolPairing entered the
    // append pipeline may already carry orphaned tool messages. Repair on
    // read so a once-poisoned thread heals instead of failing every turn.
    return sanitizeToolPairing(messages);
  }

  async append(threadId, messages) {
    if (!threadId || !messages || messages.length === 0) {
      return;
    }
    return this._enqueue(threadId, async () => {
      const raw = await this.client.get(this.buildKey(threadId));
      const existingStored = raw ? JSON.parse(raw) : [];
      // Deserialize the stored form to BaseMessage[] so the cheap compaction
      // helpers (which operate on BaseMessage) can run, then re-serialize.
      const existingMsgs = existingStored.length
        ? mapStoredMessagesToChatMessages(existingStored)
        : [];
      await this._store(threadId, this._pipeline([...existingMsgs, ...messages]));
    });
  }

  // Atomically replace the whole thread history. Used by the reactive-compact
  // recovery path: after a prompt_too_long retry succeeds against the
  // compacted history, the compacted form must be PERSISTED — append() would
  // merge the new turn into the old, still-oversized stored history and every
  // subsequent turn would prompt_too_long again (re-paying the summarize call
  // each time).
  async replace(threadId, messages) {
    if (!threadId) {
      return;
    }
    return this._enqueue(threadId, async () => {
      await this._store(threadId, this._pipeline(messages || []));
    });
  }

  async _store(threadId, messages) {
    const nextStored = mapChatMessagesToStoredMessages(messages);
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
    return this._enqueue(threadId, async () => {
      await this.client.del(this.buildKey(threadId));
    });
  }
}
