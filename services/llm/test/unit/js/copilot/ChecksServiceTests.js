import { expect } from 'chai';
import sinon from 'sinon';
import { AIMessage } from '@langchain/core/messages';
import { ChecksService } from '../../../../app/services/checks.service.js';

describe('ChecksService', function () {
  beforeEach(function () {
    this.apiKeyMapper = {
      getUsingLlmWithInfo: sinon.stub().resolves({
        usingLlm: 0,
        llminfo: [
          {
            baseUrl: 'http://example.com',
            apiKey: 'secret',
            models: [{ id: 'chat-model' }],
            usingChatModel: 0,
          },
        ],
      }),
    };
    this.clientRegistry = {
      getChatModel: sinon.stub().resolves({
        model: { bindTools: sinon.stub().returnsThis() },
        semaphore: {
          acquire: sinon.stub().resolves(),
          release: sinon.stub(),
        },
      }),
    };
    this.memoryStore = {
      load: sinon.stub().resolves([]),
      append: sinon.stub().resolves(),
    };
    this.graphFactory = sinon.stub().returns({
      invoke: sinon.stub().resolves({ messages: [new AIMessage('issue explanation')] }),
    });
  });

  it('runs citation checks and returns summary', async function () {
    const service = new ChecksService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      graphFactory: this.graphFactory,
    });

    const result = await service.runChecks('user-1', {
      conversation: { conversationId: 'conv-1' },
      project: {
        projectId: 'project-1',
        files: [
          { path: 'refs.bib', content: '@article{known2024, title={T}}' },
          { path: 'main.tex', content: 'See \\cite{missing2024}' },
        ],
      },
      checks: ['citations'],
      options: {},
    });

    expect(result.summary.total).to.equal(1);
    expect(result.issues[0].title).to.contain('missing2024');
  });

  it('explains a single issue through the graph path', async function () {
    const service = new ChecksService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      graphFactory: this.graphFactory,
    });

    const result = await service.explainIssue('user-1', {
      conversation: { conversationId: 'conv-1' },
      project: { projectId: 'project-1', fileList: [] },
      issue: {
        id: 'issue-1',
        type: 'citations',
        title: 'Undefined citation: missing2024',
      },
    });

    expect(result.message.content).to.equal('issue explanation');
    expect(this.memoryStore.append).to.have.been.calledOnce;
  });
});
