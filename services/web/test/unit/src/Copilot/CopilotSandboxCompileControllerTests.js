const sinon = require('sinon')
const { expect } = require('chai')
const SandboxedModule = require('sandboxed-module')
const MockRequest = require('../helpers/MockRequest')
const MockResponse = require('../helpers/MockResponse')
const { Readable } = require('stream')

const modulePath =
  '../../../../app/src/Features/Copilot/CopilotSandboxCompileController.js'

describe('CopilotSandboxCompileController', function () {
  beforeEach(function () {
    this.CompileManager = {
      promises: {
        getProjectCompileLimits: sinon.stub().resolves({
          timeout: 60,
          compileGroup: 'standard',
          compileBackendClass: 'n2d',
        }),
      },
    }
    this.ClsiManager = {
      promises: {
        sendSandboxRequest: sinon.stub().resolves({
          status: 'success',
          buildId: 'build-1',
          clsiServerId: 'clsi-1',
        }),
        getOutputFileStream: sinon
          .stub()
          .resolves(Readable.from(['Output written on output.pdf\n'])),
      },
    }
    this.Controller = SandboxedModule.require(modulePath, {
      requires: {
        '@overleaf/logger': { err: sinon.stub() },
        '../Compile/CompileManager': this.CompileManager,
        '../Compile/ClsiManager': this.ClsiManager,
        './LatexLogParser': {
          LatexParser: class {
            parse() {
              return { errors: [], warnings: [] }
            }
          },
        },
      },
    })
    this.req = new MockRequest()
    this.req.params = { project_id: 'project-1' }
    this.req.body = {
      baseHash: 'a'.repeat(64),
      workspaceHash: 'b'.repeat(64),
      files: [{ path: 'main.tex', content: '\\documentclass{article}' }],
    }
    this.res = new MockResponse()
    this.next = sinon.stub()
  })

  it('compiles a bounded snapshot and returns a hash-bound attestation', async function () {
    await this.Controller.compile(this.req, this.res, this.next)
    expect(this.next).not.to.have.been.called
    expect(this.ClsiManager.promises.sendSandboxRequest).to.have.been.calledOnce
    expect(JSON.parse(this.res.body)).to.include({
      status: 'success',
      errorCount: 0,
      inputWorkspaceHash: 'b'.repeat(64),
    })
  })

  it('rejects traversal before calling CLSI', async function () {
    this.req.body.files[0].path = '../secret.tex'
    await this.Controller.compile(this.req, this.res, this.next)
    expect(this.next).to.have.been.calledOnce
    expect(this.next.firstCall.args[0].status).to.equal(400)
    expect(this.ClsiManager.promises.sendSandboxRequest).not.to.have.been.called
  })

  it('rejects absolute paths before calling CLSI', async function () {
    this.req.body.files[0].path = '/main.tex'
    await this.Controller.compile(this.req, this.res, this.next)
    expect(this.next).to.have.been.calledOnce
    expect(this.next.firstCall.args[0].status).to.equal(400)
    expect(this.ClsiManager.promises.sendSandboxRequest).not.to.have.been.called
  })
})
