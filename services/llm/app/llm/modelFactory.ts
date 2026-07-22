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
    // Output cap per model call (was maxTokens: 5000 on the LangChain model).
    maxTokens: 5000,
  });
}
