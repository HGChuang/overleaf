import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { buildNativeRequest } from '../../../app/llm/nativeStream.js';
import { createOpenAICompatModel } from '../../../app/llm/openaiCompatStream.js';
import { EMPTY_USAGE, type AssistantMessage, type Model } from '../../../app/agent/core/llm-types.js';

const base = createOpenAICompatModel({ baseUrl: 'https://provider.invalid/v1', modelId: 'paper-model',
  contextWindow: 100000, maxTokens: 8000 });
const assistant = (content: AssistantMessage['content']): AssistantMessage => ({ role: 'assistant', content,
  api: 'openai-completions', provider: 'openai', model: 'paper-model', usage: EMPTY_USAGE,
  stopReason: 'toolUse', timestamp: 0 });
const context = { systemPrompt: 'stable-system', tools: [{ name: 'read_file', description: 'read',
  parameters: { type: 'object', properties: {} } }], messages: [
  { role: 'user' as const, content: JSON.stringify({ PAPER_CHECKPOINT: { version: 1 } }), timestamp: 0 },
  assistant([{ type: 'toolCall', id: 'call-1', name: 'read_file', arguments: { path: 'main.tex' } }]),
  { role: 'toolResult' as const, toolCallId: 'call-1', toolName: 'read_file', isError: false,
    content: [{ type: 'text' as const, text: 'source' }], timestamp: 0 },
  { role: 'user' as const, content: 'continue', timestamp: 0 },
] };

describe('native provider context serialization', () => {
  it('adds only profile-authorized Responses cache controls', () => {
    const model: Model = { ...base, compat: { ...base.compat, protocol: 'responses', promptCacheKey: true,
      promptCacheMode: 'explicit', promptCacheTtl: '30m', maxCacheBreakpoints: 4 } };
    const request: any = buildNativeRequest('responses', model, context, { promptCacheKey: 'private-key' });
    assert.equal(request.prompt_cache_key, 'private-key');
    assert.deepEqual(request.prompt_cache_options, { mode: 'explicit', ttl: '30m' });
    assert.ok(request.tools.at(-1).prompt_cache_breakpoint);
    assert.ok(request.input.some((item: any) => JSON.stringify(item).includes('prompt_cache_breakpoint')));
    const uncached: any = buildNativeRequest('responses', model, context, { promptCacheKey: 'private-key' }, false);
    assert.equal(uncached.prompt_cache_key, undefined);
    assert.equal(JSON.stringify(uncached).includes('prompt_cache_breakpoint'), false);
  });

  it('groups Anthropic tool results in user messages and preserves explicit TTL controls', () => {
    const model: Model = { ...base, compat: { ...base.compat, protocol: 'anthropic-messages', promptCacheKey: true,
      promptCacheMode: 'explicit', promptCacheTtl: '1h', maxCacheBreakpoints: 4 } };
    const request: any = buildNativeRequest('anthropic-messages', model, context, { promptCacheKey: 'private-key' });
    assert.deepEqual(request.system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
    assert.equal(request.messages.some((message: any) => message.role === 'toolResult'), false);
    assert.ok(request.messages.some((message: any) => message.role === 'user' &&
      message.content.some((block: any) => block.type === 'tool_result' && block.tool_use_id === 'call-1')));
  });
});
