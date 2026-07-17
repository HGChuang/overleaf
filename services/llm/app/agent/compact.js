// Pure context-compaction helpers (s08, layers L1 + L2). 0 LLM calls.
//
// These operate on langchain `BaseMessage` instances (HumanMessage / AIMessage
// / ToolMessage), so they compose with RedisMemoryStore's existing
// mapStoredMessagesToChatMessages / mapChatMessagesToStoredMessages round-trip:
// the store deserializes the stored JSON to BaseMessage[], compacts, then
// re-serializes. The LLM-backed L4 `summarizeHistory` (one API call) is wired
// in M3 alongside the reactive recovery, because it needs the per-user model
// the model-free store does not hold at construction time.
//
// Design principle (from the tutorial): cheap layers run first, the expensive
// LLM layer runs last. Here we only implement the cheap layers.

import { HumanMessage, ToolMessage } from '@langchain/core/messages';

function isToolMessage(m) {
  if (!m) return false;
  const t = typeof m._getType === 'function' ? m._getType() : null;
  const t2 = typeof m.getType === 'function' ? m.getType() : null;
  return t === 'tool' || t2 === 'tool';
}

// L1 — snip: keep `keepHead` head messages (initial context) + the tail
// (max - keepHead), replacing the dropped middle with a single placeholder.
// No-op when the list is already within `max`. `keepHead` is clamped so it can
// never exceed half of max (avoids a degenerate head > tail split for tiny max).
export function snipCompact(messages, max = 50, keepHead = 3) {
  if (!Array.isArray(messages) || messages.length <= max) {
    return messages || [];
  }
  const head = Math.max(0, Math.min(keepHead, Math.floor(max / 2)));
  const tail = Math.max(0, max - head);
  const dropped = messages.length - head - tail;
  const placeholder = new HumanMessage({
    content: `[snipped ${dropped} messages from conversation middle]`,
  });
  return [...messages.slice(0, head), placeholder, ...messages.slice(-tail)];
}

// L2 — micro: replace the *content* of old ToolMessage results with a one-line
// placeholder, keeping only the most recent `keepRecent` tool results intact.
// This bounds the bulk that accumulates from repeated read_file / run_checks
// outputs. Tool identity (id / name) is preserved so the conversation still
// parses; only the bulky content is dropped.
export function microCompact(messages, keepRecent = 3) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages || [];
  }
  const toolIndices = [];
  messages.forEach((m, i) => {
    if (isToolMessage(m)) toolIndices.push(i);
  });
  if (toolIndices.length <= keepRecent) {
    return messages;
  }
  const keep = new Set(toolIndices.slice(-keepRecent));
  return messages.map((m, i) => {
    if (!isToolMessage(m) || keep.has(i)) {
      return m;
    }
    const content =
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    if (content.length <= 120) {
      return m; // already small, leave it
    }
    return new ToolMessage({
      content: '[Earlier tool result compacted. Re-run the tool if needed.]',
      tool_call_id: m.tool_call_id ?? m.id ?? `compact_${i}`,
      name: m.name ?? undefined,
    });
  });
}

// Rough byte-size estimate of a message list, for threshold checks. Cheap and
// good enough — does not need a tokenizer.
export function estimateBytes(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    const c = typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? {});
    total += c.length;
    if (Array.isArray(m?.tool_calls)) {
      total += JSON.stringify(m.tool_calls).length;
    }
  }
  return total;
}
