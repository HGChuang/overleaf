const { randomUUID } = require('crypto')
const logger = require('@overleaf/logger')
const CompileManager = require('../Compile/CompileManager')
const ClsiManager = require('../Compile/ClsiManager')
const { LatexParser } = require('./LatexLogParser')

const MAX_FILES = 256
const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const MAX_LOG_CHARS = 1_000_000
const MAX_ERRORS = 30
const MAX_MESSAGE_CHARS = 500
const HASH_RE = /^[a-f0-9]{64}$/
const LOG_STATUSES = new Set(['success', 'failure', 'stopped-on-first-error'])

function normalizePath(value) {
  const raw = String(value || '').replace(/\\/g, '/')
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) {
    throw Object.assign(
      new Error(`sandbox path must be project-relative: ${value}`),
      {
        status: 400,
      }
    )
  }
  const path = raw.replace(/^\.\//, '')
  if (
    !path ||
    path.includes('\0') ||
    path.split('/').some(part => !part || part === '..' || part === '.')
  ) {
    throw Object.assign(new Error(`invalid sandbox path: ${value}`), {
      status: 400,
    })
  }
  return path
}

function validateBody(body) {
  if (
    !HASH_RE.test(body?.baseHash || '') ||
    !HASH_RE.test(body?.workspaceHash || '')
  ) {
    throw Object.assign(
      new Error('baseHash and workspaceHash must be SHA-256 hex strings'),
      { status: 400 }
    )
  }
  if (
    !Array.isArray(body.files) ||
    body.files.length === 0 ||
    body.files.length > MAX_FILES
  ) {
    throw Object.assign(
      new Error(`sandbox files must contain 1-${MAX_FILES} text files`),
      { status: 400 }
    )
  }
  let bytes = 0
  const seen = new Set()
  const files = body.files.map(file => {
    const path = normalizePath(file?.path)
    if (seen.has(path))
      throw Object.assign(new Error(`duplicate sandbox path: ${path}`), {
        status: 400,
      })
    seen.add(path)
    if (typeof file?.content !== 'string') {
      throw Object.assign(new Error(`sandbox file must be text: ${path}`), {
        status: 400,
      })
    }
    bytes +=
      Buffer.byteLength(path, 'utf8') + Buffer.byteLength(file.content, 'utf8')
    return { path, content: file.content }
  })
  if (bytes > MAX_SOURCE_BYTES) {
    throw Object.assign(
      new Error(`sandbox source exceeds ${MAX_SOURCE_BYTES} bytes`),
      { status: 413 }
    )
  }
  return { baseHash: body.baseHash, workspaceHash: body.workspaceHash, files }
}

async function streamToString(stream, maxChars) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    chunks.push(buffer)
    size += buffer.length
    if (size > maxChars) break
  }
  return Buffer.concat(chunks).toString('utf8').slice(0, maxChars)
}

module.exports = {
  async compile(req, res, next) {
    const projectId = req.params.project_id
    try {
      const { baseHash, workspaceHash, files } = validateBody(req.body || {})
      const limits =
        await CompileManager.promises.getProjectCompileLimits(projectId)
      const submissionId = `copilot-sandbox-${randomUUID()}`
      const result = await ClsiManager.promises.sendSandboxRequest(
        projectId,
        submissionId,
        files,
        baseHash,
        workspaceHash,
        limits
      )
      if (!LOG_STATUSES.has(result.status) || !result.buildId) {
        return res.json({
          status: result.status,
          errorCount: null,
          errors: [],
          warningCount: null,
          inputWorkspaceHash: workspaceHash,
          note:
            result.note ||
            `no output.log available for sandbox status '${result.status}'`,
        })
      }

      const stream = await ClsiManager.promises.getOutputFileStream(
        submissionId,
        null,
        limits,
        result.clsiServerId,
        result.buildId,
        'output.log'
      )
      const logText = await streamToString(stream, MAX_LOG_CHARS)
      const { errors, warnings } = new LatexParser(logText, {
        ignoreDuplicates: true,
      }).parse()
      return res.json({
        status: result.status,
        errorCount: errors.length,
        errors: errors.slice(0, MAX_ERRORS).map(entry => ({
          file: entry.file || null,
          line: entry.line == null ? null : Number(entry.line),
          message: String(entry.message || '').slice(0, MAX_MESSAGE_CHARS),
        })),
        warningCount: warnings.length,
        buildId: result.buildId,
        inputWorkspaceHash: workspaceHash,
      })
    } catch (error) {
      logger.err({ err: error, projectId }, 'copilot sandbox compile failed')
      next(error)
    }
  },
  _validateBody: validateBody,
}
