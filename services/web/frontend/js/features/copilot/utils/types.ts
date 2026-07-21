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

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  blocks?: MessageBlock[]
  suggestedActions?: ActionItem[]
  // internal: whether this message is currently loading a response
  pending?: boolean
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
