import type { AgentMessage } from '../core/types.js';
import type { Tool } from '../core/llm-types.js';
import { ContextCapacityError } from './types.js';

// Unknown tokenizers use an intentionally conservative UTF-8 byte bound,
// including message framing and tool schemas. Never use chars / 4 for CJK.
export function estimateTokens(value: unknown): number {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8') + 16;
}

export function inputBudget(window: number, output: number, positiveError = 0): number {
  if (!Number.isSafeInteger(window) || !Number.isSafeInteger(output) || window <= 0 || output <= 0) {
    throw new ContextCapacityError('Please configure this model’s context window and output token limit in Settings → LLM.');
  }
  const budget = window - output - Math.max(2048, Math.ceil(window * 0.05), positiveError);
  if (budget <= 0) throw new ContextCapacityError();
  return budget;
}

export function requestTokens(system: string, tools: Tool[], messages: AgentMessage[]): number {
  return estimateTokens(system) + estimateTokens(tools) + messages.reduce((n, m) => n + estimateTokens(m), 0);
}

/** End-exclusive boundaries. An assistant call and ALL of its results form one group. */
export function completeGroupEnds(messages: AgentMessage[]): number[] {
  const ends: number[] = [];
  for (let i = 0; i < messages.length;) {
    const message = messages[i];
    if (message.role === 'toolResult') throw new Error('Orphan tool result in context journal');
    const calls = message.role === 'assistant'
      ? message.content.filter(b => b.type === 'toolCall') : [];
    if (!calls.length) {
      ends.push(++i);
      continue;
    }
    const pending = new Set(calls.map(c => c.id));
    if (pending.size !== calls.length) throw new Error('Duplicate tool call IDs');
    let j = i + 1;
    while (j < messages.length && messages[j].role === 'toolResult') {
      const result = messages[j] as Extract<AgentMessage, { role: 'toolResult' }>;
      if (!pending.delete(result.toolCallId)) throw new Error('Unmatched or duplicate tool result');
      j++;
    }
    if (pending.size) {
      if (j !== messages.length) throw new Error('Interrupted tool group in context journal');
      break; // Open group: persist it, but never compact across it.
    }
    ends.push(j);
    i = j;
  }
  return ends;
}
