// Error recovery + the LLM summarize layer.
//
// Two call sites:
//   - REACTIVE: CopilotService inspects the terminal assistant message of a
//     finished run; when its stopReason is "error" and the errorMessage
//     matches isPromptTooLong, it compacts the history via reactiveCompact
//     (summarize → keep recent tail) and retries the turn once.
//   - PROACTIVE (usage-based): CopilotService.transformContext checks the
//     provider-reported totalTokens of the last assistant message each loop
//     iteration; above a threshold it summarizes once per run.
//
// Both need a way to complete a one-off prompt against the user's model — a
// `TextCompleter` closure provided by the service (wrapping the OpenAI-compat
// provider), so this module stays model-free.

import type { AgentMessage } from './core/types.js';
import { extractTextContent } from './messageText.js';
import { microCompact, sanitizeToolPairing } from './compact.js';

export const REACTIVE_KEEP_TAIL = 5;

// One-off text completion against the user's model. Must not throw — return
// null on failure (callers treat null as "summarization unavailable").
export type TextCompleter = (prompt: string) => Promise<string | null>;

// Does this error text indicate the request exceeded the model's context
// window? With the vendored provider, provider failures arrive as the
// terminal assistant message's errorMessage (not as thrown exceptions), so
// this matches against plain strings.
export function isPromptTooLong(errorText: unknown): boolean {
  const msg = String(
    typeof errorText === 'object' && errorText !== null && 'message' in errorText
      ? (errorText as { message?: unknown }).message
      : errorText || ''
  ).toLowerCase();
  return (
    msg.includes('prompt_too_long') ||
    msg.includes('too many tokens') ||
    msg.includes('context length') ||
    msg.includes('context_length_exceeded') ||
    msg.includes('maximum context') ||
    msg.includes('reduce the length')
  );
}

// Format the message list into a compact conversation transcript for the
// summarizer. Drops tool-result bulk via microCompact first so the summarizer
// prompt itself stays small.
export function formatForSummary(messages: AgentMessage[]): string {
  const compacted = microCompact(messages || [], REACTIVE_KEEP_TAIL);
  return compacted
    .map(m => {
      // Read the role into a plain string first — chained narrowing on the
      // AgentMessage union exhausts to `never` for the fallback branch.
      const role: string = (m as { role?: string } | undefined)?.role ?? 'message';
      const label =
        role === 'user'
          ? 'user'
          : role === 'assistant'
            ? 'assistant'
            : role === 'toolResult'
              ? 'tool-result'
              : role;
      const text = extractTextContent(m);
      if (!text) return '';
      return `${label}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

// Summarize: one LLM call → a single summary message. Preserves the current
// goal, key findings, files touched, remaining work, user constraints.
export async function summarizeHistory(
  messages: AgentMessage[],
  complete: TextCompleter
): Promise<AgentMessage | null> {
  if (typeof complete !== 'function') return null;
  const transcript = formatForSummary(messages);
  if (!transcript) return null;
  try {
    const prompt =
      `Summarize this Overleaf Copilot conversation so work can continue.\n` +
      `Preserve: 1. current goal, 2. key findings, 3. files/sections touched, ` +
      `4. remaining work, 5. user constraints/preferences.\n` +
      `Respond with TEXT ONLY. Do NOT call any tools.\n\n` +
      `Conversation:\n${transcript.slice(0, 80000)}`;
    const summary = (await complete(prompt))?.trim();
    if (!summary) return null;
    return {
      role: 'user',
      content: `[Compacted]\n\n${summary}`,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

// Reactive compact: summarize the whole history, then keep the summary + the
// most recent REACTIVE_KEEP_TAIL messages. Used when a run ends with a
// prompt_too_long provider error (rare; bounded by the cheap compaction
// layers + the step budget, but some proxies are picky about context size).
// The tail-slice can cut between an assistant message with toolCall blocks
// and its toolResults, so the result goes through sanitizeToolPairing —
// otherwise the retry itself would fail provider-side validation and the
// recovery would be wasted.
export async function reactiveCompact(
  messages: AgentMessage[],
  complete: TextCompleter
): Promise<AgentMessage[]> {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const summary = await summarizeHistory(messages, complete);
  const tail = messages.slice(-REACTIVE_KEEP_TAIL);
  if (summary) return sanitizeToolPairing([summary, ...tail]);
  // Summarize failed — fall back to a hard tail-trim so we still shrink.
  return sanitizeToolPairing([
    {
      role: 'user',
      content: '[Reactive compact: summary unavailable; kept recent tail only]',
      timestamp: Date.now(),
    },
    ...tail,
  ]);
}
