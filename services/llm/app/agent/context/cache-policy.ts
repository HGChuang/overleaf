import { createHmac } from 'node:crypto';

/** Stable, private routing hint. A key is not a cache-hit or isolation guarantee. */
export function cacheRoutingKey(secret: string, scope: {
  endpoint: string; model: string; user: string; project: string; source: string;
}): string {
  return createHmac('sha256', secret).update(JSON.stringify([
    'copilot-paper-context-v1', scope.endpoint, scope.model, scope.user, scope.project, scope.source,
  ])).digest('hex');
}

export interface CacheRates {
  input: number; cacheRead: number; cacheWrite: number; output: number;
}

/** Disjoint billing buckets; null means insufficient telemetry/pricing. */
export function requestCost(usage: {
  input: number; cacheRead: number; cacheWrite: number; output: number;
  cacheReadKnown?: boolean; cacheWriteKnown?: boolean;
}, rates?: CacheRates): number | null {
  if (!rates || !usage.cacheReadKnown || !usage.cacheWriteKnown ||
      Object.values(rates).some(n => !Number.isFinite(n) || n < 0) ||
      [usage.input, usage.cacheRead, usage.cacheWrite, usage.output].some(n => !Number.isFinite(n) || n < 0)) return null;
  return (usage.input * rates.input + usage.cacheRead * rates.cacheRead + usage.cacheWrite * rates.cacheWrite + usage.output * rates.output) / 1_000_000;
}

export function costJustifiesCompaction(args: {
  currentTokens: number; projectedTokens: number; summaryTokens: number;
  expectedCalls: number; cacheHitRate: number; rates?: CacheRates;
}): boolean {
  const { rates } = args;
  if (!rates || Object.values(rates).some(value => !Number.isFinite(value) || value < 0)) return false;
  if (rates.input === 0 && rates.cacheRead === 0 && rates.cacheWrite === 0) return false;
  const calls = Math.max(1, Math.min(8, Math.floor(args.expectedCalls)));
  const hit = Math.max(0, Math.min(1, args.cacheHitRate));
  const inputRate = rates.input * (1 - hit) + rates.cacheRead * hit;
  const keep = args.currentTokens * inputRate * calls;
  const compact = args.summaryTokens * rates.input + args.projectedTokens * rates.cacheWrite +
    args.projectedTokens * inputRate * calls;
  return compact <= keep * 0.9;
}
