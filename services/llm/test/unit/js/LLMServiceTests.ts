import { expect } from 'chai';
import sinon from 'sinon';
import { LLMService, buildLegacyHistory } from '../../../app/services/llm.service.js';
import { AssistantMessageEventStream } from '../../../app/agent/core/event-stream.js';
import type { AssistantMessage } from '../../../app/agent/core/llm-types.js';

const ZERO_USAGE = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function textStream(text: string): AssistantMessageEventStream {
  const message: AssistantMessage = {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'test',
    model: 'chat-model',
    usage: { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
  const stream = new AssistantMessageEventStream();
  stream.push({ type: 'start', partial: message });
  stream.push({ type: 'done', reason: 'stop', message });
  stream.end();
  return stream;
}

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
    this.clientRegistry = {
      getChatModel: sinon.stub().resolves({
        model: { id: 'chat-model' },
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
      clientRegistry: this.clientRegistry,
      streamFn: () => textStream('graph reply'),
    });

    const result = await service.chat('user-1', 'ask', 'selection', ['main.tex'], ['Intro'], 0, 'conv-1');

    expect(result).to.equal('graph reply');
    expect(this.memoryStore.load).to.have.been.calledWith('user-1:conv-1');
    expect(this.memoryStore.append).to.have.been.calledOnce;
    const [, appended] = this.memoryStore.append.firstCall.args;
    expect(appended.map((m: any) => m.role)).to.deep.equal(['user', 'assistant']);
  });

  it('surfaces provider errors from the terminal assistant message', async function () {
    const errorStream = () => {
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
        api: 'openai-completions',
        provider: 'test',
        model: 'chat-model',
        usage: { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } },
        stopReason: 'error',
        errorMessage: '503 provider down',
        timestamp: Date.now(),
      };
      const stream = new AssistantMessageEventStream();
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'error', reason: 'error', error: message });
      stream.end();
      return stream;
    };
    const service = new LLMService({
      llmMapper: this.llmMapper,
      apiKeyMapper: this.apiKeyMapper,
      memoryStore: this.memoryStore,
      clientRegistry: this.clientRegistry,
      streamFn: errorStream,
    });

    await expect(
      service.chat('user-1', 'ask', 'selection', [], [], 0, 'conv-1')
    ).to.be.rejectedWith(/503 provider down/);
    expect(this.memoryStore.append).to.not.have.been.called;
  });

  it('keeps completion on the fast path and formats the response', async function () {
    const service = new LLMService({
      llmMapper: this.llmMapper,
      apiKeyMapper: this.apiKeyMapper,
      memoryStore: this.memoryStore,
      clientRegistry: this.clientRegistry,
      streamFn: () => textStream('unused'),
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
