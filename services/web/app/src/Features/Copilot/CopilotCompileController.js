// Internal (service-to-service) compile endpoint for the Copilot
// self-healing loop. It compiles either an exact immutable snapshot or a
// server-materialized patch candidate over that snapshot.
//
// Auth: private API basic auth (Settings.httpAuthUsers), same as the other
// /internal/* endpoints. Mounted in router.mjs on privateApiRouter.

const Settings = require('@overleaf/settings')
const logger = require('@overleaf/logger')
const CompileManager = require('../Compile/CompileManager')
const ClsiManager = require('../Compile/ClsiManager')
const { LatexParser } = require('./LatexLogParser')

const MAX_LOG_CHARS = 1_000_000
const MAX_ERRORS = 30
const MAX_MESSAGE_CHARS = 500

// Compile statuses for which output.log is expected to exist.
const LOG_STATUSES = new Set(['success', 'failure', 'stopped-on-first-error'])

function applyHunks(text, hunks) {
  const edits = hunks.map(hunk => {
    const at = hunk.oldText ? text.indexOf(hunk.oldText) :
      Number.isInteger(hunk.line) && hunk.line >= 1 && hunk.line <= text.split('\n').length + 1
        ? text.split('\n').slice(0, hunk.line - 1).reduce((size, line) => size + line.length + 1, 0) : -1
    if (at < 0 || (hunk.oldText && text.indexOf(hunk.oldText, at + 1) >= 0)) throw new Error('Candidate patch anchor is missing or ambiguous')
    return { at, end: at + hunk.oldText.length, value: hunk.newText }
  }).sort((a, b) => a.at - b.at)
  for (let index = 1; index < edits.length; index++) if (edits[index].at <= edits[index - 1].at || edits[index].at < edits[index - 1].end) throw new Error('Candidate patch hunks overlap')
  for (const edit of edits.reverse()) text = text.slice(0, edit.at) + edit.value + text.slice(edit.end)
  return text
}

async function candidateInput(projectId, userId, snapshotId, patchId) {
  const store = require('./CopilotSnapshotStore')
  const input = await store.compileInput(projectId, snapshotId)
  if (!patchId) return { input, candidateHash: snapshotId }
  if (!/^patch_[a-f0-9]{24}$/.test(patchId)) throw Object.assign(new Error('Invalid patch ID'), { status: 400 })
  const record = await (await require('../../infrastructure/Mongoose').getNativeDb()).collection('copilot_patch_records')
    .findOne({ _id: `${userId}:${projectId}:${patchId}`, userId, projectId, snapshotId })
  if (!record) throw Object.assign(new Error('Patch does not belong to this snapshot'), { status: 404 })
  const included = record.hunks.filter(hunk => !['rejected', 'conflicted', 'unknown'].includes(hunk.status))
  if (!included.length) throw Object.assign(new Error('Patch has no compilable hunks'), { status: 409 })
  for (const path of new Set(included.map(hunk => hunk.file))) {
    const resource = input.resources.find(item => item.path === path)
    if (!resource) throw new Error('Candidate patch file is absent from snapshot')
    const source = Buffer.from(resource.content, 'base64').toString('utf8')
    resource.content = Buffer.from(applyHunks(source, included.filter(hunk => hunk.file === path))).toString('base64')
  }
  const candidateHash = require('node:crypto').createHash('sha256').update(JSON.stringify(input.resources)).digest('hex')
  input.buildProjectId = require('node:crypto').createHash('sha256').update(`copilot:${projectId}:${snapshotId}:${patchId}:${candidateHash}`).digest('hex').slice(0, 24)
  return { input, candidateHash }
}

async function saveVerification(userId, projectId, snapshotId, result, verificationId) {
  const db = await require('../../infrastructure/Mongoose').getNativeDb()
  await db.collection('copilot_verifications').updateOne(
    { _id: verificationId }, { $set: {
      userId, projectId, snapshotId, patchId: result.patchId || null,
      candidateHash: result.candidateHash || null, kind: 'compile', status: 'complete', result, verifiedAt: new Date(),
    } }, { upsert: true })
  if (result.patchId) await db.collection('copilot_patch_records').updateOne({
    _id: `${userId}:${projectId}:${result.patchId}`, snapshotId,
  }, { $set: { candidateVerification: {
    verificationId, snapshotId, patchId: result.patchId, candidateHash: result.candidateHash,
    status: result.errorCount == null ? 'unavailable' : result.errorCount === 0 ? 'passed' : 'failed',
    errorCount: result.errorCount, warningCount: result.warningCount, verifiedAt: new Date(),
  } } })
  return result
}

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
    let verificationId
    let verifications
    try {
      const userId = req.body?.userId
      const snapshotId = req.body?.snapshotId
      const patchId = req.body?.patchId
      const idempotencyKey = req.body?.idempotencyKey
      const AuthorizationManager = require('../Authorization/AuthorizationManager')
      if (!/^[a-f\d]{24}$/i.test(userId || '') || !/^[a-f\d]{64}$/.test(snapshotId || '') || typeof idempotencyKey !== 'string' || idempotencyKey.length > 200) return res.sendStatus(400)
      if (!await AuthorizationManager.promises.canUserReadProject(userId, projectId)) return res.sendStatus(403)
      verificationId = `${userId}:${projectId}:${snapshotId}:${patchId || 'snapshot'}:compile:${idempotencyKey}`
      verifications = (await require('../../infrastructure/Mongoose').getNativeDb()).collection('copilot_verifications')
      await Promise.all([
        verifications.createIndex({ userId: 1, projectId: 1, snapshotId: 1, verifiedAt: -1 }),
        verifications.createIndex({ snapshotId: 1, patchId: 1 }),
      ])
      const existing = await verifications.findOne({ _id: verificationId })
      if (existing?.result) return res.json(existing.result)
      const claim = await verifications.updateOne({ _id: verificationId }, { $setOnInsert: {
        userId, projectId, snapshotId, patchId: patchId || null,
        kind: 'compile', status: 'running', startedAt: new Date(),
      } }, { upsert: true })
      if (!claim.upsertedCount) return res.status(409).json({ status: 'running', snapshotId,
        errorCount: null, errors: [], warningCount: null,
        note: 'This exact compile was already dispatched; its outcome is not yet known.' })
      const { input: snapshotInput, candidateHash } = await candidateInput(projectId, userId, snapshotId, patchId)
      const ownerId = userId
      const {
        status,
        clsiServerId,
        buildId,
        limits,
      } = await CompileManager.promises.compile(projectId, ownerId, {
        forceCompile: true,
        snapshotInput,
      })

      if (!LOG_STATUSES.has(status) || !buildId) {
        // Compile infra unavailable / rate-limited / validation failure — the
        // agent should treat this as "verification not possible right now".
        return res.json(await saveVerification(userId, projectId, snapshotId, {
          status, snapshotId, patchId, candidateHash, manifestHash: snapshotId,
          errorCount: null,
          errors: [],
          warningCount: null,
          note: `no output.log available for compile status '${status}'`,
        }, verificationId))
      }

      const compileAsUser = Settings.disablePerUserCompiles
        ? undefined
        : ownerId
      let logText
      try {
        const stream = await ClsiManager.promises.getOutputFileStream(
          snapshotInput.buildProjectId,
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
        return res.json(await saveVerification(userId, projectId, snapshotId, {
          status, snapshotId, patchId, candidateHash, manifestHash: snapshotId,
          errorCount: null,
          errors: [],
          warningCount: null,
          note: 'compile finished but output.log was not produced (project unchanged since last compile?)',
        }, verificationId))
      }

      const { errors, warnings } = new LatexParser(logText, {
        ignoreDuplicates: true,
      }).parse()

      const result = {
        status, snapshotId, patchId, candidateHash, manifestHash: snapshotId, buildId,
        errorCount: errors.length,
        errors: errors.slice(0, MAX_ERRORS).map(entry => ({
          file: entry.file || null,
          line: entry.line == null ? null : Number(entry.line),
          message: String(entry.message || '').slice(0, MAX_MESSAGE_CHARS),
        })),
        warningCount: warnings.length,
      }
      res.json(await saveVerification(userId, projectId, snapshotId, result, verificationId))
    } catch (err) {
      const unavailable = { status: 'unavailable', snapshotId: req.body?.snapshotId,
        patchId: req.body?.patchId, errorCount: null, errors: [], warningCount: null,
        note: 'Compile outcome unavailable after interruption; not replayed.' }
      if (verifications && verificationId) await verifications.updateOne({ _id: verificationId, status: 'running' }, { $set: {
        status: 'unavailable', result: unavailable, finishedAt: new Date(),
      } })
      logger.err({ err, projectId }, 'copilot compile-and-get-errors failed')
      if (!res.headersSent) return res.json(unavailable)
      next(err)
    }
  },
}
