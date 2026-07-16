import { randomUUID } from 'crypto';
import settings from '@overleaf/settings';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { createChatModel } from '../llm/modelFactory.js';
import { buildAgentGraph, buildAgentInput } from '../agent/graph.js';
import { buildChatPrompt, buildCompilePrompt } from '../agent/prompts.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { defaultToolRegistry } from '../agent/tools/index.js';
import { ClientRegistry } from '../utils/clientRegistry.js';
import { badRequest } from '../utils/errors.js';

const MEMORY_TTL_SECONDS = Number(settings.LLM_MEMORY_TTL_SECONDS || 60 * 60);
const MEMORY_MAX_MESSAGES = Number(settings.LLM_MEMORY_MAX_MESSAGES || 20);

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

function createMessageResponse(content, extraBlocks = []) {
  return {
    role: 'assistant',
    content,
    blocks: [
      {
        type: 'text',
        text: content,
      },
      ...extraBlocks,
    ],
  };
}

export class CopilotService {
  constructor({
    apiKeyMapper = new ApiKeyMapper(),
    clientRegistry,
    memoryStore,
    toolRegistry = defaultToolRegistry,
    graphFactory = buildAgentGraph,
  } = {}) {
    this.apiKeyMapper = apiKeyMapper;
    this.memoryStore =
      memoryStore ||
      new RedisMemoryStore({
        ttlSeconds: MEMORY_TTL_SECONDS,
        maxMessages: MEMORY_MAX_MESSAGES,
        keyPrefix: 'copilot:mem',
      });
    this.toolRegistry = toolRegistry;
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
    this.graphFactory = graphFactory;
  }

  async chat(userIdentifier, context) {
    const conversationId = context.conversation.conversationId || `conv_${randomUUID()}`;
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const history = await this.memoryStore.load(threadId);
    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { model: chatModel, semaphore } = await this.clientRegistry.getChatModel(
      usingLlmInfo.baseUrl,
      usingLlmInfo.apiKey,
      model.id
    );
    const tools = this.toolRegistry.list();
    const graph = this.graphFactory({
      model: tools.length > 0 ? chatModel.bindTools(tools) : chatModel,
      tools,
    });
    const systemPrompt = buildChatPrompt(context.conversation.tab, {
      projectId: context.project.projectId,
      rootDocId: context.project.rootDocId,
      currentFile: context.context.currentFile,
      fileList: context.project.fileList,
      outline: context.project.outline,
    });
    const userMessage = JSON.stringify(
      {
        MESSAGE: context.message.content,
        CONTEXT: context.context,
        PROJECT: {
          projectId: context.project.projectId,
          rootDocId: context.project.rootDocId,
          fileList: context.project.fileList,
          outline: context.project.outline,
        },
      },
      null,
      2
    );
    const input = buildAgentInput({ systemPrompt, history, userMessage });

    await semaphore.acquire();
    try {
      const response = await graph.invoke(input, { configurable: { thread_id: threadId } });
      const messages = Array.isArray(response?.messages) ? response.messages : [];
      const content = extractTextContent(messages[messages.length - 1]);
      const appendedMessages = messages.slice(history.length + 2);
      await this.memoryStore.append(threadId, appendedMessages);
      return {
        conversationId,
        message: createMessageResponse(content),
        suggestedActions: [],
      };
    } finally {
      semaphore.release();
    }
  }

  async compileDiagnose(userIdentifier, context) {
    const conversationId = context.conversation.conversationId || `conv_${randomUUID()}`;
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const history = await this.memoryStore.load(threadId);
    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { model: chatModel, semaphore } = await this.clientRegistry.getChatModel(
      usingLlmInfo.baseUrl,
      usingLlmInfo.apiKey,
      model.id
    );
    const tools = this.toolRegistry.list();
    const graph = this.graphFactory({
      model: tools.length > 0 ? chatModel.bindTools(tools) : chatModel,
      tools,
    });
    const systemPrompt = buildCompilePrompt({
      projectId: context.project.projectId,
      rootDocId: context.project.rootDocId,
      currentFile: context.editor.currentFile,
      compileId: context.compile.compileId,
      status: context.compile.status,
      annotations: context.compile.annotations,
      logText: context.compile.logText,
    });
    const userMessage = JSON.stringify(
      {
        COMPILE: context.compile,
        PROJECT: context.project,
      },
      null,
      2
    );
    const input = buildAgentInput({ systemPrompt, history, userMessage });

    await semaphore.acquire();
    try {
      const response = await graph.invoke(input, { configurable: { thread_id: threadId } });
      const messages = Array.isArray(response?.messages) ? response.messages : [];
      const content = extractTextContent(messages[messages.length - 1]);
      const appendedMessages = messages.slice(history.length + 2);
      await this.memoryStore.append(threadId, appendedMessages);
      const primaryAnnotation = context.compile.annotations?.[0] || null;
      return {
        conversationId,
        summary: content,
        diagnostics: [
          {
            id: primaryAnnotation?.id || `diag_${randomUUID()}`,
            title: primaryAnnotation?.message || 'Compile diagnosis',
            whatHappened: content,
            likelyCause: primaryAnnotation?.message || 'See compile summary',
            suggestedFix: 'Review the cited file and line, then adjust the LaTeX source or missing dependency.',
            location: primaryAnnotation
              ? {
                  file: primaryAnnotation.file,
                  line: primaryAnnotation.line,
                }
              : null,
            actions: ['jump_to_line', 'copy', 'regenerate'],
          },
        ],
      };
    } finally {
      semaphore.release();
    }
  }

  async getConversation(userIdentifier, conversationId) {
    if (!conversationId) {
      throw badRequest('conversationId is required');
    }
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const messages = await this.memoryStore.load(threadId);
    return {
      conversationId,
      messages: messages.map(message => ({
        role: message.getType ? message.getType() : message._getType?.() || 'message',
        content: message.content,
      })),
    };
  }

  buildThreadId(userIdentifier, conversationId) {
    return `${userIdentifier}:${conversationId}`;
  }

  async resolveChatModel(userIdentifier) {
    const { usingLlm, llminfo } = await this.apiKeyMapper.getUsingLlmWithInfo(userIdentifier);
    if (usingLlm == null || usingLlm < 0 || usingLlm >= llminfo.length) {
      throw badRequest('not set chat model');
    }
    const usingLlmInfo = llminfo[usingLlm];
    const model = usingLlmInfo?.models?.[usingLlmInfo?.usingChatModel];
    if (!model) {
      throw badRequest('not set chat model');
    }
    return { usingLlmInfo, model };
  }
}
