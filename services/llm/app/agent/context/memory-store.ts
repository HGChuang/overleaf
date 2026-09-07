import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import type { AgentMessage } from '../core/types.js';
import { authorText, isAuthorMessage } from './paper-state.js';

export class PaperMemoryStore {
  private initialized?: Promise<void>;
  private get collection() {
    if (!mongoose.connection.db) throw new Error('Memory database unavailable');
    return mongoose.connection.db.collection('copilot_memories');
  }
  private initialize() {
    return this.initialized ||= Promise.all([
      this.collection.createIndex({ userId: 1, projectId: 1, scope: 1, status: 1, validity: 1 }),
      this.collection.createIndex({ validity: 1, deletedAt: 1 }),
    ]).then(() => {}).catch(error => { this.initialized = undefined; throw error; });
  }
  async list(userId: string, projectId?: string, includeCandidates = false) {
    await this.initialize();
    return this.collection.find({ userId, validity: 'active',
      status: includeCandidates ? { $in: ['candidate', 'confirmed'] } : 'confirmed',
      $or: [{ scope: 'user' }, ...(projectId ? [{ scope: 'project', projectId }] : [])],
    }).sort({ scope: 1, createdAt: 1 }).project({ _id: 0 }).toArray();
  }
  async propose(args: { userId: string; projectId: string; conversationId: string;
    value: string; scope: 'project' | 'user'; sourceQuote: string; messages: AgentMessage[] }) {
    await this.initialize();
    if (!args.value || args.value.length > 1000 || !args.sourceQuote || args.sourceQuote.length > 2000 ||
      !args.messages.some(message => isAuthorMessage(message) && authorText(message).includes(args.sourceQuote))) {
      throw new Error('Memory candidates require an exact quote from an author message');
    }
    const id = createHash('sha256').update(JSON.stringify([args.userId, args.projectId,
      args.conversationId, args.scope, args.value, args.sourceQuote])).digest('hex');
    const sourceMessage = args.messages.findIndex(message => isAuthorMessage(message) && authorText(message).includes(args.sourceQuote));
    await this.collection.updateOne({ _id: id as any }, { $setOnInsert: {
      id, userId: args.userId, projectId: args.scope === 'project' ? args.projectId : null,
      conversationId: args.conversationId, value: args.value, sourceQuote: args.sourceQuote,
      sourceMessage, scope: args.scope, basis: 'user_asserted', status: 'candidate',
      validity: 'active', createdAt: new Date(),
    } }, { upsert: true });
    return { id, status: 'candidate', value: args.value, scope: args.scope };
  }
  async decide(userId: string, id: string, action: 'confirm' | 'delete', value?: string) {
    await this.initialize();
    if (action !== 'confirm' && action !== 'delete') throw new Error('Memory action must be confirm or delete');
    if (typeof value === 'string' && (value.length === 0 || value.length > 1000)) throw new Error('Memory value must contain 1 to 1000 characters');
    const update = action === 'delete' ? { validity: 'superseded', deletedAt: new Date() }
      : { status: 'confirmed', ...(typeof value === 'string' && value.length <= 1000 ? { value } : {}), confirmedAt: new Date() };
    const result = await this.collection.findOneAndUpdate({ _id: id as any, userId }, { $set: update }, { returnDocument: 'after' });
    if (!result) throw new Error('Memory not found');
    return { id: result.id, value: result.value, scope: result.scope, status: result.status, validity: result.validity };
  }
}
