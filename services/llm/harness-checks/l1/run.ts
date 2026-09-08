import fs from 'node:fs';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import settings from '@overleaf/settings';
import { cases, referenceFiles } from './cases.mjs';
import { checkFiles, checkAnswer, materialize } from './oracle.mjs';
import { compileFiles, startBackend, hash, writeJson } from './backend.js';
import { CopilotService, AGENT_STEP_LIMIT } from '../../app/services/copilot.service.js';
import { ContextService } from '../../app/services/context.service.js';
import { ContextStore } from '../../app/agent/context/context-store.js';
import { completeGroupEnds } from '../../app/agent/context/budget.js';
import { streamConfiguredModel } from '../../app/llm/nativeStream.js';
import { createChatModel } from '../../app/llm/modelFactory.js';
import { Semaphore } from '../../app/utils/Semaphore.js';
import redis from '../../config/redis.js';

redis.disconnect();
const mode = process.env.L1_MODE;
const out = '/output';
const userId = 'a'.repeat(24); // Synthetic user, never the configured account's identity.
const sourceManifest = JSON.parse(fs.readFileSync(`${out}/source-manifest-current.json`, 'utf8'));
const datasetHash = hash(JSON.stringify(cases));
const compilerImage = fs.readFileSync(`${out}/compiler-image.txt`, 'utf8').trim();
const runtimeImage = fs.readFileSync(`${out}/runtime-image.txt`, 'utf8').trim();
let activeDir = out;
let secret = '';
const redact = (value: string) => secret ? value.split(secret).join('[REDACTED]') : value;
function log(kind: string, data: any) {
  fs.mkdirSync(activeDir, { recursive: true });
  fs.appendFileSync(`${activeDir}/events.jsonl`, redact(JSON.stringify({ at: new Date().toISOString(), kind, data })) + '\n');
}
function save(name: string, data: any) {
  writeJson(`${activeDir}/${name}.json`, JSON.parse(redact(JSON.stringify(data))));
}

async function preflight() {
  const rows = [];
  assert.equal(process.env.MONGO_URL, 'mongodb://127.0.0.1:27017/copilot_l1?replicaSet=l1');
  await mongoose.connect(process.env.MONGO_URL!, { serverSelectionTimeoutMS: 10000 });
  const backend = await startBackend(userId, log);
  try {
  for (const c of cases) {
    activeDir = `${out}/preflight/${c.id}`;
    const reference = referenceFiles(c);
    assert.deepEqual(checkFiles(c, reference), [], `${c.id}: reference oracle`);
    const referenceCompile = await compileFiles(reference);
    save('reference-compile', referenceCompile);
    assert.equal(referenceCompile.status, 'success', `${c.id}: feasible solution failed compile`);
    const baselineCompile = await compileFiles(c.files);
    save('baseline-compile', baselineCompile);
    assert.equal(baselineCompile.status, c.baselineCompiles ? 'success' : 'failure', `${c.id}: baseline expectation`);
    let negatives = 0;
    for (const path of Object.keys(reference)) {
      assert.ok(checkFiles(c, { ...reference, [path]: reference[path] + '\n% unrequested change\n' }).length, `${c.id}: protected tail`);
      assert.ok(checkFiles(c, { ...reference, [path]: '' }).length, `${c.id}: file deletion`);
      negatives += 2;
    }
    if (c.outcome === 'proposal') {
      assert.ok(checkFiles(c, c.files).length, `${c.id}: no-op must fail`); negatives++;
      const hunks = c.regions.map(r => ({ file: r.file, oldText: r.before, newText: r.reference }));
      assert.deepEqual(materialize(c.files, hunks), reference);
      const projectId = hash('preflight-' + c.id).slice(0, 24);
      const snapshot = await backend.seed(projectId, c.files);
      await backend.web.assertProjectAccess(userId, projectId);
      await backend.web.assertSnapshotCurrent(userId, projectId, snapshot.id);
      const patchId = 'patch_' + hash('reference-' + c.id).slice(0, 24);
      const proposed = await backend.web.proposePatch(projectId, {
        userId, snapshotId: snapshot.id, patchId, hunks, conversationId: 'preflight-' + c.id,
      });
      assert.equal(proposed.status, 'proposed');
      const verification = await backend.web.compileProject(projectId, userId, snapshot.id, 'preflight', patchId);
      save('controller-compile', verification);
      assert.equal(verification.status, 'success', 'production controller candidate compile');
      assert.equal(verification.errorCount, 0);
      assert.equal(verification.logComplete, true);
    } else {
      assert.ok(checkAnswer(c, '', []).length); negatives++;
      assert.ok(checkAnswer(c, '', [{}]).some(s => s.includes('unexpected proposal'))); negatives++;
    }
    const row = { id: c.id, valid: true, negativeControls: negatives,
      baselineStatus: baselineCompile.status, referenceStatus: referenceCompile.status };
    rows.push(row); save('result', row);
    console.log(`${c.id}: preflight PASS (${negatives} negative controls)`);
  }
  writeJson(`${out}/preflight.json`, { datasetHash, compilerImage, rows, completedAt: new Date().toISOString() });
  } finally { await backend.close(); await mongoose.disconnect(); }
}

async function evaluate() {
  const pre = JSON.parse(fs.readFileSync(`${out}/preflight.json`, 'utf8'));
  assert.equal(pre.datasetHash, datasetHash, 'Preflight dataset changed');
  assert.equal(pre.compilerImage, compilerImage, 'Compiler image changed after preflight');
  assert.equal(pre.rows.filter(r => r.valid).length, cases.length);
  const cfg = JSON.parse(fs.readFileSync('/secrets/model.json', 'utf8'));
  secret = cfg.apiKey;
  assert.ok(secret && /deepseek/i.test(cfg.model.id) && cfg.name === 'huoshan');
  settings.COPILOT_MODEL_PROFILES = fs.readFileSync('/secrets/profiles.json', 'utf8');
  const descriptor = createChatModel({ baseUrl: cfg.baseUrl, modelId: cfg.model.id,
    contextWindow: cfg.model.contextWindow, maxTokens: cfg.model.maxTokens });
  const config = { version: 1, datasetHash, sourceManifest, compilerImage, runtimeImage,
    model: descriptor, providerConfigName: cfg.name, steps: AGENT_STEP_LIMIT,
    turnTimeoutMs: 300000, modelTimeoutMs: 60000, totalTokenCap: null,
    temperature: 0.7, semanticIndex: 'disabled', priceStatus: 'unknown',
    fidelity: 'production agent + HTTP client + Web controllers + Mongo/GridFS; scoped auth + offline latexmk adapter; no full Web/CLSI deployment' };
  const configHash = hash(JSON.stringify(config));
  if (fs.existsSync(`${out}/config.json`)) {
    assert.equal(JSON.parse(fs.readFileSync(`${out}/config.json`, 'utf8')).configHash, configHash,
      'Frozen run configuration changed: use a new run ID and repeat preflight');
  } else writeJson(`${out}/config.json`, { ...config, configHash });
  writeJson(`${out}/dataset.json`, cases);

  // Audit actual HTTP payloads/SSE (including adapter retries/native counting).
  // Header values never enter the trace. API errors are redacted at the sink.
  const nativeFetch = globalThis.fetch;
  const wireTaps: Promise<any>[] = [];
  let wireId = 0;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url || input.toString();
    if (!url.startsWith(cfg.baseUrl.replace(/\/$/, '') + '/')) throw new Error('L1 blocked unconfigured model endpoint');
    const id = ++wireId;
    const directory = activeDir;
    const filename = `${directory}/wire-${id}`;
    const body = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : null;
    writeJson(filename + '-request.json', { url, body: body ? JSON.parse(body) : null, at: new Date().toISOString() });
    log('http_model_start', { id, url });
    const response = await nativeFetch(input, init);
    log('http_model_headers', { id, status: response.status });
    const tap = (async () => {
      try {
        if (response.body) for await (const chunk of response.clone().body as any) fs.appendFileSync(filename + '-response.txt', redact(Buffer.from(chunk).toString('utf8')));
      } catch (error: any) {
        fs.appendFileSync(filename + '-response.txt', '\n' + redact(JSON.stringify({ captureError: error.message })));
      }
    })();
    wireTaps.push(tap);
    return response;
  };
  assert.equal(process.env.MONGO_URL, 'mongodb://127.0.0.1:27017/copilot_l1?replicaSet=l1');
  await mongoose.connect(process.env.MONGO_URL!, { serverSelectionTimeoutMS: 10000 });
  const backend = await startBackend(userId, log);
  const rows: any[] = fs.existsSync(`${out}/results.json`) ? JSON.parse(fs.readFileSync(`${out}/results.json`, 'utf8')) : [];
  const selected = process.env.L1_CASES === 'all' ? cases : cases.filter(c => process.env.L1_CASES!.split(',').includes(c.id));
  assert.ok(selected.length, 'No matching cases');
  try {
    for (const c of selected) {
      activeDir = `${out}/${c.id}`;
      if (fs.existsSync(`${activeDir}/result.json`)) { console.log(`${c.id}: skip completed frozen result`); continue; }
      if (fs.existsSync(`${activeDir}/state.json`)) {
        // Never merge a fresh attempt with a killed run. Receipts/events on
        // disk permit investigation; a new run ID makes remeasurement clear.
        console.log(`${c.id}: interrupted attempt retained; use a new run ID to remeasure`);
        continue;
      }
      save('state', { status: 'running', configHash, startedAt: new Date().toISOString() });
      const started = Date.now();
      const projectId = hash(configHash + c.id).slice(0, 24);
      const snapshot = await backend.seed(projectId, c.files);
      save('snapshot', snapshot);
      const journal = new ContextStore();
      const observedStore: any = Object.create(journal);
      observedStore.open = async (scope: any) => {
        const session = await journal.open(scope);
        log('session_open', scope);
        return { ...session,
          append: async (m: any) => { await session.append(m); log('journal_append', m); },
          recordTool: async (m: any) => { await session.recordTool!(m); log('tool_receipt', m); },
          commit: async (epoch: any) => { await session.commit(epoch); log('context_commit', epoch); },
        };
      };
      let calls = 0;
      const usage: any[] = [];
      const streamFn: any = async (m: any, ctx: any, opts: any) => {
        if (++calls > AGENT_STEP_LIMIT + 4) throw new Error('L1 per-case model-call circuit breaker');
        const callId = calls;
        log('model_request', { callId, model: m, context: ctx,
          options: { temperature: opts?.temperature, maxTokens: opts?.maxTokens ?? m.maxTokens, timeoutMs: opts?.timeoutMs ?? 60000 } });
        const stream = await streamConfiguredModel(m, ctx, opts);
        void stream.result().then(message => {
          usage.push({ callId, ...message.usage, reported: message.usage.totalTokens > 0 });
          log('model_response', { callId, message });
        });
        return stream;
      };
      const service = new CopilotService({ contextStore: observedStore, webClient: backend.web, streamFn,
        clientRegistry: { getChatModel: async () => ({ model: descriptor, semaphore: new Semaphore(1) }) } as any });
      service.resolveChatModel = async () => ({ usingLlmInfo: cfg, model: cfg.model } as any);
      const context = new ContextService().normalizeChatContext({
        project: { projectId, sourceSnapshot: { id: snapshot.id } },
        message: { role: 'user', content: c.prompt },
      });
      let response: any, error: any;
      try { response = await service.chat(userId, context, { onEvent: event => log('service_event', event) }); }
      catch (e: any) { error = { code: e.code || null, message: e.message }; }
      save('response', { response: response || null, error: error || null });
      const history = await journal.history(userId, context.conversation.conversationId);
      save('history', history);
      const db = mongoose.connection.db!;
      const proposals = await db.collection('copilot_patch_records').find({ projectId }).toArray();
      const verifications = await db.collection('copilot_verifications').find({ projectId }).toArray();
      save('backend-records', { proposals, verifications });
      const harnessFailures: string[] = [];
      try {
        const messages = history?.messages || [];
        const boundaries = completeGroupEnds(messages);
        assert.equal(boundaries.at(-1) ?? 0, messages.length, 'open tool group');
      } catch (e: any) { harnessFailures.push(`journal pairing: ${e.message}`); }
      for (const p of proposals) {
        if (p.userId !== userId || p.conversationId !== context.conversation.conversationId || p.snapshotId !== snapshot.id) harnessFailures.push('proposal scope mismatch');
        if (p.hunks.some((h: any) => h.status !== 'proposed')) harnessFailures.push('unexpected application state');
      }
      const text = response?.message?.content || '';
      let failures: string[] = [];
      let candidateCompile: any;
      if (c.outcome === 'proposal') {
        const delivered = response?.message?.blocks?.find((b: any) => b.type === 'patch')?.patch;
        const proposal = proposals.find((p: any) => p.patchId === delivered?.id);
        if (!proposal) failures.push('no delivered persisted proposal');
        else {
          try {
            const candidate = materialize(c.files, proposal.hunks);
            save('candidate', candidate);
            failures.push(...checkFiles(c, candidate));
            candidateCompile = await compileFiles(candidate);
            save('oracle-compile', candidateCompile);
            if (candidateCompile.status !== 'success') failures.push('independent candidate compile failed');
            if (c.agentCompileRequired && !verifications.some((v: any) => v.patchId === proposal.patchId &&
              v.result?.status === 'success' && v.result?.errorCount === 0 && v.result?.logComplete && v.result?.buildId)) failures.push('agent did not verify delivered candidate');
          } catch (e: any) { failures.push(`candidate: ${e.message}`); }
        }
      } else failures = checkAnswer(c, text, proposals);
      if (error) failures.unshift(`chat error: ${error.code || error.message}`);
      const category = harnessFailures.length ? 'harness_failure' : error
        ? /LIMIT|TIMEOUT|circuit breaker/.test(error.code || error.message) ? 'budget_exhausted' : /UPSTREAM/.test(error.code || '') ? 'provider_failure' : 'inconclusive'
        : failures.length ? 'task_failure' : 'checks_passed_pending_review';
      const row = { id: c.id, category, checksPassed: !failures.length && !harnessFailures.length,
        failures, harnessFailures, calls, usage, reportedTotalTokens: usage.reduce((n, u) => n + u.totalTokens, 0),
        usageComplete: usage.length === calls && usage.every(u => u.reported), monetaryCost: null,
        elapsedMs: Date.now() - started, conversationId: context.conversation.conversationId,
        answer: text, reviewRequired: 'Inspect answer for supported claims; lexical answer checks alone do not establish semantic success.' };
      save('result', row); save('state', { status: 'completed', configHash });
      rows.push(row); writeJson(`${out}/results.json`, rows);
      fs.writeFileSync(`${out}/summary.md`, '# L1 自动检查结果（语义与报告一致性待复核）\n\n' +
        '| Case | 自动检查 | 类别 | 模型调用 | 实报 token |\n|---|---|---|---:|---:|\n' +
        rows.map(r => `| ${r.id} | ${r.checksPassed ? 'PASS' : 'FAIL'} | ${r.category} | ${r.calls} | ${r.reportedTotalTokens}${r.usageComplete ? '' : '（不完整）'} |`).join('\n') + '\n');
      console.log(`${c.id}: ${category}; calls=${calls}; tokens=${row.reportedTotalTokens}; ${failures.join('; ')}`);
    }
  } finally {
    await Promise.allSettled(wireTaps);
    globalThis.fetch = nativeFetch;
    await backend.close();
    await mongoose.disconnect();
  }
}

try {
  if (mode === 'preflight') await preflight();
  else await evaluate();
} catch (error: any) {
  log('runner_error', { message: error.message, stack: error.stack });
  console.error(redact(error.stack || error.message));
  process.exitCode = 1;
  await mongoose.disconnect();
}
