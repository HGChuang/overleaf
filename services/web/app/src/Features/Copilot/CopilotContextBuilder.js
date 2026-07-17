const ProjectGetter = require('../Project/ProjectGetter')
const ProjectEntityHandler = require('../Project/ProjectEntityHandler')
const ProjectRootDocManager = require('../Project/ProjectRootDocManager')
const CompileManager = require('../Compile/CompileManager')
const ClsiManager = require('../Compile/ClsiManager')
const SessionManager = require('../Authentication/SessionManager')

async function buildProjectContext(projectId) {
  const project = await ProjectGetter.promises.getProjectWithoutDocLines(projectId)
  if (!project) {
    throw new Error(`project not found: ${projectId}`)
  }

  const entities = ProjectEntityHandler.getAllEntitiesFromProject(project)
  const allDocs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const fileList = [
    ...entities.docs.map(item => item.path.replace(/^\//, '')),
    ...entities.files.map(item => item.path.replace(/^\//, '')),
  ]

  let rootDocId = project.rootDoc_id ? project.rootDoc_id.toString() : null
  if (!rootDocId) {
    await ProjectRootDocManager.promises.ensureRootDocumentIsSet(projectId)
    const refreshed = await ProjectGetter.promises.getProjectWithoutDocLines(projectId)
    rootDocId = refreshed?.rootDoc_id ? refreshed.rootDoc_id.toString() : null
  }

  return {
    projectId,
    rootDocId,
    fileList,
    outline: fileList.filter(path => path.endsWith('.tex')),
    files: Object.entries(allDocs).map(([path, doc]) => ({
      path: path.replace(/^\//, ''),
      content: Array.isArray(doc?.lines) ? doc.lines.join('\n') : '',
    })),
  }
}

async function buildCompileContext(projectId, reqBody, session) {
  const compile = reqBody.compile || {}
  if (compile.logText || compile.annotations) {
    return compile
  }

  if (!compile.compileId) {
    return compile
  }

  const userId = SessionManager.getLoggedInUserId(session)
  const limits = await CompileManager.promises.getProjectCompileLimits(projectId)
  let logText = ''
  try {
    const stream = await ClsiManager.promises.getOutputFileStream(
      projectId,
      userId,
      limits,
      compile.clsiServerId,
      compile.compileId,
      'output.log'
    )
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    logText = Buffer.concat(chunks).toString('utf8')
  } catch (error) {
    logText = ''
  }

  return {
    ...compile,
    logText,
    annotations: Array.isArray(compile.annotations) ? compile.annotations : [],
  }
}

// Per-intent defaults for the conversation envelope, mirroring the old
// per-endpoint builders (chat→panel/ask, compile-diagnose→compile/fix,
// run-checks & explain-issue→checks/check).
const CONVERSATION_DEFAULTS = {
  chat: { source: 'panel', tab: 'ask' },
  'compile-diagnose': { source: 'compile', tab: 'fix' },
  'run-checks': { source: 'checks', tab: 'check' },
  'explain-issue': { source: 'checks', tab: 'check' },
}

// Build the body for the unified `POST /api/v1/copilot/chat` request. Every
// intent shares this builder: it always injects the server-side project context
// (fileList/outline/files) from `projectId`, and — only for the compile-diagnose
// intent — fetches the CLSI output.log when a `compile.compileId` is present
// without a logText (the logic formerly owned by buildCompileBody). All other
// fields (context/message/editor/checks/options/issue/intent) are forwarded
// verbatim from the client.
module.exports = {
  async buildCopilotBody(req) {
    const projectId = req.body.projectId || req.body.project?.projectId
    const project = await buildProjectContext(projectId)
    const intent = req.body.intent || 'chat'
    const defaults = CONVERSATION_DEFAULTS[intent] || CONVERSATION_DEFAULTS.chat

    const body = {
      intent,
      conversation:
        req.body.conversation || {
          conversationId: req.body.conversationId || null,
          source: defaults.source,
          tab: defaults.tab,
        },
      project,
    }

    // forward the optional, intent-specific fields the client sent
    if (req.body.context) body.context = req.body.context
    if (req.body.message) body.message = req.body.message
    if (req.body.editor) body.editor = req.body.editor
    if (req.body.checks) body.checks = req.body.checks
    if (req.body.options) body.options = req.body.options
    if (req.body.issue) body.issue = req.body.issue

    if (intent === 'compile-diagnose') {
      body.compile = await buildCompileContext(projectId, req.body, req.session)
    } else if (req.body.compile) {
      body.compile = req.body.compile
    }

    return body
  },
}
