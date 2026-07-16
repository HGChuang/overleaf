import { ChatOpenAI } from '@langchain/openai';

export function createChatModel({ baseUrl, apiKey, modelId }) {
  return new ChatOpenAI({
    model: modelId,
    apiKey,
    temperature: 0.7,
    maxTokens: 5000,
    maxRetries: 1,
    configuration: {
      baseURL: baseUrl,
    },
  });
}
