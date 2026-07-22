// Shared patch (submit_patch) structured-output helpers + the message-list →
// API view mapping used by BOTH CopilotService.mapResult (live turn) and the
// getConversation history-reload path. They lived inline in
// copilot.service.js, which is why the reload path couldn't rebuild patch
// cards and leaked raw tool-result JSON to the frontend.

import { randomUUID } from 'crypto';
import type { AgentMessage } from './core/types.js';
import { extractTextContent } from './messageText.js';

export interface PatchHunk {
  file: string | null;
  line: number | null;
  oldText: string;
  newText: string;
}

export interface RawPatch {
  hunks: unknown[];
  summary: string;
}

export interface PatchBlock {
  id: string;
  title: string;
  hunks: PatchHunk[];
}

// Map a model-produced patch hunk to the API shape, with defensive coercion.
export function toPatchHunk(entry: unknown): PatchHunk {
  const e = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
  return {
    file: typeof e.file === 'string' && e.file ? e.file : null,
    line: Number.isInteger(e.line) ? (e.line as number) : null,
    oldText: typeof e.oldText === 'string' ? e.oldText : '',
    newText: typeof e.newText === 'string' ? e.newText : '',
  };
}

// Find the last `submit_patch` tool call in the message list and return the raw
// {hunks, summary} the model passed (or null). Assistant messages carry tool
// calls as content blocks ({type:'toolCall', name, arguments}).
export function extractSubmittedPatch(messages: AgentMessage[]): RawPatch | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const sp = m.content.find(
      b => b.type === 'toolCall' && b.name === 'submit_patch'
    );
    if (!sp || sp.type !== 'toolCall') continue;
    const args = (sp.arguments || {}) as Record<string, unknown>;
    const hunks = Array.isArray(args.hunks) ? args.hunks : null;
    if (hunks && hunks.length > 0) {
      return {
        hunks,
        summary: typeof args.summary === 'string' ? args.summary : '',
      };
    }
  }
  return null;
}

// Build a {type:'patch'} block from a raw patch, dropping no-op hunks.
// Returns null if nothing meaningful remains (caller then falls back to text).
export function toPatchBlock(rawPatch: RawPatch | null, index: number): PatchBlock | null {
  if (!rawPatch || !Array.isArray(rawPatch.hunks)) return null;
  const hunks = rawPatch.hunks.map(toPatchHunk).filter(h => h.oldText || h.newText);
  if (hunks.length === 0) return null;
  return {
    id: `patch_${index}_${randomUUID().slice(0, 8)}`,
    title:
      typeof rawPatch.summary === 'string' && rawPatch.summary
        ? rawPatch.summary
        : `Proposed change (${hunks.length} hunk${hunks.length === 1 ? '' : 's'})`,
    hunks,
  };
}

export function patchIntroContent(count: number): string {
  return `Proposed ${count} change${
    count === 1 ? '' : 's'
  } — review the inline preview, then Accept or Reject.`;
}

// buildUserMessage wraps the user's text in a JSON envelope
// ({MESSAGE, CONTEXT, PROJECT}) for the model. Rendering that blob as the
// user's chat bubble on history reload is unreadable — unwrap it back to the
// bare MESSAGE text. Only our exact envelope shape is unwrapped; a user
// message that merely happens to be JSON is left untouched.
function unwrapUserEnvelope(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  // The user turn may be prefixed with an injected <relevant_memories> block
  // (long-term memory) before the JSON envelope — strip that first.
  const trimmed = content
    .replace(/^<relevant_memories>[\s\S]*?<\/relevant_memories>\s*/, '')
    .trim();
  if (!trimmed.startsWith('{')) return content;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.MESSAGE === 'string' &&
      'CONTEXT' in parsed
    ) {
      return parsed.MESSAGE;
    }
  } catch {
    /* not our envelope — render as-is */
  }
  return content;
}

// Map stored AgentMessage[] into the conversation-view shape for the frontend.
// The raw history contains intermediate agent plumbing — assistant messages
// that only carry tool calls and toolResult messages with raw JSON results —
// which must NOT be rendered as chat bubbles. We keep user/assistant text
// messages, drop tool plumbing, and rebuild a `patch` block for any
// submit_patch call so the inline-diff card survives a page reload.
export function mapMessagesForView(messages: AgentMessage[]) {
  if (!Array.isArray(messages)) return [];
  const view: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === 'toolResult') {
      continue; // agent plumbing, not a chat bubble
    }
    if (message.role === 'user') {
      view.push({ role: 'user', content: unwrapUserEnvelope(extractTextContent(message)) });
      continue;
    }
    if (message.role !== 'assistant') {
      continue;
    }
    // assistant message: text and/or a submit_patch tool call
    const patch = toPatchBlock(extractSubmittedPatch([message]), view.length);
    const text = extractTextContent(message);
    if (patch) {
      view.push({
        role: 'assistant',
        content: text || patchIntroContent(patch.hunks.length),
        blocks: [{ type: 'patch', patch }],
      });
    } else if (text) {
      view.push({ role: 'assistant', content: text });
    }
    // else: tool-call-only intermediate step — skip
  }
  return view;
}
