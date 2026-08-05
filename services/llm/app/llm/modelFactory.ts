// Chat-model factory for the ClientRegistry: builds the OpenAI-compatible
// Model descriptor the vendored agent core carries. The API key is NOT baked
// into the descriptor — it is resolved per call (Agent's getApiKey), so a
// cached descriptor survives key rotation.

import { createOpenAICompatModel } from './openaiCompatStream.js';
import type { Model } from '../agent/core/llm-types.js';

export function createChatModel({
  baseUrl,
  modelId,
}: {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
}): Model<'openai-completions'> {
  return createOpenAICompatModel({
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
    maxTokens: 16000,
  });
}
