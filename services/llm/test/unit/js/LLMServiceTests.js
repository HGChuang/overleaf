import { expect } from 'chai';
import sinon from 'sinon';
import { AIMessage } from '@langchain/core/messages';
import { LLMService, buildLegacyHistory } from '../../../app/services/llm.service.js';

describe('LLMService', function () {
  beforeEach(function () {
    this.llmMapper = { updateUsedTokens: sinon.stub() };
    this.apiKeyMapper = {
      getUsingLlmWithInfo: sinon.stub().resolves({
        usingLlm: 0,
        llminfo: [
          {
            baseUrl: 'http://example.com',
            apiKey: 'secret',
            models: [{ id: 'chat-model' }, { id: 'completion-model' }],
            usingChatModel: 0,
            usingCompletionModel: 1,
          },
        ],
      }),
    };
    this.memoryStore = {
      load: sinon.stub().resolves([]),
      append: sinon.stub().resolves(),
    };
    this.toolRegistry = {
      list: sinon.stub().returns([]),
    };
    this.chatInvoke = sinon.stub().resolves({ messages: [new AIMessage('graph reply')] });
    this.graphFactory = sinon.stub().returns({ invoke: this.chatInvoke });
    this.clientRegistry = {
      getChatModel: sinon.stub().resolves({
        model: { bindTools: sinon.stub().returnsThis() },
        semaphore: {
          acquire: sinon.stub().resolves(),
          release: sinon.stub(),
        },
      }),
      getLlmClient: sinon.stub().resolves({
        llmClient: {
          chat: sinon.stub().resolves({ choices: [{ message: { content: 'legacy reply' } }] }),
          completion: sinon.stub().resolves({
            choices: [{ message: { content: '<COMPLETION>done' } }],
            usage: { total_tokens: 12 },
          }),
        },
        semaphore: {
          acquire: sinon.stub().resolves(),
          release: sinon.stub(),
        },
      }),
    };
  });

  it('returns a string from the agent path and persists new history when conversationId is present', async function () {
    const service = new LLMService({
      llmMapper: this.llmMapper,
      apiKeyMapper: this.apiKeyMapper,
      memoryStore: this.memoryStore,
      toolRegistry: this.toolRegistry,
      clientRegistry: this.clientRegistry,
      graphFactory: this.graphFactory,
    });

    const result = await service.chat('user-1', 'ask', 'selection', ['main.tex'], ['Intro'], 0, 'conv-1');

    expect(result).to.equal('graph reply');
    expect(this.memoryStore.load).to.have.been.calledWith('user-1:conv-1');
    expect(this.memoryStore.append).to.have.been.calledOnce;
    expect(this.graphFactory).to.have.been.calledOnce;
  });

  it('keeps completion on the fast path and formats the response', async function () {
    const service = new LLMService({
      llmMapper: this.llmMapper,
      apiKeyMapper: this.apiKeyMapper,
      memoryStore: this.memoryStore,
      toolRegistry: this.toolRegistry,
      clientRegistry: this.clientRegistry,
      graphFactory: this.graphFactory,
    });

    const result = await service.completion('user-1', 0, 'left', 'right', 'tex', 50, ['main.tex'], ['Intro']);

    expect(result).to.equal('done');
    expect(this.llmMapper.updateUsedTokens).to.have.been.calledWith('user-1', 12);
    expect(this.clientRegistry.getLlmClient).to.have.been.calledOnce;
  });

  it('can build the legacy chat history format', function () {
    const { history, userMessage } = buildLegacyHistory(0, 'question', 'selected', ['file.tex'], ['Outline']);
    expect(history).to.have.length(2);
    expect(history[0].role).to.equal('system');
    expect(history[1].role).to.equal('user');
    expect(userMessage).to.contain('USER_QUERY');
  });
});
