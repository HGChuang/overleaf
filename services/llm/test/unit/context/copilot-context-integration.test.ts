import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { CopilotService } from '../../../app/services/copilot.service.js';
import { createOpenAICompatModel, buildOpenAICompatRequest } from '../../../app/llm/openaiCompatStream.js';
import { createAssistantMessageEventStream } from '../../../app/agent/core/event-stream.js';
import { EMPTY_USAGE, type AssistantMessage } from '../../../app/agent/core/llm-types.js';
import { defineTool } from '../../../app/agent/tools/baseTool.js';
import { Semaphore } from '../../../app/utils/Semaphore.js';
import { cacheRoutingKey, requestCost } from '../../../app/agent/context/cache-policy.js';
import { buildUnifiedSystemPrompt } from '../../../app/agent/prompts.js';
import type { AgentMessage } from '../../../app/agent/core/types.js';

const model = createOpenAICompatModel({ baseUrl: 'https://test.invalid', modelId: 'test', contextWindow: 1000000, maxTokens: 16000 });
const response = (content: AssistantMessage['content'], stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage => ({
  role: 'assistant', content, stopReason, timestamp: 1, api: model.api, provider: model.provider, model: model.id, usage: EMPTY_USAGE,
});
const stream = (message: AssistantMessage) => {
  const events = createAssistantMessageEventStream();
  if (message.stopReason === 'error') events.push({ type: 'error', reason: 'error', error: message });
  else events.push({ type: 'done', reason: message.stopReason as any, message });
  events.end();
  return events;
};
const context = { project: { projectId: 'p', files: [], fileList: [] }, conversation: { conversationId: 'c' },
  message: { content: 'Keep the scientific hedges and continue.' } };
function makeService(overrides: Record<string, any> = {}) {
  const service = new CopilotService({ clientRegistry: { getChatModel: async () => ({ model, semaphore: new Semaphore(1) }) } as any,
    webClient: { assertProjectAccess: async () => {}, listPatches: async () => [] } as any, ...overrides });
  service.resolveChatModel = async () => ({ usingLlmInfo: { baseUrl: model.baseUrl, apiKey: 'test-secret' }, model: { id: model.id } }) as any;
  return service;
}

describe('Copilot context integration', () => {
  it('continues the actual failed request without replaying a completed tool or user prompt', async () => {
    const messages: AgentMessage[] = [{ role: 'user', content: 'Original author request: keep may.', timestamp: 0 }];
    for (let i = 0; i < 5; i++) {
      messages.push(response([{ type: 'toolCall', id: `old-${i}`, name: 'read_source', arguments: {} }], 'toolUse'));
      messages.push({ role: 'toolResult', toolCallId: `old-${i}`, toolName: 'read_source', isError: false,
        content: [{ type: 'text', text: 'old source\n'.repeat(1500) }], timestamp: 1 });
    }
    const originalLength = messages.length;
    let executed = 0;
    let mainCalls = 0;
    let summaryCalls = 0;
    let commits = 0;
    let closed = false;
    const service = makeService({
      contextStore: { open: async () => ({ messages,
        append: async (m: AgentMessage) => { messages.push(structuredClone(m)); },
        commit: async () => { commits++; }, renew: async () => {}, close: async () => { closed = true; },
      }), readSummary: async () => null, saveSummary: async () => {}, deleteSummary: async () => {} },
      toolPoolFactory: () => [defineTool({ name: 'read_source', description: 'Read test source', parameters: { type: 'object', properties: {} },
        handler: () => { executed++; return 'Current source: may improve, p99=412 ms.'; } })],
      streamFn: (_model: any, request: any) => {
        const last = request.messages.at(-1);
        if (last.role === 'user' && String(last.content).startsWith('Create a paper-writing continuity checkpoint')) {
          summaryCalls++;
          return stream(response([{ type: 'text', text: '{"observations":[],"pending":["continue"]}' }]));
        }
        mainCalls++;
        if (mainCalls === 1) return stream(response([{ type: 'toolCall', id: 'current-tool', name: 'read_source', arguments: {} }], 'toolUse'));
        if (mainCalls === 2) return stream({ ...response([], 'error'), errorMessage: 'context_length_exceeded' });
        assert.ok(request.messages.some((m: any) => m.role === 'toolResult' && m.toolCallId === 'current-tool'));
        return stream(response([{ type: 'text', text: 'Done, with hedges preserved.' }]));
      },
    });
    const result = await service.chat('author', context);
    assert.equal(result.message.content, 'Done, with hedges preserved.');
    assert.equal(executed, 1);
    assert.equal(mainCalls, 3);
    assert.equal(summaryCalls, 1);
    assert.equal(commits, 1);
    assert.equal(messages.slice(originalLength).filter(m => m.role === 'user').length, 1);
    assert.equal(closed, true);
  });

  it('does not execute tools if persisting their assistant intent fails', async () => {
    let executed = false;
    const messages: AgentMessage[] = [];
    const service = makeService({
      contextStore: { open: async () => ({ messages, append: async (m: AgentMessage) => {
        if (m.role === 'assistant') throw new Error('durability unavailable');
        messages.push(m);
      }, commit: async () => {}, renew: async () => {}, close: async () => {} }),
      readSummary: async () => null, saveSummary: async () => {}, deleteSummary: async () => {} },
      toolPoolFactory: () => [defineTool({ name: 'test', description: 'test', parameters: { type: 'object', properties: {} },
        handler: () => { executed = true; return 'executed'; } })],
      streamFn: () => stream(response([{ type: 'toolCall', id: 'intent', name: 'test', arguments: {} }], 'toolUse')),
    });
    await assert.rejects(service.chat('author', context), /durability unavailable/);
    assert.equal(executed, false);
  });

  it('keeps selection and inline requests stateless with no tools', async () => {
    const service = makeService({ contextStore: { open: () => { throw new Error('must not load panel history'); } },
      toolPoolFactory: () => { throw new Error('must not build tools'); },
      streamFn: (_model: any, request: any) => {
        assert.equal(request.messages.length, 1);
        assert.equal(request.tools.length, 0);
        return stream(response([{ type: 'text', text: 'completion' }]));
      },
    });
    for (const kind of ['completion', 'selection']) await service.chat('author', {
      ...context, context: { editorAction: { kind, mode: 0, leftContext: 'source' } },
    });
  });

  it('keeps system/tool prefixes stable when file, diagnostics or cursor configuration changes', () => {
    const first = buildUnifiedSystemPrompt({ project: { projectId: 'p', fileList: ['a.tex'] }, context: { currentFile: 'a.tex' } }, ['read_file']);
    const second = buildUnifiedSystemPrompt({ project: { projectId: 'p', fileList: ['b.tex'] }, context: { currentFile: 'b.tex', compileErrors: [{ message: 'error' }] } }, ['read_file']);
    assert.equal(first, second);
    assert.equal(buildUnifiedSystemPrompt({ context: { editorAction: { kind: 'completion', language: 'latex', maxLength: 20 } } }),
      buildUnifiedSystemPrompt({ context: { editorAction: { kind: 'completion', language: 'text', maxLength: 50 } } }));
  });

  it('only sends explicitly supported cache parameters with private stable routing keys', () => {
    const scope = { endpoint: model.baseUrl, model: 'test', user: 'author', project: 'p', source: 'panel' };
    const key = cacheRoutingKey('secret', scope);
    assert.equal(key, cacheRoutingKey('secret', scope));
    assert.notEqual(key, cacheRoutingKey('secret', { ...scope, user: 'other' }));
    assert.notEqual(key, cacheRoutingKey('secret', { ...scope, project: 'other' }));
    const request = { systemPrompt: 'fixed', messages: [] };
    assert.equal(buildOpenAICompatRequest(model, request, { promptCacheKey: key }).prompt_cache_key, undefined);
    assert.equal(buildOpenAICompatRequest({ ...model, compat: { promptCacheKey: true } }, request, { promptCacheKey: key }).prompt_cache_key, key);
    assert.equal(requestCost(EMPTY_USAGE), null);
  });

  it('cancels semaphore queueing without leaking a permit', async () => {
    const semaphore = new Semaphore(1);
    await semaphore.acquire();
    const abort = new AbortController();
    const waiting = semaphore.acquire(abort.signal);
    abort.abort(new Error('cancelled'));
    await assert.rejects(waiting, /cancelled/);
    assert.equal(semaphore.queue.length, 0);
    semaphore.release();
    assert.equal(semaphore.current, 0);
  });
});
