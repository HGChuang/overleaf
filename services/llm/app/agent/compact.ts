// Pure context-compaction helpers (cheap layers, 0 LLM calls) operating on the
// vendored agent-core message shapes (user / assistant / toolResult). Used in
// two places:
//   - RedisMemoryStore append/load: bound the STORED history
//   - CopilotService.transformContext: bound the LIVE per-call context
// The LLM-backed summarize layer lives in recovery.ts (it needs a model).

import type { AgentMessage } from './core/types.js';
import type { AssistantMessage, ToolResultMessage } from './core/llm-types.js';

function isToolResultMessage(m: AgentMessage): m is ToolResultMessage {
  return m?.role === 'toolResult';
}

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
  return m?.role === 'assistant';
}

function toolCallIdsOf(m: AssistantMessage): string[] {
  return m.content
    .filter(b => b.type === 'toolCall')
    .map(b => (b.type === 'toolCall' ? b.id : ''))
    .filter(Boolean);
}

function hasVisibleContent(m: AssistantMessage): boolean {
  return m.content.some(
    b =>
      (b.type === 'text' && b.text.trim().length > 0) ||
      (b.type === 'thinking' && b.thinking.trim().length > 0)
  );
}

function textOfToolResult(m: ToolResultMessage): string {
  return m.content
    .filter(b => b.type === 'text')
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('\n');
}

// L1 — snip: keep `keepHead` head messages (initial context) + the tail
// (max - keepHead), replacing the dropped middle with a single placeholder.
// No-op when the list is already within `max`.
export function snipCompact(messages: AgentMessage[], max = 50, keepHead = 3): AgentMessage[] {
  if (!Array.isArray(messages) || messages.length <= max) {
    return messages || [];
  }
  const head = Math.max(0, Math.min(keepHead, Math.floor(max / 2)));
  const tail = Math.max(0, max - head);
  const dropped = messages.length - head - tail;
  const placeholder: AgentMessage = {
    role: 'user',
    content: `[snipped ${dropped} messages from conversation middle]`,
    timestamp: Date.now(),
  };
  return [...messages.slice(0, head), placeholder, ...messages.slice(-tail)];
}

// L2 — micro: replace the *content* of old tool results with a one-line
// placeholder, keeping only the most recent `keepRecent` intact. Bounds the
// bulk that accumulates from repeated read_file outputs. Identity
// (toolCallId / toolName / isError) is preserved so pairing still validates.
export function microCompact(messages: AgentMessage[], keepRecent = 3): AgentMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages || [];
  }
  const toolIndices: number[] = [];
  messages.forEach((m, i) => {
    if (isToolResultMessage(m)) toolIndices.push(i);
  });
  if (toolIndices.length <= keepRecent) {
    return messages;
  }
  const keep = new Set(toolIndices.slice(-keepRecent));
  return messages.map((m, i) => {
    if (!isToolResultMessage(m) || keep.has(i)) {
      return m;
    }
    if (textOfToolResult(m).length <= 120) {
      return m; // already small, leave it
    }
    return {
      ...m,
      content: [
        { type: 'text' as const, text: '[Earlier tool result compacted. Re-run the tool if needed.]' },
      ],
    };
  });
}

// Tool-call pairing repair. ANY truncation of the message list (the hard
// slice(-maxMessages) cap, snipCompact's middle-drop, reactiveCompact's
// tail-keep) can cut between an assistant message carrying toolCall blocks and
// the toolResult messages that answer it. OpenAI-compatible providers
// HARD-REJECT such a history ("messages with role 'tool' must be a response to
// a preceding message with 'tool_calls'") — and because the poisoned list is
// what gets persisted, every subsequent turn of that conversation would fail
// the same way until the thread expires. This pass makes the list
// provider-safe again:
//   - an assistant message whose toolCalls are NOT all answered by the
//     toolResults immediately following it is degraded (toolCall blocks
//     stripped; dropped entirely if no text/thinking remains);
//   - a toolResult not consumed by such a pair (orphan) is dropped.
export function sanitizeToolPairing(messages: AgentMessage[]): AgentMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages || [];
  }
  const result: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (isAssistantMessage(m)) {
      const ids = toolCallIdsOf(m);
      if (ids.length > 0) {
        // Collect the run of toolResults immediately after this assistant message.
        const following: ToolResultMessage[] = [];
        let j = i + 1;
        while (j < messages.length && isToolResultMessage(messages[j])) {
          following.push(messages[j] as ToolResultMessage);
          j++;
        }
        const answered = new Set(following.map(tm => tm.toolCallId));
        const allAnswered = ids.every(id => answered.has(id));
        if (allAnswered) {
          result.push(m);
          for (const tm of following) {
            if (ids.includes(tm.toolCallId)) result.push(tm);
          }
        } else if (hasVisibleContent(m)) {
          // Degrade to a plain assistant message: strip the toolCall blocks.
          result.push({
            ...m,
            content: m.content.filter(b => b.type !== 'toolCall'),
          });
        }
        // Either way the immediately-following toolResults are consumed here
        // (paired ones kept above, unpaired ones dropped as orphans).
        i = j - 1;
        continue;
      }
      result.push(m);
      continue;
    }
    if (isToolResultMessage(m)) {
      continue; // orphan with no preceding toolCalls — drop
    }
    result.push(m);
  }
  return result;
}

// The total token count the provider last reported for this context, scanning
// from the end for the most recent assistant message with usage data. This is
// the REAL context size (not a chars/4 estimate) — the trigger for the
// usage-based summarize layer. 0 when no usage has been reported yet.
export function lastReportedTotalTokens(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (isAssistantMessage(m) && m.usage && typeof m.usage.totalTokens === 'number') {
      return m.usage.totalTokens;
    }
  }
  return 0;
}
