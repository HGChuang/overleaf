import { RedisMemoryStore } from '../agent/memory.js';
import { mapMessagesForView } from '../agent/patchBlocks.js';
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
      // View mapping: drop tool-call plumbing and empty intermediate steps,
      // rebuild patch cards, unwrap the user-message JSON envelope — the raw
      // stored history is agent plumbing, not chat bubbles.
      messages: mapMessagesForView(messages),
    };
  }

  buildThreadId(userIdentifier, conversationId) {
    if (!userIdentifier || !conversationId) {
      throw notFound('conversationId is required');
    }
    return `${userIdentifier}:${conversationId}`;
  }
}
