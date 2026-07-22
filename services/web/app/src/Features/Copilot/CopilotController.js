const Settings = require('@overleaf/settings')
const fetch = require('node-fetch')
const CopilotContextBuilder = require('./CopilotContextBuilder')
const SessionManager = require('../Authentication/SessionManager')
const AuthorizationManager = require('../Authorization/AuthorizationManager')

async function ensureCanReadProject(req, projectId) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const canRead = await AuthorizationManager.promises.canUserReadProject(userId, projectId)
  if (!canRead) {
    const error = new Error('forbidden')
    error.status = 403
    error.code = 'COPILOT_FORBIDDEN'
    throw error
  }
}

// Pipe an upstream SSE response through to the browser. The llm service
// already emits well-formed `event:`/`data:` frames (plus `: hb` heartbeats),
// so this is a straight byte pipe with the right headers. The upstream
// request itself gets a generous wall-clock budget: heartbeats keep
// intermediaries alive, and the llm service's own 120s turn deadline is the
// real bound (this only backstops a wedged upstream).
function pipeSse(response, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  // Browser went away mid-stream: kill the upstream fetch so the llm service
  // sees the connection drop and aborts the agent turn (its own res 'close'
  // handler) instead of burning tokens for nobody.
  res.on('close', () => {
    response.body.destroy()
  })
  response.body.pipe(res)
}

async function proxy(req, res, url, bodyBuilder) {
  const requestId = req.headers['x-request-id'] || `${Date.now()}`
  try {
    const llmUrl = Settings.apis?.llm?.url
    if (!llmUrl) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'COPILOT_UPSTREAM_ERROR',
          message: 'LLM service URL not configured',
        },
        meta: { requestId },
      })
    }

    const builtBody = bodyBuilder ? await bodyBuilder(req) : undefined
    const projectId =
      builtBody?.project?.projectId || req.body?.projectId || req.body?.project?.projectId
    if (projectId) {
      await ensureCanReadProject(req, projectId)
    }

    const wantsStream = String(req.headers.accept || '').includes('text/event-stream')

    const response = await fetch(`${llmUrl}${url}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
        ...(wantsStream && { Accept: 'text/event-stream' }),
        ...(req.headers.authorization && {
          Authorization: req.headers.authorization,
        }),
        ...(req.headers['user-agent'] && {
          'User-Agent': req.headers['user-agent'],
        }),
        ...(req.headers.cookie && {
          Cookie: req.headers.cookie,
        }),
        ...(req.headers['accept-language'] && {
          'Accept-Language': req.headers['accept-language'],
        }),
      },
      // Buffered callers keep the original 60s budget; SSE turns are bounded
      // by the llm service's own turn deadline (~120s), so the proxy backstop
      // sits above it.
      signal: AbortSignal.timeout(wantsStream ? 180_000 : 60_000),
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: JSON.stringify(builtBody) }
        : {}),
    })

    // Only pipe through when the upstream actually answered with an SSE
    // stream — pre-stream failures (401/413/500) arrive as ordinary JSON and
    // must keep their status codes.
    const upstreamType = String(response.headers.get('content-type') || '')
    if (wantsStream && response.status === 200 && upstreamType.includes('text/event-stream')) {
      pipeSse(response, res)
      return
    }

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    const status = error.status || 500
    res.status(status).json({
      success: false,
      error: {
        code: error.code || 'COPILOT_UPSTREAM_ERROR',
        message: error.message,
      },
      meta: { requestId },
    })
  }
}

module.exports = {
  // The single Copilot endpoint. Forwards to the LLM service's
  // /api/v1/copilot/chat route; CopilotContextBuilder.buildCopilotBody injects
  // the server-side project context. When the browser asks for
  // `Accept: text/event-stream` the upstream SSE stream is piped through
  // verbatim; otherwise the response is buffered JSON as before.
  async chat(req, res) {
    return proxy(req, res, '/api/v1/copilot/chat', CopilotContextBuilder.buildCopilotBody)
  },
  async getConversation(req, res) {
    return proxy(req, res, `/api/v1/copilot/conversations/${req.params.conversationId}`)
  },
}
