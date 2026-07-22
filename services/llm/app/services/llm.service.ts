// llm.service.ts — the legacy /api/v1/llm endpoints (mode-based single-shot
// chat + FIM completion). The chat path now runs on the same vendored agent
// core as Copilot (no tools bound — it is a one-call completion with
// conversation memory); completion keeps using the plain LlmClient.

import settings from '@overleaf/settings';
import { LLMMapper } from '../mappers/llm.mapper.js';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { fimCompletion } from '../../config/index.js';
import { formatResult } from '../utils/common.js';
import { buildSystemPrompt } from '../agent/prompts.js';
import { Agent } from '../agent/core/agent.js';
import type { AgentMessage, StreamFn } from '../agent/core/types.js';
import {
  assistantTextOf,
  streamOpenAICompat,
} from '../llm/openaiCompatStream.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { createChatModel } from '../llm/modelFactory.js';
import { ClientRegistry } from '../utils/clientRegistry.js';

const AGENT_ENABLED = settings.LLM_AGENT_ENABLED !== false;
const MEMORY_TTL_SECONDS = Number(settings.LLM_MEMORY_TTL_SECONDS || 60 * 60);
const MEMORY_MAX_MESSAGES = Number(settings.LLM_MEMORY_MAX_MESSAGES || 20);

function buildLegacyHistory(mode: number, ask: string, selection: string, filelist: unknown, outline: unknown) {
  const history = [{ role: 'system', content: buildSystemPrompt(mode) }];
  const userMessage = JSON.stringify(
    {
      USER_QUERY: ask || '',
      SELECTED_TEXT: selection || '',
      FILE_LIST: filelist || [],
      OUTLINE: outline || [],
    },
    null,
    2
  );
  history.push({ role: 'user', content: userMessage });
  return { history, userMessage };
}

function buildCompletionPrompt(params: any) {
  return `\n\n<FILELIST>${JSON.stringify(params.fileList)}</FILELIST>\n<QUERY>${params.leftContext}{{FILL_HERE}}${params.rightContext}\n</QUERY>\nTASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion, and NOTHING ELSE. Do it now.<COMPLETION>`;
}

function normalizeMode(mode: unknown): number {
  if (Number.isInteger(mode)) {
    return mode as number;
  }
  return Number(mode) || 0;
}

function wrapLlmError(error: unknown): never {
  console.error('LLM call failed:', error);
  throw new Error(`LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
}

export class LLMService {
  llmMapper: LLMMapper;
  apiKeyMapper: ApiKeyMapper;
  memoryStore: RedisMemoryStore;
  clientRegistry: ClientRegistry;
  // Provider stream function — injectable for tests.
  streamFn: StreamFn;

  constructor({
    llmMapper = new LLMMapper(),
    apiKeyMapper = new ApiKeyMapper(),
    memoryStore = undefined,
    clientRegistry = undefined,
    streamFn = streamOpenAICompat,
  }: {
    llmMapper?: LLMMapper;
    apiKeyMapper?: ApiKeyMapper;
    memoryStore?: RedisMemoryStore;
    clientRegistry?: ClientRegistry;
    streamFn?: StreamFn;
  } = {}) {
    this.llmMapper = llmMapper;
    this.apiKeyMapper = apiKeyMapper;
    this.streamFn = streamFn;

    this.memoryStore =
      memoryStore ||
      new RedisMemoryStore({
        ttlSeconds: MEMORY_TTL_SECONDS,
        maxMessages: MEMORY_MAX_MESSAGES,
      });
    this.clientRegistry =
      clientRegistry ||
      new ClientRegistry({
        createChatModel,
        agentOptions: {
          timeout: 60_000,
          keepAlive: true,
          maxSockets: 200,
          retries: 1,
        },
        clientExpireMs: 10 * 60 * 1000,
        maxConcurrentPerKey: 8,
      });
  }

  async chat(
    userIdentifier: string,
    ask: string,
    selection: string,
    filelist: unknown,
    outline: unknown,
    mode: unknown,
    conversationId: string | null
  ) {
    const normalizedMode = normalizeMode(mode);
    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { baseUrl, apiKey } = usingLlmInfo;

    if (!AGENT_ENABLED) {
      return this.chatWithLegacyClient({
        baseUrl,
        apiKey,
        modelId: model.id,
        mode: normalizedMode,
        ask,
        selection,
        filelist,
        outline,
      });
    }

    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const history = threadId ? await this.memoryStore.load(threadId) : [];
    const { model: modelDescriptor, semaphore } = await this.clientRegistry.getChatModel(
      baseUrl,
      apiKey,
      model.id
    );
    const { userMessage } = buildLegacyHistory(normalizedMode, ask, selection, filelist, outline);

    const agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt(normalizedMode),
        model: modelDescriptor,
        tools: [],
        messages: history,
      },
      streamFn: (m, ctx, opts) =>
        this.streamFn(m, ctx, { ...opts, temperature: 0.7 }),
      getApiKey: () => apiKey,
    });
    let newMessages: AgentMessage[] = [];
    agent.subscribe(event => {
      if (event.type === 'agent_end') {
        newMessages = event.messages;
      }
    });

    await semaphore.acquire();
    try {
      await agent.prompt({
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      } as AgentMessage);
    } catch (error) {
      wrapLlmError(error);
    } finally {
      semaphore.release();
    }

    let content = '';
    let failure: string | null = null;
    for (let i = newMessages.length - 1; i >= 0; i--) {
      const m = newMessages[i];
      if (m?.role !== 'assistant') continue;
      if (m.stopReason === 'error' || m.stopReason === 'aborted') {
        failure = m.errorMessage || `provider stopped with ${m.stopReason}`;
      } else {
        content = assistantTextOf(m);
      }
      break;
    }
    if (failure) {
      wrapLlmError(new Error(failure));
    }
    if (threadId && newMessages.length > 0) {
      await this.memoryStore.append(threadId, newMessages);
    }
    return content;
  }

  async chatWithLegacyClient({ baseUrl, apiKey, modelId, mode, ask, selection, filelist, outline }: any) {
    const { history } = buildLegacyHistory(mode, ask, selection, filelist, outline);
    const entry = await this.clientRegistry.getLlmClient(baseUrl, apiKey);
    await entry.semaphore.acquire();
    try {
      const response = await entry.llmClient.chat(history, modelId);
      return response.choices[0].message.content;
    } catch (error) {
      wrapLlmError(error);
    } finally {
      entry.lastUsed = Date.now();
      entry.semaphore.release();
    }
  }

  async completion(
    userIdentifier: string,
    cursorOffset: unknown,
    leftContext: string,
    rightContext: string,
    language: unknown,
    maxLength: unknown,
    fileList: unknown,
    outline: unknown
  ) {
    const { usingLlmInfo, model } = await this.resolveCompletionModel(userIdentifier);
    const { baseUrl, apiKey } = usingLlmInfo;
    const params = { leftContext, rightContext, language, maxLength, fileList, outline };
    const prompt = buildCompletionPrompt(params);
    const history = [{ role: 'user', content: fimCompletion + prompt }];

    const entry = await this.clientRegistry.getLlmClient(baseUrl, apiKey);
    await entry.semaphore.acquire();
    try {
      const response = await entry.llmClient.completion(history, model.id);
      this.llmMapper.updateUsedTokens(userIdentifier, response?.usage?.total_tokens);
      return formatResult(response.choices[0].message.content);
    } catch (error) {
      wrapLlmError(error);
    } finally {
      entry.lastUsed = Date.now();
      entry.semaphore.release();
    }
  }

  async resolveChatModel(userIdentifier: string) {
    const { usingLlm, llminfo } = await this.apiKeyMapper.getUsingLlmWithInfo(userIdentifier);
    if (usingLlm == null || usingLlm < 0 || usingLlm >= llminfo.length) {
      throw new Error('not set chat model');
    }
    const usingLlmInfo = llminfo[usingLlm];
    const model = usingLlmInfo?.models?.[usingLlmInfo?.usingChatModel];
    if (!model) {
      throw new Error('not set chat model');
    }
    return { usingLlmInfo, model };
  }

  async resolveCompletionModel(userIdentifier: string) {
    const { usingLlm, llminfo } = await this.apiKeyMapper.getUsingLlmWithInfo(userIdentifier);
    if (usingLlm == null || usingLlm < 0 || usingLlm >= llminfo.length) {
      throw new Error('not set completion model');
    }
    const usingLlmInfo = llminfo[usingLlm];
    const model = usingLlmInfo?.models?.[usingLlmInfo?.usingCompletionModel];
    if (!model) {
      throw new Error('not set completion model');
    }
    return { usingLlmInfo, model };
  }

  buildThreadId(userIdentifier: string, conversationId: string | null): string | null {
    if (!userIdentifier || !conversationId) {
      return null;
    }
    return `${userIdentifier}:${conversationId}`;
  }

  buildPrompt(params: any) {
    return buildCompletionPrompt(params);
  }
}

export { buildLegacyHistory, buildCompletionPrompt };
