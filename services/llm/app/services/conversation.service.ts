import { ContextStore } from '../agent/context/context-store.js';
import { mapMessagesForView } from '../agent/patchBlocks.js';
import { notFound, badRequest } from '../utils/errors.js';
import { WebApiClient } from '../llm/webApiClient.js';

export class ConversationService {
  constructor(private contextStore = new ContextStore(), private webClient = new WebApiClient()) {}

  async getConversation(userIdentifier: string, conversationId: string, projectId: string, before?: number) {
    if (!projectId) throw badRequest('projectId is required');
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 0)) throw badRequest('Invalid history cursor');
    await this.webClient.assertProjectAccess(userIdentifier, projectId);
    const history = await this.contextStore.historyPage(userIdentifier, conversationId, before);
    if (!history || history.projectId !== projectId) throw notFound('conversation not found');
    return { conversationId, messages: mapMessagesForView(history.messages), nextBefore: history.nextBefore };
  }

  async listConversations(userIdentifier: string, projectId: string) {
    if (!projectId) throw badRequest('projectId is required');
    await this.webClient.assertProjectAccess(userIdentifier, projectId);
    return { conversations: await this.contextStore.listConversations(userIdentifier, projectId) };
  }

  async getContext(userIdentifier: string, conversationId: string, projectId: string) {
    if (!projectId) throw badRequest('projectId is required');
    await this.webClient.assertProjectAccess(userIdentifier, projectId);
    const value = await this.contextStore.diagnostics(userIdentifier, conversationId, projectId);
    if (!value) throw notFound('conversation not found');
    return value;
  }
}
