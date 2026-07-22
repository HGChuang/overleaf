import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { LlmClient } from '../utils/LlmClient.js';

export class KeysService {
  apiKeyMapper: ApiKeyMapper;

  constructor() {
    this.apiKeyMapper = new ApiKeyMapper();
  }

  async saveApiKey(userIdentifier: string, name: string, baseUrl: string, apiKey: string) {
    if (!userIdentifier) throw new Error('userIdentifier cannot be empty');
    if (!name) throw new Error('name cannot be empty');
    if (!baseUrl) throw new Error('Base URL cannot be empty');
    if (!apiKey) throw new Error('API Key cannot be empty');
    const client = new LlmClient(baseUrl, apiKey);
    const models = await client.listModels();
    await this.apiKeyMapper.saveApiKey(userIdentifier, name, baseUrl, apiKey, models);
  }

  async deleteApiKey(userIdentifier: string, name: string) {
    await this.apiKeyMapper.deleteApiKey(userIdentifier, name);
  }

  async getLlmInfo(userIdentifier: string) {
    const llminfoArr = await this.apiKeyMapper.getLlmInfo(userIdentifier);
    return llminfoArr.map((info: any) => ({
      provider: info.provider,
      updatedAt: info.updatedAt,
      usedTokens: (info.usedTokens / 1000).toFixed(2) + 'k' || 0,
      usingChatModel: info.usingChatModel,
      usingCompletionModel: info.usingCompletionModel,
      models: info.models || [],
      name: info.name,
    }));
  }

  async getUsingLlm(userIdentifier: string) {
    // get the index of using llm
    const usingLlm = await this.apiKeyMapper.getUsingLlm(userIdentifier);
    return usingLlm;
  }

  async updateUsingLlm(userIdentifier: string, usingLlm: number) {
    await this.apiKeyMapper.updateUsingLlm(userIdentifier, usingLlm);
  }

  async updateUsingModel(userIdentifier: string, name: string, chatOrCompletion: number, newModel: number) {
    await this.apiKeyMapper.updateUsingModel(userIdentifier, name, chatOrCompletion, newModel);
  }
}
