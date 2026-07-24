import { expect } from 'chai';
import sinon from 'sinon';
import { CopilotService } from '../../../../app/services/copilot.service.js';
import { AssistantMessageEventStream } from '../../../../app/agent/core/event-stream.js';
import type { AssistantMessage } from '../../../../app/agent/core/llm-types.js';
import { buildToolPool } from '../../../../app/agent/tools/index.js';

// Integration-style unit tests: the REAL vendored Agent loop + REAL tools
// run against a fake provider streamFn, so the whole stack is exercised
// without network. The fake provider decides its response from the tail of
// the context it receives.

const ZERO_USAGE = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantMessage({
  text = '',
  toolCalls = [],
  stopReason = 'stop',
  errorMessage,
}: {
  text?: string;
  toolCalls?: Array<{ type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }>;
  stopReason?: AssistantMessage['stopReason'];
  errorMessage?: string;
}): AssistantMessage {
  return {
    role: 'assistant',
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...toolCalls,
    ],
    api: 'openai-completions',
    provider: 'test',
    model: 'chat-model',
    usage: { ...ZERO_USAGE, cost: { ...ZERO_USAGE.cost } },
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    timestamp: Date.now(),
  };
}

function streamOf(message: AssistantMessage): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  stream.push({ type: 'start', partial: message });
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    stream.push({ type: 'error', reason: message.stopReason, error: message });
  } else {
    stream.push({
      type: 'done',
      reason: message.stopReason === 'toolUse' ? 'toolUse' : 'stop',
      message,
    });
  }
  stream.end();
  return stream;
}

const CHAT_CONTEXT = {
  conversation: { conversationId: 'conv-1', source: 'panel' },
  project: {
    projectId: 'project-1',
    fileList: ['main.tex'],
    outline: [],
    files: [{ path: 'main.tex', content: '\\section{Intro} hello world' }],
  },
  context: { currentFile: 'main.tex', attachedFiles: [] },
  message: { role: 'user', content: 'read main.tex' },
};

describe('CopilotService (vendored agent core)', function () {
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
        model: { id: 'chat-model' },
        semaphore: {
          acquire: sinon.stub().resolves(),
          release: sinon.stub(),
        },
      }),
    };
    this.memoryStore = {
      load: sinon.stub().resolves([]),
      append: sinon.stub().resolves(),
      replace: sinon.stub().resolves(),
    };
    this.longTermMemoryStore = {
      readIndex: sinon.stub().resolves([]),
      renderIndexForPrompt: sinon.stub().returns(''),
      loadRelevant: sinon.stub().resolves(''),
      extractMemories: sinon.stub().resolves([]),
      consolidate: sinon.stub().resolves(false),
    };
    this.buildService = streamFn =>
      new CopilotService({
        apiKeyMapper: this.apiKeyMapper,
        clientRegistry: this.clientRegistry,
        memoryStore: this.memoryStore,
        longTermMemoryStore: this.longTermMemoryStore,
        streamFn,
      });
  });

  it('returns the assistant answer and persists the turn', async function () {
    const streamFn = () => streamOf(assistantMessage({ text: 'panel answer' }));
    const service = this.buildService(streamFn);

    const result = await service.chat('user-1', CHAT_CONTEXT);

    expect(result.conversationId).to.equal('conv-1');
    expect(result.message.content).to.equal('panel answer');
    expect(this.memoryStore.append).to.have.been.calledOnce;
    const [threadId, appended] = this.memoryStore.append.firstCall.args;
    expect(threadId).to.equal('user-1:conv-1');
    // The user prompt and the assistant answer are both persisted.
    expect(appended.map((m: any) => m.role)).to.deep.equal(['user', 'assistant']);
  });

  it('runs a tool round trip through the real loop and tools', async function () {
    const streamFn = (_model: unknown, context: any) => {
      const last = context.messages[context.messages.length - 1];
      if (last?.role === 'toolResult') {
        const toolText = last.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
        return streamOf(
          assistantMessage({ text: toolText.includes('hello world') ? 'read confirmed' : 'read failed' })
        );
      }
      return streamOf(
        assistantMessage({
          toolCalls: [
            { type: 'toolCall', id: 'call_1', name: 'read_file', arguments: { path: 'main.tex' } },
          ],
          stopReason: 'toolUse',
        })
      );
    };
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      toolPoolFactory: buildToolPool,
      streamFn,
    });

    const events: any[] = [];
    const result = await service.chat('user-1', CHAT_CONTEXT, {
      onEvent: (e: any) => events.push(e),
    });

    expect(result.message.content).to.equal('read confirmed');
    const types = events.map(e => e.type);
    expect(types).to.include('tool_start');
    expect(types).to.include('tool_end');
    // Workflow display (Claude Code-style steps): tool_start carries the
    // capped args preview, tool_end a text result summary.
    const start = events.find(e => e.type === 'tool_start');
    expect(start?.toolName).to.equal('read_file');
    expect(start?.args).to.deep.equal({ path: 'main.tex' });
    const end = events.find(e => e.type === 'tool_end');
    expect(end?.isError).to.equal(false);
    expect(end?.resultSummary).to.be.a('string').and.to.include('hello world');
    const [, appended] = this.memoryStore.append.firstCall.args;
    const toolResultMsg = appended.find((m: any) => m.role === 'toolResult');
    expect(toolResultMsg?.toolCallId).to.equal('call_1');
    expect(toolResultMsg?.isError).to.equal(false);
  });

  it('reactive-compacts and retries once on prompt_too_long', async function () {
    // Seed history so reactiveCompact actually summarizes (it short-circuits
    // on an empty history without calling the completer).
    this.memoryStore.load.resolves([
      { role: 'user', content: 'old question', timestamp: Date.now() },
    ]);
    let calls = 0;
    const streamFn = () => {
      calls++;
      if (calls === 1) {
        return streamOf(
          assistantMessage({ stopReason: 'error', errorMessage: 'prompt_too_long: too many tokens' })
        );
      }
      if (calls === 2) {
        // The summarize completer call.
        return streamOf(assistantMessage({ text: 'short summary' }));
      }
      return streamOf(assistantMessage({ text: 'recovered answer' }));
    };
    const service = this.buildService(streamFn);

    const result = await service.chat('user-1', CHAT_CONTEXT);

    expect(result.message.content).to.equal('recovered answer');
    expect(calls).to.equal(3);
    expect(this.memoryStore.replace).to.have.been.calledOnce;
    expect(this.memoryStore.append).to.not.have.been.called;
  });

  it('surfaces non-retryable provider errors as CopilotError', async function () {
    const streamFn = () =>
      streamOf(assistantMessage({ stopReason: 'error', errorMessage: '401 unauthorized' }));
    const service = this.buildService(streamFn);

    await expect(service.chat('user-1', CHAT_CONTEXT)).to.be.rejectedWith('401 unauthorized');
    expect(this.memoryStore.append).to.not.have.been.called;
  });

  it('enforces the per-turn step budget', async function () {
    this.timeout(15000);
    let calls = 0;
    const streamFn = () => {
      calls++;
      return streamOf(
        assistantMessage({
          toolCalls: [
            { type: 'toolCall', id: `call_${calls}`, name: 'read_file', arguments: { path: 'main.tex' } },
          ],
          stopReason: 'toolUse',
        })
      );
    };
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      toolPoolFactory: buildToolPool,
      streamFn,
    });

    await expect(service.chat('user-1', CHAT_CONTEXT)).to.be.rejectedWith(/step budget/);
    expect(calls).to.equal(25);
    expect(this.memoryStore.append).to.not.have.been.called;
  });

  it('maps a submit_patch tool call into a patch block', async function () {
    const streamFn = (_model: unknown, context: any) => {
      const last = context.messages[context.messages.length - 1];
      if (last?.role === 'toolResult') {
        return streamOf(assistantMessage({ text: '' }));
      }
      return streamOf(
        assistantMessage({
          toolCalls: [
            {
              type: 'toolCall',
              id: 'call_p1',
              name: 'submit_patch',
              arguments: {
                hunks: [
                  { file: 'main.tex', line: 1, oldText: 'hello world', newText: 'hello LaTeX' },
                ],
                summary: 'Fix greeting',
              },
            },
          ],
          stopReason: 'toolUse',
        })
      );
    };
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      toolPoolFactory: buildToolPool,
      streamFn,
    });

    const result = await service.chat('user-1', CHAT_CONTEXT);
    const patchBlock = result.message.blocks?.find((b: any) => b.type === 'patch');
    expect(patchBlock).to.exist;
    expect(patchBlock.patch.title).to.equal('Fix greeting');
    expect(patchBlock.patch.hunks[0].newText).to.equal('hello LaTeX');
  });

  // Self-healing loop: a post-accept verification turn must call
  // compile_project (real tool → fake webClient), react to remaining errors
  // with a new patch, and confirm success only once the compile is clean.
  it('closes the compile-fix loop: verify → still failing → patch → clean', async function () {
    const VERIFY_CONTEXT = {
      ...CHAT_CONTEXT,
      message: { role: 'user', content: '[自动验证] 补丁已应用。' },
    };
    const compileProject = sinon.stub();
    compileProject.onFirstCall().resolves({
      status: 'failure',
      errorCount: 1,
      errors: [{ file: 'main.tex', line: 1, message: 'Undefined control sequence.' }],
      warningCount: 0,
    });
    compileProject.onSecondCall().resolves({
      status: 'success',
      errorCount: 0,
      errors: [],
      warningCount: 0,
    });
    const webClient = { compileProject };
    // Fake provider protocol: first action of a turn is always compile_project;
    // after reading its result, patch again if errors remain, confirm if clean.
    const streamFn = (_model: unknown, context: any) => {
      const last = context.messages[context.messages.length - 1];
      if (last?.role === 'toolResult') {
        const text = last.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
        const parsed = JSON.parse(text);
        if (parsed.errorCount === 0) {
          return streamOf(assistantMessage({ text: '编译通过，修复成功' }));
        }
        return streamOf(
          assistantMessage({
            toolCalls: [
              {
                type: 'toolCall',
                id: 'call_fix',
                name: 'submit_patch',
                arguments: {
                  hunks: [{ file: 'main.tex', line: 1, oldText: '\\bad', newText: '\\good' }],
                  summary: 'Fix remaining error',
                },
              },
            ],
            stopReason: 'toolUse',
          })
        );
      }
      return streamOf(
        assistantMessage({
          toolCalls: [
            { type: 'toolCall', id: 'call_compile', name: 'compile_project', arguments: {} },
          ],
          stopReason: 'toolUse',
        })
      );
    };
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      toolPoolFactory: buildToolPool,
      streamFn,
      webClient: webClient as any,
    });

    // Round 1: verification finds remaining errors → agent submits a new patch.
    const r1 = await service.chat('user-1', VERIFY_CONTEXT);
    expect(webClient.compileProject).to.have.been.calledOnceWith('project-1');
    expect(r1.message.blocks?.some((b: any) => b.type === 'patch')).to.equal(true);

    // Round 2: verification is clean → brief confirmation, no new patch.
    const r2 = await service.chat('user-1', VERIFY_CONTEXT);
    expect(webClient.compileProject).to.have.been.calledTwice;
    expect(r2.message.content).to.equal('编译通过，修复成功');
    expect(r2.message.blocks?.some((b: any) => b.type === 'patch')).to.not.equal(true);
  });

  it('omits the compile tool when no webClient is wired (toolPoolFactory without deps)', async function () {
    const seenToolNames: string[][] = [];
    const streamFn = (_model: unknown, context: any) => {
      seenToolNames.push((context.tools || []).map((t: any) => t.name));
      return streamOf(assistantMessage({ text: 'ok' }));
    };
    const service = new CopilotService({
      apiKeyMapper: this.apiKeyMapper,
      clientRegistry: this.clientRegistry,
      memoryStore: this.memoryStore,
      longTermMemoryStore: this.longTermMemoryStore,
      toolPoolFactory: (context: any) => buildToolPool(context), // legacy 1-arg factory
      streamFn,
    });

    await service.chat('user-1', CHAT_CONTEXT);
    expect(seenToolNames[0]).to.not.include('compile_project');
    expect(seenToolNames[0]).to.include('read_file');
  });
});
