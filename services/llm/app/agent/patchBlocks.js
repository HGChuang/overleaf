// Shared patch (submit_patch) structured-output helpers + the message-list →
// API view mapping used by BOTH CopilotService.mapResult (live turn) and the
// getConversation history-reload path (CopilotService.getConversation and
// ConversationService.getConversation). They lived inline in
// copilot.service.js, which is why the reload path couldn't rebuild patch
// cards and leaked raw tool-result JSON to the frontend.

import { randomUUID } from 'crypto';
import { extractTextContent } from './messageText.js';

// Map a model-produced patch hunk to the API shape, with defensive coercion.
export function toPatchHunk(entry) {
  const e = entry && typeof entry === 'object' ? entry : {};
  return {
    file: typeof e.file === 'string' && e.file ? e.file : null,
    line: Number.isInteger(e.line) ? e.line : null,
    oldText: typeof e.oldText === 'string' ? e.oldText : '',
    newText: typeof e.newText === 'string' ? e.newText : '',
  };
}

// Find the last `submit_patch` tool call in the message list and return the raw
// {hunks, summary} the model passed (or null).
export function extractSubmittedPatch(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const toolCalls = m && Array.isArray(m.tool_calls) ? m.tool_calls : null;
    if (!toolCalls || toolCalls.length === 0) continue;
    const sp = toolCalls.find(tc => tc && tc.name === 'submit_patch');
    if (!sp) continue;
    const args = sp.args || {};
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
export function toPatchBlock(rawPatch, index) {
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

export function patchIntroContent(count) {
  return `Proposed ${count} change${
    count === 1 ? '' : 's'
  } — review the inline preview, then Accept or Reject.`;
}

function roleOf(message) {
  return message.getType ? message.getType() : message._getType?.() || 'message';
}

// buildUserMessage wraps the user's text in a JSON envelope
// ({MESSAGE, CONTEXT, PROJECT}) for the model. Rendering that blob as the
// user's chat bubble on history reload is unreadable — unwrap it back to the
// bare MESSAGE text. Only our exact envelope shape is unwrapped; a user
// message that merely happens to be JSON is left untouched.
function unwrapUserEnvelope(content) {
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

// Map stored BaseMessage[] into the conversation-view shape for the frontend.
// The raw history contains intermediate agent plumbing — AIMessages that only
// carry tool_calls (empty text) and ToolMessages with raw JSON results — which
// must NOT be rendered as chat bubbles. We keep human/ai text messages, drop
// tool plumbing, and rebuild a `patch` block for any submit_patch call so the
// inline-diff card survives a page reload.
export function mapMessagesForView(messages) {
  if (!Array.isArray(messages)) return [];
  const view = [];
  for (const message of messages) {
    const role = roleOf(message);
    if (role === 'tool' || role === 'system') {
      continue; // agent plumbing, not a chat bubble
    }
    if (role === 'human' || role === 'user') {
      view.push({ role, content: unwrapUserEnvelope(message.content) });
      continue;
    }
    // assistant message: text and/or a submit_patch tool call
    const patch = toPatchBlock(extractSubmittedPatch([message]), view.length);
    const text = extractTextContent(message);
    if (patch) {
      view.push({
        role,
        content: text || patchIntroContent(patch.hunks.length),
        blocks: [{ type: 'patch', patch }],
      });
    } else if (text) {
      view.push({ role, content: message.content });
    }
    // else: tool-call-only intermediate step — skip
  }
  return view;
}
