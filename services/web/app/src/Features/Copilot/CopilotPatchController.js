const { createHash } = require('node:crypto')
const mongoose = require('../../infrastructure/Mongoose')
const Authorization = require('../Authorization/AuthorizationManager')
const SessionManager = require('../Authentication/SessionManager')
const Updater = require('../DocumentUpdater/DocumentUpdaterHandler')
const Snapshots = require('./CopilotSnapshotStore')
const hash = text => createHash('sha256').update(text).digest('hex')
const key = (user, project, patch) => `${user}:${project}:${patch}`
let initialized
async function records() {
  const db = await mongoose.getNativeDb()
  initialized ||= Promise.all([
    db.collection('copilot_patch_records').createIndex({ userId: 1, projectId: 1, conversationId: 1, createdAt: 1 }),
    db.collection('copilot_patch_records').createIndex({ snapshotId: 1 }),
  ]).catch(error => { initialized = undefined; throw error })
  await initialized
  return db.collection('copilot_patch_records')
}

function applyHunks(text, hunks) {
  const edits = hunks.map(h => {
    const at = h.oldText ? text.indexOf(h.oldText) :
      Number.isInteger(h.line) && h.line >= 1 && h.line <= text.split('\n').length + 1
        ? text.split('\n').slice(0, h.line - 1).reduce((n, line) => n + line.length + 1, 0) : -1
    if (at < 0 || at > text.length || (h.oldText && text.indexOf(h.oldText, at + 1) >= 0)) {
      throw Object.assign(new Error('Patch anchor is missing or ambiguous'), { status: 409 })
    }
    return { at, end: at + h.oldText.length, text: h.newText }
  }).sort((a, b) => a.at - b.at)
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].at <= edits[i - 1].at || edits[i].at < edits[i - 1].end) throw new Error('Overlapping hunks')
  }
  for (const edit of edits.reverse()) text = text.slice(0, edit.at) + edit.text + text.slice(edit.end)
  return text
}

function status(hunks) {
  if (hunks.every(h => h.status === 'applied')) return 'applied'
  if (hunks.some(h => h.status === 'applied')) return 'partially_applied'
  if (hunks.some(h => ['applying', 'unknown', 'revision_submitted_unverified'].includes(h.status))) return 'unknown'
  if (hunks.some(h => h.status === 'conflicted')) return 'conflicted'
  if (hunks.every(h => h.status === 'rejected')) return 'rejected'
  return 'proposed'
}

async function reconcileInterrupted(projectId, record, collection) {
  if (!record.hunks.some(hunk => hunk.status === 'applying') ||
    (record.busy?.until && new Date(record.busy.until) > new Date())) return record
  for (const file of new Set(record.hunks.filter(hunk => hunk.status === 'applying').map(hunk => hunk.file))) {
    const source = await Snapshots.readFile(projectId, record.snapshotId, file)
    const applied = record.hunks.filter(hunk => hunk.file === file && hunk.status === 'applied')
    const interrupted = record.hunks.filter(hunk => hunk.file === file && hunk.status === 'applying')
    const before = applyHunks(source.content, applied)
    const candidate = applyHunks(source.content, [...applied, ...interrupted])
    const live = await Updater.promises.getDocument(projectId, source.docId, -1)
    const liveHash = hash(live.lines.join('\n'))
    if (liveHash === hash(candidate)) {
      for (const hunk of interrupted) {
        hunk.status = 'applied'
        hunk.receipt = { status: 'applied', recovered: true, operationId: hunk.applicationId,
          beforeHash: hash(before), afterHash: liveHash, afterVersion: live.version }
      }
      record.documentHeads ||= {}
      record.documentHeads[file] = { hash: liveHash, version: live.version }
    } else if (liveHash === hash(before)) {
      for (const hunk of interrupted) hunk.status = 'proposed'
    } else {
      for (const hunk of interrupted) {
        hunk.status = 'conflicted'
        hunk.receipt = { status: 'conflicted', recovered: true, beforeHash: liveHash, beforeVersion: live.version }
      }
    }
  }
  await collection.updateOne({ _id: record._id }, { $set: {
    hunks: record.hunks, documentHeads: record.documentHeads,
  }, $unset: { busy: '' } })
  return record
}

module.exports = {
  async list(req, res, next) {
    try {
      const { project_id: projectId, user_id: userId } = req.params
      if (!await Authorization.promises.canUserReadProject(userId, projectId)) return res.sendStatus(403)
      const rows = await (await records())
        .find({ projectId, userId, ...(req.query.conversationId ? { conversationId: req.query.conversationId } : {}) })
        .sort({ createdAt: 1 }).project({ _id: 0, patchId: 1, snapshotId: 1,
          hunks: 1, candidateVerification: 1, createdAt: 1 }).toArray()
      res.json(rows.map(row => ({ ...row, status: status(row.hunks) })))
    } catch (error) { next(error) }
  },
  async propose(req, res, next) {
    try {
      const projectId = req.params.project_id
      const { userId, snapshotId, patchId, hunks, conversationId } = req.body || {}
      if (typeof userId !== 'string' || !/^patch_[a-f0-9]{24}$/.test(patchId || '') || !Array.isArray(hunks) || !hunks.length) return res.sendStatus(400)
      if (!await Authorization.promises.canUserReadProject(userId, projectId)) return res.sendStatus(403)
      const snapshot = await Snapshots.get(projectId, snapshotId)
      const normalized = hunks.map((h, index) => {
        if (typeof h.oldText !== 'string' || typeof h.newText !== 'string') throw new Error('Invalid patch hunk')
        const file = snapshot.docs.find(doc => doc.path === h.file)
        if (!file) throw new Error('Patch requires an exact editable file path')
        return { ...h, index, docId: file.docId, baselineHash: file.sha256, baselineVersion: file.version, status: 'proposed' }
      })
      for (const file of new Set(normalized.map(h => h.file))) {
        const source = await Snapshots.readFile(projectId, snapshotId, file)
        applyHunks(source.content, normalized.filter(h => h.file === file))
      }
      const collection = await records()
      const _id = key(userId, projectId, patchId)
      const documentHeads = Object.fromEntries(snapshot.docs
        .filter(doc => normalized.some(hunk => hunk.file === doc.path))
        .map(doc => [doc.path, { hash: doc.sha256, version: doc.version }]))
      const record = { projectId, userId, snapshotId, patchId, conversationId,
        hunks: normalized, documentHeads, createdAt: new Date() }
      await collection.updateOne({ _id }, { $setOnInsert: record }, { upsert: true })
      const saved = await collection.findOne({ _id })
      if (saved.snapshotId !== snapshotId || JSON.stringify(saved.hunks.map(h => [h.file, h.oldText, h.newText])) !== JSON.stringify(normalized.map(h => [h.file, h.oldText, h.newText]))) return res.sendStatus(409)
      res.json({ patchId, status: status(saved.hunks), hunks: saved.hunks })
    } catch (error) { next(error) }
  },
  async action(req, res, next) {
    let collection, _id, operationId, keepLease = false
    try {
      const projectId = req.params.project_id
      const userId = String(SessionManager.getLoggedInUserId(req.session) || '')
      if (!await Authorization.promises.canUserReadProject(userId, projectId)) return res.sendStatus(403)
      collection = await records()
      _id = key(userId, projectId, req.params.patch_id)
      let record = await collection.findOne({ _id })
      if (!record) return res.sendStatus(404)
      record = await reconcileInterrupted(projectId, record, collection)
      if (req.method === 'GET') return res.json({ ...record, status: status(record.hunks) })
      if (!await Authorization.promises.canUserWriteProjectContent(userId, projectId)) return res.sendStatus(403)
      const action = req.body?.action
      if (!['accept', 'reject', 'revision_submitted'].includes(action)) return res.sendStatus(400)
      const selected = req.body?.hunks || record.hunks.map(h => h.index)
      if (!Array.isArray(selected) || !selected.length || selected.some(i => !Number.isInteger(i) || !record.hunks[i]) || new Set(selected).size !== selected.length) return res.sendStatus(400)
      operationId = `patch:${createHash('sha256').update(JSON.stringify([
        record.patchId, action, [...selected].sort((a, b) => a - b), record.documentHeads,
      ])).digest('hex')}`
      const claimed = await collection.updateOne({ _id, $or: [
        { busy: { $exists: false } }, { 'busy.until': { $lte: new Date() } },
      ] }, { $set: { busy: { id: operationId, until: new Date(Date.now() + 30 * 1000) } } })
      if (!claimed.modifiedCount) return res.status(409).json({ status: 'unknown', message: 'Another application may still be in progress. Do not replay it.' })
      if (action === 'reject') {
        for (const h of record.hunks) if (selected.includes(h.index) && h.status === 'proposed') h.status = 'rejected'
      } else if (action === 'revision_submitted') {
        for (const h of record.hunks) if (selected.includes(h.index) && h.status === 'proposed') h.status = 'revision_submitted_unverified'
      } else {
        for (const file of new Set(record.hunks.filter(h => selected.includes(h.index) && h.status === 'proposed').map(h => h.file))) {
          const target = record.hunks.filter(h => h.file === file && selected.includes(h.index) && h.status === 'proposed')
          const allApplied = record.hunks.filter(h => h.file === file && h.status === 'applied')
          if (record.hunks.some(h => h.file === file && ['applying', 'unknown'].includes(h.status))) continue
          const source = await Snapshots.readFile(projectId, record.snapshotId, file)
          const before = applyHunks(source.content, allApplied)
          const candidate = applyHunks(source.content, [...allApplied, ...target])
          const head = record.documentHeads?.[file] || { hash: hash(before),
            version: allApplied.reduce((maximum, hunk) => Math.max(maximum, hunk.receipt?.afterVersion || 0), source.version) }
          for (const h of target) { h.status = 'applying'; h.applicationId = operationId }
          await collection.updateOne({ _id, 'busy.id': operationId }, { $set: { hunks: record.hunks } })
          let receipt
          try {
            receipt = await Updater.promises.applyCopilotPatch(projectId, source.docId, {
              expectedHash: head.hash, expectedVersion: head.version, content: candidate, operationId, userId,
            })
          } catch {
            keepLease = true
            receipt = { status: 'applying', operationId,
              note: 'Transport outcome unknown; reconcile against the live document before retrying.' }
          }
          for (const h of target) { h.status = receipt.status; h.receipt = receipt }
          if (receipt.status === 'applied') {
            record.documentHeads ||= {}
            record.documentHeads[file] = { hash: receipt.afterHash, version: receipt.afterVersion }
          }
          await collection.updateOne({ _id, 'busy.id': operationId }, { $set: {
            hunks: record.hunks, documentHeads: record.documentHeads,
          } })
        }
      }
      await collection.updateOne({ _id, 'busy.id': operationId }, { $set: { hunks: record.hunks } })
      res.json({ patchId: record.patchId, status: status(record.hunks), hunks: record.hunks,
        candidateVerification: record.candidateVerification })
    } catch (error) { next(error) }
    finally { if (collection && operationId && !keepLease) await collection.updateOne({ _id, 'busy.id': operationId }, { $unset: { busy: '' } }) }
  },
}
