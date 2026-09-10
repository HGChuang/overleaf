import { createHash, randomUUID } from 'crypto';
import settings from '@overleaf/settings';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { createChatModel } from '../llm/modelFactory.js';
import { Agent } from '../agent/core/agent.js';
import type { AgentMessage, StreamFn } from '../agent/core/types.js';
import type { AssistantMessage } from '../agent/core/llm-types.js';
import {
  assistantTextOf,
} from '../llm/openaiCompatStream.js';
import { countNativeInput, streamConfiguredModel } from '../llm/nativeStream.js';
import { buildUnifiedSystemPrompt } from '../agent/prompts.js';
import { extractTextContent } from '../agent/messageText.js';
import { buildToolPool } from '../agent/tools/index.js';
import { WebApiClient } from '../llm/webApiClient.js';
import { isPromptTooLong } from '../agent/recovery.js';
import { ConversationService } from './conversation.service.js';
import { ContextManager } from '../agent/context/context-manager.js';
import { cacheRoutingKey } from '../agent/context/cache-policy.js';
import { withHistorySourceLookup } from '../agent/context/history-source-lookup.js';
import { ContextStore, type ContextSession } from '../agent/context/context-store.js';
import { inputBudget, requestTokens } from '../agent/context/budget.js';
import { ContextCapacityError, type ContextEvent } from '../agent/context/types.js';
import { ContextMetrics } from '../agent/context/context-metrics.js';
import { validateSummary } from '../agent/context/paper-state.js';
import { PaperMemoryStore } from '../agent/context/memory-store.js';
import { defineTool } from '../agent/tools/baseTool.js';
import {
  extractSubmittedPatch,
  computeRejectedSubmitPatchIds,
  patchIntroContent,
  toPatchBlock,
} from '../agent/patchBlocks.js';
import { ClientRegistry } from '../utils/clientRegistry.js';
import { badRequest, CopilotError, timeout } from '../utils/errors.js';

// Per-turn budget of assistant steps (model responses, incl. tool-calling
// ones). The vendored loop has no built-in recursion limit, so the budget is
// enforced via shouldStopAfterTurn. The value comes from settings as-is — do
// NOT add an `|| N` fallback here: settings.defaults.cjs always defines it,
// so a fallback is dead code that only pretends the value lives here (F31:
// editing such a fallback changed nothing and voided an eval iteration).
// Exported so the eval harness can record the resolved value in run.json.
export const AGENT_STEP_LIMIT = Number(settings.COPILOT_AGENT_RECURSION_LIMIT);
// Hard wall-clock budget for ONE chat turn (all agent steps + queueing). The
// per-CALL model timeout (60s) bounds a single step; without an overall
// deadline a 25-step turn can burn ~25 minutes after the client has long
// given up. 120s comfortably fits the diagnose-all-errors flow.
// Generous default: a verification round includes a full LaTeX compile
// (compile_project tool timeout is 150s) plus model time.
const TURN_TIMEOUT_MS = Number(settings.COPILOT_TURN_TIMEOUT_MS || 300_000);

// Events forwarded to SSE clients mid-turn. `done`/`error` are sent by the
// controller once the turn settles, not through this channel. tool_start /
// tool_end carry compact I/O previews (args / resultSummary) so the frontend
// can render the agent workflow Claude Code-style (step list); raw args and
// results stay server-side.
export type CopilotStreamEvent = ContextEvent
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args?: Record<string, unknown> }
  | { type: 'tool_end'; toolCallId: string; toolName: string; isError: boolean; resultSummary?: string };

// Caps for the tool I/O previews shipped to the browser. Args are flattened
// to a shallow object with per-value caps (submit_patch hunks can be large);
// results reduce to their text content, one line, capped.
const TOOL_ARG_MAX_KEYS = 6;
const TOOL_ARG_VALUE_CHARS = 160;
const TOOL_RESULT_PREVIEW_CHARS = 500;

function summarizeToolArgs(args: unknown): Record<string, unknown> | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>).slice(0, TOOL_ARG_MAX_KEYS)) {
    if (typeof value === 'string') {
      out[key] = value.length > TOOL_ARG_VALUE_CHARS ? `${value.slice(0, TOOL_ARG_VALUE_CHARS)}…` : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value != null) {
      try {
        const json = JSON.stringify(value);
        if (json) out[key] = json.length > TOOL_ARG_VALUE_CHARS ? `${json.slice(0, TOOL_ARG_VALUE_CHARS)}…` : json;
      } catch {
        // unstringifiable value — skip the key
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function summarizeToolResult(result: any): string | undefined {
  const content = result?.content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((c: any) => (c?.type === 'text' && typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > TOOL_RESULT_PREVIEW_CHARS ? `${text.slice(0, TOOL_RESULT_PREVIEW_CHARS)}…` : text;
}

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

function summaryCacheKey(scope: { user: string; project: string; conversation: string }, model: any,
  system: string, tools: unknown[], messages: AgentMessage[], instruction: string) {
  return createHash('sha256').update(JSON.stringify(['paper-summary-v1', scope, model.baseUrl,
    model.id, model.compat?.profileVersion || '1', system, tools, messages, instruction])).digest('hex');
}

// Intent-specific user message payload. Project *paths* (not full contents) —
// the model reads source via the read_file / read_file_fragment tools.
function paperProjectShell(project: any = {}) {
  return {
    projectId: project.projectId,
    rootDocId: project.rootDocId,
    fileList: project.fileList || [],
    outline: project.outline || [],
    sourceManifest: (project.files || []).map((file: any) => ({
      path: file.path,
      docId: file.docId,
      version: file.version,
      sha256: file.sha256 || createHash('sha256').update(file.content || '').digest('hex'),
    })).sort((a: any, b: any) => a.path.localeCompare(b.path)),
    sourceSnapshot: project.sourceSnapshot ? {
      id: project.sourceSnapshot.id,
      treeVersion: project.sourceSnapshot.treeVersion,
      configVersion: project.sourceSnapshot.configVersion,
      compiler: project.sourceSnapshot.compiler,
      imageName: project.sourceSnapshot.imageName,
      assets: project.sourceSnapshot.assets,
      assetBytesFrozen: project.sourceSnapshot.assetBytesFrozen,
    } : null,
    sourceConsistency: project.sourceSnapshot?.consistency || 'request-local file content; not an atomic project snapshot',
    confirmedMemories: project.confirmedMemories || [],
    patchRecords: project.patchRecords || [],
  };
}

function projectStateFromMessages(messages: AgentMessage[]) {
  let project: any = null;
  for (const message of messages) {
    if (message.role !== 'user') continue;
    try {
      const envelope = JSON.parse(extractTextContent(message));
      if (envelope.PROJECT && typeof envelope.PROJECT === 'object') project = envelope.PROJECT;
      if (project && envelope.PROJECT_DELTA && typeof envelope.PROJECT_DELTA === 'object') {
        project = { ...project, ...envelope.PROJECT_DELTA };
      }
    } catch { /* legacy plain message */ }
  }
  return project;
}

function projectDelta(current: any, previous: any) {
  if (!previous) return null;
  return Object.fromEntries(Object.entries(current).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(previous[key])));
}

function buildUserMessage(context: any = {}, previousProject?: any) {
  const project = context.project || {};
  const editorAction = context.context?.editorAction;
  if (editorAction?.kind === 'completion') {
    return JSON.stringify(
      {
        LEFT_CONTEXT: editorAction.leftContext,
        RIGHT_CONTEXT: editorAction.rightContext,
        LANGUAGE: editorAction.language,
        MAX_LENGTH: editorAction.maxLength,
        FILE_LIST: project.fileList || [],
        OUTLINE: project.outline || [],
      },
      null,
      2
    );
  }
  if (editorAction?.kind === 'selection') {
    return JSON.stringify(
      {
        USER_QUERY: context.message?.content || '',
        SELECTED_TEXT: context.context?.selectedText || '',
        FILE_LIST: project.fileList || [],
        OUTLINE: project.outline || [],
      },
      null,
      2
    );
  }

  const projectShell = paperProjectShell(project);
  const delta = projectDelta(projectShell, previousProject);

  return JSON.stringify(
    {
      MESSAGE: context.message?.content,
      MESSAGE_KIND: context.message?.origin || 'author',
      CONTEXT: context.context,
      ...(previousProject ? { PROJECT_REF: {
        projectId: projectShell.projectId,
        snapshotId: projectShell.sourceSnapshot?.id || null,
      }, PROJECT_DELTA: delta } : { PROJECT: projectShell }),
    },
    null,
    2
  );
}

export class CopilotService {
  apiKeyMapper: ApiKeyMapper;
  contextStore: ContextStore;
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
  contextMetrics: ContextMetrics;
  memoryStore: PaperMemoryStore;

  constructor({
    apiKeyMapper = new ApiKeyMapper(),
    clientRegistry = undefined,
    contextStore = new ContextStore(),
    toolPoolFactory = buildToolPool,
    turnTimeoutMs = TURN_TIMEOUT_MS,
    streamFn = streamConfiguredModel,
    webClient = undefined,
    contextMetrics = new ContextMetrics(),
    memoryStore = new PaperMemoryStore(),
  }: {
    apiKeyMapper?: ApiKeyMapper;
    clientRegistry?: ClientRegistry;
    contextStore?: ContextStore;
    toolPoolFactory?: typeof buildToolPool;
    turnTimeoutMs?: number;
    streamFn?: StreamFn;
    webClient?: WebApiClient;
    contextMetrics?: ContextMetrics;
    memoryStore?: PaperMemoryStore;
  } = {}) {
    this.apiKeyMapper = apiKeyMapper;
    this.contextStore = contextStore;
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
    this.contextMetrics = contextMetrics;
    this.memoryStore = memoryStore;
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
    { signal, onEvent, requestId = randomUUID() }: { signal?: AbortSignal; onEvent?: (e: CopilotStreamEvent) => void; requestId?: string } = {}
  ) {
    const isEditorAction = Boolean(context.context?.editorAction);
    const conversationId = context.conversation?.conversationId || `conv_${randomUUID()}`;
    context.conversation = { ...context.conversation, conversationId };
    const abort = new AbortController();
    let semaphore: { acquire(signal?: AbortSignal): Promise<void>; release(): void } | undefined;
    let timedOut = false;
    let currentAgent: Agent | undefined;
    let session: ContextSession | undefined;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let leaseError: unknown;
    let contextError: unknown;
    const onAbort = () => { abort.abort(); currentAgent?.abort(); };
    const turnTimeout = isEditorAction ? 60_000 : this.turnTimeoutMs;
    const timer = setTimeout(() => { timedOut = true; onAbort(); }, turnTimeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    let acquired = false;
    const newMessages: AgentMessage[] = [];
    try {
      abort.signal.throwIfAborted();
      await this.webClient.assertProjectAccess(userIdentifier, context.project?.projectId, abort.signal);
      if (!isEditorAction && !/^[a-f0-9]{64}$/.test(context.project?.sourceSnapshot?.id || '')) {
        throw badRequest('A versioned project snapshot is required for Copilot chat');
      }
      if (!isEditorAction && context.project.sourceSnapshot?.id) {
        const snapshot = await this.webClient.readSnapshot(userIdentifier, context.project.projectId, context.project.sourceSnapshot.id, undefined, abort.signal);
        context.project.sourceSnapshot = snapshot;
        context.project.rootDocId = snapshot.rootDocId;
        context.project.fileList = [...snapshot.docs, ...snapshot.assets].map((file: any) => file.path);
        context.project.outline = snapshot.docs.filter((file: any) => file.path.endsWith('.tex')).map((file: any) => file.path);
        context.project.files = snapshot.docs;
      }
      const { usingLlmInfo, model } = await withAbort(this.resolveChatModel(userIdentifier), abort.signal);
      const resolved = await withAbort(this.clientRegistry.getChatModel(usingLlmInfo.baseUrl, usingLlmInfo.apiKey, model.id, {
        contextWindow: model.contextWindow, maxTokens: model.maxTokens,
      }), abort.signal);
      const modelDescriptor = resolved.model;
      const profileId = `${modelDescriptor.baseUrl}|${modelDescriptor.id}|${modelDescriptor.compat?.profileVersion || '1'}`;
      let calibration = { p99: 0, cacheHitRate: 0, samples: 0, completeSamples: 0 };
      try { calibration = await withAbort(this.contextMetrics.calibration(profileId), abort.signal); }
      catch { abort.signal.throwIfAborted(); }
      semaphore = resolved.semaphore;
      const promptCacheKey = cacheRoutingKey(usingLlmInfo.apiKey, {
        endpoint: usingLlmInfo.baseUrl, model: model.id, user: userIdentifier,
        project: context.project?.projectId || '', source: context.context?.editorAction?.kind || 'panel',
      });
      await semaphore.acquire(abort.signal);
      acquired = true;
      abort.signal.throwIfAborted();
      if (!isEditorAction) {
        session = await this.contextStore.open({ userId: userIdentifier,
          projectId: context.project?.projectId, conversationId, source: 'panel' });
        renewal = setInterval(() => {
          session!.renew().catch(error => { leaseError = error; onAbort(); });
        }, 10_000);
        // Legacy Redis histories are intentionally not imported: they have no
        // project binding and cannot safely prove scope. They remain untouched
        // in Redis until their normal TTL expires.
        // A crashed worker may leave calls without results. Close those as
        // UNKNOWN, never replay a possibly completed external action.
        const pending = new Map<string, string>();
        for (const message of session.messages) {
          if (message.role === 'assistant') for (const block of message.content) {
            if (block.type === 'toolCall') pending.set(block.id, block.name);
          }
          if (message.role === 'toolResult') pending.delete(message.toolCallId);
        }
        for (const [toolCallId, toolName] of pending) await session.append(await session.recoverTool?.(toolCallId) || {
          role: 'toolResult', toolCallId, toolName, isError: true, timestamp: Date.now(),
          details: { executionOutcome: 'unknown' },
          content: [{ type: 'text', text: 'Execution outcome unknown after interruption. Verify source/state before taking any action; this is not evidence of success or failure.' }],
        });
      }
      const history = session?.messages || [];
      context.project.confirmedMemories = isEditorAction ? [] : await this.memoryStore
        .list(userIdentifier, context.project.projectId).catch(() => []);
      context.project.patchRecords = isEditorAction ? [] : await this.webClient.listPatches(userIdentifier, context.project.projectId, conversationId, abort.signal);
      const tools = isEditorAction ? [] : this.toolPoolFactory(context, { webClient: this.webClient, userId: userIdentifier,
        loadFile: context.project.sourceSnapshot?.id ? async (path: string) => {
          const file = await this.webClient.readSnapshot(userIdentifier, context.project.projectId, context.project.sourceSnapshot.id, path, abort.signal);
          if (createHash('sha256').update(file.content).digest('hex') !== file.sha256) throw new Error('Snapshot source integrity check failed');
          return file.content as string;
        } : undefined,
        proposeMemory: session ? args => this.memoryStore.propose({ ...args, userId: userIdentifier,
          projectId: context.project.projectId, conversationId, messages: session!.messages }) : undefined,
      });
      if (session) tools.push(withHistorySourceLookup(defineTool({
        name: 'read_context_history',
        description: 'Read exact archived conversation evidence by absolute message index from PAPER_CHECKPOINT. Historical source may be stale; read current project source before editing. Returns a bounded page of text with a continuation offset.',
        parameters: { type: 'object', required: ['message'], properties: {
          message: { type: 'integer', minimum: 0 }, offset: { type: 'integer', minimum: 0 },
        }, additionalProperties: false },
        handler: async ({ message, offset = 0 }) => {
          let value = session!.messages[message];
          if (!value) throw new Error('Archived message not found in this conversation');
          if (value.role === 'toolResult') value = await session!.recoverTool?.(value.toolCallId, message) || value;
          const text = JSON.stringify(value);
          const content = text.slice(offset, offset + 800);
          return JSON.stringify({ message, offset, content, nextOffset: offset + content.length < text.length ? offset + content.length : null, historical: true });
        },
      }), session));
      const systemPrompt = buildUnifiedSystemPrompt(context, tools.map(t => t.name));
      const userMessage = buildUserMessage(context, projectStateFromMessages(history));
      let summaryArtifactKey: string | undefined;
      const manager = session ? new ContextManager({
        system: systemPrompt, tools, window: modelDescriptor.contextWindow, output: modelDescriptor.maxTokens,
        epoch: session.epoch, commit: epoch => session!.commit(epoch), onEvent,
        positiveError: calibration.p99,
        economics: calibration.completeSamples >= 20 ? { rates: modelDescriptor.cost,
          expectedCalls: Math.max(1, Math.min(8, AGENT_STEP_LIMIT)), cacheHitRate: calibration.cacheHitRate } : undefined,
        summarize: async ({ messages, instruction, boundary, warm }) => {
          const cacheKey = summaryCacheKey({ user: userIdentifier, project: context.project.projectId,
            conversation: conversationId }, modelDescriptor, systemPrompt, tools, messages, instruction);
          summaryArtifactKey = cacheKey;
          const cached = await this.contextStore.readSummary(cacheKey);
          if (cached) {
            try { validateSummary(cached, session!.messages, boundary); return cached; }
            catch { await this.contextStore.deleteSummary(cacheKey); }
          }
          const summaryStarted = Date.now();
          const stream = await this.streamFn(modelDescriptor, {
            systemPrompt, tools, messages: [...messages, { role: 'user', content: instruction, timestamp: 0 }],
          }, { apiKey: usingLlmInfo.apiKey, promptCacheKey, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45_000)]),
            maxTokens: 4096, maxRetries: 0, timeoutMs: 45_000 });
          for await (const _event of stream) { /* No tool executor in a summary call. */ }
          const result = await stream.result();
          await this.contextMetrics.record({ requestId: `${requestId}:summary:${boundary}`,
            runId: requestId, userId: userIdentifier, projectId: context.project.projectId,
            conversationId, model: modelDescriptor, epoch: manager?.generation() || 0,
            prefixHash: manager?.prefixHash(), estimatedInput: requestTokens(systemPrompt, tools,
              [...messages, { role: 'user', content: instruction, timestamp: 0 }]),
            usage: result.usage, latencyMs: Date.now() - summaryStarted,
            reason: warm ? 'summary_warm' : 'summary_bounded' }).catch(() => {});
          const summary = result.stopReason === 'stop' ? assistantTextOf(result) : null;
          return summary;
        },
        onSummaryValidated: async summary => {
          if (summaryArtifactKey) await this.contextStore.saveSummary(summaryArtifactKey, summary);
        },
      }) : undefined;
      let stoppedByBudget = false;
      let batchAssistant: AssistantMessage | undefined;
      let batchReservations = 0;
      let estimatedInput = 0;
      let requestStarted = Date.now();
      let firstResponseAt: number | undefined;
      currentAgent = new Agent({
        initialState: { systemPrompt, model: modelDescriptor, tools, messages: [...history] },
        streamFn: (m, ctx, opts) => this.streamFn(m, ctx, {
          ...opts, promptCacheKey, signal: AbortSignal.any([abort.signal, ...(opts?.signal ? [opts.signal] : [])]), temperature: 0.7,
        }),
        getApiKey: () => usingLlmInfo.apiKey,
        transformContext: async (messages) => {
          try {
            abort.signal.throwIfAborted();
            await this.webClient.assertProjectAccess(userIdentifier, context.project.projectId, abort.signal);
            if (context.project.sourceSnapshot?.id) {
              try {
                await this.webClient.assertSnapshotCurrent(userIdentifier, context.project.projectId, context.project.sourceSnapshot.id, abort.signal);
              } catch (error) {
                onEvent?.({ type: 'context_invalidated', reason: error instanceof Error ? error.message : 'Paper source changed' });
                throw error;
              }
            }
            const projected = manager ? await manager.prepare(session!.messages) : messages;
            estimatedInput = requestTokens(systemPrompt, tools, projected);
            if (estimatedInput > inputBudget(modelDescriptor.contextWindow, modelDescriptor.maxTokens, calibration.p99) * 0.7) {
              const counted = await countNativeInput(modelDescriptor, { systemPrompt, tools, messages: projected }, {
                apiKey: usingLlmInfo.apiKey, signal: abort.signal,
              });
              if (counted !== null) estimatedInput = counted;
            }
            requestStarted = Date.now();
            firstResponseAt = undefined;
            if (!manager && estimatedInput > inputBudget(modelDescriptor.contextWindow, modelDescriptor.maxTokens, calibration.p99)) {
              throw new ContextCapacityError();
            }
            // Provider error envelopes are audit records, not model output to
            // replay. Successful content and reasoning signatures stay intact.
            return projected.filter(m => m.role !== 'assistant' || (m.stopReason !== 'error' && m.stopReason !== 'aborted') || m.content.some(b => b.type === 'toolCall'));
          } catch (error) { contextError = error; throw error; }
        },
        beforeToolCall: async ({ assistantMessage }) => {
          abort.signal.throwIfAborted();
          if (leaseError) throw leaseError;
          await this.webClient.assertProjectAccess(userIdentifier, context.project.projectId, abort.signal);
          if (context.project.sourceSnapshot?.id) {
            await this.webClient.assertSnapshotCurrent(userIdentifier, context.project.projectId, context.project.sourceSnapshot.id, abort.signal);
          }
          if (batchAssistant !== assistantMessage) { batchAssistant = assistantMessage; batchReservations = 0; }
          if (batchReservations >= 3) return { block: true, reason: 'This batch reached its 12288-token evidence budget. Request additional evidence in the next step.' };
          batchReservations++;
          return {};
        },
        afterToolCall: async ({ assistantMessage, toolCall, result, isError }) => {
          try {
            if (session?.recordTool) await session.recordTool({
              role: 'toolResult', toolCallId: toolCall.id, toolName: toolCall.name,
              content: result.content, details: result.details, isError, timestamp: Date.now(),
            });
          } catch (error) { contextError = error; onAbort(); throw error; }
          const resultTokens = result.content.reduce((n, block) => n + 16 + Buffer.byteLength(block.type === 'text' ? block.text : block.data), 0);
          if (session?.recordTool && resultTokens > 4096) {
            const intentIndex = session.messages.findLastIndex(m => m.role === 'assistant' && m.content.some(b => b.type === 'toolCall' && b.id === toolCall.id));
            const callIndex = assistantMessage.content.filter(b => b.type === 'toolCall').findIndex(b => b.id === toolCall.id);
            // Original bytes are in the durable receipt. Only the model view
            // is bounded; no loss of exact source or completed action results.
            return { content: [{ type: 'text', text: JSON.stringify({
              archived: true, resultMessage: intentIndex + callIndex + 1,
              note: 'Result exceeds the per-tool budget. Read this tool result by its absolute message index with read_context_history; do not infer its contents.',
            }) }] };
          }
          return {};
        },
        toolExecution: 'parallel',
        shouldStopAfterTurn: ({ message, toolResults }) => {
          const needsNextStep = message.content.some(block => block.type === 'toolCall') &&
            !toolResults.some(result => result.details?.dryRunRejected === true || result.details?.executionOutcome === 'unknown');
          if (needsNextStep && newMessages.filter(m => m.role === 'assistant').length >= AGENT_STEP_LIMIT) {
            stoppedByBudget = true;
            return true;
          }
          return false;
        },
      });
      currentAgent.subscribe(async event => {
        if (event.type === 'message_end') {
          // Await durability BEFORE tool dispatch or the next provider call.
          // agent_end alone misses work when an exception/abort interrupts a run.
          // Once a journal write fails, the loop's synthetic error must not be
          // inserted inside the still-open tool group. Recovery closes that
          // group from its durable receipt (or UNKNOWN) on the next request.
          if (contextError) throw contextError;
          try { if (session) await session.append(event.message); }
          catch (error) { contextError = error; onAbort(); throw error; }
          newMessages.push(event.message);
          if (event.message.role === 'assistant') await this.contextMetrics.record({
            requestId: `${requestId}:${newMessages.filter(message => message.role === 'assistant').length}`,
            runId: requestId, userId: userIdentifier, projectId: context.project.projectId,
            conversationId, model: modelDescriptor, epoch: manager?.generation() || 0,
            prefixHash: manager?.prefixHash(), estimatedInput, usage: event.message.usage,
            latencyMs: Date.now() - requestStarted,
            ttftMs: firstResponseAt === undefined ? undefined : firstResponseAt - requestStarted,
            reason: manager?.compactionReason(),
          }).catch(() => {});
        }
        if (event.type === 'message_update' && firstResponseAt === undefined) firstResponseAt = Date.now();
        if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          onEvent?.({ type: 'text_delta', delta: event.assistantMessageEvent.delta });
        } else if (event.type === 'tool_execution_start') {
          onEvent?.({ type: 'tool_start', toolCallId: event.toolCallId, toolName: event.toolName, args: summarizeToolArgs(event.args) });
        } else if (event.type === 'tool_execution_end') {
          onEvent?.({ type: 'tool_end', toolCallId: event.toolCallId, toolName: event.toolName,
            isError: event.isError || (event.result as any)?.details?.dryRunRejected === true,
            resultSummary: summarizeToolResult(event.result) });
        }
      });
      await currentAgent.prompt({ role: 'user', content: userMessage, timestamp: Date.now() });
      let lastAssistant = lastAssistantOf(newMessages);
      if (manager && lastAssistant?.stopReason === 'error' && isPromptTooLong(lastAssistant.errorMessage) && !abort.signal.aborted && !contextError) {
        // Compact the ACTUAL failed request including this turn's completed
        // tools. Resume at its last tool/user message; never replay the prompt.
        await manager.prepare(session!.messages, true);
        currentAgent.state.messages = currentAgent.state.messages.slice(0, -1);
        await currentAgent.continue();
        lastAssistant = lastAssistantOf(newMessages);
      }
      if (leaseError) throw leaseError;
      if (contextError) throw contextError;
      if (timedOut) throw timeout('copilot turn timed out — please narrow the request and try again');
      if (abort.signal.aborted || lastAssistant?.stopReason === 'aborted') throw new CopilotError('COPILOT_ABORTED', 'copilot turn aborted', 499);
      if (stoppedByBudget) throw new CopilotError('COPILOT_STEP_LIMIT', 'Copilot hit its step budget; unfinished work is retained.', 500);
      if (lastAssistant?.stopReason === 'length') throw new CopilotError('COPILOT_OUTPUT_LIMIT', 'Copilot output was truncated; unfinished work is retained.', 500);
      if (lastAssistant?.stopReason === 'error') throw new CopilotError('COPILOT_UPSTREAM_ERROR', lastAssistant.errorMessage || 'model call failed', 500);
      return this.mapResult(newMessages, context, conversationId);
    } catch (error) {
      if (timedOut) throw timeout('copilot turn timed out — please narrow the request and try again');
      if (signal?.aborted) throw new CopilotError('COPILOT_ABORTED', 'copilot turn aborted', 499);
      throw error;
    } finally {
      clearTimeout(timer);
      if (renewal) clearInterval(renewal);
      signal?.removeEventListener('abort', onAbort);
      try { await session?.close(); } finally { if (acquired) semaphore.release(); }
    }
  }

  // Map the agent's message list into the unified response envelope. A
  // `patch` block is emitted when the model called `submit_patch` (a
  // structured edit proposal the frontend renders as an inline-diff ghost
  // preview with Accept/Reject); otherwise the free-text answer rides as
  // message.content.
  mapResult(messages: AgentMessage[], context: any, conversationId: string) {
    const finalContent = extractTextContent(lastAssistantOf(messages));
    if (messages.some(message => message.role === 'toolResult' && message.details?.executionOutcome === 'unknown')) {
      return {
        conversationId,
        message: createMessageResponse('操作结果尚未确认，不能据此断言补丁提交或编译成功。已保留进度并停止自动重试，请先核实项目中的补丁和验证记录。'),
        suggestedActions: [],
      };
    }

    // Preserve a post-verification explanation when present. If the model only
    // repeats the patch title, use the short generic intro to avoid duplication.
    const patchRaw = extractSubmittedPatch(messages, computeRejectedSubmitPatchIds(messages));
    if (patchRaw) {
      const patch = toPatchBlock(patchRaw, 0);
      if (patch) {
        return {
          conversationId,
          message: createMessageResponse(finalContent && finalContent.trim() !== patch.title.trim()
            ? finalContent : patchIntroContent(patch.hunks.length), [
            { type: 'patch', patch },
          ]),
          suggestedActions: [],
        };
      }
    }

    // R1: the turn ended on the 3rd consecutive dry-run rejection — the
    // terminate cut the turn before the model could say anything, so
    // `finalContent` is empty or a stale "let me resubmit". Synthesize the
    // user-facing closure server-side instead of showing nothing.
    const terminatingRejection = [...messages].reverse().find(
      m =>
        m?.role === 'toolResult' &&
        (m as { toolName?: string }).toolName === 'submit_patch' &&
        ((m as { details?: Record<string, unknown> }).details?.dryRunRejected === true)
    );
    if (terminatingRejection) {
      const body = extractTextContent(terminatingRejection);
      const firstProblem =
        body
          .split('\n')
          .map(l => l.trim())
          .find(l => l.startsWith('hunk ')) ||
        body.split('\n')[0] ||
        '';
      const clipped = firstProblem.length > 200 ? `${firstProblem.slice(0, 200)}…` : firstProblem;
      const content =
        `补丁连续几次都没能服务端校验通过，这次就没有改动被提交。` +
        (clipped ? `最后一次的问题：${clipped}。` : '') +
        `你可以把相关源码片段贴给我，我照着原文再试一次。`;
      return {
        conversationId,
        message: createMessageResponse(content),
        suggestedActions: [],
      };
    }

    return {
      conversationId,
      message: createMessageResponse(finalContent),
      suggestedActions: [],
    };
  }

  async getConversation(userIdentifier: string, conversationId: string, projectId: string) {
    return new ConversationService(this.contextStore, this.webClient).getConversation(userIdentifier, conversationId, projectId);
  }

  async compact(userIdentifier: string, conversationId: string, projectId: string) {
    await this.webClient.assertProjectAccess(userIdentifier, projectId);
    const session = await this.contextStore.open({ userId: userIdentifier, projectId, conversationId, source: 'panel' });
    const leaseAbort = new AbortController();
    const renewal = setInterval(() => {
      session.renew().catch(error => leaseAbort.abort(error));
    }, 10_000);
    try {
      const latest = [...session.messages].reverse().find(message => message.role === 'user');
      if (!latest) throw badRequest('conversation has no messages to compact');
      let project: any = { projectId, files: [], fileList: [], outline: [],
        ...projectStateFromMessages(session.messages) };
      if (project.sourceSnapshot?.id) {
        const snapshot = await this.webClient.readSnapshot(userIdentifier, projectId, project.sourceSnapshot.id);
        project.sourceSnapshot = snapshot;
        project.rootDocId = snapshot.rootDocId;
        project.fileList = [...snapshot.docs, ...snapshot.assets].map((file: any) => file.path);
        project.outline = snapshot.docs.filter((file: any) => file.path.endsWith('.tex')).map((file: any) => file.path);
        project.files = snapshot.docs;
      }
      project.confirmedMemories = await this.memoryStore.list(userIdentifier, projectId).catch(() => []);
      project.patchRecords = await this.webClient.listPatches(userIdentifier, projectId, conversationId);
      const context = { conversation: { conversationId, source: 'panel' }, project, context: {} };
      const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
      const { model: descriptor } = await this.clientRegistry.getChatModel(usingLlmInfo.baseUrl, usingLlmInfo.apiKey, model.id, {
        contextWindow: model.contextWindow, maxTokens: model.maxTokens,
      });
      const promptCacheKey = cacheRoutingKey(usingLlmInfo.apiKey, { endpoint: usingLlmInfo.baseUrl,
        model: model.id, user: userIdentifier, project: projectId, source: 'panel' });
      const tools = this.toolPoolFactory(context, { webClient: this.webClient, userId: userIdentifier,
        loadFile: project.sourceSnapshot?.id ? async (path: string) => {
          const file = await this.webClient.readSnapshot(userIdentifier, projectId, project.sourceSnapshot.id, path);
          if (createHash('sha256').update(file.content).digest('hex') !== file.sha256) throw new Error('Snapshot source integrity check failed');
          return file.content as string;
        } : undefined,
        proposeMemory: async () => { throw new Error('Memory proposals are unavailable during manual compaction'); },
      });
      const system = buildUnifiedSystemPrompt(context, tools.map(tool => tool.name));
      let summaryArtifactKey: string | undefined;
      const compactRequestId = randomUUID();
      const manager = new ContextManager({ system, tools, window: descriptor.contextWindow,
        output: descriptor.maxTokens, epoch: session.epoch, commit: async epoch => {
          leaseAbort.signal.throwIfAborted();
          await session.commit(epoch);
        },
        summarize: async ({ messages, instruction, boundary, warm }) => {
          const cacheKey = summaryCacheKey({ user: userIdentifier, project: projectId,
            conversation: conversationId }, descriptor, system, tools, messages, instruction);
          summaryArtifactKey = cacheKey;
          const cached = await this.contextStore.readSummary(cacheKey);
          if (cached) {
            try { validateSummary(cached, session.messages, boundary); return cached; }
            catch { await this.contextStore.deleteSummary(cacheKey); }
          }
          const summaryStarted = Date.now();
          const response = await this.streamFn(descriptor, { systemPrompt: system, tools,
            messages: [...messages, { role: 'user', content: instruction, timestamp: 0 }] },
          { apiKey: usingLlmInfo.apiKey, promptCacheKey, maxTokens: 4096, timeoutMs: 45_000, maxRetries: 0,
            signal: AbortSignal.any([leaseAbort.signal, AbortSignal.timeout(45_000)]) });
          for await (const _ of response) { /* summary has no executor */ }
          const result = await response.result();
          await this.contextMetrics.record({ requestId: `${compactRequestId}:summary:${boundary}`,
            runId: compactRequestId, userId: userIdentifier, projectId, conversationId,
            model: descriptor, epoch: manager.generation(), prefixHash: manager.prefixHash(),
            estimatedInput: requestTokens(system, tools,
              [...messages, { role: 'user', content: instruction, timestamp: 0 }]),
            usage: result.usage, latencyMs: Date.now() - summaryStarted,
            reason: warm ? 'summary_warm' : 'summary_bounded' }).catch(() => {});
          const summary = result.stopReason === 'stop' ? assistantTextOf(result) : null;
          return summary;
        }, onSummaryValidated: async summary => {
          if (summaryArtifactKey) await this.contextStore.saveSummary(summaryArtifactKey, summary);
        } });
      const projected = await manager.prepare(session.messages, 'manual');
      leaseAbort.signal.throwIfAborted();
      const diagnostics = await this.contextStore.diagnostics(userIdentifier, conversationId, projectId);
      return { generation: diagnostics?.generation || 0, projectedMessages: projected.length,
        coveredThroughSeq: diagnostics?.coveredThroughSeq ?? -1 };
    } finally { clearInterval(renewal); await session.close(); }
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

// Bound read-only setup work too; cancellation must include model lookup and
// queueing, not begin only after the first provider call has started.
async function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let cancel: () => void;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', cancel!); }
}
