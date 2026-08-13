// Provider health probe — the pre-flight check before any full eval run.
// Replays the EXACT stream path the agent uses (createOpenAICompatModel +
// streamOpenAICompat) against the mongo-configured provider with a minimal
// request, and classifies failures (model_not_found / insufficient_balance /
// timeout / other) so a dead provider is caught BEFORE it burns 300 trials
// into garbage records that would trip the F4 circuit breaker anyway.
//
// Also validates the reasoning-model contract: reasoning_content deltas must
// land as thinking blocks while the answer text stays intact.
//
// SECURITY: the apiKey flows mongo → memory → provider stream only. It is
// never printed, never written to disk, never included in error output.
//
//   npx tsx eval/probeProvider.ts        (inside develop-llm)
// Exit 0 = healthy, 2 = unhealthy (stop and report; do NOT swap config).

import connectDB from '../config/db.js';
import { loadEvalCreds, resolveProviderMeta } from './creds.js';
import { createOpenAICompatModel, streamOpenAICompat } from '../app/llm/openaiCompatStream.js';
import { shutdownEval } from './serviceFactory.js';

const PROBE_TIMEOUT_MS = 30_000;

function classify(detail: string): string {
  const s = detail.toLowerCase();
  if (/余额不足|insufficient|quota|balance|429/.test(s)) return 'insufficient_balance';
  if (/model.*not.*found|does not exist|no such model|notfound|404/.test(s)) return 'model_not_found';
  if (/timeout|timed out|abort/.test(s)) return 'timeout';
  return 'other';
}

async function main(): Promise<number> {
  await connectDB();
  const creds = await loadEvalCreds();
  const { baseUrl, modelId } = resolveProviderMeta(creds);
  if (!baseUrl || !modelId) {
    console.error('[probe] FAIL: cannot resolve baseUrl/modelId from mongo llminfo');
    return 2;
  }
  const apiKey = creds.llminfo[creds.usingLlm]?.apiKey; // memory-only; never printed
  if (!apiKey) {
    console.error('[probe] FAIL: provider entry has no apiKey');
    return 2;
  }
  console.log(`[probe] provider baseUrl=${baseUrl} modelId=${modelId}`);

  const model = createOpenAICompatModel({ baseUrl, modelId });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  let msg: any;
  try {
    const stream = streamOpenAICompat(
      model,
      { messages: [{ role: 'user', content: 'Reply with the single word: OK', timestamp: Date.now() }] },
      // Generous maxTokens: reasoning models spend thinking tokens before the
      // answer; a tiny cap could surface as stopReason "length" with no text.
      { apiKey, signal: controller.signal, maxTokens: 1024 }
    );
    msg = await stream.result();
  } catch (err: any) {
    console.error(`[probe] FAIL (${classify(String(err?.message || err))}, threw): ${String(err?.message || err).slice(0, 200)}`);
    return 2;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - t0;
  if (msg?.stopReason === 'error' || msg?.stopReason === 'aborted') {
    const detail = String(msg?.errorMessage || msg?.stopReason).slice(0, 300);
    console.error(`[probe] FAIL (${classify(detail)}): ${detail}`);
    return 2;
  }

  const text = (msg?.content || [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('');
  const thinkingChars = (msg?.content || [])
    .filter((b: any) => b?.type === 'thinking')
    .reduce((n: number, b: any) => n + String(b.thinking || '').length, 0);
  console.log(`[probe] OK in ${latencyMs}ms — stopReason=${msg?.stopReason}`);
  console.log(
    `[probe] usage: input=${msg?.usage?.input ?? '?'} output=${msg?.usage?.output ?? '?'}` +
      ` cacheRead=${msg?.usage?.cacheRead ?? '?'} cacheWrite=${msg?.usage?.cacheWrite ?? '?'}`
  );
  console.log(`[probe] reasoning parse: ${thinkingChars} thinking char(s); text preview: ${JSON.stringify(text.slice(0, 80))}`);
  if (!text.trim()) {
    console.error('[probe] FAIL (other): empty answer text — stream parsing suspect');
    return 2;
  }
  return 0;
}

main()
  .then(async code => {
    await shutdownEval();
    process.exit(code);
  })
  .catch(async err => {
    console.error('[probe] fatal:', err?.message || err);
    await shutdownEval();
    process.exit(2);
  });
