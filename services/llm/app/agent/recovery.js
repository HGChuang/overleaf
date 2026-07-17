// Error recovery (s11) + the deferred LLM summarize layer (s08 L4).
//
// `withRecovery` wraps the graph.invoke call: on a `prompt_too_long` error it
// reactively compacts the short-term history (summarize → keep recent tail) and
// retries once. `summarizeHistory` is also the L4 auto-compact primitive the
// short-term memory will use when the stored history crosses the summarize
// threshold. Both need the per-user model, which is why they live here (not in
// the model-free RedisMemoryStore).
//
// The model's own `maxRetries` (set in modelFactory) already handles transient
// network/timeout retries; this layer adds the context-too-large path.

import { HumanMessage } from '@langchain/core/messages';
import { extractTextContent } from './messageText.js';
import { microCompact } from './compact.js';

const REACTIVE_KEEP_TAIL = 5;

// Does this error indicate the request exceeded the model's context window?
export function isPromptTooLong(err) {
  const msg = String(err?.message || err || '').toLowerCase();
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
// summarizer. Drops tool-result bulk via micro_compact first so the summarizer
// prompt itself stays small.
export function formatForSummary(messages) {
  const compacted = microCompact(messages || [], REACTIVE_KEEP_TAIL);
  return compacted
    .map(m => {
      const role =
        typeof m?.getType === 'function'
          ? m.getType()
          : typeof m?._getType === 'function'
            ? m._getType()
            : 'message';
      const label =
        role === 'human' || role === 'user'
          ? 'user'
          : role === 'ai' || role === 'assistant'
            ? 'assistant'
            : role === 'tool'
              ? 'tool-result'
              : role;
      const text = extractTextContent(m);
      if (!text) return '';
      return `${label}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

// L4 — summarize: one LLM call → a single summary message. Preserves the
// current goal, key findings, files touched, remaining work, user constraints.
export async function summarizeHistory(messages, model) {
  if (!model) return null;
  const transcript = formatForSummary(messages);
  if (!transcript) return null;
  try {
    const prompt =
      `Summarize this Overleaf Copilot conversation so work can continue.\n` +
      `Preserve: 1. current goal, 2. key findings, 3. files/sections touched, ` +
      `4. remaining work, 5. user constraints/preferences.\n` +
      `Respond with TEXT ONLY. Do NOT call any tools.\n\n` +
      `Conversation:\n${transcript.slice(0, 80000)}`;
    const res = await model.invoke([new HumanMessage(prompt)]);
    const summary = extractTextContent(res).trim();
    if (!summary) return null;
    return new HumanMessage({ content: `[Compacted]\n\n${summary}` });
  } catch {
    return null;
  }
}

// Reactive compact: summarize the whole history, then keep the summary + the
// most recent REACTIVE_KEEP_TAIL messages. Used when an invoke throws
// prompt_too_long (rare; bounded by recursionLimit + micro_compact, but the
// GLM proxy this runs on can be picky about context size).
export async function reactiveCompact(messages, model) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const summary = await summarizeHistory(messages, model);
  const tail = messages.slice(-REACTIVE_KEEP_TAIL);
  if (summary) return [summary, ...tail];
  // summarize failed — fall back to a hard tail-trim so we still shrink.
  return [
    new HumanMessage({ content: '[Reactive compact: summary unavailable; kept recent tail only]' }),
    ...tail,
  ];
}

// Wrap an async `fn(input)` that may throw. On a prompt_too_long error, run
// `compact(input)` to get a reduced input and retry `fn` once with it. Any
// other error (or a second prompt_too_long) is rethrown.
export async function withRecovery(fn, input, { compact, retries = 1 } = {}) {
  try {
    return await fn(input);
  } catch (err) {
    if (!isPromptTooLong(err) || retries <= 0 || typeof compact !== 'function') {
      throw err;
    }
    const reduced = await compact(input);
    return await fn(reduced);
  }
}
