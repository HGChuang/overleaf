// Long-term, cross-conversation memory (s09). Keyed by `userIdentifier` —
// which resolves to the stable Mongo user `_id` (see utils/common.js
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
// RESILIENCE: every public method the service calls is wrapped to never
// throw. Long-term memory is an enhancement; it must never break a chat turn.

import { randomUUID } from 'crypto';
import { HumanMessage } from '@langchain/core/messages';
import redisClient from '../../config/redis.js';
import { extractTextContent } from './messageText.js';

const INDEX_PREFIX = 'copilot:ltmem';
const CONSOLIDATE_THRESHOLD = 12;
const CONSOLIDATE_TARGET = 8;
const MAX_MEMORIES = 60;
const MAX_RELEVANT = 5;
const MEMORY_TYPES = new Set(['user', 'feedback', 'project', 'reference']);

function slugify(name) {
  return String(name || `mem_${randomUUID().slice(0, 8)}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `mem_${randomUUID().slice(0, 8)}`;
}

// Tolerant JSON-array parse: scans for the first balanced [...] or {...} and
// parses it. Mirrors the tutorial's robust extraction (models often wrap JSON
// in prose / code fences).
function parseJsonArrayLoose(text) {
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

export class LongTermMemoryStore {
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
  }

  indexKey(userId) {
    return `${this.keyPrefix}:${userId}:index`;
  }
  memoryKey(userId, slug) {
    return `${this.keyPrefix}:${userId}:${slug}`;
  }

  async readIndex(userId) {
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

  async readMemory(userId, slug) {
    if (!userId || !slug) return null;
    try {
      const raw = await this.client.get(this.memoryKey(userId, slug));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async list(userId) {
    const index = await this.readIndex(userId);
    const memories = await Promise.all(
      index.map(entry => this.readMemory(userId, entry.slug))
    );
    return memories.filter(Boolean);
  }

  async _writeIndex(userId, index) {
    await this.client.set(this.indexKey(userId), JSON.stringify(index));
  }

  async writeMemory(userId, { name, type = 'user', description = '', body = '' } = {}) {
    if (!userId) return null;
    const slug = slugify(name);
    const memType = MEMORY_TYPES.has(type) ? type : 'user';
    const entry = {
      slug,
      name: String(name || slug),
      type: memType,
      description: String(description || '').slice(0, 200),
    };
    const record = {
      ...entry,
      body: String(body || ''),
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

  async clear(userId) {
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
  renderIndexForPrompt(index) {
    if (!Array.isArray(index) || index.length === 0) return '';
    const lines = index.map(
      e => `- [${e.name}] (${e.type}): ${e.description}`.trim()
    );
    return `<long_term_memory_index>\nRelevant long-term memories available (loaded on demand below when they match the conversation):\n${lines.join('\n')}\n</long_term_memory_index>`;
  }

  // Keyword selection: match recent user-message words against each memory's
  // name + description. The tutorial's LLM side-query path is supported via
  // `model` (when provided AND useLlmSelect=true) but keyword is the default
  // to avoid adding per-turn latency.
  async selectRelevant(userId, messages, { model = null, useLlmSelect = false } = {}) {
    const index = await this.readIndex(userId);
    if (index.length === 0) return [];

    const recentUserText = this._recentUserText(messages);
    if (!recentUserText) return [];

    if (useLlmSelect && model) {
      const llmSelected = await this._llmSelect(index, recentUserText, model);
      if (llmSelected) return llmSelected.slice(0, this.maxRelevant);
    }

    // keyword fallback
    const words = recentUserText
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(w => w && w.length > 3);
    const uniqueWords = [...new Set(words)];
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

  async _llmSelect(index, recentText, model) {
    try {
      const catalog = index
        .map((e, i) => `${i}: ${e.name} — ${e.description}`)
        .join('\n');
      const prompt =
        `Select the indices of memories clearly relevant to the recent conversation. ` +
        `Return ONLY a JSON array of integers, e.g. [0, 3]. If none are relevant, return [].\n\n` +
        `Recent conversation:\n${recentText.slice(0, 2000)}\n\nMemory catalog:\n${catalog}`;
      const res = await model.invoke([new HumanMessage(prompt)]);
      const text = extractTextContent(res);
      const indices = parseJsonArrayLoose(text);
      if (!indices) return null;
      return indices
        .filter(i => typeof i === 'number' && i >= 0 && i < index.length)
        .map(i => index[i].slug);
    } catch {
      return null;
    }
  }

  _recentUserText(messages) {
    if (!Array.isArray(messages)) return '';
    const texts = [];
    for (let i = messages.length - 1; i >= 0 && texts.length < 3; i--) {
      const m = messages[i];
      const role =
        typeof m?.getType === 'function'
          ? m.getType()
          : typeof m?._getType === 'function'
            ? m._getType()
            : null;
      if (role !== 'human' && role !== 'user') continue;
      texts.push(extractTextContent(m));
    }
    return texts.reverse().join(' ').trim();
  }

  // Load the full content of relevant memories as a block to prepend to the
  // user turn. Returns '' when nothing is relevant (so nothing is injected).
  async loadRelevant(userId, messages, opts = {}) {
    try {
      const slugs = await this.selectRelevant(userId, messages, opts);
      if (slugs.length === 0) return '';
      const memories = await Promise.all(
        slugs.map(slug => this.readMemory(userId, slug))
      );
      const parts = memories.filter(Boolean).map(mem => {
        const header = `[${mem.name}] (${mem.type})`;
        return `${header}\n${mem.body || mem.description || ''}`;
      });
      if (parts.length === 0) return '';
      return `<relevant_memories>\n${parts.join('\n\n')}\n</relevant_memories>`;
    } catch {
      return '';
    }
  }

  // Extract new memories from recent dialogue (fire-and-forget). LLM call.
  async extractMemories(userId, messages, model) {
    if (!userId || !model) return [];
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
      const res = await model.invoke([new HumanMessage(prompt)]);
      const items = parseJsonArrayLoose(extractTextContent(res));
      if (!items || items.length === 0) return [];
      const written = [];
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

  _formatDialogue(messages) {
    if (!Array.isArray(messages)) return '';
    const parts = [];
    const recent = messages.slice(-10);
    for (const m of recent) {
      const role =
        typeof m?.getType === 'function'
          ? m.getType()
          : typeof m?._getType === 'function'
            ? m._getType()
            : 'message';
      const text = extractTextContent(m);
      if (!text) continue;
      const label =
        role === 'human' || role === 'user'
          ? 'user'
          : role === 'ai' || role === 'assistant'
            ? 'assistant'
            : role;
      parts.push(`${label}: ${text}`);
    }
    return parts.join('\n');
  }

  // Consolidate (dedupe/merge) when the memory count crosses the threshold.
  // LLM call. Fire-and-forget from the service.
  async consolidate(userId, model) {
    if (!userId || !model) return false;
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
      const res = await model.invoke([new HumanMessage(prompt)]);
      const items = parseJsonArrayLoose(extractTextContent(res));
      if (!items || items.length === 0) return false;
      // replace all memories with the consolidated set
      await this.clear(userId);
      for (const mem of items.slice(0, this.maxMemories)) {
        await this.writeMemory(userId, {
          name: mem.name,
          type: mem.type,
          description: mem.description,
          body: mem.body,
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}
