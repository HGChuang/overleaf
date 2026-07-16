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

module.exports = {
  async buildChatBody(req) {
    const project = await buildProjectContext(req.body.projectId || req.body.project?.projectId)
    return {
      conversation: req.body.conversation || {
        conversationId: req.body.conversationId || null,
        source: 'panel',
        tab: 'ask',
      },
      project,
      context: req.body.context || {
        currentFile: req.body.currentFile || null,
        selectedText: req.body.selection || '',
        attachedFiles: [],
        recentCompileErrorId: null,
      },
      message: req.body.message || {
        role: 'user',
        content: req.body.ask || '',
      },
    }
  },

  async buildCompileBody(req) {
    const projectId = req.body.projectId || req.body.project?.projectId
    const project = await buildProjectContext(projectId)
    const compile = await buildCompileContext(projectId, req.body, req.session)
    return {
      conversation: req.body.conversation || {
        conversationId: req.body.conversationId || null,
        source: 'compile',
        tab: 'fix',
      },
      project,
      editor: req.body.editor || {
        currentFile: req.body.currentFile || null,
      },
      compile,
    }
  },

  async buildChecksRunBody(req) {
    const project = await buildProjectContext(req.body.projectId || req.body.project?.projectId)
    return {
      conversation: req.body.conversation || {
        conversationId: req.body.conversationId || null,
        source: 'checks',
        tab: 'check',
      },
      project,
      checks: req.body.checks || ['citations'],
      options: req.body.options || {},
    }
  },

  async buildChecksExplainBody(req) {
    const project = await buildProjectContext(req.body.projectId || req.body.project?.projectId)
    return {
      conversation: req.body.conversation || {
        conversationId: req.body.conversationId || null,
        source: 'checks',
        tab: 'check',
      },
      project,
      issue: req.body.issue,
    }
  },
}
