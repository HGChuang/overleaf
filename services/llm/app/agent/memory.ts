// Short-term conversation memory, storing the vendored agent-core message
// shapes (user / assistant / toolResult) as plain JSON — they serialize
// directly, no adapter layer. The keyPrefix defaults to `copilot:mem2`:
// threads stored under the previous LangChain-serialized format
// (`copilot:mem:*`) are simply never read and expire via their 1h TTL.

import redis from '../../config/redis.js';
import settings from '@overleaf/settings';
import type { AgentMessage } from './core/types.js';
import { microCompact, sanitizeToolPairing, snipCompact } from './compact.js';

const DEFAULT_SNIP_MAX = Number(settings.COPILOT_CONTEXT_SNIP_MAX || 50);
const DEFAULT_MICRO_KEEP = Number(settings.COPILOT_CONTEXT_MICRO_KEEP || 3);

// Defensive shape check on messages read back from Redis — a hand-edited or
// partially-written key must not crash the turn.
function isAgentMessage(m: unknown): m is AgentMessage {
  if (!m || typeof m !== 'object') return false;
  const role = (m as { role?: unknown }).role;
  return role === 'user' || role === 'assistant' || role === 'toolResult';
}

export class RedisMemoryStore {
  client: typeof redis;
  ttlSeconds: number;
  maxMessages: number;
  keyPrefix: string;
  snipMax: number;
  microKeep: number;
  private _chains: Map<string, Promise<unknown>>;

  constructor({
    client = redis,
    ttlSeconds = 60 * 60,
    maxMessages = 20,
    keyPrefix = 'copilot:mem2',
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

  buildKey(threadId: string): string {
    return `${this.keyPrefix}:${threadId}`;
  }

  private _enqueue<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
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
  // slice(-maxMessages) cap can both cut between an assistant message with
  // toolCall blocks and its toolResults, and a list with such orphans is
  // hard-rejected by OpenAI-compatible providers on the NEXT turn (poisoning
  // the thread for the rest of its sliding TTL).
  private _pipeline(messages: AgentMessage[]): AgentMessage[] {
    let next = microCompact(messages, this.microKeep); // L2: placeholder old tool results
    next = snipCompact(next, this.snipMax); // L1: keep head + tail, drop middle
    next = next.slice(-this.maxMessages); // hard cap (backstop)
    return sanitizeToolPairing(next); // repair any orphaned tool messages
  }

  async load(threadId: string | null): Promise<AgentMessage[]> {
    if (!threadId) {
      return [];
    }
    const raw = await this.client.get(this.buildKey(threadId));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    const messages = Array.isArray(parsed) ? parsed.filter(isAgentMessage) : [];
    // Defensive: histories compacted before a sanitizer fix, or written by an
    // older build, may already carry orphaned tool messages. Repair on read so
    // a once-poisoned thread heals instead of failing every turn.
    return sanitizeToolPairing(messages);
  }

  async append(threadId: string | null, messages: AgentMessage[]): Promise<void> {
    if (!threadId || !messages || messages.length === 0) {
      return;
    }
    return this._enqueue(threadId, async () => {
      const existing = await this.load(threadId);
      await this._store(threadId, this._pipeline([...existing, ...messages]));
    });
  }

  // Atomically replace the whole thread history. Used by the reactive-compact
  // recovery path: after a prompt_too_long retry succeeds against the
  // compacted history, the compacted form must be PERSISTED — append() would
  // merge the new turn into the old, still-oversized stored history and every
  // subsequent turn would prompt_too_long again (re-paying the summarize call
  // each time).
  async replace(threadId: string | null, messages: AgentMessage[]): Promise<void> {
    if (!threadId) {
      return;
    }
    return this._enqueue(threadId, async () => {
      await this._store(threadId, this._pipeline(messages || []));
    });
  }

  private async _store(threadId: string, messages: AgentMessage[]): Promise<void> {
    await this.client.set(
      this.buildKey(threadId),
      JSON.stringify(messages),
      'EX',
      this.ttlSeconds
    );
  }

  async clear(threadId: string | null): Promise<void> {
    if (!threadId) {
      return;
    }
    return this._enqueue(threadId, async () => {
      await this.client.del(this.buildKey(threadId));
    });
  }
}
