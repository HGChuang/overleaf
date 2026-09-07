// Chat-model factory for the ClientRegistry: builds the OpenAI-compatible
// Model descriptor the vendored agent core carries. The API key is NOT baked
// into the descriptor — it is resolved per call (Agent's getApiKey), so a
// cached descriptor survives key rotation.

import { createOpenAICompatModel } from './openaiCompatStream.js';
import type { Model } from '../agent/core/llm-types.js';
import settings from '@overleaf/settings';
import { inputBudget } from '../agent/context/budget.js';

function readProfiles(): Record<string, any> {
  let value: unknown;
  try { value = JSON.parse(settings.COPILOT_MODEL_PROFILES || '{}'); }
  catch { throw new Error('COPILOT_MODEL_PROFILES must be valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('COPILOT_MODEL_PROFILES must be a JSON object');
  return value as Record<string, any>;
}

function prices(value: any) {
  const result = { input: Number(value?.input || 0), output: Number(value?.output || 0),
    cacheRead: Number(value?.cacheRead || 0), cacheWrite: Number(value?.cacheWrite || 0) };
  if (Object.values(result).some(rate => !Number.isFinite(rate) || rate < 0)) throw new Error('Model profile prices must be non-negative numbers');
  return result;
}

export function createChatModel({
  baseUrl,
  modelId,
  contextWindow: userWindow,
  maxTokens: userOutput,
}: {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  contextWindow?: number;
  maxTokens?: number;
}): Model<'openai-completions'> {
  const profiles = readProfiles();
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const profile = profiles[`${baseUrl}|${modelId}`] || profiles[`${normalizedBaseUrl}|${modelId}`] ||
    profiles[`${normalizedBaseUrl}/|${modelId}`] || {};
  const contextWindow = Number(userWindow ?? profile.contextWindow ?? settings.COPILOT_CONTEXT_WINDOW);
  const maxTokens = Number(userOutput ?? profile.maxTokens ?? settings.COPILOT_OUTPUT_TOKENS);
  inputBudget(contextWindow, maxTokens);
  const descriptor = createOpenAICompatModel({
    baseUrl,
    modelId,
    // Output cap per model call. Reasoning models spend this budget on
    // thinking AND visible output together: at the old 5000 (a LangChain-era
    // carryover), audit/rewrite tasks burned all 5000 on reasoning and were
    // truncated by `length` with zero visible output (eval cluster F25 —
    // no_patch/stopReason=length across shrink-30pct, label-audit,
    // passive-sweep and 3 regression-suite tasks). 16000 gives the thinking
    // headroom those tasks actually need while staying far under provider
    // limits; callers that want tighter caps can still pin per call.
    contextWindow,
    maxTokens,
  });
  descriptor.cost = prices(profile.prices);
  descriptor.compat = {
    ...descriptor.compat,
    protocol: ['responses', 'anthropic-messages'].includes(profile.protocol)
      ? profile.protocol : 'chat-completions',
    profileVersion: String(profile.profileVersion || '1'),
    tokenizerId: typeof profile.tokenizerId === 'string' ? profile.tokenizerId : undefined,
    maxCacheBreakpoints: Math.max(0, Math.min(4, Number(profile.maxCacheBreakpoints || 0))),
    promptCacheMode: profile.promptCacheMode === 'explicit' ? 'explicit' : 'implicit',
    promptCacheTtl: ['5m', '30m', '1h'].includes(profile.promptCacheTtl)
      ? profile.promptCacheTtl : undefined,
  };
  if (profile.promptCacheKey === true) {
    descriptor.compat = { ...descriptor.compat, promptCacheKey: true };
    if (profile.promptCacheRetention === 'in-memory' || profile.promptCacheRetention === '24h') {
      descriptor.compat.promptCacheRetention = profile.promptCacheRetention;
    }
  }
  if (descriptor.compat?.promptCacheMode === 'explicit' && !descriptor.compat.maxCacheBreakpoints) {
    throw new Error('Explicit prompt caching requires maxCacheBreakpoints from 1 to 4');
  }
  if (descriptor.compat?.protocol === 'responses' && descriptor.compat.promptCacheTtl && descriptor.compat.promptCacheTtl !== '30m') {
    throw new Error('Responses prompt cache TTL must be 30m');
  }
  if (descriptor.compat?.protocol === 'anthropic-messages' && descriptor.compat.promptCacheTtl === '30m') {
    throw new Error('Anthropic prompt cache TTL must be 5m or 1h');
  }
  if (descriptor.compat?.protocol === 'anthropic-messages' && descriptor.compat.promptCacheKey &&
      descriptor.compat.promptCacheMode !== 'explicit') {
    throw new Error('Anthropic prompt caching requires explicit mode and cache breakpoints');
  }
  if (descriptor.compat?.protocol === 'chat-completions' && descriptor.compat.promptCacheMode === 'explicit') {
    throw new Error('Explicit prompt cache breakpoints require a native Responses or Anthropic Messages profile');
  }
  return descriptor;
}
