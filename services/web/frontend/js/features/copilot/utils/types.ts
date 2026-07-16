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

export interface Diagnostic {
  id?: string
  title: string
  whatHappened?: string
  likelyCause?: string
  suggestedFix?: string
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

export interface ChatResponseData {
  conversationId?: string
  message: CopilotMessage
  suggestedActions?: ActionItem[]
}

export interface CompileDiagnoseResponseData {
  conversationId?: string
  summary?: string
  diagnostics?: Diagnostic[]
}

export interface RunChecksResponseData {
  runId?: string
  summary?: CheckSummary
  issues?: CheckIssue[]
}

export interface ExplainIssueResponseData {
  message: CopilotMessage
}

export interface GetConversationResponseData {
  conversationId?: string
  messages?: CopilotMessage[]
}
