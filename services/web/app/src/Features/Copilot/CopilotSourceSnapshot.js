const { createHash } = require('node:crypto')
const ProjectGetter = require('../Project/ProjectGetter')
const ProjectEntityHandler = require('../Project/ProjectEntityHandler')
const ProjectRootDocManager = require('../Project/ProjectRootDocManager')
const DocumentUpdaterHandler = require('../DocumentUpdater/DocumentUpdaterHandler')

const SnapshotStore = require('./CopilotSnapshotStore')
const FileStoreHandler = require('../FileStore/FileStoreHandler')

const hash = value => createHash('sha256').update(value).digest('hex')
const comparePaths = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

async function metadata(projectId) {
  const project = await ProjectGetter.promises.getProjectWithoutDocLines(projectId)
  if (!project) throw new Error(`project not found: ${projectId}`)
  const entities = ProjectEntityHandler.getAllEntitiesFromProject(project)
  return {
    treeVersion: project.version ?? 0,
    configVersion: project.copilotConfigVersion ?? 0,
    rootDocId: project.rootDoc_id?.toString() || null,
    compiler: project.compiler || 'pdflatex',
    imageName: project.imageName || null,
    docs: entities.docs.map(({ path, doc }) => ({
      path: path.replace(/^\//, ''), docId: doc._id.toString(),
    })).sort(comparePaths),
    assets: entities.files.map(({ path, file }) => ({
      path: path.replace(/^\//, ''), fileId: file._id.toString(),
      hash: file.hash || null,
    })).sort(comparePaths),
  }
}

async function documents(projectId, docs) {
  const result = []
  // Bounded concurrency: do not fan out one updater request per project file.
  for (const doc of docs) {
    const { lines, version } = await DocumentUpdaterHandler.promises.getDocument(
      projectId, doc.docId, -1
    )
    if (!Number.isSafeInteger(version) || version < 0 || !Array.isArray(lines)) {
      throw new Error('Document updater returned an unversioned source')
    }
    const content = lines.join('\n')
    result.push({ ...doc, version, sha256: hash(content), content })
  }
  return result
}

async function capture(projectId) {
  SnapshotStore.startMaintenance()
  await ProjectRootDocManager.promises.ensureRootDocumentIsSet(projectId)
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await metadata(projectId)
    const files = await documents(projectId, first.docs)
    const assets = []
    for (const asset of first.assets) {
      const stream = await FileStoreHandler.promises.getFileStream(projectId, asset.fileId, {})
      stream.on('response', response => {
        if (response.statusCode !== 200) stream.destroy(new Error('Snapshot asset download failed'))
      })
      const chunks = []
      let size = 0
      for await (const chunk of stream) {
        size += chunk.length
        if (size > 100 * 1024 * 1024) {
          stream.destroy()
          throw new Error('Snapshot asset exceeds the 100 MiB capture limit')
        }
        chunks.push(Buffer.from(chunk))
      }
      const sha256 = await SnapshotStore.putArtifact(projectId, Buffer.concat(chunks))
      assets.push({ ...asset, sha256, size })
    }
    const second = await metadata(projectId)
    if (JSON.stringify(first) !== JSON.stringify(second)) continue
    const confirmed = await documents(projectId, second.docs)
    if (files.some((file, i) =>
      file.version !== confirmed[i].version || file.sha256 !== confirmed[i].sha256
    )) continue

    // Each stable document interval spans the second metadata read. The
    // monotonic tree/config revisions also cover that point (including ABA).
    // Filestore asset IDs are immutable; their exact bytes were copied before
    // the confirmation point, and later reads use only the copied artifacts.
    for (const file of files) await SnapshotStore.putArtifact(projectId, Buffer.from(file.content))
    const manifest = {
      schemaVersion: 1,
      projectId: projectId.toString(),
      ...first,
      docs: files.map(({ content, ...entry }) => entry),
      assets,
      consistency: 'immutable-double-collected-project',
      assetBytesFrozen: true,
    }
    return {
      projectId,
      rootDocId: first.rootDocId,
      fileList: [...first.docs, ...first.assets].map(file => file.path),
      outline: first.docs.filter(doc => doc.path.endsWith('.tex')).map(doc => doc.path),
      files: [],
      sourceSnapshot: await SnapshotStore.publish(manifest),
    }
  }
  const error = new Error('The project changed during source capture. Please retry.')
  error.code = 'COPILOT_SOURCE_CHANGED'
  error.status = 409
  throw error
}

async function assertCurrent(projectId, snapshot) {
  const current = await metadata(projectId)
  const expected = { treeVersion: snapshot.treeVersion, configVersion: snapshot.configVersion,
    rootDocId: snapshot.rootDocId, compiler: snapshot.compiler, imageName: snapshot.imageName,
    docs: snapshot.docs.map(({ path, docId }) => ({ path, docId })),
    assets: snapshot.assets.map(({ path, fileId, hash }) => ({ path, fileId, hash })),
  }
  if (JSON.stringify(current) !== JSON.stringify(expected)) return false
  const live = await documents(projectId, current.docs)
  return live.every((doc, index) => doc.version === snapshot.docs[index].version && doc.sha256 === snapshot.docs[index].sha256)
}

module.exports = { capture, assertCurrent }
