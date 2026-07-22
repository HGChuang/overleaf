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

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

function isToolMessage(m) {
  if (!m) return false;
  const t = typeof m._getType === 'function' ? m._getType() : null;
  const t2 = typeof m.getType === 'function' ? m.getType() : null;
  return t === 'tool' || t2 === 'tool';
}

function isAiMessage(m) {
  if (!m) return false;
  const t = typeof m._getType === 'function' ? m._getType() : null;
  const t2 = typeof m.getType === 'function' ? m.getType() : null;
  return t === 'ai' || t2 === 'ai';
}

function hasTextContent(m) {
  if (typeof m?.content === 'string') return m.content.length > 0;
  if (Array.isArray(m?.content)) return m.content.length > 0;
  return false;
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

// Tool-call pairing repair. ANY truncation of the message list (the hard
// slice(-maxMessages) cap in RedisMemoryStore, snipCompact's middle-drop, or
// reactiveCompact's tail-keep) can cut between an AIMessage carrying
// tool_calls and the ToolMessages that answer it. OpenAI-compatible providers
// HARD-REJECT such a history ("messages with role 'tool' must be a response
// to a preceding message with 'tool_calls'") — and because the poisoned list
// is what gets persisted, every subsequent turn of that conversation would
// fail the same way until the thread expires. This pass makes the list
// provider-safe again:
//   - an AIMessage whose tool_calls are NOT all answered by the ToolMessages
//     immediately following it is degraded to a plain assistant message
//     (tool_calls stripped; dropped entirely if it has no content either);
//   - a ToolMessage not consumed by such a pair (orphan) is dropped.
// The conversation loses the broken tool round-trip but stays loadable.
export function sanitizeToolPairing(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages || [];
  }
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (isAiMessage(m) && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const ids = m.tool_calls.map(tc => tc && tc.id).filter(Boolean);
      // Collect the run of ToolMessages immediately after this AIMessage.
      const following = [];
      let j = i + 1;
      while (j < messages.length && isToolMessage(messages[j])) {
        following.push(messages[j]);
        j++;
      }
      const answered = new Set(following.map(tm => tm.tool_call_id));
      const allAnswered = ids.length > 0 && ids.every(id => answered.has(id));
      if (allAnswered) {
        result.push(m);
        for (const tm of following) {
          if (ids.includes(tm.tool_call_id)) result.push(tm);
        }
      } else if (hasTextContent(m)) {
        // Degrade to a plain assistant message; strip provider-specific
        // tool_call fields from additional_kwargs too so nothing dangling
        // remains for strict providers to reject.
        const extra = { ...(m.additional_kwargs || {}) };
        delete extra.tool_calls;
        result.push(
          new AIMessage({ content: m.content, additional_kwargs: extra })
        );
      }
      // Either way the immediately-following ToolMessages are consumed here
      // (paired ones kept above, unpaired ones dropped as orphans).
      i = j - 1;
      continue;
    }
    if (isToolMessage(m)) {
      continue; // orphan with no preceding tool_calls — drop
    }
    result.push(m);
  }
  return result;
}
