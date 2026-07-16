import { RedisMemoryStore } from '../agent/memory.js';
import { notFound } from '../utils/errors.js';

export class ConversationService {
  constructor({ memoryStore = new RedisMemoryStore() } = {}) {
    this.memoryStore = memoryStore;
  }

  async getConversation(userIdentifier, conversationId) {
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const messages = await this.memoryStore.load(threadId);
    if (!messages.length) {
      throw notFound(`conversation not found: ${conversationId}`);
    }
    return {
      conversationId,
      messages: messages.map(message => ({
        role: message.getType ? message.getType() : message._getType?.() || 'message',
        content: message.content,
      })),
    };
  }

  buildThreadId(userIdentifier, conversationId) {
    if (!userIdentifier || !conversationId) {
      throw notFound('conversationId is required');
    }
    return `${userIdentifier}:${conversationId}`;
  }
}
