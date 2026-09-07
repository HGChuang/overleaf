const sinon = require('sinon')
const { expect } = require('chai')
const SandboxedModule = require('sandboxed-module')

const modulePath =
  '../../../../app/src/Features/Copilot/CopilotContextBuilder.js'

describe('CopilotContextBuilder', function () {
  beforeEach(function () {
    this.projectGetter = {
      promises: {
        getProjectWithoutDocLines: sinon.stub().resolves({
          rootDoc_id: { toString: () => 'root-doc' },
        }),
      },
    }
    this.projectEntityHandler = {
      getAllEntitiesFromProject: sinon.stub().returns({
        docs: [{ path: '/main.tex' }],
        files: [{ path: '/figure.png' }],
      }),
      promises: {
        getAllDocs: sinon.stub().resolves({
          '/main.tex': { lines: ['Hello'] },
        }),
      },
    }
    this.sourceSnapshot = {
      capture: sinon.stub().resolves({
        projectId: 'project-1',
        files: [{ path: 'main.tex', content: 'Hello' }],
        sourceSnapshot: { id: 'snapshot-1' },
      }),
    }

    this.builder = SandboxedModule.require(modulePath, {
      requires: {
        '../Project/ProjectGetter': this.projectGetter,
        '../Project/ProjectEntityHandler': this.projectEntityHandler,
        '../Project/ProjectRootDocManager': {
          promises: { ensureRootDocumentIsSet: sinon.stub().resolves() },
        },
        './CopilotSourceSnapshot': this.sourceSnapshot,
      },
    })
  })

  it('uses consistent source capture for panel turns', async function () {
    const body = await this.builder.buildCopilotBody({
      body: {
        projectId: 'project-1',
        conversation: { source: 'panel' },
        message: { role: 'user', content: 'hello' },
      },
    })

    expect(this.sourceSnapshot.capture).to.have.been.calledOnceWith('project-1')
    expect(body.project.sourceSnapshot.id).to.equal('snapshot-1')
    expect(body.project).to.deep.equal({
      projectId: 'project-1',
      sourceSnapshot: { id: 'snapshot-1' },
    })
  })

  it('uses lightweight project metadata for transient editor actions', async function () {
    const editorAction = { kind: 'completion', leftContext: 'abc' }
    const body = await this.builder.buildCopilotBody({
      body: {
        projectId: 'project-1',
        conversation: { source: 'inline-completion' },
        context: { editorAction },
        message: { role: 'user', content: 'complete' },
      },
    })

    expect(this.sourceSnapshot.capture).not.to.have.been.called
    expect(this.projectEntityHandler.promises.getAllDocs).not.to.have.been
      .called
    expect(body.project.fileList).to.deep.equal(['main.tex', 'figure.png'])
    expect(body.project.files).to.deep.equal([])
    expect(body.context.editorAction).to.equal(editorAction)
  })
})
