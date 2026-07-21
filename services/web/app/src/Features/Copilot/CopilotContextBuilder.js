const ProjectGetter = require('../Project/ProjectGetter')
const ProjectEntityHandler = require('../Project/ProjectEntityHandler')
const ProjectRootDocManager = require('../Project/ProjectRootDocManager')

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

// Build the body for the `POST /api/v1/copilot/chat` request. Injects the
// server-side project context (fileList/outline/files) from `projectId` and
// forwards the client's `conversation` / `context` / `message` verbatim. (The
// former compile-diagnose / run-checks / explain-issue intents and their
// per-intent compile-log fetching were removed when the Ask/Fix/Check
// distinction was dropped; there is now only chat.)
module.exports = {
  async buildCopilotBody(req) {
    const projectId = req.body.projectId || req.body.project?.projectId
    const project = await buildProjectContext(projectId)

    const body = {
      conversation:
        req.body.conversation || {
          conversationId: req.body.conversationId || null,
          source: 'panel',
        },
      project,
    }

    if (req.body.context) body.context = req.body.context
    if (req.body.message) body.message = req.body.message

    return body
  },
}
