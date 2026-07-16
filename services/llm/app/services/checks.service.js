import settings from '@overleaf/settings';
import { buildCheckExplainPrompt } from '../agent/prompts.js';
import { buildAgentGraph, buildAgentInput } from '../agent/graph.js';
import { createChatModel } from '../llm/modelFactory.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { defaultToolRegistry } from '../agent/tools/index.js';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { ClientRegistry } from '../utils/clientRegistry.js';
import { badRequest, unsupported } from '../utils/errors.js';
import { getScanner } from '../checks/registry.js';

const MEMORY_TTL_SECONDS = Number(settings.LLM_MEMORY_TTL_SECONDS || 60 * 60);
const MEMORY_MAX_MESSAGES = Number(settings.LLM_MEMORY_MAX_MESSAGES || 20);
const MAX_ISSUES = Number(settings.COPILOT_CHECKS_MAX_ISSUES || 100);

export class ChecksService {
  constructor({
    apiKeyMapper = new ApiKeyMapper(),
    clientRegistry,
    toolRegistry = defaultToolRegistry,
    memoryStore,
    graphFactory = buildAgentGraph,
  } = {}) {
    this.apiKeyMapper = apiKeyMapper;
    this.toolRegistry = toolRegistry;
    this.memoryStore = memoryStore || new RedisMemoryStore({
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
    this.graphFactory = graphFactory;
  }

  async runChecks(userIdentifier, context) {
    const issues = [];
    for (const type of context.checks) {
      const scanner = getScanner(type);
      if (!scanner) {
        throw unsupported(`Unsupported check type: ${type}`);
      }
      issues.push(...scanner.scan(context.project));
      if (issues.length >= MAX_ISSUES) {
        break;
      }
    }

    const cappedIssues = issues.slice(0, MAX_ISSUES);
    const byType = cappedIssues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {});

    return {
      runId: context.conversation.conversationId,
      summary: {
        total: cappedIssues.length,
        byType,
      },
      issues: cappedIssues,
    };
  }

  async explainIssue(userIdentifier, context) {
    if (!context.issue) {
      throw badRequest('issue is required');
    }

    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { baseUrl, apiKey } = usingLlmInfo;
    const { model: chatModel, semaphore } = await this.clientRegistry.getChatModel(
      baseUrl,
      apiKey,
      model.id
    );
    const tools = this.toolRegistry.list();
    const graph = this.graphFactory({
      model: tools.length > 0 ? chatModel.bindTools(tools) : chatModel,
      tools,
    });
    const systemPrompt = buildCheckExplainPrompt(context.issue, context.project);
    const userMessage = JSON.stringify(
      {
        ISSUE: context.issue,
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
    const threadId = `${userIdentifier}:${context.conversation.conversationId}`;
    const history = await this.memoryStore.load(threadId);
    const input = buildAgentInput({ systemPrompt, history, userMessage });

    await semaphore.acquire();
    try {
      const response = await graph.invoke(input, { configurable: { thread_id: threadId } });
      const messages = Array.isArray(response?.messages) ? response.messages : [];
      const lastMessage = messages[messages.length - 1];
      const content = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
      const appendedMessages = messages.slice(history.length + 2);
      await this.memoryStore.append(threadId, appendedMessages);
      return {
        message: {
          role: 'assistant',
          content,
          blocks: [
            {
              type: 'text',
              text: content,
            },
          ],
        },
      };
    } finally {
      semaphore.release();
    }
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
