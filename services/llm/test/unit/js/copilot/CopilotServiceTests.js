import { expect } from 'chai';
import sinon from 'sinon';
import { AIMessage } from '@langchain/core/messages';
import { CopilotService } from '../../../../app/services/copilot.service.js';

describe('CopilotService', function () {
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
    // Long-term memory store stubbed so the tests never touch real Redis.
    // Defaults make the long-term path a no-op (empty index, no relevant
    // memories, background extraction/consolidation resolve cleanly).
    this.longTermMemoryStore = {
      readIndex: sinon.stub().resolves([]),
      renderIndexForPrompt: sinon.stub().returns(''),
      loadRelevant: sinon.stub().resolves(''),
      extractMemories: sinon.stub().resolves([]),
      consolidate: sinon.stub().resolves(false),
    };
    this.graphFactory = sinon.stub().returns({
      invoke: sinon.stub().resolves({ messages: [new AIMessage('panel answer')] }),
    });
  });

  it('returns chat content and persists memory', async function () {
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      graphFactory: this.graphFactory,
    });

    const result = await service.chat('user-1', {
      conversation: { conversationId: 'conv-1', tab: 'ask' },
      project: { projectId: 'project-1', fileList: [], outline: [] },
      context: { currentFile: 'main.tex', attachedFiles: [] },
      message: { role: 'user', content: 'hello' },
    });

    expect(result.conversationId).to.equal('conv-1');
    expect(result.message.content).to.equal('panel answer');
    expect(this.memoryStore.append).to.have.been.calledOnce;
  });

  it('returns compile diagnosis payload', async function () {
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      graphFactory: this.graphFactory,
    });

    const result = await service.compileDiagnose('user-1', {
      conversation: { conversationId: 'conv-2' },
      project: { projectId: 'project-1', rootDocId: 'root' },
      editor: { currentFile: 'main.tex' },
      compile: {
        compileId: 'compile-1',
        status: 'failed',
        logText: 'Undefined control sequence',
        annotations: [{ file: 'main.tex', line: 12, message: 'Undefined control sequence' }],
      },
    });

    expect(result.summary).to.equal('panel answer');
    expect(result.diagnostics[0].location.file).to.equal('main.tex');
  });
});
