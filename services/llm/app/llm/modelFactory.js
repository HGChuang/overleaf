import { ChatOpenAI } from '@langchain/openai';

export function createChatModel({ baseUrl, apiKey, modelId }) {
  return new ChatOpenAI({
    model: modelId,
    apiKey,
    temperature: 0.7,
    maxTokens: 5000,
    // Transient 429/5xx/network blips get a second shot before the turn fails.
    // Context-too-large errors are NOT retried here — isPromptTooLong routes
    // them to the reactive-compact path in CopilotService.
    maxRetries: 2,
    configuration: {
      baseURL: baseUrl,
    },
  });
}
