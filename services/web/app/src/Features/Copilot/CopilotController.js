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

    const response = await fetch(`${llmUrl}${url}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
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
      signal: AbortSignal.timeout(60000),
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: JSON.stringify(builtBody) }
        : {}),
    })

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
  // One unified Copilot endpoint. The body's `intent` (chat / compile-diagnose
  // / run-checks / explain-issue) is forwarded to the LLM service's single
  // /api/v1/copilot/chat route; CopilotContextBuilder.buildCopilotBody injects
  // the server-side project context (and the compile log for the diagnose
  // intent). The former compileDiagnose / runChecks / explainCheck proxy
  // methods were folded into this one when the Ask/Fix/Check distinction was
  // removed.
  async chat(req, res) {
    return proxy(req, res, '/api/v1/copilot/chat', CopilotContextBuilder.buildCopilotBody)
  },
  async getConversation(req, res) {
    return proxy(req, res, `/api/v1/copilot/conversations/${req.params.conversationId}`)
  },
}
