// Long-term, cross-conversation memory (s09). Keyed by `userIdentifier` —
// which resolves to the stable Mongo user `_id` (see utils/common.ts
// getUserIdentifier), so memories persist across conversations and sessions,
// unlike the per-conversation short-term RedisMemoryStore.
//
// Storage (Redis = our "filesystem", matching the s09 analogy):
//   copilot:ltmem:{userId}:index   → JSON array of {slug,name,description,type}
//   copilot:ltmem:{userId}:{slug}  → JSON {name,type,description,body,updatedAt}
// No TTL — long-term memories are persistent. Consolidation (dedupe/merge)
// runs when the count crosses a threshold.
//
// Flow in CopilotService.chat:
//   1. readIndex → inject the one-line-per-memory catalog into the SYSTEM
//      prompt (cheap, always present, describes what's available).
//   2. loadRelevant → keyword-select memories whose name/description match the
//      recent user messages, read their full content, inject into the USER
//      turn. (LLM side-query selection is supported but disabled by default to
//      avoid per-turn latency.)
//   3. after the turn → extractMemories (fire-and-forget LLM) writes new
//      user/feedback/project/reference memories; consolidate (fire-and-forget)
//      trims when count ≥ threshold.
//
// LLM access goes through a `TextCompleter` closure (recovery.ts) supplied by
// the service, so this store stays model-free.
//
// RESILIENCE: every public method the service calls is wrapped to never
// throw. Long-term memory is an enhancement; it must never break a chat turn.

import { randomUUID } from 'crypto';
import redisClient from '../../config/redis.js';
import { extractTextContent } from './messageText.js';
import type { AgentMessage } from './core/types.js';
import type { TextCompleter } from './recovery.js';

const INDEX_PREFIX = 'copilot:ltmem';
const CONSOLIDATE_THRESHOLD = 12;
const CONSOLIDATE_TARGET = 8;
const MAX_MEMORIES = 60;
const MAX_RELEVANT = 5;
const MAX_BODY_CHARS = 4000;
const MAX_RELEVANT_CHARS = 6000;
const MAX_QUERY_TOKENS = 64;
const MEMORY_TYPES = new Set(['user', 'feedback', 'project', 'reference']);

// Keyword tokenizer for memory retrieval. The previous latin-only split
// (/[^a-z0-9]+/i) treated every CJK character as a SEPARATOR, so a pure
// Chinese message tokenized to nothing and retrieval silently never matched —
// memories were written but never loaded for Chinese conversations. Text is
// scanned as alternating CJK / latin-alnum runs: unsegmented CJK runs index
// as overlapping bigrams (plus the whole run when short), latin words keep a
// length floor to skip noise.
function tokenizeForMatch(text: string): string[] {
  const tokens = new Set<string>();
  const runs = String(text || '').toLowerCase().match(/[a-z0-9]+|[一-鿿]+/gu) || [];
  for (const run of runs) {
    if (/^[一-鿿]+$/.test(run)) {
      if (run.length <= 6) tokens.add(run);
      for (let i = 0; i < run.length - 1; i++) {
        tokens.add(run.slice(i, i + 2));
      }
    } else if (run.length > 2) {
      tokens.add(run);
    }
    if (tokens.size >= MAX_QUERY_TOKENS) break;
  }
  return [...tokens].slice(0, MAX_QUERY_TOKENS);
}

function slugify(name: string): string {
  return (
    String(name || `mem_${randomUUID().slice(0, 8)}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || `mem_${randomUUID().slice(0, 8)}`
  );
}

// Tolerant JSON-array parse: scans for the first balanced [...] or {...} and
// parses it. Mirrors the tutorial's robust extraction (models often wrap JSON
// in prose / code fences).
function parseJsonArrayLoose(text: string): any[] | null {
  if (!text || typeof text !== 'string') return null;
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const open = candidate[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    if (parsed && Array.isArray(parsed.memories)) return parsed.memories;
    return null;
  } catch {
    return null;
  }
}

interface MemoryIndexEntry {
  slug: string;
  name: string;
  type: string;
  description: string;
}

interface MemoryRecord extends MemoryIndexEntry {
  body: string;
  updatedAt: string;
}

export class LongTermMemoryStore {
  client: typeof redisClient;
  keyPrefix: string;
  consolidateThreshold: number;
  consolidateTarget: number;
  maxMemories: number;
  maxRelevant: number;
  private _userChains: Map<string, Promise<unknown>>;

  constructor({
    client = redisClient,
    keyPrefix = INDEX_PREFIX,
    consolidateThreshold = CONSOLIDATE_THRESHOLD,
    consolidateTarget = CONSOLIDATE_TARGET,
    maxMemories = MAX_MEMORIES,
    maxRelevant = MAX_RELEVANT,
  } = {}) {
    this.client = client;
    this.keyPrefix = keyPrefix;
    this.consolidateThreshold = consolidateThreshold;
    this.consolidateTarget = consolidateTarget;
    this.maxMemories = maxMemories;
    this.maxRelevant = maxRelevant;
    // Per-user promise chains serializing the background write paths
    // (extractMemories + consolidate). Those run fire-and-forget and can
    // overlap across requests; without serialization their
    // read-index→write-index cycles race and clobber each other.
    this._userChains = new Map();
  }

  // Run `fn` after all previously queued work for this user settles. Errors
  // in earlier links never block later ones.
  runExclusive<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const key = String(userId);
    const prev = this._userChains.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this._userChains.set(key, next);
    const cleanup = () => {
      if (this._userChains.get(key) === next) {
        this._userChains.delete(key);
      }
    };
    next.then(cleanup, cleanup);
    return next;
  }

  indexKey(userId: string): string {
    return `${this.keyPrefix}:${userId}:index`;
  }
  memoryKey(userId: string, slug: string): string {
    return `${this.keyPrefix}:${userId}:${slug}`;
  }

  async readIndex(userId: string): Promise<MemoryIndexEntry[]> {
    if (!userId) return [];
    try {
      const raw = await this.client.get(this.indexKey(userId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async readMemory(userId: string, slug: string): Promise<MemoryRecord | null> {
    if (!userId || !slug) return null;
    try {
      const raw = await this.client.get(this.memoryKey(userId, slug));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async list(userId: string): Promise<MemoryRecord[]> {
    const index = await this.readIndex(userId);
    const memories = await Promise.all(
      index.map(entry => this.readMemory(userId, entry.slug))
    );
    return memories.filter(Boolean) as MemoryRecord[];
  }

  private async _writeIndex(userId: string, index: MemoryIndexEntry[]): Promise<void> {
    await this.client.set(this.indexKey(userId), JSON.stringify(index));
  }

  async writeMemory(
    userId: string,
    { name, type = 'user', description = '', body = '' }: { name?: string; type?: string; description?: string; body?: string } = {}
  ): Promise<MemoryRecord | null> {
    if (!userId) return null;
    const slug = slugify(name || '');
    const memType = MEMORY_TYPES.has(type) ? type : 'user';
    const entry: MemoryIndexEntry = {
      slug,
      name: String(name || slug),
      type: memType,
      description: String(description || '').slice(0, 200),
    };
    const record: MemoryRecord = {
      ...entry,
      // Cap the body: an unbounded body rides back into the user turn via
      // loadRelevant and can bloat the context well past the model window.
      body: String(body || '').slice(0, MAX_BODY_CHARS),
      updatedAt: new Date().toISOString(),
    };
    await this.client.set(this.memoryKey(userId, slug), JSON.stringify(record));
    // upsert into index
    const index = await this.readIndex(userId);
    const idx = index.findIndex(e => e.slug === slug);
    if (idx >= 0) index[idx] = entry;
    else index.push(entry);
    await this._writeIndex(userId, index);
    return record;
  }

  async clear(userId: string): Promise<void> {
    if (!userId) return;
    try {
      const index = await this.readIndex(userId);
      await Promise.all(
        index.map(entry => this.client.del(this.memoryKey(userId, entry.slug)))
      );
      await this.client.del(this.indexKey(userId));
    } catch {
      /* swallow */
    }
  }

  // Render the index as a one-line-per-memory catalog for the SYSTEM prompt.
  // Cheap, always present, tells the model what long-term knowledge exists.
  renderIndexForPrompt(index: MemoryIndexEntry[]): string {
    if (!Array.isArray(index) || index.length === 0) return '';
    const lines = index.map(
      e => `- [${e.name}] (${e.type}): ${e.description}`.trim()
    );
    return `<long_term_memory_index>\nRelevant long-term memories available (loaded on demand below when they match the conversation):\n${lines.join('\n')}\n</long_term_memory_index>`;
  }

  // Keyword selection: match recent user-message words against each memory's
  // name + description. The LLM side-query path is supported via `complete`
  // (when provided AND useLlmSelect=true) but keyword is the default to avoid
  // adding per-turn latency.
  async selectRelevant(
    userId: string,
    messages: AgentMessage[],
    { complete = null, useLlmSelect = false }: { complete?: TextCompleter | null; useLlmSelect?: boolean } = {}
  ): Promise<string[]> {
    const index = await this.readIndex(userId);
    if (index.length === 0) return [];

    const recentUserText = this._recentUserText(messages);
    if (!recentUserText) return [];

    if (useLlmSelect && complete) {
      const llmSelected = await this._llmSelect(index, recentUserText, complete);
      if (llmSelected) return llmSelected.slice(0, this.maxRelevant);
    }

    // keyword fallback
    const uniqueWords = tokenizeForMatch(recentUserText);
    if (uniqueWords.length === 0) return [];
    const scored = index
      .map(entry => {
        const hay = `${entry.name} ${entry.description}`.toLowerCase();
        const score = uniqueWords.reduce(
          (n, w) => (hay.includes(w) ? n + 1 : n),
          0
        );
        return { entry, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, this.maxRelevant).map(s => s.entry.slug);
  }

  private async _llmSelect(
    index: MemoryIndexEntry[],
    recentText: string,
    complete: TextCompleter
  ): Promise<string[] | null> {
    try {
      const catalog = index
        .map((e, i) => `${i}: ${e.name} — ${e.description}`)
        .join('\n');
      const prompt =
        `Select the indices of memories clearly relevant to the recent conversation. ` +
        `Return ONLY a JSON array of integers, e.g. [0, 3]. If none are relevant, return [].\n\n` +
        `Recent conversation:\n${recentText.slice(0, 2000)}\n\nMemory catalog:\n${catalog}`;
      const text = await complete(prompt);
      const indices = parseJsonArrayLoose(text || '');
      if (!indices) return null;
      return indices
        .filter(i => typeof i === 'number' && i >= 0 && i < index.length)
        .map(i => index[i].slug);
    } catch {
      return null;
    }
  }

  private _recentUserText(messages: AgentMessage[]): string {
    if (!Array.isArray(messages)) return '';
    const texts: string[] = [];
    for (let i = messages.length - 1; i >= 0 && texts.length < 3; i--) {
      const m = messages[i];
      if (m?.role !== 'user') continue;
      texts.push(extractTextContent(m));
    }
    return texts.reverse().join(' ').trim();
  }

  // Load the full content of relevant memories as a block to prepend to the
  // user turn. Returns '' when nothing is relevant (so nothing is injected).
  // The whole block is capped so a batch of max-size memories can't blow up
  // the context on its own.
  async loadRelevant(
    userId: string,
    messages: AgentMessage[],
    opts: { complete?: TextCompleter | null; useLlmSelect?: boolean } = {}
  ): Promise<string> {
    try {
      const slugs = await this.selectRelevant(userId, messages, opts);
      if (slugs.length === 0) return '';
      const memories = await Promise.all(
        slugs.map(slug => this.readMemory(userId, slug))
      );
      const parts: string[] = [];
      let budget = MAX_RELEVANT_CHARS;
      for (const mem of memories.filter(Boolean) as MemoryRecord[]) {
        const header = `[${mem.name}] (${mem.type})`;
        const part = `${header}\n${mem.body || mem.description || ''}`;
        if (part.length > budget) {
          if (parts.length === 0) parts.push(part.slice(0, MAX_RELEVANT_CHARS));
          break;
        }
        parts.push(part);
        budget -= part.length;
      }
      if (parts.length === 0) return '';
      return `<relevant_memories>\n${parts.join('\n\n')}\n</relevant_memories>`;
    } catch {
      return '';
    }
  }

  // Extract new memories from recent dialogue (fire-and-forget). LLM call.
  async extractMemories(
    userId: string,
    messages: AgentMessage[],
    complete: TextCompleter | null
  ): Promise<MemoryRecord[]> {
    if (!userId || !complete) return [];
    try {
      const dialogue = this._formatDialogue(messages);
      if (!dialogue) return [];
      const existing = await this.readIndex(userId);
      const existingDesc =
        existing.length > 0
          ? existing.map(m => `- ${m.name}: ${m.description}`).join('\n')
          : '(none)';
      const prompt =
        `Extract durable user preferences, constraints, or project facts from this dialogue.\n` +
        `Return a JSON array. Each item: {name, type, description, body}.\n` +
        `- name: short kebab-case identifier\n` +
        `- type: one of 'user' (preference), 'feedback' (guidance on how to work), 'project' (project fact), 'reference' (external pointer)\n` +
        `- description: one-line summary for index lookup\n` +
        `- body: full detail in markdown\n` +
        `If nothing new or already covered by existing memories, return [].\n\n` +
        `Existing memories:\n${existingDesc}\n\nDialogue:\n${dialogue.slice(0, 4000)}`;
      const items = parseJsonArrayLoose((await complete(prompt)) || '');
      if (!items || items.length === 0) return [];
      const written: MemoryRecord[] = [];
      for (const mem of items) {
        if (!mem || (!mem.description && !mem.body)) continue;
        const rec = await this.writeMemory(userId, {
          name: mem.name,
          type: mem.type,
          description: mem.description,
          body: mem.body,
        });
        if (rec) written.push(rec);
      }
      return written;
    } catch {
      return [];
    }
  }

  private _formatDialogue(messages: AgentMessage[]): string {
    if (!Array.isArray(messages)) return '';
    const parts: string[] = [];
    const recent = messages.slice(-10);
    for (const m of recent) {
      const text = extractTextContent(m);
      if (!text) continue;
      const label =
        m?.role === 'user' ? 'user' : m?.role === 'assistant' ? 'assistant' : String(m?.role || 'message');
      parts.push(`${label}: ${text}`);
    }
    return parts.join('\n');
  }

  // Consolidate (dedupe/merge) when the memory count crosses the threshold.
  // LLM call. Fire-and-forget from the service (serialized per user via
  // runExclusive there).
  async consolidate(userId: string, complete: TextCompleter | null): Promise<boolean> {
    if (!userId || !complete) return false;
    try {
      const index = await this.readIndex(userId);
      if (index.length < this.consolidateThreshold) return false;
      const memories = await this.list(userId);
      const catalog = memories
        .map(
          m =>
            `## ${m.slug}\nname: ${m.name}\ntype: ${m.type}\ndescription: ${m.description}\n${m.body || ''}`
        )
        .join('\n\n');
      const prompt =
        `Consolidate these memory files. Rules:\n` +
        `1. Merge duplicates into one.\n2. Remove outdated/contradicted memories.\n` +
        `3. Keep the total under ${this.consolidateTarget} memories.\n` +
        `4. Preserve important user preferences above all.\n` +
        `Return a JSON array. Each item: {name, type, description, body}.\n\n${catalog.slice(0, 16000)}`;
      const items = parseJsonArrayLoose((await complete(prompt)) || '');
      if (!items || items.length === 0) return false;
      // Upsert the consolidated set FIRST, then delete stale entries and
      // rewrite the index. The previous clear()-then-rewrite had a window
      // where a crash lost EVERY memory, and a concurrent extractMemories
      // could resurrect slugs the consolidation had just removed.
      const newSlugs = new Set<string>();
      const newIndex: MemoryIndexEntry[] = [];
      for (const mem of items.slice(0, this.maxMemories)) {
        const rec = await this.writeMemory(userId, {
          name: mem.name,
          type: mem.type,
          description: mem.description,
          body: mem.body,
        });
        if (rec) {
          newSlugs.add(rec.slug);
          newIndex.push({
            slug: rec.slug,
            name: rec.name,
            type: rec.type,
            description: rec.description,
          });
        }
      }
      if (newSlugs.size === 0) return false;
      const stale = index.filter(e => !newSlugs.has(e.slug));
      await Promise.all(
        stale.map(e => this.client.del(this.memoryKey(userId, e.slug)))
      );
      await this._writeIndex(userId, newIndex);
      return true;
    } catch {
      return false;
    }
  }
}
