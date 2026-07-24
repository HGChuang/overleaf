// Internal (service-to-service) compile endpoint for the Copilot
// self-healing loop. The llm service calls this AFTER the user has applied a
// Copilot patch, to get the authoritative result of a FRESH compile as
// structured errors — closing the generator→verifier loop.
//
// Auth: private API basic auth (Settings.httpAuthUsers), same as the other
// /internal/* endpoints. Mounted in router.mjs on privateApiRouter.

const Settings = require('@overleaf/settings')
const logger = require('@overleaf/logger')
const ProjectGetter = require('../Project/ProjectGetter')
const CompileManager = require('../Compile/CompileManager')
const ClsiManager = require('../Compile/ClsiManager')
const DocumentUpdaterHandler = require('../DocumentUpdater/DocumentUpdaterHandler')
const { LatexParser } = require('./LatexLogParser')

const MAX_LOG_CHARS = 1_000_000
const MAX_ERRORS = 30
const MAX_MESSAGE_CHARS = 500

// Compile statuses for which output.log is expected to exist.
const LOG_STATUSES = new Set(['success', 'failure', 'stopped-on-first-error'])

async function streamToString(stream, maxChars) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    chunks.push(buf)
    size += buf.length
    if (size > maxChars) break
  }
  return Buffer.concat(chunks).toString('utf8').slice(0, maxChars)
}

module.exports = {
  async compileAndGetErrors(req, res, next) {
    const projectId = req.params.project_id
    try {
      // Force document-updater to flush pending doc ops (e.g. a just-accepted
      // Copilot patch) to Mongo, so the compile sees the current source — the
      // same guarantee CopilotContextBuilder relies on for chat context.
      await DocumentUpdaterHandler.promises.flushProjectToMongo(projectId)

      const project = await ProjectGetter.promises.getProjectWithoutDocLines(
        projectId
      )
      if (!project) {
        return res.sendStatus(404)
      }

      // Compile as the project owner (CompileManager drops the userId itself
      // when per-user compiles are disabled). forceCompile makes latexmk run
      // *latex even when the project is unchanged since the last compile —
      // otherwise it no-ops (clsi deletes the previous output.log during
      // sync) and there is no fresh log to parse.
      const ownerId = project.owner_ref ? project.owner_ref.toString() : null
      const {
        status,
        clsiServerId,
        buildId,
        limits,
      } = await CompileManager.promises.compile(projectId, ownerId, {
        forceCompile: true,
      })

      if (!LOG_STATUSES.has(status) || !buildId) {
        // Compile infra unavailable / rate-limited / validation failure — the
        // agent should treat this as "verification not possible right now".
        return res.json({
          status,
          errorCount: null,
          errors: [],
          warningCount: null,
          note: `no output.log available for compile status '${status}'`,
        })
      }

      const compileAsUser = Settings.disablePerUserCompiles
        ? undefined
        : ownerId
      let logText
      try {
        const stream = await ClsiManager.promises.getOutputFileStream(
          projectId,
          compileAsUser,
          limits,
          clsiServerId,
          buildId,
          'output.log'
        )
        logText = await streamToString(stream, MAX_LOG_CHARS)
      } catch (err) {
        // latexmk can no-op on an unchanged project ("Nothing to do …
        // up-to-date" from a stale fdb) and produce no new log — report
        // "verification unavailable" instead of erroring the agent's turn.
        logger.warn(
          { err, projectId, status },
          'copilot compile: output.log unavailable'
        )
        return res.json({
          status,
          errorCount: null,
          errors: [],
          warningCount: null,
          note: 'compile finished but output.log was not produced (project unchanged since last compile?)',
        })
      }

      const { errors, warnings } = new LatexParser(logText, {
        ignoreDuplicates: true,
      }).parse()

      res.json({
        status,
        errorCount: errors.length,
        errors: errors.slice(0, MAX_ERRORS).map(entry => ({
          file: entry.file || null,
          line: entry.line == null ? null : Number(entry.line),
          message: String(entry.message || '').slice(0, MAX_MESSAGE_CHARS),
        })),
        warningCount: warnings.length,
      })
    } catch (err) {
      logger.err({ err, projectId }, 'copilot compile-and-get-errors failed')
      next(err)
    }
  },
}
