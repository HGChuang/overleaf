const sinon = require('sinon')
const { expect } = require('chai')
const SandboxedModule = require('sandboxed-module')
const MockRequest = require('../helpers/MockRequest')
const MockResponse = require('../helpers/MockResponse')

const modulePath = '../../../../app/src/Features/Copilot/CopilotController.js'

describe('CopilotController', function () {
  beforeEach(function () {
    this.fetch = sinon.stub().resolves({
      status: 200,
      json: sinon.stub().resolves({ success: true, data: { ok: true } }),
    })
    this.contextBuilder = {
      buildChatBody: sinon.stub().resolves({ project: { projectId: 'project-1' } }),
      buildCompileBody: sinon.stub().resolves({ project: { projectId: 'project-1' } }),
      buildChecksRunBody: sinon.stub().resolves({ project: { projectId: 'project-1' } }),
      buildChecksExplainBody: sinon.stub().resolves({ project: { projectId: 'project-1' } }),
    }
    this.authorizationManager = {
      promises: {
        canUserReadProject: sinon.stub().resolves(true),
      },
    }
    this.sessionManager = {
      getLoggedInUserId: sinon.stub().returns('user-1'),
    }

    this.controller = SandboxedModule.require(modulePath, {
      requires: {
        '@overleaf/settings': { apis: { llm: { url: 'http://llm.example.com' } } },
        'node-fetch': this.fetch,
        './CopilotContextBuilder': this.contextBuilder,
        '../Authentication/SessionManager': this.sessionManager,
        '../Authorization/AuthorizationManager': this.authorizationManager,
      },
    })

    this.req = new MockRequest()
    this.req.session = {}
    this.req.headers = {}
    this.req.body = { projectId: 'project-1' }
    this.res = new MockResponse()
  })

  it('proxies chat requests to the llm service', async function () {
    await this.controller.chat(this.req, this.res)

    expect(this.fetch).to.have.been.calledOnce
    expect(this.fetch.firstCall.args[0]).to.equal('http://llm.example.com/api/v1/copilot/chat')
    expect(this.res.statusCode).to.equal(200)
  })

  it('returns forbidden when project access is denied', async function () {
    this.authorizationManager.promises.canUserReadProject.resolves(false)

    await this.controller.chat(this.req, this.res)

    expect(this.res.statusCode).to.equal(403)
    expect(this.res.body.error.code).to.equal('COPILOT_FORBIDDEN')
  })
})
