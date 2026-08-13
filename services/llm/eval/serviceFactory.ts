// Per-task CopilotService factory: the full production stack with exactly
// three boundaries substituted.
//
//   REAL: agent loop, tool pool, provider stream (mongo-configured GLM/DeepSeek),
//         RedisMemoryStore compaction pipeline (on ioredis-mock)
//   STUB: apiKeyMapper (replays the mongo llminfo doc from creds.ts)
//         webClient   (compileProject → clsi against the CURRENT in-memory files)
//         longTermMemoryStore (no-op: task isolation + zero extra cost)
//
// Every task gets a FRESH memory store and conversation — no state leaks
// between tasks or trials (the Anthropic eval article's isolation rule).

import mongoose from 'mongoose';
import RedisMock from 'ioredis-mock';
import connectDB from '../config/db.js';
import { CopilotService } from '../app/services/copilot.service.js';
import { RedisMemoryStore } from '../app/agent/memory.js';
import { ClientRegistry } from '../app/utils/clientRegistry.js';
import { createChatModel } from '../app/llm/modelFactory.js';
import { createOpenAICompatModel, streamOpenAICompat } from '../app/llm/openaiCompatStream.js';
import { loadEvalCreds, buildApiKeyMapper, type EvalCreds } from './creds.js';
import { compileFiles } from './compileRunner.js';
import { emptyUsage, wrapStreamFnWithUsageTap, type UsageRecord } from './usageTap.js';
import { buildToolPool } from '../app/agent/tools/provider.js';
import { wrapTool, type RawTraceRecorder } from './rawTrace.js';

let mongoReady: Promise<any> | null = null;
const liveRegistries: ClientRegistry[] = [];

const noopLongTermMemory: any = {
  async readIndex() {
    return [];
  },
  renderIndexForPrompt() {
    return '';
  },
  async loadRelevant() {
    return '';
  },
  async extractMemories() {
    return [];
  },
  async consolidate() {
    return false;
  },
};

export interface TaskService {
  service: CopilotService;
  creds: EvalCreds;
  agentUsage: UsageRecord;
  userIdentifier: string;
  memoryStore: RedisMemoryStore;
}

export async function buildTaskService(
  taskId: string,
  filesRef: { current: { path: string; content: string }[] },
  mainFile: string,
  recorder?: RawTraceRecorder
): Promise<TaskService> {
  if (!mongoReady) mongoReady = connectDB();
  await mongoReady;
  const creds = await loadEvalCreds();

  const agentUsage = emptyUsage();
  const memoryStore = new RedisMemoryStore({
    client: new RedisMock(),
    keyPrefix: `eval:mem:${taskId}:${Date.now().toString(36)}`,
  });
  const clientRegistry = new ClientRegistry({
    createChatModel,
    agentOptions: { timeout: 60_000, keepAlive: true, maxSockets: 200, retries: 1 },
    clientExpireMs: 10 * 60 * 1000,
    maxConcurrentPerKey: 8,
  });

  const service = new CopilotService({
    apiKeyMapper: buildApiKeyMapper(creds) as any,
    clientRegistry,
    memoryStore,
    longTermMemoryStore: noopLongTermMemory,
    // Tap the REAL provider streamFn so every model call lands in agentUsage.
    streamFn: wrapStreamFnWithUsageTap(streamOpenAICompat as any, agentUsage),
    // Raw trace capture (F3): the tool pool is rebuilt per chat() call, so the
    // wrapping factory is the one clean seam for full-fidelity args/results.
    // beginTurn() per build keeps events turn-aligned with the agent loop.
    toolPoolFactory: recorder
      ? (((context: any, deps: any) => {
          recorder.beginTurn();
          const turnRef = { current: recorder.turn };
          return buildToolPool(context, deps).map(t => wrapTool(t, recorder, turnRef));
        }) as typeof buildToolPool)
      : undefined,
    webClient: {
      // The compile_project tool's backend: compile the CURRENT in-memory
      // files (post-patch state), exactly what the user would see on recompile.
      compileProject: async () => compileFiles(filesRef.current, mainFile),
    } as any,
  });

  return { service, creds, agentUsage, userIdentifier: creds.userIdentifier, memoryStore };
}

export async function buildJudgeClient(creds: EvalCreds): Promise<{ model: any; apiKey: string }> {
  const entry = creds.llminfo[creds.usingLlm];
  const modelId = process.env.EVAL_MODEL_ID || entry?.models?.[entry.usingChatModel ?? 0]?.id;
  if (!entry?.baseUrl || !modelId) {
    throw new Error('eval: judge client cannot resolve baseUrl/modelId from llminfo');
  }
  return {
    model: createOpenAICompatModel({ baseUrl: entry.baseUrl, modelId }),
    apiKey: entry.apiKey,
  };
}

// The mongoose connection, registry cleanup timers (and the redis singleton
// imported transitively) keep the event loop alive — the CLI must call this
// and then process.exit().
export async function shutdownEval(): Promise<void> {
  for (const registry of liveRegistries.splice(0)) {
    try {
      registry.close();
    } catch {
      /* ignore */
    }
  }
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
}
