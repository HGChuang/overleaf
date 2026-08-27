import mongoose from 'mongoose'
import RedisMock from 'ioredis-mock'
import connectDatabase from '../../config/db.js'
import { CopilotService } from '../../app/services/copilot.service.js'
import { RedisMemoryStore } from '../../app/agent/memory.js'
import { ClientRegistry } from '../../app/utils/clientRegistry.js'
import { buildToolPool } from '../../app/agent/tools/provider.js'
import { createChatModel } from '../../app/llm/modelFactory.js'
import { streamOpenAICompat } from '../../app/llm/openaiCompatStream.js'
import { compileFiles } from './compileRunner.js'
import type { EvalFile } from './evalContext.js'

export interface UsageRecord {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
}

export function emptyUsage(): UsageRecord {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }
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
  usage: UsageRecord
) {
  databaseReady ||= connectDatabase().then(() => undefined)
  await databaseReady
  const memoryStore = new RedisMemoryStore({
    client: new RedisMock(),
    keyPrefix: `eval:headless:${Date.now().toString(36)}`,
  })
  const registry = new ClientRegistry({
    createChatModel,
    agentOptions: { timeout: 60_000, keepAlive: true, maxSockets: 20, retries: 1 },
    clientExpireMs: 10 * 60 * 1000,
    maxConcurrentPerKey: 4,
  })
  registries.push(registry)

  const streamFn = ((model: unknown, context: unknown, options: unknown) => {
    const stream = streamOpenAICompat(model as never, context as never, options as never)
    Promise.resolve(stream)
      .then(result => result.result())
      .then(message => addUsage(usage, message?.usage))
      .catch(() => {})
    return stream
  }) as never

  const service = new CopilotService({
    clientRegistry: registry,
    memoryStore,
    longTermMemoryStore: noopLongTermMemory,
    streamFn,
    toolPoolFactory: ((context: unknown, dependencies: unknown) =>
      buildToolPool(context as never, dependencies as never)) as never,
    webClient: {
      compileProject: () => compileFiles(filesRef.current, mainFile),
    } as never,
  })
  return { service, memoryStore }
}

export async function shutdownEval() {
  for (const registry of registries.splice(0)) registry.close()
  await mongoose.disconnect()
}
