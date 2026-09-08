import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AssistantMessageEventStream } from '../app/agent/core/event-stream.js';
import { EMPTY_USAGE } from '../app/agent/core/llm-types.js';
import { CopilotService } from '../app/services/copilot.service.js';
import { ContextService } from '../app/services/context.service.js';
import { Semaphore } from '../app/utils/Semaphore.js';
import { hashMessages } from '../app/agent/context/paper-state.js';
import redis from '../config/redis.js';

// A legacy import creates Redis eagerly; Copilot's tested journal uses Mongo.
// Close this unused handle instead of masking leaked handles with forced exit.
redis.disconnect();

export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const userId = 'a'.repeat(24);
export const projectId = 'b'.repeat(24);
export const model: any = { id: 'l0-script', provider: 'openai', api: 'openai-completions',
  baseUrl: 'http://127.0.0.1:1', contextWindow: 200000, maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { protocol: 'chat-completions' } };
export const call = (id: string, name: string, args: any = {}) => ({ type: 'toolCall', id, name, arguments: args });
export function assistant(content: any[] = [{ type: 'text', text: 'done' }], stopReason = 'stop') : any {
  return { role: 'assistant', content, stopReason, timestamp: 0, api: model.api, provider: model.provider,
    model: model.id, usage: structuredClone(EMPTY_USAGE) };
}
export function scripted(steps: any[]) {
  const requests: any[] = [];
  const streamFn: any = async (m: any, context: any, options: any) => {
    options?.signal?.throwIfAborted();
    requests.push(structuredClone({ messages: context.messages, systemPrompt: context.systemPrompt }));
    assert.ok(steps.length, 'Unexpected extra model request');
    const step = steps.shift();
    const value = typeof step === 'function' ? await step(context, options) : step;
    const stream = new AssistantMessageEventStream();
    if (value.stopReason === 'error' || value.stopReason === 'aborted') stream.push({ type: 'error', reason: value.stopReason, error: value });
    else stream.push({ type: 'done', reason: value.stopReason, message: value });
    return stream;
  };
  return { streamFn, requests };
}

// Strict request-local fake: durable intents precede receipts; scope and
// message copies are retained across chat calls. Real transactions/leases are
// tested separately against isolated Mongo, not simulated by this class.
export class JournalFake {
  sessions = new Map<string, any>();
  async open(scope: any) {
    const key = `${scope.userId}:${scope.conversationId}`;
    let state = this.sessions.get(key);
    if (state) {
      assert.equal(state.scope.projectId, scope.projectId, 'scope mismatch');
      assert.equal(state.busy, false, 'conversation busy');
    } else {
      state = { scope, messages: [], receipts: new Map(), busy: false };
      this.sessions.set(key, state);
    }
    state.busy = true;
    const receiptKey = (id: string, before = state.messages.length) => {
      const index = state.messages.findLastIndex((m: any, i: number) => i < before && m.role === 'assistant' && m.content.some((b: any) => b.type === 'toolCall' && b.id === id));
      assert.ok(index >= 0, 'missing durable intent');
      return `${index}:${id}`;
    };
    return { messages: state.messages, epoch: state.epoch,
      append: async (m: any) => { assert.ok(state.busy); state.messages.push(structuredClone(m)); },
      recordTool: async (m: any) => { const key = receiptKey(m.toolCallId); assert.ok(!state.receipts.has(key)); state.receipts.set(key, structuredClone(m)); },
      recoverTool: async (id: string, before?: number) => structuredClone(state.receipts.get(receiptKey(id, before)) || null),
      commit: async (epoch: any) => { assert.equal(epoch.coveredHash, hashMessages(state.messages.slice(0, epoch.coveredMessages))); state.epoch = structuredClone(epoch); },
      renew: async () => { assert.ok(state.busy); }, close: async () => { state.busy = false; },
    };
  }
  async readSummary() { return null; }
  async saveSummary() {}
  async deleteSummary() {}
}

export function fixture(steps: any[], overrides: any = {}) {
  const content = 'Hello world.\n';
  const snapshot: any = { id: 'c'.repeat(64), rootDocId: 'd'.repeat(24), assets: [],
    docs: [{ path: 'main.tex', docId: 'd'.repeat(24), version: 1, sha256: hash(content) }] };
  const records: any[] = [];
  const web: any = {
    assertProjectAccess: async () => {}, assertSnapshotCurrent: async () => {},
    readSnapshot: async (_u: string, _p: string, id: string, path?: string) => {
      assert.equal(id, snapshot.id);
      if (!path) return structuredClone(snapshot);
      assert.equal(path, 'main.tex');
      return { ...snapshot.docs[0], content };
    },
    listPatches: async (_u: string, _p: string, conversationId: string) => records.filter(r => r.conversationId === conversationId),
    proposePatch: async (_p: string, payload: any) => {
      assert.equal(payload.snapshotId, snapshot.id);
      records.push(payload);
      return { ...payload, status: 'proposed' };
    },
    compileProject: async (_p: string, _u: string, id: string, _key: string, patchId?: string) => {
      assert.equal(id, snapshot.id);
      return { status: 'success', snapshotId: id, patchId, errorCount: 0, errors: [], warningCount: 0 };
    },
  };
  const journal = new JournalFake();
  const semaphore = new Semaphore(1);
  const script = scripted(steps);
  const service = new CopilotService({ apiKeyMapper: {} as any, contextStore: journal as any,
    clientRegistry: { getChatModel: async () => ({ model, semaphore }) } as any,
    webClient: web, memoryStore: { list: async () => [] } as any,
    contextMetrics: { calibration: async () => ({ p99: 0, samples: 0, completeSamples: 0 }), record: async () => {} } as any,
    streamFn: script.streamFn, ...overrides });
  service.resolveChatModel = async () => ({ usingLlmInfo: { baseUrl: model.baseUrl, apiKey: 'offline' }, model } as any);
  const context = new ContextService().normalizeChatContext({ project: { projectId, sourceSnapshot: { id: snapshot.id } },
    message: { role: 'user', content: 'Change Hello to Greetings.' } });
  return { service, context, web, journal, semaphore, records, snapshot, ...script };
}
export const patchArgs = { hunks: [{ file: 'main.tex', line: 1, oldText: 'Hello', newText: 'Greetings' }] };
