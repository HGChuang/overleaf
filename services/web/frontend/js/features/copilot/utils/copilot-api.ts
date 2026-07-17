// Thin transport layer for the Copilot backend.
//
// A single endpoint — `POST /api/v1/copilot/chat` — handles every action
// (chat / compile-diagnose / run-checks / explain-issue). The request body's
// `intent` field selects which path runs server-side; every action returns
// the same unified `{ conversationId, message:{role,content,blocks},
// suggestedActions }` shape.
//
// The web layer (`services/web/app/src/Features/Copilot/CopilotController.js`)
// proxies this route and builds project context server-side from `projectId`,
// so callers only send `projectId` + `intent` + the intent-specific fields
// (context/message, compile/editor, checks/options, issue).
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

// One unified Copilot request. The body MUST include an `intent`
// ('chat' | 'compile-diagnose' | 'run-checks' | 'explain-issue'); the server
// defaults to 'chat' if omitted.
export function copilotChat(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ChatResponseData> {
  return copilotFetch<ChatResponseData>(`${BASE}/chat`, 'POST', body, signal)
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
