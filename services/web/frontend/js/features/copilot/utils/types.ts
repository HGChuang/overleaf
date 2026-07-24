// Type definitions for the Overleaf Copilot frontend feature.
// These mirror the response `data` shapes returned by the /api/v1/copilot/*
// endpoints (unified envelope `{ success, data, error, meta }`).

export type CopilotSource =
  | 'completion'
  | 'selection'
  | 'panel'
  | 'compile'
  | 'checks'

// ---------------------------------------------------------------------------
// Message blocks
// ---------------------------------------------------------------------------

export type MessageBlockType =
  | 'text'
  | 'markdown'
  | 'code'
  | 'file_refs'
  | 'suggested_fix'
  | 'actions'
  | 'patch'

export interface FileRef {
  path: string
  line?: number
  label?: string
}

export interface ActionItem {
  type: 'followup' | 'open_file' | 'copy' | 'regenerate' | string
  label: string
  path?: string
  prompt?: string
}

export type MessageBlock =
  | { type: 'text'; text: string }
  | { type: 'markdown'; text: string }
  | { type: 'code'; language?: string; text: string }
  | { type: 'file_refs'; items: FileRef[] }
  | { type: 'suggested_fix'; text: string; language?: string }
  | { type: 'actions'; items: ActionItem[] }
  | { type: 'patch'; patch: Patch }

// A proposed text edit the user can preview (inline-diff ghost in the editor)
// and Accept/Reject. Mirrors the `FixEdit` shape in editor-bridge.ts so it
// round-trips through the `copilot:apply-fix` apply path.
export interface PatchHunk {
  file?: string | null
  line?: number | null
  oldText: string
  newText: string
}

export interface Patch {
  id: string
  title?: string
  hunks: PatchHunk[]
}

// One tool invocation in the agent's workflow, rendered Claude Code-style as
// a step row (name + salient args, spinner/✓/✗, indented result preview).
// `args` is the shallow, per-value-capped preview shipped by the llm service
// (raw args/results never leave the server).
export interface CopilotToolStep {
  id: string
  name: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  resultSummary?: string
  durationMs?: number
}

// One entry in an assistant turn's chronological transcript. Text segments
// are split at tool-call boundaries (text arriving after a tool call starts a
// NEW segment), so rendering the items in order reproduces the agent's real
// interleaving — instead of the old "all text on top, all steps below" that
// let an upper block keep growing after lower blocks had appeared.
export type CopilotTimelineItem =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; step: CopilotToolStep }

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  blocks?: MessageBlock[]
  suggestedActions?: ActionItem[]
  // internal: whether this message is currently loading a response
  pending?: boolean
  // internal: the assistant turn as an APPEND-ONLY chronological transcript
  // (SSE mode): text segments and tool steps interleaved in arrival order.
  // Frozen onto the completed message — it is the single source of truth for
  // what the turn showed. The terminal `done` payload's `content` is LOSSY
  // (last text segment only, or a generic patch intro), so it is only ever
  // appended to the timeline, never swapped in for it.
  timeline?: CopilotTimelineItem[]
  // internal: never render this message in the chat view. Used for the
  // automatic post-accept verification turn — its instruction text is a
  // trigger for the agent, not content for the user (the assistant reply
  // that follows it renders normally).
  hidden?: boolean
}

// One structured compile error, parsed from the user's last failed compile
// (subset of the log-entry shape — only what the agent needs). Sent on
// context.compileErrors so the agent grounds its diagnosis in the real log.
export interface CompileErrorEntry {
  file: string | null
  line: number | null
  message: string
}

// ---------------------------------------------------------------------------
// API envelope + error
// ---------------------------------------------------------------------------

export interface CopilotEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
  meta?: { requestId?: string; model?: string; latencyMs?: number }
}

export class CopilotError extends Error {
  code: string
  requestId?: string

  constructor(
    code: string,
    message: string,
    requestId?: string
  ) {
    super(message || code)
    this.name = 'CopilotError'
    this.code = code
    this.requestId = requestId
  }
}

// ---------------------------------------------------------------------------
// API response `data` shapes
// ---------------------------------------------------------------------------

// Every Copilot action flows through the single `POST /api/v1/copilot/chat`
// endpoint and returns this one unified shape. The human-readable summary is
// in `message.content`; structured extras ride as `message.blocks` — a `patch`
// block ({type:'patch'}) when the model proposed an edit via `submit_patch`.
export interface ChatResponseData {
  conversationId?: string
  message: CopilotMessage
  suggestedActions?: ActionItem[]
}

export interface GetConversationResponseData {
  conversationId?: string
  messages?: CopilotMessage[]
}
