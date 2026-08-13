// Usage tap: wrap the real provider streamFn and accumulate token usage for
// every model call in a run. The vendored AssistantMessageEventStream.result()
// resolves the terminal AssistantMessage (which carries `usage`) and is safe
// for multiple awaiters — the agent loop awaits it internally, we tap it here
// without consuming or altering the stream.
//
// The vendored model descriptors have a ZERO cost table (createOpenAICompatModel
// hardcodes cost 0), so provider-reported cost is always $0. priceUsage()
// prices the token counts from a per-model-id table instead; env vars
// EVAL_PRICE_<KEY>_{IN,HIT,OUT} override the built-ins (per 1M tokens).

import type { StreamFn } from '../app/agent/core/types.js';

export interface UsageRecord {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costTotal: number;
}

export function emptyUsage(): UsageRecord {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 };
}

export function addUsage(sink: UsageRecord, usage: any): void {
  if (!usage) return;
  sink.input += Number(usage.input || 0);
  sink.output += Number(usage.output || 0);
  sink.cacheRead += Number(usage.cacheRead || 0);
  sink.cacheWrite += Number(usage.cacheWrite || 0);
  sink.totalTokens +=
    Number(usage.input || 0) +
    Number(usage.output || 0) +
    Number(usage.cacheRead || 0) +
    Number(usage.cacheWrite || 0);
}

// Non-blocking tap: the .then() chain is fire-and-forget; callers read `sink`
// after the turn completes, by which time the terminal message has resolved.
export function wrapStreamFnWithUsageTap(real: StreamFn, sink: UsageRecord): StreamFn {
  return (model: any, context: any, options: any) => {
    const stream = real(model, context, options);
    Promise.resolve(stream)
      .then((s: any) => s.result())
      .then((msg: any) => addUsage(sink, msg?.usage))
      .catch(() => {
        // Stream failures surface through the agent loop's own error path;
        // the tap must never crash a turn.
      });
    return stream;
  };
}

// USD per 1M tokens: { in, hit (cache read), out }. Approximate list prices for
// the dev providers; good enough for cost-trend tracking, not billing.
const PRICE_TABLE: Record<string, { in: number; hit: number; out: number }> = {
  deepseek: { in: 0.27, hit: 0.07, out: 1.1 },
  'glm-4.5-air': { in: 0.11, hit: 0.028, out: 0.28 },
  glm: { in: 0.6, hit: 0.11, out: 2.2 },
};

function priceFor(modelId: string): { in: number; hit: number; out: number } {
  const id = (modelId || '').toLowerCase();
  for (const [key, price] of Object.entries(PRICE_TABLE)) {
    if (id.includes(key)) {
      const envKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      return {
        in: Number(process.env[`EVAL_PRICE_${envKey}_IN`] ?? price.in),
        hit: Number(process.env[`EVAL_PRICE_${envKey}_HIT`] ?? price.hit),
        out: Number(process.env[`EVAL_PRICE_${envKey}_OUT`] ?? price.out),
      };
    }
  }
  return { in: 0, hit: 0, out: 0 };
}

export function priceUsage(usage: UsageRecord, modelId: string): void {
  const p = priceFor(modelId);
  usage.costTotal = (usage.input * p.in + usage.cacheRead * p.hit + usage.output * p.out) / 1_000_000;
}
