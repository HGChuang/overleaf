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
} from './types'

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

// ---------------------------------------------------------------------------
// SSE streaming chat
// ---------------------------------------------------------------------------

// Events emitted by the llm service over the `text/event-stream` variant of
// /chat. `done` carries the same envelope data as the buffered JSON mode;
// `error` carries the envelope error plus its HTTP status.
export type CopilotSseEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string }
  | { type: 'tool_end'; toolCallId: string; toolName: string; isError: boolean }
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
    case 'text_delta':
      return typeof payload?.delta === 'string'
        ? { type: 'text_delta', delta: payload.delta }
        : null
    case 'tool_start':
      return {
        type: 'tool_start',
        toolCallId: String(payload?.toolCallId || ''),
        toolName: String(payload?.toolName || ''),
      }
    case 'tool_end':
      return {
        type: 'tool_end',
        toolCallId: String(payload?.toolCallId || ''),
        toolName: String(payload?.toolName || ''),
        isError: Boolean(payload?.isError),
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
  signal?: AbortSignal
): Promise<GetConversationResponseData> {
  return copilotFetch<GetConversationResponseData>(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}`,
    'GET',
    undefined,
    signal
  )
}

export { CopilotError } from './types'
