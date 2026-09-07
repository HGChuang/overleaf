import type {
  AssistantMessage, Context, Message, Model, SimpleStreamOptions, Tool,
  ToolCall, Usage,
} from '../agent/core/llm-types.js';
import { EMPTY_USAGE } from '../agent/core/llm-types.js';
import { AssistantMessageEventStream } from '../agent/core/event-stream.js';

type NativeProtocol = 'responses' | 'anthropic-messages';

function textOf(message: Message): string {
  if (typeof message.content === 'string') return message.content;
  return message.content.map((block: any) => block.text || '').join('');
}

function toolsOf(tools: Tool[] = []) {
  return tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
}

function cacheControl(model: Model) {
  return { type: 'ephemeral', ...(model.compat?.promptCacheTtl === '1h' ? { ttl: '1h' } : {}) };
}

function explicitCacheEnabled(model: Model, options?: SimpleStreamOptions) {
  return Boolean(model.compat?.promptCacheKey && options?.promptCacheKey &&
    model.compat?.promptCacheMode === 'explicit' && (model.compat?.maxCacheBreakpoints || 0) > 0);
}

function breakpointIndexes(messages: Message[], available: number) {
  const indexes: number[] = [];
  const checkpoint = messages.findIndex(message => message.role === 'user' && textOf(message).includes('PAPER_CHECKPOINT'));
  if (checkpoint >= 0 && available > 0) indexes.push(checkpoint);
  const last = messages.length - 1;
  if (last >= 0 && available > indexes.length && !indexes.includes(last)) indexes.push(last);
  return new Set(indexes.slice(0, available));
}

function endpoint(baseUrl: string, protocol: NativeProtocol) {
  return `${baseUrl.replace(/\/$/, '')}/${protocol === 'responses' ? 'responses' : 'messages'}`;
}

function retryDelay(response: Response, attempt: number, maximum = 30_000) {
  const raw = response.headers.get('retry-after');
  if (raw) {
    const seconds = Number(raw);
    const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
    if (Number.isFinite(milliseconds)) return Math.max(0, Math.min(maximum, milliseconds));
  }
  return Math.min(maximum, 4000, 250 * 2 ** attempt);
}

async function waitForRetry(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const done = () => { signal.removeEventListener('abort', aborted); resolve(); };
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

async function fetchNative(model: Model, protocol: NativeProtocol, context: Context,
  options: SimpleStreamOptions | undefined, headers: Record<string, string>, signal: AbortSignal,
  allowCache: boolean) {
  const retries = Math.max(0, Math.min(5, options?.maxRetries ?? 2));
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint(model.baseUrl, protocol), { method: 'POST', signal,
      headers, body: JSON.stringify(buildNativeRequest(protocol, model, context, options, allowCache)) });
    if (attempt >= retries || (response.status !== 429 && response.status < 500)) return response;
    const delay = retryDelay(response, attempt, Math.max(0, Math.min(30_000, options?.maxRetryDelayMs ?? 30_000)));
    await response.arrayBuffer();
    await waitForRetry(delay, signal);
  }
}

function anthropicMessages(messages: Message[], model: Model, breakpoints = false, reserved = 0) {
  const marked = breakpoints ? breakpointIndexes(messages, Math.max(0, (model.compat?.maxCacheBreakpoints || 0) - reserved)) : new Set<number>();
  const result: Array<{ role: 'user' | 'assistant'; content: any[] }> = [];
  const append = (role: 'user' | 'assistant', content: any[]) => {
    const previous = result[result.length - 1];
    if (previous?.role === role) previous.content.push(...content);
    else result.push({ role, content });
  };
  messages.forEach((message, messageIndex) => {
    const mark = marked.has(messageIndex) ? { cache_control: cacheControl(model) } : {};
    if (message.role === 'user') { append('user', [{ type: 'text', text: textOf(message), ...mark }]); return; }
    if (message.role === 'toolResult') { append('user', [{ type: 'tool_result',
      tool_use_id: message.toolCallId, content: textOf(message), is_error: message.isError, ...mark }]); return; }
    const native = Array.isArray(message.providerItems) ? message.providerItems : [];
    const portable: any[] = message.content.flatMap((block: any): any[] => block.type === 'text'
      ? [{ type: 'text', text: block.text }]
      : block.type === 'thinking' && block.thinkingSignature
        ? [{ type: 'thinking', thinking: block.thinking, signature: block.thinkingSignature }]
        : block.type === 'toolCall'
          ? [{ type: 'tool_use', id: block.id, name: block.name, input: block.arguments }]
          : []);
    const content: any[] = [...native, ...portable];
    if (content.length && marked.has(messageIndex)) Object.assign(content[content.length - 1], mark);
    if (content.length) append('assistant', content);
  });
  return result;
}

function responsesInput(messages: Message[], model: Model, breakpoints = false, reserved = 0) {
  const marked = breakpoints ? breakpointIndexes(messages, Math.max(0, (model.compat?.maxCacheBreakpoints || 0) - reserved)) : new Set<number>();
  return messages.flatMap((message, messageIndex) => {
    const mark = marked.has(messageIndex) ? { prompt_cache_breakpoint: { mode: 'explicit' } } : {};
    if (message.role === 'user') return [{ role: 'user', content: [{ type: 'input_text', text: textOf(message), ...mark }] }];
    if (message.role === 'toolResult') return [{ type: 'function_call_output', call_id: message.toolCallId, output: textOf(message), ...mark }];
    const native = Array.isArray(message.providerItems) ? message.providerItems : [];
    const portable: any[] = message.content.flatMap((block: any): any[] => block.type === 'text'
      ? [{ role: 'assistant', content: block.text }]
      : block.type === 'toolCall'
        ? [{ type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.arguments) }]
        : []);
    if (portable.length && marked.has(messageIndex)) Object.assign(portable[portable.length - 1], mark);
    return [...native, ...portable];
  });
}

export function buildNativeRequest(protocol: NativeProtocol, model: Model, context: Context, options?: SimpleStreamOptions, allowCache = true) {
  const cache = allowCache && model.compat?.promptCacheKey && options?.promptCacheKey;
  const explicit = Boolean(cache && explicitCacheEnabled(model, options));
  const limit = explicit ? Math.min(4, model.compat?.maxCacheBreakpoints || 0) : 0;
  if (protocol === 'responses') {
    const tools = (context.tools || []).map(tool => ({ type: 'function', name: tool.name,
      description: tool.description, parameters: tool.parameters, strict: false })) as any[];
    if (limit > 0 && tools.length) tools[tools.length - 1].prompt_cache_breakpoint = { mode: 'explicit' };
    return {
    model: model.id, instructions: context.systemPrompt,
    input: responsesInput(context.messages, model, explicit, tools.length && limit > 0 ? 1 : 0),
    tools,
    stream: true, store: false, max_output_tokens: options?.maxTokens || model.maxTokens,
    include: ['reasoning.encrypted_content'],
    ...(cache ? { prompt_cache_key: options!.promptCacheKey,
      ...((model.compat?.promptCacheMode === 'explicit' || model.compat?.promptCacheTtl === '30m') ? {
        prompt_cache_options: { mode: model.compat.promptCacheMode || 'implicit',
          ...(model.compat?.promptCacheTtl === '30m' ? { ttl: '30m' } : {}) },
      } : {}) } : {}),
    };
  }
  const system: any = [{ type: 'text', text: context.systemPrompt || '' }];
  const tools = toolsOf(context.tools);
  let reserved = 0;
  if (explicit && limit > reserved) { system[0].cache_control = cacheControl(model); reserved++; }
  if (explicit && limit > reserved && tools.length) { Object.assign(tools[tools.length - 1], { cache_control: cacheControl(model) }); reserved++; }
  const body: any = {
    model: model.id, system, messages: anthropicMessages(context.messages, model, explicit, reserved),
    tools, stream: true, max_tokens: options?.maxTokens || model.maxTokens,
    ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
  };
  return body;
}

async function* sse(response: Response) {
  if (!response.body) throw new Error('Provider returned no stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    let split;
    while ((split = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (data && data !== '[DONE]') yield JSON.parse(data);
    }
    if (done) break;
  }
}

function usage(protocol: NativeProtocol, value: any): Usage {
  const raw = value?.usage || {};
  const read = protocol === 'responses' ? raw.input_tokens_details?.cached_tokens : raw.cache_read_input_tokens;
  const write = protocol === 'responses' ? raw.input_tokens_details?.cache_write_tokens : raw.cache_creation_input_tokens;
  const totalInput = protocol === 'responses' ? raw.input_tokens : raw.input_tokens;
  const input = protocol === 'responses' ? Math.max(0, (totalInput || 0) - (read || 0) - (write || 0)) : totalInput || 0;
  const output = raw.output_tokens || 0;
  return { input, output, cacheRead: read || 0, cacheWrite: write || 0,
    cacheReadKnown: read !== undefined, cacheWriteKnown: write !== undefined,
    reasoning: raw.output_tokens_details?.reasoning_tokens || 0,
    totalTokens: input + output + (read || 0) + (write || 0), cost: { ...EMPTY_USAGE.cost } };
}

function price(model: Model, value: Usage): Usage {
  const cost = { input: value.input * model.cost.input / 1_000_000,
    output: value.output * model.cost.output / 1_000_000,
    cacheRead: value.cacheRead * model.cost.cacheRead / 1_000_000,
    cacheWrite: value.cacheWrite * model.cost.cacheWrite / 1_000_000, total: 0 };
  cost.total = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
  return { ...value, cost };
}

export function streamNative(model: Model, context: Context, options?: SimpleStreamOptions) {
  const protocol = model.compat?.protocol as NativeProtocol;
  const stream = new AssistantMessageEventStream();
  const output: AssistantMessage = { role: 'assistant', content: [], api: protocol,
    provider: protocol === 'responses' ? 'openai' : 'anthropic', model: model.id,
    usage: { ...EMPTY_USAGE, cost: { ...EMPTY_USAGE.cost } }, stopReason: 'stop', timestamp: Date.now() };
  void (async () => {
    try {
      const timeoutSignal = AbortSignal.timeout(Math.max(1, options?.timeoutMs || 60_000));
      const requestSignal = options?.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
      const headers = { 'content-type': 'application/json',
        ...(protocol === 'anthropic-messages' ? { 'x-api-key': options?.apiKey || '', 'anthropic-version': '2023-06-01',
          ...(model.compat?.promptCacheTtl === '1h' ? { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' } : {}) }
          : { authorization: `Bearer ${options?.apiKey || ''}` }), ...model.headers };
      let response = await fetchNative(model, protocol, context, options, headers, requestSignal, true);
      if (!response.ok && response.status === 400 && model.compat?.promptCacheKey && options?.promptCacheKey) {
        await response.arrayBuffer();
        response = await fetchNative(model, protocol, context, options, headers, requestSignal, false);
      }
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
      stream.push({ type: 'start', partial: output });
      const calls = new Map<number, ToolCall & { args: string }>();
      let textIndex = -1;
      let thinkingIndex = -1;
      let thinkingProviderIndex = -1;
      let anthropicUsage: any = {};
      const anthropicProviderItems: any[] = [];
      for await (const event of sse(response)) {
        const type = event.type;
        if (type === 'error' || type === 'response.failed') {
          throw new Error(event.error?.message || event.response?.error?.message || 'Provider stream failed');
        }
        const textDelta = protocol === 'responses' && type === 'response.output_text.delta' ? event.delta
          : protocol === 'anthropic-messages' && type === 'content_block_delta' && event.delta?.type === 'text_delta' ? event.delta.text : null;
        if (textDelta != null) {
          if (textIndex < 0) { textIndex = output.content.length; output.content.push({ type: 'text', text: '' }); stream.push({ type: 'text_start', contentIndex: textIndex, partial: output }); }
          (output.content[textIndex] as any).text += textDelta;
          stream.push({ type: 'text_delta', contentIndex: textIndex, delta: textDelta, partial: output });
        }
        const added = protocol === 'responses' && type === 'response.output_item.added' ? event.item
          : protocol === 'anthropic-messages' && type === 'content_block_start' ? event.content_block : null;
        if (added?.type === 'function_call' || added?.type === 'tool_use') {
          const index = event.output_index ?? event.index;
          const call: ToolCall & { args: string } = { type: 'toolCall', id: added.call_id || added.id,
            name: added.name, arguments: {}, args: added.arguments ||
              (added.type === 'tool_use' && added.input && Object.keys(added.input).length ? JSON.stringify(added.input) : '') };
          calls.set(index, call); output.content.push(call);
          stream.push({ type: 'toolcall_start', contentIndex: output.content.length - 1, partial: output });
        }
        const argDelta = protocol === 'responses' && type === 'response.function_call_arguments.delta' ? event.delta
          : protocol === 'anthropic-messages' && type === 'content_block_delta' && event.delta?.type === 'input_json_delta' ? event.delta.partial_json : null;
        if (argDelta != null) calls.get(event.output_index ?? event.index)!.args += argDelta;
        if (protocol === 'anthropic-messages' && type === 'content_block_start' && added?.type === 'thinking') {
          thinkingIndex = output.content.length;
          thinkingProviderIndex = event.index;
          output.content.push({ type: 'thinking', thinking: added.thinking || '', thinkingSignature: added.signature });
          stream.push({ type: 'thinking_start', contentIndex: thinkingIndex, partial: output });
        }
        if (protocol === 'anthropic-messages' && type === 'content_block_start' && added?.type === 'redacted_thinking') {
          anthropicProviderItems.push(added);
        }
        if (protocol === 'anthropic-messages' && type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
          const block = output.content[thinkingIndex] as any;
          if (block) { block.thinking += event.delta.thinking; stream.push({ type: 'thinking_delta', contentIndex: thinkingIndex, delta: event.delta.thinking, partial: output }); }
        }
        if (protocol === 'anthropic-messages' && type === 'content_block_delta' && event.delta?.type === 'signature_delta') {
          const block = output.content[thinkingIndex] as any;
          if (block) block.thinkingSignature = `${block.thinkingSignature || ''}${event.delta.signature || ''}`;
        }
        if (protocol === 'anthropic-messages' && type === 'content_block_stop' && event.index === thinkingProviderIndex) {
          const block = output.content[thinkingIndex] as any;
          stream.push({ type: 'thinking_end', contentIndex: thinkingIndex, content: block?.thinking || '', partial: output });
        }
        if ((protocol === 'responses' && type === 'response.function_call_arguments.done') ||
            (protocol === 'anthropic-messages' && type === 'content_block_stop' && calls.has(event.index))) {
          const call = calls.get(event.output_index ?? event.index)!; call.arguments = JSON.parse(call.args || '{}'); delete (call as any).args;
          stream.push({ type: 'toolcall_end', contentIndex: output.content.indexOf(call), toolCall: call, partial: output });
        }
        if (protocol === 'responses' && type === 'response.completed') {
          output.responseId = event.response.id; output.providerItems = (event.response.output || []).filter((item: any) => item.type === 'reasoning');
          output.usage = price(model, usage(protocol, event.response)); output.stopReason = calls.size ? 'toolUse' : event.response.incomplete_details ? 'length' : 'stop';
        }
        if (protocol === 'anthropic-messages' && type === 'message_start') {
          output.responseId = event.message?.id;
          anthropicUsage = { ...anthropicUsage, ...(event.message?.usage || {}) };
        }
        if (protocol === 'anthropic-messages' && type === 'message_delta') {
          anthropicUsage = { ...anthropicUsage, ...(event.usage || {}) };
          output.usage = price(model, usage(protocol, { usage: anthropicUsage }));
          output.stopReason = event.delta?.stop_reason === 'tool_use' ? 'toolUse' : event.delta?.stop_reason === 'max_tokens' ? 'length' : 'stop';
        }
      }
      if (protocol === 'anthropic-messages' && anthropicProviderItems.length) output.providerItems = anthropicProviderItems;
      if (textIndex >= 0) stream.push({ type: 'text_end', contentIndex: textIndex, content: (output.content[textIndex] as any).text, partial: output });
      stream.push({ type: 'done', reason: output.stopReason as 'stop' | 'length' | 'toolUse', message: output });
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: 'error', reason: output.stopReason as 'aborted' | 'error', error: output });
    }
  })();
  return stream;
}

export async function countNativeInput(model: Model, context: Context, options?: SimpleStreamOptions): Promise<number | null> {
  const protocol = model.compat?.protocol;
  if (protocol !== 'responses' && protocol !== 'anthropic-messages') return null;
  const url = protocol === 'responses'
    ? `${model.baseUrl.replace(/\/$/, '')}/responses/input_tokens`
    : `${model.baseUrl.replace(/\/$/, '')}/messages/count_tokens`;
  const body: any = buildNativeRequest(protocol, model, context, options);
  delete body.stream; delete body.store; delete body.include; delete body.max_output_tokens;
  delete body.max_tokens; delete body.temperature; delete body.prompt_cache_key; delete body.prompt_cache_options;
  const timeoutSignal = AbortSignal.timeout(Math.max(1, options?.timeoutMs || 30_000));
  const response = await fetch(url, { method: 'POST', signal: options?.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal,
    headers: { 'content-type': 'application/json', ...(protocol === 'responses'
      ? { authorization: `Bearer ${options?.apiKey || ''}` }
      : { 'x-api-key': options?.apiKey || '', 'anthropic-version': '2023-06-01',
        ...(model.compat?.promptCacheTtl === '1h' ? { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' } : {}) }), ...model.headers },
    body: JSON.stringify(body) });
  if (!response.ok) return null;
  const data: any = await response.json();
  return Number.isSafeInteger(data.input_tokens) ? data.input_tokens : null;
}

export function streamConfiguredModel(model: Model, context: Context, options?: SimpleStreamOptions) {
  return model.compat?.protocol === 'responses' || model.compat?.protocol === 'anthropic-messages'
    ? streamNative(model, context, options)
    : import('./openaiCompatStream.js').then(({ streamOpenAICompat }) => streamOpenAICompat(model as any, context, options));
}
