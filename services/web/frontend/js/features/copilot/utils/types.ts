// Type definitions for the Overleaf Copilot frontend feature.
// These mirror the response `data` shapes defined in
// COPILOT_API_INTERFACE_REQUIREMENTS.md and the unified envelope
// `{ success, data, error, meta }` returned by all /api/v1/copilot/* endpoints.

export type CopilotTab = 'ask' | 'write' | 'fix' | 'check'

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
  | 'diagnostic'
  | 'issue_list'
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
  | { type: 'diagnostic'; diagnostic: Diagnostic }
  | { type: 'issue_list'; items: CheckIssue[] }
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
// Compile diagnostics (entry 4)
// ---------------------------------------------------------------------------

export interface CodeLocation {
  file?: string
  line?: number
}

export interface DiagnosticFix {
  oldText: string
  newText: string
}

export interface Diagnostic {
  id?: string
  title: string
  whatHappened?: string
  likelyCause?: string
  suggestedFix?: string
  fix?: DiagnosticFix | null
  location?: CodeLocation
  actions?: string[]
}

// ---------------------------------------------------------------------------
// Checks (entry 5)
// ---------------------------------------------------------------------------

export type CheckType =
  | 'citations'
  | 'references'
  | 'figures_tables'
  | 'terminology'
  | string

export type Severity = 'error' | 'warning' | 'info' | string

export interface CheckIssue {
  id: string
  type: CheckType
  severity: Severity
  title: string
  description?: string
  location?: CodeLocation
  actions?: string[]
}

export interface CheckSummary {
  total: number
  byType: Record<string, number>
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

// Every Copilot action (chat / compile-diagnose / run-checks / explain-issue)
// flows through the single `POST /api/v1/copilot/chat` endpoint and returns
// this one unified shape. The human-readable summary is in `message.content`;
// structured extras ride as `message.blocks` — diagnostic cards
// ({type:'diagnostic'}) for compile-diagnose, an issue list
// ({type:'issue_list'}) for run-checks.
export interface ChatResponseData {
  conversationId?: string
  message: CopilotMessage
  suggestedActions?: ActionItem[]
}

export interface GetConversationResponseData {
  conversationId?: string
  messages?: CopilotMessage[]
}
