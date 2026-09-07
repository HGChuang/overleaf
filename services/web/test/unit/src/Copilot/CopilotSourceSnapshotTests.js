const sinon = require('sinon')
const { expect } = require('chai')
const SandboxedModule = require('sandboxed-module')
const { createHash } = require('node:crypto')
const { Readable } = require('node:stream')

describe('CopilotSourceSnapshot', function () {
  beforeEach(function () {
    this.project = {
      version: 1, copilotConfigVersion: 1, rootDoc_id: 'doc-1',
      compiler: 'xelatex', imageName: 'texlive',
    }
    this.getProject = sinon.stub().callsFake(async () => ({ ...this.project }))
    this.getDocument = sinon.stub().resolves({ lines: ['原文', '\\label{claim}'], version: 3 })
    this.entities = {
      docs: [{ path: '/main.tex', doc: { _id: 'doc-1' } }],
      files: [{ path: '/figure.pdf', file: { _id: 'asset-1', hash: 'asset-hash' } }],
    }
    this.snapshotStore = {
      startMaintenance: sinon.stub(),
      putArtifact: sinon.stub().callsFake(async (_projectId, bytes) =>
        createHash('sha256').update(bytes).digest('hex')),
      publish: sinon.stub().callsFake(async manifest => ({
        ...manifest,
        id: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
      })),
    }
    this.getFileStream = sinon.stub().callsFake(async () => Readable.from([Buffer.from('asset bytes')]))
    this.snapshot = SandboxedModule.require(
      '../../../../app/src/Features/Copilot/CopilotSourceSnapshot.js', {
        requires: {
          'node:crypto': require('node:crypto'),
          '../Project/ProjectGetter': { promises: { getProjectWithoutDocLines: this.getProject } },
          '../Project/ProjectEntityHandler': { getAllEntitiesFromProject: () => this.entities },
          '../DocumentUpdater/DocumentUpdaterHandler': { promises: { getDocument: this.getDocument } },
          '../Project/ProjectRootDocManager': { promises: { ensureRootDocumentIsSet: sinon.stub().resolves() } },
          './CopilotSnapshotStore': this.snapshotStore,
          '../FileStore/FileStoreHandler': { promises: { getFileStream: this.getFileStream } },
        },
      }
    )
  })

  it('captures exact live source and stable identity with frozen asset bytes', async function () {
    const first = await this.snapshot.capture('project-1')
    const second = await this.snapshot.capture('project-1')
    expect(first).to.deep.equal(second)
    expect(first.files).to.deep.equal([])
    expect(first.sourceSnapshot.docs[0]).to.include({ version: 3, docId: 'doc-1' })
    expect(first.sourceSnapshot.id).to.match(/^[a-f0-9]{64}$/)
    expect(first.sourceSnapshot.assetBytesFrozen).to.equal(true)
    expect(first.sourceSnapshot.assets[0].fileId).to.equal('asset-1')
    expect(this.getDocument).to.have.been.calledWith('project-1', 'doc-1', -1)
  })

  it('retries an intervening edit, even when text changed back to the same bytes', async function () {
    this.getDocument.onFirstCall().resolves({ lines: ['same text'], version: 1 })
    this.getDocument.onSecondCall().resolves({ lines: ['same text'], version: 3 })
    const result = await this.snapshot.capture('project-1')
    expect(this.getDocument.callCount).to.equal(4)
    expect(result.sourceSnapshot.docs[0].version).to.equal(3)
  })

  it('retries configuration ABA using its independent monotonic revision', async function () {
    this.getProject.onFirstCall().resolves({ ...this.project, copilotConfigVersion: 0 })
    const result = await this.snapshot.capture('project-1')
    expect(this.getProject.callCount).to.equal(4)
    expect(result.sourceSnapshot.configVersion).to.equal(1)
    expect(result.sourceSnapshot.treeVersion).to.equal(1)
  })

  it('retries tree changes before confirming source', async function () {
    this.getProject.onFirstCall().resolves({ ...this.project, version: 0 })
    await this.snapshot.capture('project-1')
    expect(this.getProject.callCount).to.equal(4)
    expect(this.getDocument.callCount).to.equal(3)
  })

  it('rejects continuous concurrent changes without returning a mixed snapshot', async function () {
    let version = 0
    this.getDocument.callsFake(async () => ({ lines: ['changing'], version: version++ }))
    try {
      await this.snapshot.capture('project-1')
      expect.fail('must reject unstable source')
    } catch (error) {
      expect(error.code).to.equal('COPILOT_SOURCE_CHANGED')
      expect(error.status).to.equal(409)
    }
    expect(this.getDocument.callCount).to.equal(6)
  })

  it('rejects unversioned or missing source instead of replacing it with empty text', async function () {
    this.getDocument.resolves({ lines: ['unversioned'] })
    await expect(this.snapshot.capture('project-1')).to.be.rejectedWith('unversioned source')
  })
})
