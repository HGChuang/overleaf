// Thin transport layer for the Copilot backend.
//
// A single endpoint — `POST /api/v1/copilot/chat` — handles every action.
// Every action returns the same unified
// `{ conversationId, message:{role,content,blocks}, suggestedActions }` shape.
//
// The web layer (`services/web/app/src/Features/Copilot/CopilotController.js`)
// proxies this route and builds project context server-side from `projectId`,
// so callers only send `projectId` + `conversation` + `context` + `message`.
//
// All responses use the unified envelope `{ success, data, error, meta }`.
// We unwrap it and throw a `CopilotError` on failure. Aborted requests are
// rethrown with `name: 'AbortError'` so callers can distinguish cancellation
// from real errors.

import {
  CopilotEnvelope,
  CopilotError,
  ChatResponseData,
  GetConversationResponseData,
  ListConversationsResponseData,
} from './types'
import getMeta from '@/utils/meta'

const BASE = '/api/v1/copilot'

async function copilotFetch<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(method === 'POST' && {
          'X-Csrf-Token': getMeta('ol-csrfToken'),
        }),
      },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // rethrow a recognizable abort error
      const abortErr = new Error('aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    throw new CopilotError(
      'COPILOT_UPSTREAM_ERROR',
      err?.message || 'network error'
    )
  }

  let json: CopilotEnvelope<T>
  try {
    json = (await response.json()) as CopilotEnvelope<T>
  } catch {
    json = { success: false }
  }

  if (!response.ok) {
    const err = json?.error
    throw new CopilotError(
      err?.code || 'COPILOT_UPSTREAM_ERROR',
      err?.message || `HTTP ${response.status}`,
      json?.meta?.requestId
    )
  }

  if (!json || json.success === false) {
    throw new CopilotError(
      json?.error?.code || 'COPILOT_UPSTREAM_ERROR',
      json?.error?.message || 'request failed',
      json?.meta?.requestId
    )
  }

  return (json.data as T) ?? ({} as T)
}

// One unified Copilot chat request. The body carries `projectId`,
// `conversation`, `context`, and `message`.
export function copilotChat(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ChatResponseData> {
  return copilotFetch<ChatResponseData>(`${BASE}/chat`, 'POST', body, signal)
}

export type CopilotEditorAction =
  | { kind: 'selection'; mode: number }
  | {
      kind: 'completion'
      leftContext: string
      rightContext: string
      language: string
      maxLength: number
    }

export function normalizeInlineCompletion(text: string): string {
  return text
    .trim()
    .replace(/^```(?:latex|tex)?\s*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^<COMPLETION\s*\/?>/i, '')
    .replace(/<\/COMPLETION>$/i, '')
    .trim()
}

export async function runCopilotEditorAction({
  projectId,
  currentFile = null,
  selectedText = '',
  message,
  action,
  signal,
}: {
  projectId: string
  currentFile?: string | null
  selectedText?: string
  message: string
  action: CopilotEditorAction
  signal?: AbortSignal
}): Promise<string> {
  const source =
    action.kind === 'completion' ? 'inline-completion' : 'selection'
  const userMessage = message.trim() || (action.kind === 'completion'
    ? 'Complete the text at the cursor.'
    : 'Transform the selected text according to the requested editor action.')
  const data = await copilotChat(
    {
      projectId,
      conversation: { source },
      context: {
        currentFile,
        selectedText,
        editorAction: action,
      },
      message: { role: 'user', content: userMessage },
    },
    signal
  )
  const blockText = (data.message?.blocks || [])
    .flatMap(block => ('text' in block ? [block.text] : []))
    .filter(Boolean)
    .join('\n\n')
  const text = blockText || data.message?.content || ''
  return action.kind === 'completion' ? normalizeInlineCompletion(text) : text
}

// ---------------------------------------------------------------------------
// SSE streaming chat
// ---------------------------------------------------------------------------

// Events emitted by the llm service over the `text/event-stream` variant of
// /chat. `done` carries the same envelope data as the buffered JSON mode;
// `error` carries the envelope error plus its HTTP status.
export type CopilotSseEvent =
  | { type: 'context_compacting'; reason: string }
  | { type: 'context_compacted'; generation: number; beforeTokens: number; afterTokens: number }
  | { type: 'context_degraded'; reason: string }
  | { type: 'context_invalidated'; reason: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'tool_start'
      toolCallId: string
      toolName: string
      args?: Record<string, unknown>
    }
  | {
      type: 'tool_end'
      toolCallId: string
      toolName: string
      isError: boolean
      resultSummary?: string
    }
  | { type: 'done'; data: ChatResponseData }
  | { type: 'error'; code: string; message: string; status?: number }

interface SseFrame {
  event: string
  data: string
}

// Parse one `event:`/`data:` frame. Comment lines (`:` heartbeats) and
// unknown fields are ignored; multi-line data is joined with \n (spec).
function parseSseFrame(raw: string): SseFrame | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
    }
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

function toSseEvent(frame: SseFrame): CopilotSseEvent | null {
  let payload: any
  try {
    payload = JSON.parse(frame.data)
  } catch {
    return null
  }
  switch (frame.event) {
    case 'context_compacting':
    case 'context_degraded':
    case 'context_invalidated':
      return { type: frame.event, reason: String(payload?.reason || '') }
    case 'context_compacted':
      return { type: 'context_compacted', generation: Number(payload?.generation),
        beforeTokens: Number(payload?.beforeTokens), afterTokens: Number(payload?.afterTokens) }
    case 'text_delta':
      return typeof payload?.delta === 'string'
        ? { type: 'text_delta', delta: payload.delta }
        : null
    case 'tool_start':
      return {
        type: 'tool_start',
        toolCallId: String(payload?.toolCallId || ''),
        toolName: String(payload?.toolName || ''),
        args:
          payload?.args && typeof payload.args === 'object'
            ? (payload.args as Record<string, unknown>)
            : undefined,
      }
    case 'tool_end':
      return {
        type: 'tool_end',
        toolCallId: String(payload?.toolCallId || ''),
        toolName: String(payload?.toolName || ''),
        isError: Boolean(payload?.isError),
        resultSummary:
          typeof payload?.resultSummary === 'string'
            ? payload.resultSummary
            : undefined,
      }
    case 'done':
      return { type: 'done', data: payload as ChatResponseData }
    case 'error':
      return {
        type: 'error',
        code: String(payload?.code || 'COPILOT_UPSTREAM_ERROR'),
        message: String(payload?.message || 'request failed'),
        status: typeof payload?.status === 'number' ? payload.status : undefined,
      }
    default:
      return null
  }
}

/**
 * Streaming variant of copilotChat: POSTs with `Accept: text/event-stream`
 * and dispatches server-sent events via `onEvent` as they arrive (text deltas
 * for incremental rendering, tool start/end for activity display). Resolves
 * with the terminal `done` payload — identical in shape to the buffered
 * mode's response — and rejects with CopilotError on `error` events /
 * pre-stream failures / network errors. Aborts rethrow `name: 'AbortError'`.
 */
export async function copilotChatStream(
  body: Record<string, unknown>,
  {
    signal,
    onEvent,
  }: {
    signal?: AbortSignal
    onEvent?: (event: CopilotSseEvent) => void
  } = {}
): Promise<ChatResponseData> {
  let response: Response
  try {
    response = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const abortErr = new Error('aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    throw new CopilotError(
      'COPILOT_UPSTREAM_ERROR',
      err?.message || 'network error'
    )
  }

  const contentType = response.headers.get('content-type') || ''

  // Pre-stream failure (auth / validation / proxy fallback): ordinary JSON
  // envelope, same handling as the buffered path.
  if (!response.ok || !contentType.includes('text/event-stream')) {
    let json: CopilotEnvelope<ChatResponseData>
    try {
      json = (await response.json()) as CopilotEnvelope<ChatResponseData>
    } catch {
      json = { success: false }
    }
    if (!response.ok || !json || json.success === false) {
      throw new CopilotError(
        json?.error?.code || 'COPILOT_UPSTREAM_ERROR',
        json?.error?.message || `HTTP ${response.status}`,
        json?.meta?.requestId
      )
    }
    // A non-SSE OK response (older backend / proxy fallback): treat the whole
    // payload as the terminal result.
    return (json.data as ChatResponseData) ?? ({} as ChatResponseData)
  }

  if (!response.body) {
    throw new CopilotError('COPILOT_UPSTREAM_ERROR', 'empty SSE body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalData: ChatResponseData | null = null

  const dispatch = (frame: SseFrame) => {
    const event = toSseEvent(frame)
    if (!event) return
    if (event.type === 'done') {
      finalData = event.data
      return
    }
    if (event.type === 'error') {
      throw new CopilotError(event.code, event.message)
    }
    onEvent?.(event)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const frame = parseSseFrame(raw)
        if (frame) dispatch(frame)
      }
    }
    // Flush any trailing frame (stream ended without a blank line).
    buffer += decoder.decode()
    const tail = parseSseFrame(buffer.trim())
    if (tail) dispatch(tail)
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const abortErr = new Error('aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    throw err
  }

  if (!finalData) {
    throw new CopilotError(
      'COPILOT_UPSTREAM_ERROR',
      'stream ended without a done event'
    )
  }
  return finalData
}

export function copilotGetConversation(
  conversationId: string,
  projectId: string,
  signal?: AbortSignal,
  before?: number
): Promise<GetConversationResponseData> {
  return copilotFetch<GetConversationResponseData>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}?projectId=${encodeURIComponent(projectId)}${before !== undefined ? `&before=${before}` : ""}`,
    'GET',
    undefined,
    signal
  )
}

export function copilotListConversations(projectId: string) {
  return copilotFetch<ListConversationsResponseData>(
    `${BASE}/conversations?projectId=${encodeURIComponent(projectId)}`,
    'GET'
  )
}

export function copilotGetContext(conversationId: string, projectId: string) {
  return copilotFetch<any>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/context?projectId=${encodeURIComponent(projectId)}`,
    'GET'
  )
}

export function copilotGetMemories(projectId: string) {
  return copilotFetch<any[]>(`${BASE}/memories?projectId=${encodeURIComponent(projectId)}`, 'GET')
}

export function copilotDecideMemory(projectId: string, memoryId: string, action: 'confirm' | 'delete', value?: string) {
  return copilotFetch<any>(`${BASE}/memories/${encodeURIComponent(memoryId)}`, 'POST', { projectId, action, value })
}

export function copilotCompact(conversationId: string, projectId: string) {
  return copilotFetch<any>(`${BASE}/conversations/${encodeURIComponent(conversationId)}/compact`, 'POST', { projectId })
}

export { CopilotError } from './types'
