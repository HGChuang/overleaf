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
  verification?: Record<string, unknown>;
}

export interface PatchBlock {
  id: string;
  title: string;
  hunks: PatchHunk[];
  verification?: Record<string, unknown>;
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

// Ids of submit_patch tool calls the server REJECTED (dry-run validation):
// the tool result is either flagged isError (thrown rejections) or carries
// details.dryRunRejected (the terminating 3rd rejection). A rejected patch must
// never surface as the user's patch card — the model was told to fix and
// resubmit, and if it gave up, the honest UI is "no patch", not a broken one.
export function computeRejectedSubmitPatchIds(messages: AgentMessage[]): Set<string> {
  const rejected = new Set<string>();
  for (const m of messages) {
    if (m?.role !== 'toolResult') continue;
    const tr = m as { toolName?: string; toolCallId?: string; isError?: boolean; details?: Record<string, unknown> };
    if (tr.toolName !== 'submit_patch' || !tr.toolCallId) continue;
    if (tr.isError || tr.details?.dryRunRejected === true) {
      rejected.add(tr.toolCallId);
    }
  }
  return rejected;
}

// Find the last `submit_patch` tool call in the message list and return the raw
// {hunks, summary} the model passed (or null). Assistant messages carry tool
// calls as content blocks ({type:'toolCall', name, arguments}). Calls whose id
// is in `rejectedIds` (see computeRejectedSubmitPatchIds) are skipped.
export function extractSubmittedPatch(messages: AgentMessage[], rejectedIds?: Set<string>): RawPatch | null {
  // A sandbox submission is derived server-side from the immutable base and
  // lives in the terminating tool result rather than model-authored args.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as AgentMessage & {
      toolName?: string;
      isError?: boolean;
      details?: { sandboxPatch?: RawPatch };
    };
    if (m?.role !== 'toolResult' || m.toolName !== 'submit_sandbox' || m.isError) continue;
    const patch = m.details?.sandboxPatch;
    if (patch && Array.isArray(patch.hunks) && patch.hunks.length > 0) return patch;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const sp = m.content.find(
      b => b.type === 'toolCall' && b.name === 'submit_patch' && !rejectedIds?.has(b.id)
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
    ...(rawPatch.verification ? { verification: rawPatch.verification } : {}),
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
  const rejectedPatchIds = computeRejectedSubmitPatchIds(messages);
  const sandboxResults = new Map<string, AgentMessage>();
  for (const message of messages) {
    if (message.role !== 'toolResult') continue;
    const result = message as AgentMessage & {
      toolName?: string;
      toolCallId?: string;
    };
    if (result.toolName === 'submit_sandbox' && result.toolCallId) {
      sandboxResults.set(result.toolCallId, message);
    }
  }
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
    const sandboxCall = Array.isArray(message.content)
      ? message.content.find(
          (block) => block.type === 'toolCall' && block.name === 'submit_sandbox'
        )
      : undefined;
    const paired =
      sandboxCall?.type === 'toolCall' ? sandboxResults.get(sandboxCall.id) : undefined;
    const patch = toPatchBlock(
      extractSubmittedPatch(paired ? [message, paired] : [message], rejectedPatchIds),
      view.length
    );
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
