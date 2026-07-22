import { randomUUID } from 'crypto';
import settings from '@overleaf/settings';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { createChatModel } from '../llm/modelFactory.js';
import { buildAgentGraph, buildAgentInput } from '../agent/graph.js';
import { buildUnifiedSystemPrompt } from '../agent/prompts.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { LongTermMemoryStore } from '../agent/longTermMemory.js';
import { extractTextContent } from '../agent/messageText.js';
import { buildToolPool } from '../agent/tools/index.js';
import { isPromptTooLong, reactiveCompact } from '../agent/recovery.js';
import {
  extractSubmittedPatch,
  mapMessagesForView,
  patchIntroContent,
  toPatchBlock,
} from '../agent/patchBlocks.js';
import { ClientRegistry } from '../utils/clientRegistry.js';
import { badRequest, CopilotError, timeout } from '../utils/errors.js';

const MEMORY_TTL_SECONDS = Number(settings.LLM_MEMORY_TTL_SECONDS || 60 * 60);
const MEMORY_MAX_MESSAGES = Number(settings.LLM_MEMORY_MAX_MESSAGES || 20);
const AGENT_RECURSION_LIMIT = Number(settings.COPILOT_AGENT_RECURSION_LIMIT || 25);
const LTMEM_ENABLED = settings.COPILOT_LTMEM_ENABLED !== 'false';
// Hard wall-clock budget for ONE chat turn (all agent steps + queueing). The
// per-CALL model timeout (60s) bounds a single step; without an overall
// deadline a 25-step turn can burn ~25 minutes after the client has long
// given up. 120s comfortably fits the diagnose-all-errors flow.
const TURN_TIMEOUT_MS = Number(settings.COPILOT_TURN_TIMEOUT_MS || 120_000);

function createMessageResponse(content, extraBlocks = []) {
  // `content` already carries the assistant's markdown text — don't also echo
  // it as a {type:'text'} block, or the frontend renders the answer twice
  // (once from `content`, once from the block). `blocks` is for structured
  // extras only (diagnostics, issue lists, code, file refs, …).
  return {
    role: 'assistant',
    content,
    blocks: extraBlocks,
  };
}

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    String(err?.message || '').toLowerCase().includes('abort')
  );
}

// LangGraph throws GraphRecursionError when the agent↔tool loop exceeds
// recursionLimit. Surface it as a readable CopilotError instead of a bare 500.
function isRecursionError(err) {
  return (
    err?.name === 'GraphRecursionError' ||
    String(err?.message || '').includes('Recursion limit')
  );
}

// Intent-specific user message payload. Project *paths* (not full contents) —
// the model reads source via the read_file / read_file_fragment tools.
function buildUserMessage(context = {}) {
  const project = context.project || {};
  const projectShell = {
    projectId: project.projectId,
    rootDocId: project.rootDocId,
    fileList: project.fileList || [],
    outline: project.outline || [],
  };

  return JSON.stringify(
    {
      MESSAGE: context.message?.content,
      CONTEXT: context.context,
      PROJECT: projectShell,
    },
    null,
    2
  );
}

export class CopilotService {
  constructor({
    apiKeyMapper = new ApiKeyMapper(),
    clientRegistry,
    memoryStore,
    longTermMemoryStore,
    toolPoolFactory = buildToolPool,
    graphFactory = buildAgentGraph,
    turnTimeoutMs = TURN_TIMEOUT_MS,
  } = {}) {
    this.apiKeyMapper = apiKeyMapper;
    this.memoryStore =
      memoryStore ||
      new RedisMemoryStore({
        ttlSeconds: MEMORY_TTL_SECONDS,
        maxMessages: MEMORY_MAX_MESSAGES,
        keyPrefix: 'copilot:mem',
      });
    // Long-term, cross-conversation memory. Default-constructed (singleton —
    // the service itself is constructed once). Disabled via
    // COPILOT_LTMEM_ENABLED=false. Shares the redis singleton.
    this.longTermMemoryStore = longTermMemoryStore || new LongTermMemoryStore();
    this.toolPoolFactory = toolPoolFactory;
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
    this.turnTimeoutMs = turnTimeoutMs;
  }

  // The single unified agent entry point. The controller normalizes the
  // request (size validation) and the MODEL decides which tools to call (real
  // intent recognition). The result is mapped into the unified
  // {conversationId, message, suggestedActions} envelope, with a `patch`
  // structured block emitted when the model called `submit_patch`.
  //
  // opts.signal: AbortSignal from the controller (fires when the HTTP client
  // disconnects) — combined here with the overall turn deadline so a gone or
  // timed-out turn cancels in-flight model calls instead of burning tokens.
  async chat(userIdentifier, context, { signal } = {}) {
    const conversationId =
      context.conversation?.conversationId || `conv_${randomUUID()}`;
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const history = await this.memoryStore.load(threadId);
    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { model: chatModel, semaphore } = await this.clientRegistry.getChatModel(
      usingLlmInfo.baseUrl,
      usingLlmInfo.apiKey,
      model.id
    );

    const tools = this.toolPoolFactory(context);
    const boundModel =
      tools.length > 0 && typeof chatModel.bindTools === 'function'
        ? chatModel.bindTools(tools)
        : chatModel;
    const graph = this.graphFactory({
      model: boundModel,
      tools,
    });

    // Build the base prompt + user message, then layer in long-term memory
    // (M3): the memory *index* (a cheap catalog) goes into the system prompt;
    // the *relevant* memory bodies go into the user turn. Both are best-effort
    // and fully swallowed so a flaky memory subsystem never breaks a turn.
    let systemPrompt = buildUnifiedSystemPrompt(
      context,
      tools.map(t => t.name)
    );
    let userMessage = buildUserMessage(context);
    const lt = LTMEM_ENABLED ? this.longTermMemoryStore : null;
    if (lt) {
      try {
        const index = await lt.readIndex(userIdentifier);
        const indexSection = lt.renderIndexForPrompt(index);
        if (indexSection) systemPrompt = `${systemPrompt}\n\n${indexSection}`;
        const relevant = await lt.loadRelevant(userIdentifier, [
          ...history,
          this._pseudoUserMessage(userMessage),
        ], { model: chatModel, useLlmSelect: false });
        if (relevant) userMessage = `${relevant}\n\n${userMessage}`;
      } catch {
        // long-term memory must never break a chat turn
      }
    }

    // Overall turn deadline + external (client-disconnect) abort.
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, this.turnTimeoutMs);
    const onOuterAbort = () => ac.abort();
    if (signal) {
      if (signal.aborted) ac.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    const invoke = hist =>
      graph.invoke(buildAgentInput({ systemPrompt, history: hist, userMessage }), {
        configurable: { thread_id: threadId },
        recursionLimit: AGENT_RECURSION_LIMIT,
        signal: ac.signal,
      });

    await semaphore.acquire();
    let messages;
    try {
      if (ac.signal.aborted) {
        throw Object.assign(new Error('copilot turn aborted'), {
          name: 'AbortError',
        });
      }
      let effectiveHistory = history;
      let compacted = false;
      let response;
      try {
        response = await invoke(effectiveHistory);
      } catch (err) {
        // s11 reactive compact: on context-too-large, summarize the short-term
        // history and retry once. Rare (recursionLimit + micro_compact bound
        // growth), but the GLM proxy can be picky about context size.
        if (ac.signal.aborted || !isPromptTooLong(err)) throw err;
        effectiveHistory = await reactiveCompact(effectiveHistory, chatModel);
        compacted = true;
        response = await invoke(effectiveHistory);
      }
      messages = Array.isArray(response?.messages) ? response.messages : [];
      // Keep the full new turn (Human + assistant + tool messages), dropping
      // the System + the effectiveHistory prefix actually used (may differ from
      // the loaded history if a reactive compact ran). Storing the HumanMessage
      // too (was dropped before) so follow-up turns keep the user's prior
      // questions and long-term extraction can see user preferences.
      const appendedMessages = messages.slice(effectiveHistory.length + 1);
      if (compacted) {
        // PERSIST the compacted history + new turn: append() would merge the
        // new turn into the OLD, still-oversized stored history, and every
        // subsequent turn would prompt_too_long again (re-paying one
        // summarize LLM call each time, forever).
        await this.memoryStore.replace(threadId, [
          ...effectiveHistory,
          ...appendedMessages,
        ]);
      } else {
        await this.memoryStore.append(threadId, appendedMessages);
      }
    } catch (err) {
      if (timedOut && isAbortError(err)) {
        throw timeout(
          'copilot turn timed out — please narrow the request and try again'
        );
      }
      if (isRecursionError(err)) {
        throw new CopilotError(
          'COPILOT_STEP_LIMIT',
          'Copilot hit its step budget for this turn — please narrow the request or break it into smaller pieces.',
          500,
          { cause: err }
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onOuterAbort);
      semaphore.release();
    }

    // M3: fire-and-forget long-term extraction + consolidation. Non-blocking
    // and fully swallowed — never affects the response or breaks the caller.
    this._maybePersistLongTermMemory(userIdentifier, messages, chatModel, semaphore);

    return this.mapResult(messages, context, conversationId);
  }

  // A lightweight stand-in for the current user message so loadRelevant's
  // recent-user-text scan sees this turn's question when selecting memories
  // (the real HumanMessage isn't built until buildAgentInput).
  _pseudoUserMessage(content) {
    return {
      getType: () => 'human',
      _getType: () => 'human',
      content,
    };
  }

  // Background long-term memory persistence (s09 stop-hook pattern). Runs after
  // the response is returned via setImmediate; every error is swallowed.
  // Serialized per user (racing extract/consolidate cycles clobber the memory
  // index) and routed through the same per-key semaphore as foreground turns —
  // background LLM calls previously bypassed it and could push a key past its
  // provider rate limit.
  _maybePersistLongTermMemory(userIdentifier, messages, chatModel, semaphore) {
    const lt = LTMEM_ENABLED ? this.longTermMemoryStore : null;
    if (!lt || !chatModel || !Array.isArray(messages) || messages.length === 0) {
      return;
    }
    setImmediate(async () => {
      try {
        const work = async () => {
          await lt.extractMemories(userIdentifier, messages, chatModel);
          await lt.consolidate(userIdentifier, chatModel);
        };
        const gated =
          semaphore && typeof semaphore.acquire === 'function'
            ? async () => {
                await semaphore.acquire();
                try {
                  await work();
                } finally {
                  semaphore.release();
                }
              }
            : work;
        if (typeof lt.runExclusive === 'function') {
          await lt.runExclusive(userIdentifier, gated);
        } else {
          await gated();
        }
      } catch {
        /* swallow — never break the caller */
      }
    });
  }

  // Map the agent's message list into the unified response envelope. A
  // `patch` block is emitted when the model called `submit_patch` (a
  // structured edit proposal the frontend renders as an inline-diff ghost
  // preview with Accept/Reject); otherwise the free-text answer rides as
  // message.content.
  mapResult(messages, context, conversationId) {
    const finalContent = extractTextContent(messages[messages.length - 1]);

    // chat: free-text answer, plus a `patch` block when the model called
    // `submit_patch` (a structured edit proposal the frontend renders as an
    // inline-diff ghost preview with Accept/Reject). `content` is a SHORT
    // generic intro only — the model's `summary` rides as `patch.title` inside
    // the card (see `toPatchBlock`). Rendering the summary in BOTH `content`
    // and `patch.title` showed it twice in the chat (message-list renders
    // `content` as markdown *and* the block).
    const patchRaw = extractSubmittedPatch(messages);
    if (patchRaw) {
      const patch = toPatchBlock(patchRaw, 0);
      if (patch) {
        return {
          conversationId,
          message: createMessageResponse(patchIntroContent(patch.hunks.length), [
            { type: 'patch', patch },
          ]),
          suggestedActions: [],
        };
      }
    }

    return {
      conversationId,
      message: createMessageResponse(finalContent),
      suggestedActions: [],
    };
  }

  async getConversation(userIdentifier, conversationId) {
    if (!conversationId) {
      throw badRequest('conversationId is required');
    }
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const messages = await this.memoryStore.load(threadId);
    return {
      conversationId,
      messages: mapMessagesForView(messages),
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
