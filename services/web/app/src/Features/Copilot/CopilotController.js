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

    const projectId = req.body?.projectId || req.body?.project?.projectId || req.query?.projectId
    if (!projectId || typeof projectId !== 'string') {
      const error = new Error('projectId is required')
      error.status = 400
      error.code = 'COPILOT_BAD_REQUEST'
      throw error
    }
    // Check current access before loading any source or archived conversation.
    await ensureCanReadProject(req, projectId)
    const builtBody = bodyBuilder ? await bodyBuilder(req) : undefined

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
      // by the llm service's own turn deadline (~300s — a verification round
      // includes a full LaTeX compile), so the proxy backstop sits above it.
      signal: AbortSignal.timeout(wantsStream ? 360_000 : 60_000),
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
  async readSnapshot(req, res, next) {
    try {
      const { project_id: projectId, user_id: userId, snapshot_id: snapshotId } = req.params
      if (!/^[a-f\d]{24}$/i.test(projectId) || !/^[a-f\d]{24}$/i.test(userId) || !/^[a-f\d]{64}$/.test(snapshotId)) return res.sendStatus(400)
      if (!await AuthorizationManager.promises.canUserReadProject(userId, projectId)) return res.sendStatus(403)
      const store = require('./CopilotSnapshotStore')
      if (req.query.current === '1') {
        const snapshot = await store.get(projectId, snapshotId)
        const current = await require('./CopilotSourceSnapshot').assertCurrent(projectId, snapshot)
        return res.json({ current })
      }
      const result = typeof req.query.path === 'string'
        ? await store.readFile(projectId, snapshotId, req.query.path)
        : await store.get(projectId, snapshotId)
      res.json(result)
    } catch (error) { next(error) }
  },
  // Private API: the llm service must recheck access even when its endpoint
  // is called directly, rather than trusting a browser-supplied project ID.
  async checkProjectAccess(req, res, next) {
    try {
      const { project_id: projectId, user_id: userId } = req.params
      if (!/^[a-f\d]{24}$/i.test(projectId) || !/^[a-f\d]{24}$/i.test(userId)) {
        return res.status(400).json({ allowed: false })
      }
      const allowed = await AuthorizationManager.promises.canUserReadProject(userId, projectId)
      res.json({ allowed: Boolean(allowed) })
    } catch (error) { next(error) }
  },
  // The single Copilot endpoint. Forwards to the LLM service's
  // /api/v1/copilot/chat route; CopilotContextBuilder.buildCopilotBody injects
  // the server-side project context. When the browser asks for
  // `Accept: text/event-stream` the upstream SSE stream is piped through
  // verbatim; otherwise the response is buffered JSON as before.
  async chat(req, res) {
    return proxy(req, res, '/api/v1/copilot/chat', CopilotContextBuilder.buildCopilotBody)
  },
  async listConversations(req, res) {
    return proxy(req, res, `/api/v1/copilot/conversations?projectId=${encodeURIComponent(req.query.projectId || '')}`)
  },
  async getConversation(req, res) {
    return proxy(req, res, `/api/v1/copilot/conversations/${encodeURIComponent(req.params.conversationId)}?projectId=${encodeURIComponent(req.query.projectId || "")}${req.query.before !== undefined ? `&before=${encodeURIComponent(req.query.before)}` : ""}`)
  },
  async getContext(req, res) {
    return proxy(req, res, `/api/v1/copilot/conversations/${encodeURIComponent(req.params.conversationId)}/context?projectId=${encodeURIComponent(req.query.projectId || '')}`)
  },
  async memories(req, res) {
    const suffix = req.params.memoryId ? `/${encodeURIComponent(req.params.memoryId)}` : `?projectId=${encodeURIComponent(req.query.projectId || '')}`
    return proxy(req, res, `/api/v1/copilot/memories${suffix}`, req.method === 'POST' ? request => request.body : undefined)
  },
  async compact(req, res) {
    return proxy(req, res, `/api/v1/copilot/conversations/${encodeURIComponent(req.params.conversationId)}/compact`, request => request.body)
  },
}
