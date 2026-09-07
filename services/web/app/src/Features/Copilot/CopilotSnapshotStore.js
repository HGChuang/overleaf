const { createHash } = require('node:crypto')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const mongoose = require('../../infrastructure/Mongoose')

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const key = (projectId, id) => `${projectId}:${id}`
const bucket = db => new mongoose.mongo.GridFSBucket(db, { bucketName: 'copilot_source_bytes' })
let initialized
async function initialize(db) {
  initialized ||= Promise.all([
    db.collection('copilot_snapshots').createIndex({ 'manifest.projectId': 1, lastReferencedAt: 1 }),
    db.collection('copilot_artifacts').createIndex({ projectId: 1, sha256: 1 }, { unique: true }),
    db.collection('copilot_artifacts').createIndex({ createdAt: 1 }),
  ]).catch(error => { initialized = undefined; throw error })
  return initialized
}

async function putArtifact(projectId, bytes) {
  const db = await mongoose.getNativeDb()
  await initialize(db)
  const id = sha256(bytes)
  const artifacts = db.collection('copilot_artifacts')
  const existing = await artifacts.findOne({ _id: key(projectId, id) })
  if (existing) return id
  const upload = bucket(db).openUploadStream(id, { metadata: { projectId: String(projectId) } })
  await pipeline(Readable.from([bytes]), upload)
  // Concurrent captures may publish the same content. Only the winner is
  // referenced; unmatched uploads remain collectible after the grace period.
  await artifacts.updateOne({ _id: key(projectId, id) }, { $setOnInsert: {
    projectId: String(projectId), sha256: id, fileId: upload.id,
    size: bytes.length, createdAt: new Date(),
  } }, { upsert: true })
  return id
}

async function readArtifact(projectId, id) {
  const db = await mongoose.getNativeDb()
  await initialize(db)
  const entry = await db.collection('copilot_artifacts').findOne({ _id: key(projectId, id) })
  if (!entry) throw Object.assign(new Error('Snapshot source is unavailable'), { status: 404 })
  const chunks = []
  for await (const chunk of bucket(db).openDownloadStream(entry.fileId)) chunks.push(chunk)
  const bytes = Buffer.concat(chunks)
  if (sha256(bytes) !== id) throw new Error('Snapshot artifact integrity check failed')
  return bytes
}

async function publish(manifest) {
  const id = sha256(JSON.stringify(manifest))
  const db = await mongoose.getNativeDb()
  await initialize(db)
  await db.collection('copilot_snapshots').updateOne({ _id: key(manifest.projectId, id) }, {
    $setOnInsert: { manifest, createdAt: new Date() },
    $set: { lastReferencedAt: new Date() },
  }, { upsert: true })
  return { id, ...manifest }
}

async function get(projectId, id) {
  const db = await mongoose.getNativeDb()
  await initialize(db)
  const value = await db.collection('copilot_snapshots').findOne({ _id: key(projectId, id) })
  if (!value || sha256(JSON.stringify(value.manifest)) !== id) {
    throw Object.assign(new Error('Snapshot not found'), { status: 404 })
  }
  await db.collection('copilot_snapshots').updateOne({ _id: key(projectId, id) }, { $set: { lastReferencedAt: new Date() } })
  return { id, ...value.manifest }
}

let maintenanceTimer
function startMaintenance() {
  if (maintenanceTimer) return
  void cleanup().catch(() => {})
  maintenanceTimer = setInterval(() => void cleanup().catch(() => {}), 24 * 60 * 60 * 1000)
  maintenanceTimer.unref()
}

async function cleanup(now = new Date()) {
  const db = await mongoose.getNativeDb()
  await initialize(db)
  const grace = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const snapshots = db.collection('copilot_snapshots')
  for await (const snapshot of snapshots.find({ lastReferencedAt: { $lt: grace } })) {
    const [patch, review, index] = await Promise.all([
      db.collection('copilot_patch_records').findOne({ snapshotId: snapshot.manifest?.id || snapshot._id.split(':').pop() }),
      db.collection('copilot_paper_reviews').findOne({ snapshotId: snapshot._id.split(':').pop() }),
      db.collection('copilot_paper_indexes').findOne({ snapshotId: snapshot._id.split(':').pop() }),
    ])
    if (!patch && !review && !index) await snapshots.deleteOne({ _id: snapshot._id })
  }
  const referenced = new Set()
  for await (const snapshot of snapshots.find({}, { projection: { manifest: 1 } })) {
    for (const file of [...(snapshot.manifest?.docs || []), ...(snapshot.manifest?.assets || [])]) referenced.add(key(snapshot.manifest.projectId, file.sha256))
  }
  const artifacts = db.collection('copilot_artifacts')
  const retainedFileIds = new Set()
  for await (const artifact of artifacts.find({ createdAt: { $lt: grace } })) {
    if (referenced.has(artifact._id)) { retainedFileIds.add(String(artifact.fileId)); continue }
    await bucket(db).delete(artifact.fileId).catch(() => {})
    await artifacts.deleteOne({ _id: artifact._id })
  }
  for await (const artifact of artifacts.find({}, { projection: { fileId: 1 } })) retainedFileIds.add(String(artifact.fileId))
  for await (const file of db.collection('copilot_source_bytes.files').find({ uploadDate: { $lt: grace } }, { projection: { _id: 1 } })) {
    if (retainedFileIds.has(String(file._id))) continue
    await bucket(db).delete(file._id).catch(() => {})
  }
}

async function readFile(projectId, id, path) {
  const snapshot = await get(projectId, id)
  const file = snapshot.docs.find(doc => doc.path === path)
  if (!file) throw Object.assign(new Error('Snapshot text file not found'), { status: 404 })
  return { ...file, content: (await readArtifact(projectId, file.sha256)).toString('utf8') }
}

async function compileInput(projectId, id) {
  const snapshot = await get(projectId, id)
  const root = snapshot.docs.find(doc => doc.docId === snapshot.rootDocId)
  if (!root || !snapshot.assetBytesFrozen) throw new Error('Snapshot is not compilable')
  const resources = []
  for (const file of [...snapshot.docs, ...snapshot.assets]) {
    const bytes = await readArtifact(projectId, file.sha256)
    resources.push({ path: file.path, content: bytes.toString('base64'), encoding: 'base64' })
  }
  return { snapshotId: id, buildProjectId: sha256(`copilot:${projectId}:${id}`).slice(0, 24), compiler: snapshot.compiler, imageName: snapshot.imageName,
    rootResourcePath: root.path, resources }
}

module.exports = { putArtifact, readArtifact, publish, get, readFile, compileInput, startMaintenance, cleanup }
