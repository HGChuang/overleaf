// llm.service.js
import settings from '@overleaf/settings';
import { LLMMapper } from '../mappers/llm.mapper.js';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { fimCompletion } from '../../config/index.js';
import { formatResult } from '../utils/common.js';
import { buildSystemPrompt } from '../agent/prompts.js';
import { buildAgentGraph, buildAgentInput } from '../agent/graph.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { defaultToolRegistry } from '../agent/tools/index.js';
import { createChatModel } from '../llm/modelFactory.js';
import { ClientRegistry } from '../utils/clientRegistry.js';

const AGENT_ENABLED = settings.LLM_AGENT_ENABLED !== false;
const MEMORY_TTL_SECONDS = Number(settings.LLM_MEMORY_TTL_SECONDS || 60 * 60);
const MEMORY_MAX_MESSAGES = Number(settings.LLM_MEMORY_MAX_MESSAGES || 20);

function buildLegacyHistory(mode, ask, selection, filelist, outline) {
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

function buildCompletionPrompt(params) {
  return `\n\n<FILELIST>${JSON.stringify(params.fileList)}</FILELIST>\n<QUERY>${params.leftContext}{{FILL_HERE}}${params.rightContext}\n</QUERY>\nTASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion, and NOTHING ELSE. Do it now.<COMPLETION>`;
}

function normalizeMode(mode) {
  if (Number.isInteger(mode)) {
    return mode;
  }
  return Number(mode) || 0;
}

function extractTextContent(message) {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map(block => {
        if (typeof block === 'string') {
          return block;
        }
        if (block && typeof block.text === 'string') {
          return block.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function wrapLlmError(error) {
  console.error('LLM call failed:', error);
  throw new Error(`LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
}

export class LLMService {
  constructor({
    llmMapper = new LLMMapper(),
    apiKeyMapper = new ApiKeyMapper(),
    memoryStore,
    toolRegistry = defaultToolRegistry,
    clientRegistry,
    graphFactory = buildAgentGraph,
  } = {}) {
    this.llmMapper = llmMapper;
    this.apiKeyMapper = apiKeyMapper;

    this.CLIENT_EXPIRE_MS = 10 * 60 * 1000;
    this.MAX_CONCURRENT_PER_KEY = 8;
    this.AGENT_OPTIONS = {
      timeout: 60_000,
      keepAlive: true,
      maxSockets: 200,
      retries: 1,
    };

    this.memoryStore =
      memoryStore ||
      new RedisMemoryStore({
        ttlSeconds: MEMORY_TTL_SECONDS,
        maxMessages: MEMORY_MAX_MESSAGES,
      });
    this.toolRegistry = toolRegistry;
    this.clientRegistry =
      clientRegistry ||
      new ClientRegistry({
        createChatModel,
        agentOptions: this.AGENT_OPTIONS,
        clientExpireMs: this.CLIENT_EXPIRE_MS,
        maxConcurrentPerKey: this.MAX_CONCURRENT_PER_KEY,
      });
    this.graphFactory = graphFactory;
  }

  async chat(userIdentifier, ask, selection, filelist, outline, mode, conversationId) {
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
    const tools = this.toolRegistry.list();
    const { model: chatModel, semaphore } = await this.clientRegistry.getChatModel(
      baseUrl,
      apiKey,
      model.id
    );
    const graph = this.graphFactory({
      model: tools.length > 0 ? chatModel.bindTools(tools) : chatModel,
      tools,
    });
    const { userMessage } = buildLegacyHistory(normalizedMode, ask, selection, filelist, outline);
    const input = buildAgentInput({
      systemPrompt: buildSystemPrompt(normalizedMode),
      history,
      userMessage,
    });

    await semaphore.acquire();
    try {
      const response = await graph.invoke(input, threadId ? { configurable: { thread_id: threadId } } : undefined);
      const messages = Array.isArray(response?.messages) ? response.messages : [];
      const content = extractTextContent(messages[messages.length - 1]);
      const appendedMessages = messages.slice(history.length + 2);
      await this.memoryStore.append(threadId, appendedMessages);
      return content;
    } catch (error) {
      wrapLlmError(error);
    } finally {
      semaphore.release();
    }
  }

  async chatWithLegacyClient({ baseUrl, apiKey, modelId, mode, ask, selection, filelist, outline }) {
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
    userIdentifier,
    cursorOffset,
    leftContext,
    rightContext,
    language,
    maxLength,
    fileList,
    outline
  ) {
    try {
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
    } catch (error) {
      throw error;
    }
  }

  async resolveChatModel(userIdentifier) {
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

  async resolveCompletionModel(userIdentifier) {
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

  buildThreadId(userIdentifier, conversationId) {
    if (!userIdentifier || !conversationId) {
      return null;
    }
    return `${userIdentifier}:${conversationId}`;
  }

  buildPrompt(params) {
    return buildCompletionPrompt(params);
  }
}

export { buildLegacyHistory, buildCompletionPrompt, extractTextContent };
