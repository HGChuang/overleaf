import { LlmClient } from './LlmClient.js';
import { Semaphore } from './Semaphore.js';
import type { Model } from '../agent/core/llm-types.js';

export type CreateChatModelFn = (args: {
  baseUrl: string;
  apiKey?: string;
  modelId: string;
}) => Model<'openai-completions'>;

interface ClientRegistryOptions {
  createChatModel?: CreateChatModelFn;
  agentOptions?: {
    timeout?: number;
    keepAlive?: boolean;
    maxSockets?: number;
    retries?: number;
  };
  clientExpireMs?: number;
  maxConcurrentPerKey?: number;
}

interface RegistryEntry {
  llmClient: LlmClient;
  chatModels: Map<string, Model<'openai-completions'>>;
  semaphore: Semaphore;
  lastUsed: number;
}

export class ClientRegistry {
  createChatModel?: CreateChatModelFn;
  agentOptions: NonNullable<ClientRegistryOptions['agentOptions']>;
  clientExpireMs: number;
  maxConcurrentPerKey: number;
  entries: Map<string, RegistryEntry>;
  cleanupTimer: NodeJS.Timeout | null;

  constructor({
    createChatModel,
    agentOptions = {},
    clientExpireMs = 10 * 60 * 1000,
    maxConcurrentPerKey = 8,
  }: ClientRegistryOptions = {}) {
    this.createChatModel = createChatModel;
    this.agentOptions = agentOptions;
    this.clientExpireMs = clientExpireMs;
    this.maxConcurrentPerKey = Math.max(1, maxConcurrentPerKey || 8);
    this.entries = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), this.clientExpireMs);
  }

  buildKey(baseUrl: string, apiKey: string): string {
    return `${baseUrl}_${apiKey}`;
  }

  getOrCreate(baseUrl: string, apiKey: string): RegistryEntry {
    const key = this.buildKey(baseUrl, apiKey);
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        llmClient: new LlmClient(baseUrl, apiKey, this.agentOptions),
        chatModels: new Map(),
        semaphore: new Semaphore(this.maxConcurrentPerKey),
        lastUsed: now,
      };
      this.entries.set(key, entry);
    } else {
      entry.lastUsed = now;
    }
    return entry;
  }

  async getLlmClient(baseUrl: string, apiKey: string): Promise<RegistryEntry> {
    return this.getOrCreate(baseUrl, apiKey);
  }

  async getChatModel(baseUrl: string, apiKey: string, modelId: string) {
    const entry = this.getOrCreate(baseUrl, apiKey);
    if (!entry.chatModels.has(modelId)) {
      if (typeof this.createChatModel !== 'function') {
        throw new Error('Chat model factory is not configured');
      }
      entry.chatModels.set(modelId, this.createChatModel({ baseUrl, apiKey, modelId }));
    }
    entry.lastUsed = Date.now();
    return { model: entry.chatModels.get(modelId) as Model<'openai-completions'>, semaphore: entry.semaphore, entry };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.lastUsed <= this.clientExpireMs) {
        continue;
      }
      try {
        entry.llmClient?.close?.();
      } catch (error) {
        console.error('Failed to close LlmClient:', error);
      }
      this.entries.delete(key);
    }
  }

  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const entry of this.entries.values()) {
      try {
        entry.llmClient?.close?.();
      } catch (error) {
        console.error('Failed to close LlmClient:', error);
      }
    }
    this.entries.clear();
  }
}
