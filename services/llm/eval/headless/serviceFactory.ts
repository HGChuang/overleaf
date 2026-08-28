import mongoose from 'mongoose'
import RedisMock from 'ioredis-mock'
import settings from '@overleaf/settings'
import redis from '../../config/redis.js'
import { CopilotService } from '../../app/services/copilot.service.js'
import { RedisMemoryStore } from '../../app/agent/memory.js'
import { buildUnifiedSystemPrompt } from '../../app/agent/prompts.js'
import { ClientRegistry } from '../../app/utils/clientRegistry.js'
import { buildToolPool } from '../../app/agent/tools/provider.js'
import { createChatModel } from '../../app/llm/modelFactory.js'
import { streamOpenAICompat } from '../../app/llm/openaiCompatStream.js'
import { CanonicalTraceWriter, hashValue } from './canonicalTrace.js'
import type { EvalFile } from './evalContext.js'
import { tracedCompile, type TraceContextAccess } from './tracedCompile.js'
import { connectEvalDatabase } from './evalDatabase.js'

export interface UsageRecord {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
}

export interface RuntimeTraceHooks {
  trace: CanonicalTraceWriter
  context: TraceContextAccess
  runDir: string
  nextCompileOrdinal(): number
}

export function emptyUsage(): UsageRecord {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }
}

export function evalRuntimeConfig() {
  return {
    agent_step_limit: Number(settings.COPILOT_AGENT_RECURSION_LIMIT),
    turn_timeout_ms: Number(settings.COPILOT_TURN_TIMEOUT_MS || 300_000),
    memory_max_messages: Number(settings.LLM_MEMORY_MAX_MESSAGES || 20),
    context_snip_max: Number(settings.COPILOT_CONTEXT_SNIP_MAX || 50),
    context_micro_keep: Number(settings.COPILOT_CONTEXT_MICRO_KEEP || 3),
    temperature: 0.7,
    provider_max_retries: 2,
    harness_max_chat_turns: 3,
    patch_policy: 'replacement-only',
    compile_timeout_ms: Number(process.env.EVAL_COMPILE_TIMEOUT_MS || 120_000),
  }
}

export function evalPromptMetadata(context: unknown) {
  const tools = buildToolPool(
    context as never,
    {
      webClient: { compileProject: async () => ({}) },
    } as never
  )
  const toolNames = tools.map((tool) => tool.name)
  const systemPrompt = buildUnifiedSystemPrompt(context, toolNames)
  return { promptHash: hashValue(systemPrompt), toolNames }
}

function addUsage(target: UsageRecord, usage: unknown) {
  if (!usage || typeof usage !== 'object') return
  const source = usage as Record<string, unknown>
  target.input += Number(source.input || 0)
  target.output += Number(source.output || 0)
  target.cacheRead += Number(source.cacheRead || 0)
  target.cacheWrite += Number(source.cacheWrite || 0)
  target.totalTokens +=
    Number(source.input || 0) +
    Number(source.output || 0) +
    Number(source.cacheRead || 0) +
    Number(source.cacheWrite || 0)
}

let databaseReady: Promise<void> | null = null
const registries: ClientRegistry[] = []
const memoryClients: RedisMock[] = []

const noopLongTermMemory = {
  async readIndex() {
    return []
  },
  renderIndexForPrompt() {
    return ''
  },
  async loadRelevant() {
    return ''
  },
  async extractMemories() {
    return []
  },
  async consolidate() {
    return false
  },
}

export async function buildTaskService(
  filesRef: { current: EvalFile[] },
  mainFile: string,
  usage: UsageRecord,
  runtimeTrace: RuntimeTraceHooks
) {
  databaseReady ||= connectEvalDatabase()
  await databaseReady
  const memoryClient = new RedisMock()
  memoryClients.push(memoryClient)
  const memoryStore = new RedisMemoryStore({
    client: memoryClient,
    keyPrefix: `eval:headless:${Date.now().toString(36)}`,
  })
  const registry = new ClientRegistry({
    createChatModel,
    agentOptions: {
      timeout: 60_000,
      keepAlive: true,
      maxSockets: 20,
      retries: 1,
    },
    clientExpireMs: 10 * 60 * 1000,
    maxConcurrentPerKey: 4,
  })
  registries.push(registry)

  const streamFn = (async (
    model: unknown,
    context: unknown,
    options: unknown
  ) => {
    const descriptor = model as Record<string, unknown>
    const turnId = runtimeTrace.context.getTurnId()
    const started = runtimeTrace.trace.emit({
      event_type: 'model_started',
      parent_event_id: runtimeTrace.context.getParentEventId(),
      turn_id: turnId,
      summary: {
        model: descriptor.id,
        provider: descriptor.provider,
        api: descriptor.api,
      },
    })
    runtimeTrace.context.setParentEventId(started.eventId)
    await started.committed

    const stream = streamOpenAICompat(
      model as never,
      context as never,
      options as never
    )
    Promise.resolve(stream)
      .then((result) => result.result())
      .then((message) => {
        addUsage(usage, message?.usage)
        const completed = runtimeTrace.trace.emit({
          event_type: 'model_completed',
          parent_event_id: started.eventId,
          turn_id: turnId,
          status:
            message?.stopReason === 'error' || message?.stopReason === 'aborted'
              ? 'error'
              : 'ok',
          summary: {
            model: message?.model,
            response_model: message?.responseModel,
            response_id: message?.responseId,
            stop_reason: message?.stopReason,
            error_message: message?.errorMessage,
            usage: message?.usage,
          },
        })
        runtimeTrace.context.setParentEventId(completed.eventId)
        return completed.committed
      })
      .catch((error) => {
        const completed = runtimeTrace.trace.emit({
          event_type: 'model_completed',
          parent_event_id: started.eventId,
          turn_id: turnId,
          status: 'error',
          summary: {
            failure_category: 'model',
            error_type: 'MODEL_PROVIDER_ERROR',
            error_message:
              error instanceof Error ? error.message : String(error),
          },
        })
        runtimeTrace.context.setParentEventId(completed.eventId)
        return completed.committed
      })
    return stream
  }) as never

  const compileProject = () =>
    tracedCompile({
      files: filesRef.current,
      mainFile,
      purpose: 'agent_verification',
      ordinal: runtimeTrace.nextCompileOrdinal(),
      runDir: runtimeTrace.runDir,
      trace: runtimeTrace.trace,
      context: runtimeTrace.context,
    }).then((outcome) => outcome.result)

  const service = new CopilotService({
    clientRegistry: registry,
    memoryStore,
    longTermMemoryStore: noopLongTermMemory,
    streamFn,
    toolPoolFactory: ((context: unknown, dependencies: unknown) =>
      buildToolPool(context as never, dependencies as never)) as never,
    webClient: { compileProject } as never,
  })
  return {
    service,
    memoryStore,
    async resolveModelMetadata(userIdentifier: string) {
      const { usingLlmInfo, model } =
        await service.resolveChatModel(userIdentifier)
      const descriptor = createChatModel({
        baseUrl: usingLlmInfo.baseUrl,
        modelId: model.id,
      })
      return {
        id: descriptor.id,
        provider: descriptor.provider,
        api: descriptor.api,
        max_tokens: descriptor.maxTokens,
        context_window: descriptor.contextWindow,
        base_url_hash: hashValue(usingLlmInfo.baseUrl),
      }
    },
  }
}

export async function shutdownEval() {
  for (const registry of registries.splice(0)) registry.close()
  for (const client of memoryClients.splice(0)) client.disconnect()
  redis.disconnect()
  await mongoose.disconnect()
}
