import { randomUUID } from 'crypto';
import settings from '@overleaf/settings';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { createChatModel } from '../llm/modelFactory.js';
import { Agent } from '../agent/core/agent.js';
import type { AgentMessage, StreamFn } from '../agent/core/types.js';
import type { AssistantMessage } from '../agent/core/llm-types.js';
import {
  assistantTextOf,
  streamOpenAICompat,
} from '../llm/openaiCompatStream.js';
import { buildUnifiedSystemPrompt } from '../agent/prompts.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { LongTermMemoryStore } from '../agent/longTermMemory.js';
import { extractTextContent } from '../agent/messageText.js';
import { buildToolPool } from '../agent/tools/index.js';
import { WebApiClient } from '../llm/webApiClient.js';
import {
  isPromptTooLong,
  reactiveCompact,
  REACTIVE_KEEP_TAIL,
  summarizeHistory,
  type TextCompleter,
} from '../agent/recovery.js';
import {
  lastReportedTotalTokens,
  microCompact,
  sanitizeToolPairing,
  snipCompact,
} from '../agent/compact.js';
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
const CONTEXT_SNIP_MAX = Number(settings.COPILOT_CONTEXT_SNIP_MAX || 50);
const CONTEXT_MICRO_KEEP = Number(settings.COPILOT_CONTEXT_MICRO_KEEP || 3);
// Per-turn budget of assistant steps (model responses, incl. tool-calling
// ones). The vendored loop has no built-in recursion limit, so the budget is
// enforced via shouldStopAfterTurn. 25 comfortably fits the
// diagnose-all-errors flow with headroom.
const AGENT_STEP_LIMIT = Number(settings.COPILOT_AGENT_RECURSION_LIMIT || 25);
const LTMEM_ENABLED = settings.COPILOT_LTMEM_ENABLED !== 'false';
// Usage-based proactive compaction: when the provider reports the last turn
// consumed more than this many total tokens, summarize the older context once
// per chat turn (via transformContext). This uses the REAL usage numbers —
// the vendored provider reports per-call token counts.
const SUMMARIZE_TOKENS = Number(settings.COPILOT_SUMMARIZE_TOKENS || 80_000);
// Hard wall-clock budget for ONE chat turn (all agent steps + queueing). The
// per-CALL model timeout (60s) bounds a single step; without an overall
// deadline a 25-step turn can burn ~25 minutes after the client has long
// given up. 120s comfortably fits the diagnose-all-errors flow.
// Generous default: a verification round includes a full LaTeX compile
// (compile_project tool timeout is 150s) plus model time.
const TURN_TIMEOUT_MS = Number(settings.COPILOT_TURN_TIMEOUT_MS || 300_000);

// Events forwarded to SSE clients mid-turn. `done`/`error` are sent by the
// controller once the turn settles, not through this channel.
export type CopilotStreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string }
  | { type: 'tool_end'; toolCallId: string; toolName: string; isError: boolean };

function createMessageResponse(content: string, extraBlocks: unknown[] = []) {
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

// Intent-specific user message payload. Project *paths* (not full contents) —
// the model reads source via the read_file / read_file_fragment tools.
function buildUserMessage(context: any = {}) {
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
  apiKeyMapper: ApiKeyMapper;
  memoryStore: RedisMemoryStore;
  longTermMemoryStore: LongTermMemoryStore;
  toolPoolFactory: typeof buildToolPool;
  clientRegistry: ClientRegistry;
  turnTimeoutMs: number;
  // Web private-API client backing the compile_project verification tool —
  // injectable for tests (same seam style as streamFn).
  webClient: WebApiClient;
  // Provider stream function — injectable for tests (replaces the old
  // graphFactory seam). Both the agent loop and the summarize/LTM completer
  // route through it.
  streamFn: StreamFn;

  constructor({
    apiKeyMapper = new ApiKeyMapper(),
    clientRegistry = undefined,
    memoryStore = undefined,
    longTermMemoryStore = undefined,
    toolPoolFactory = buildToolPool,
    turnTimeoutMs = TURN_TIMEOUT_MS,
    streamFn = streamOpenAICompat,
    webClient = undefined,
  }: {
    apiKeyMapper?: ApiKeyMapper;
    clientRegistry?: ClientRegistry;
    memoryStore?: RedisMemoryStore;
    longTermMemoryStore?: LongTermMemoryStore;
    toolPoolFactory?: typeof buildToolPool;
    turnTimeoutMs?: number;
    streamFn?: StreamFn;
    webClient?: WebApiClient;
  } = {}) {
    this.apiKeyMapper = apiKeyMapper;
    this.memoryStore =
      memoryStore ||
      new RedisMemoryStore({
        ttlSeconds: MEMORY_TTL_SECONDS,
        maxMessages: MEMORY_MAX_MESSAGES,
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
    this.turnTimeoutMs = turnTimeoutMs;
    this.streamFn = streamFn;
    this.webClient = webClient || new WebApiClient();
  }

  // The single unified agent entry point. The controller normalizes the
  // request (size validation) and the MODEL decides which tools to call (real
  // intent recognition). The result is mapped into the unified
  // {conversationId, message, suggestedActions} envelope, with a `patch`
  // structured block emitted when the model called `submit_patch`.
  //
  // opts.signal: AbortSignal from the controller (fires when the HTTP client
  // disconnects) — aborts the agent run so a gone client cancels in-flight
  // model calls instead of burning tokens.
  // opts.onEvent: SSE tap — mid-turn text deltas + tool execution events.
  async chat(
    userIdentifier: string,
    context: any,
    { signal, onEvent }: { signal?: AbortSignal; onEvent?: (e: CopilotStreamEvent) => void } = {}
  ) {
    const conversationId =
      context.conversation?.conversationId || `conv_${randomUUID()}`;
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const history = await this.memoryStore.load(threadId);
    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { model: modelDescriptor, semaphore } = await this.clientRegistry.getChatModel(
      usingLlmInfo.baseUrl,
      usingLlmInfo.apiKey,
      model.id
    );
    const apiKey = usingLlmInfo.apiKey;

    const tools = this.toolPoolFactory(context, { webClient: this.webClient });

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
        const relevant = await lt.loadRelevant(
          userIdentifier,
          [
            ...history,
            { role: 'user', content: userMessage, timestamp: Date.now() } as AgentMessage,
          ],
          { complete: null, useLlmSelect: false }
        );
        if (relevant) userMessage = `${relevant}\n\n${userMessage}`;
      } catch {
        // long-term memory must never break a chat turn
      }
    }

    // One-off text completion for summarize / LTM side-queries. Never throws.
    // Routes through the (injectable) streamFn so tests exercise one seam.
    const completer: TextCompleter = async prompt => {
      try {
        const stream = await this.streamFn(
          modelDescriptor,
          { messages: [{ role: 'user', content: prompt, timestamp: Date.now() }] },
          { apiKey, timeoutMs: 60_000, maxRetries: 2 }
        );
        for await (const _event of stream) {
          // drain partial events
        }
        const msg = await stream.result();
        if (msg.stopReason === 'error' || msg.stopReason === 'aborted') return null;
        return assistantTextOf(msg) || null;
      } catch {
        return null;
      }
    };

    // Overall turn deadline + external (client-disconnect) abort. Both feed
    // agent.abort(); the distinction is only needed for error mapping, so a
    // flag remembers the timeout case.
    let timedOut = false;
    let currentAgent: Agent | null = null;
    const timer = setTimeout(() => {
      timedOut = true;
      currentAgent?.abort();
    }, this.turnTimeoutMs);
    const onOuterAbort = () => currentAgent?.abort();
    if (signal) {
      if (signal.aborted) currentAgent?.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    // Usage-based proactive summarize runs at most once per chat turn (shared
    // across the initial run and a reactive retry).
    const summarizeOnce = { done: false };
    const transformContext = async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      let next = microCompact(messages, CONTEXT_MICRO_KEEP);
      next = snipCompact(next, CONTEXT_SNIP_MAX);
      next = next.slice(-MEMORY_MAX_MESSAGES);
      next = sanitizeToolPairing(next);
      if (!summarizeOnce.done && lastReportedTotalTokens(next) > SUMMARIZE_TOKENS) {
        summarizeOnce.done = true;
        const summary = await summarizeHistory(next, completer);
        if (summary) {
          next = sanitizeToolPairing([summary, ...next.slice(-REACTIVE_KEEP_TAIL)]);
        }
      }
      return next;
    };

    await semaphore.acquire();
    let stoppedByBudget = false;
    let newMessages: AgentMessage[] = [];
    try {
      if (signal?.aborted) {
        throw new CopilotError('COPILOT_ABORTED', 'copilot turn aborted', 499);
      }
      let effectiveHistory = history;
      let compacted = false;

      // One agent run over `effectiveHistory`. Populates `newMessages` via the
      // terminal agent_end event. Resolves (not throws) on provider errors —
      // they arrive as a terminal assistant message with stopReason "error".
      const runOnce = async (): Promise<void> => {
        newMessages = [];
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: modelDescriptor,
            tools,
            messages: effectiveHistory,
          },
          // The vendored provider defaults temperature to the provider's own;
          // keep the former ChatOpenAI behaviour (0.7) by pinning it here.
          streamFn: (m, ctx, opts) =>
            this.streamFn(m, ctx, { ...opts, temperature: 0.7 }),
          getApiKey: () => apiKey,
          transformContext,
          toolExecution: 'parallel',
          shouldStopAfterTurn: ({ newMessages: soFar }) => {
            const steps = soFar.filter(m => m.role === 'assistant').length;
            if (steps >= AGENT_STEP_LIMIT) {
              stoppedByBudget = true;
              return true;
            }
            return false;
          },
        });
        currentAgent = agent;
        agent.subscribe(async event => {
          if (event.type === 'agent_end') {
            newMessages = event.messages;
            return;
          }
          if (!onEvent) return;
          if (
            event.type === 'message_update' &&
            event.assistantMessageEvent?.type === 'text_delta'
          ) {
            onEvent({ type: 'text_delta', delta: event.assistantMessageEvent.delta });
          } else if (event.type === 'tool_execution_start') {
            onEvent({
              type: 'tool_start',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
            });
          } else if (event.type === 'tool_execution_end') {
            onEvent({
              type: 'tool_end',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              isError: event.isError,
            });
          }
        });
        await agent.prompt({
          role: 'user',
          content: userMessage,
          timestamp: Date.now(),
        } as AgentMessage);
      };

      await runOnce();

      // Provider failure: encoded in the terminal assistant message.
      let lastAssistant = lastAssistantOf(newMessages);
      if (lastAssistant?.stopReason === 'error' && !compacted && !timedOut && !signal?.aborted) {
        // Reactive compact: on context-too-large, summarize the short-term
        // history and retry the turn once against the compacted form.
        if (isPromptTooLong(lastAssistant.errorMessage)) {
          effectiveHistory = await reactiveCompact(effectiveHistory, completer);
          compacted = true;
          stoppedByBudget = false;
          await runOnce();
          lastAssistant = lastAssistantOf(newMessages);
        }
      }

      if (stoppedByBudget) {
        throw new CopilotError(
          'COPILOT_STEP_LIMIT',
          'Copilot hit its step budget for this turn — please narrow the request or break it into smaller pieces.',
          500
        );
      }
      if (lastAssistant?.stopReason === 'error') {
        throw new CopilotError(
          'COPILOT_UPSTREAM_ERROR',
          lastAssistant.errorMessage || 'model call failed',
          500
        );
      }
      if (lastAssistant?.stopReason === 'aborted' || signal?.aborted || timedOut) {
        if (timedOut) {
          throw timeout(
            'copilot turn timed out — please narrow the request and try again'
          );
        }
        throw new CopilotError('COPILOT_ABORTED', 'copilot turn aborted', 499);
      }

      // Persist the new turn (user prompt + assistant + toolResult messages —
      // agent_end's newMessages covers all of them). After a reactive compact
      // the compacted history must REPLACE the stored one: append() would
      // merge the new turn into the old, still-oversized history and every
      // subsequent turn would prompt_too_long again.
      if (newMessages.length > 0) {
        if (compacted) {
          await this.memoryStore.replace(threadId, [
            ...effectiveHistory,
            ...newMessages,
          ]);
        } else {
          await this.memoryStore.append(threadId, newMessages);
        }
      }
    } finally {
      clearTimeout(timer);
      currentAgent = null;
      if (signal) signal.removeEventListener('abort', onOuterAbort);
      semaphore.release();
    }

    // M3: fire-and-forget long-term extraction + consolidation. Non-blocking
    // and fully swallowed — never affects the response or breaks the caller.
    this._maybePersistLongTermMemory(userIdentifier, newMessages, completer, semaphore);

    return this.mapResult(newMessages, context, conversationId);
  }

  // Background long-term memory persistence (s09 stop-hook pattern). Runs after
  // the response is returned via setImmediate; every error is swallowed.
  // Serialized per user (racing extract/consolidate cycles clobber the memory
  // index) and routed through the same per-key semaphore as foreground turns —
  // background LLM calls previously bypassed it and could push a key past its
  // provider rate limit.
  _maybePersistLongTermMemory(
    userIdentifier: string,
    messages: AgentMessage[],
    completer: TextCompleter,
    semaphore: { acquire(): Promise<void>; release(): void } | null
  ) {
    const lt = LTMEM_ENABLED ? this.longTermMemoryStore : null;
    if (!lt || !completer || !Array.isArray(messages) || messages.length === 0) {
      return;
    }
    setImmediate(async () => {
      try {
        const work = async () => {
          await lt.extractMemories(userIdentifier, messages, completer);
          await lt.consolidate(userIdentifier, completer);
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
  mapResult(messages: AgentMessage[], context: any, conversationId: string) {
    const finalContent = extractTextContent(lastAssistantOf(messages));

    // chat: free-text answer, plus a `patch` block when the model called
    // `submit_patch`. `content` is a SHORT generic intro only — the model's
    // `summary` rides as `patch.title` inside the card (see `toPatchBlock`).
    // Rendering the summary in BOTH `content` and `patch.title` showed it
    // twice in the chat.
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

  async getConversation(userIdentifier: string, conversationId: string) {
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

  buildThreadId(userIdentifier: string, conversationId: string): string {
    return `${userIdentifier}:${conversationId}`;
  }

  async resolveChatModel(userIdentifier: string) {
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

// The most recent assistant message of a run (a turn's terminal state lives
// there; trailing toolResults / the user prompt are not outcomes).
function lastAssistantOf(messages: AgentMessage[]): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'assistant') return m as AssistantMessage;
  }
  return undefined;
}
