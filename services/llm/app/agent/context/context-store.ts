import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { CopilotError } from '../../utils/errors.js';
import type { AgentMessage } from '../core/types.js';
import type { ContextEpoch, ContextScope } from './types.js';
import type { ToolResultMessage } from '../core/llm-types.js';
import { hashMessages } from './paper-state.js';

type Payload = { inline?: unknown; blob?: string };
export interface ContextSession {
  messages: AgentMessage[];
  epoch?: ContextEpoch;
  append(message: AgentMessage): Promise<void>;
  commit(epoch: ContextEpoch): Promise<void>;
  renew(): Promise<void>;
  close(): Promise<void>;
  recordTool?(result: ToolResultMessage): Promise<void>;
  recoverTool?(toolCallId: string, beforeMessage?: number): Promise<ToolResultMessage | null>;
}

/** Mongo owns the journal. Redis expiry must not erase manuscript decisions. */
export class ContextStore {
  private initialized?: Promise<void>;
  constructor(private connection = mongoose.connection) {}

  private get db() {
    if (!this.connection.db) throw new Error('Context database is unavailable');
    return this.connection.db;
  }

  private scopeKey(scope: ContextScope) {
    return createHash('sha256').update(JSON.stringify([scope.userId, scope.conversationId])).digest('hex');
  }

  private initialize() {
    return this.initialized ||= Promise.all([
      this.db.collection('copilot_events').createIndex({ conversation: 1, seq: 1 }, { unique: true }),
      this.db.collection('copilot_events').createIndex({ conversation: 1, role: 1, seq: 1 }),
      this.db.collection('copilot_context_epochs').createIndex({ conversation: 1, generation: 1 }, { unique: true }),
      this.db.collection('copilot_conversations').createIndex({ 'scope.userId': 1, 'scope.projectId': 1 }),
      this.db.collection('copilot_conversations').createIndex(
        { 'scope.userId': 1, 'scope.projectId': 1, lastActivityAt: -1 },
      ),
      this.db.collection('copilot_summary_artifacts').createIndex({ createdAt: 1 }),
    ]).then(() => {}).catch(error => { this.initialized = undefined; throw error; });
  }

  private async pack(value: unknown): Promise<Payload> {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length <= 64 * 1024) return { inline: value };
    const bucket = new mongoose.mongo.GridFSBucket(this.db, { bucketName: 'copilot_context_artifacts' });
    const upload = bucket.openUploadStream(randomUUID(), { metadata: { sha256: createHash('sha256').update(bytes).digest('hex') } });
    await new Promise<void>((resolve, reject) => {
      upload.on('finish', resolve).on('error', reject);
      upload.end(bytes);
    });
    return { blob: upload.id.toHexString() };
  }

  private async unpack<T>(payload: Payload): Promise<T> {
    if (!payload.blob) return payload.inline as T;
    const bucket = new mongoose.mongo.GridFSBucket(this.db, { bucketName: 'copilot_context_artifacts' });
    const parts: Buffer[] = [];
    for await (const part of bucket.openDownloadStream(new mongoose.mongo.ObjectId(payload.blob))) parts.push(part);
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }

  async history(userId: string, conversationId: string): Promise<{ projectId: string; messages: AgentMessage[] } | null> {
    await this.initialize();
    const id = this.scopeKey({ userId, conversationId, projectId: '', source: 'panel' });
    const conversation = await this.db.collection('copilot_conversations').findOne({ _id: id as any, 'scope.userId': userId });
    if (!conversation) return null;
    const messages: AgentMessage[] = [];
    for await (const event of this.db.collection('copilot_events').find({ conversation: id, seq: { $lt: conversation.head } }).sort({ seq: 1 })) {
      messages.push(await this.unpack<AgentMessage>(event.payload));
    }
    return { projectId: conversation.scope.projectId, messages };
  }

  async historyPage(userId: string, conversationId: string, before?: number) {
    await this.initialize();
    const id = this.scopeKey({ userId, conversationId, projectId: '', source: 'panel' });
    const conversation = await this.db.collection('copilot_conversations').findOne({ _id: id as any, 'scope.userId': userId });
    if (!conversation) return null;
    const end = Math.min(before ?? conversation.head, conversation.head);
    const previousUser = await this.db.collection('copilot_events').findOne({
      conversation: id, role: 'user', seq: { $lte: Math.max(0, end - 100) },
    }, { sort: { seq: -1 } });
    const start = previousUser?.seq || 0;
    const messages: AgentMessage[] = [];
    for await (const event of this.db.collection('copilot_events').find({ conversation: id, seq: { $gte: start, $lt: end } }).sort({ seq: 1 })) {
      messages.push(await this.unpack<AgentMessage>(event.payload));
    }
    return { projectId: conversation.scope.projectId, messages, nextBefore: start || null };
  }

  async listConversations(userId: string, projectId: string) {
    await this.initialize();
    const conversations = await this.db.collection('copilot_conversations').find({
      'scope.userId': userId,
      'scope.projectId': projectId,
      'scope.source': 'panel',
      head: { $gt: 0 },
    }).sort({ lastActivityAt: -1, createdAt: -1 }).toArray();

    const items = [];
    for (const conversation of conversations) {
      let firstQuestion = typeof conversation.firstQuestion === 'string'
        ? conversation.firstQuestion
        : null;
      if (!firstQuestion) {
        const events = this.db.collection('copilot_events').find({
          conversation: conversation._id,
          role: 'user',
        }).sort({ seq: 1 });
        for await (const event of events) {
          firstQuestion = firstAuthorQuestion(await this.unpack<AgentMessage>(event.payload));
          if (firstQuestion) break;
        }
      }
      if (!firstQuestion) continue;
      items.push({
        conversationId: conversation.scope.conversationId,
        firstQuestion,
        createdAt: conversation.createdAt || null,
        lastActivityAt: conversation.lastActivityAt || conversation.createdAt || null,
      });
    }
    return items;
  }

  async diagnostics(userId: string, conversationId: string, projectId: string) {
    await this.initialize();
    const id = this.scopeKey({ userId, conversationId, projectId, source: 'panel' });
    const conversation = await this.db.collection('copilot_conversations').findOne({
      _id: id as any, 'scope.userId': userId, 'scope.projectId': projectId,
    });
    if (!conversation) return null;
    const epoch = conversation.epoch ? await this.unpack<ContextEpoch>(conversation.epoch) : undefined;
    let snapshotId = (epoch?.checkpoint.projectBase as any)?.sourceSnapshot?.id as string | undefined;
    const latestUser = await this.db.collection('copilot_events').findOne({ conversation: id, role: 'user' }, { sort: { seq: -1 } });
    if (latestUser) try {
      const envelope = JSON.parse(extractText(await this.unpack<AgentMessage>(latestUser.payload)));
      snapshotId = envelope.PROJECT?.sourceSnapshot?.id || envelope.PROJECT_REF?.snapshotId || snapshotId;
    } catch { /* legacy plain message */ }
    let paperIndex = null;
    if (snapshotId) {
      const [index, reviewedWindows, allReviews] = await Promise.all([
        this.db.collection('copilot_paper_indexes').findOne(
          { projectId, snapshotId, parserVersion: 2 },
          { sort: { createdAt: -1 } },
        ),
        this.db.collection('copilot_paper_reviews').distinct('nodeId', { userId, projectId, conversationId, snapshotId }),
        this.db.collection('copilot_paper_reviews').countDocuments({ userId, projectId, conversationId }),
      ]);
      paperIndex = { snapshotId, sourceWindows: index?.count || 0,
        reviewedWindows: reviewedWindows.length, staleReviews: Math.max(0, allReviews - reviewedWindows.length),
        semanticStatus: index?.semanticStatus || 'not_built' };
    }
    const metrics = await this.db.collection('copilot_request_metrics').find({
      userId, projectId, conversationId,
    }).sort({ occurredAt: -1 }).limit(20).project({ providerItems: 0 }).toArray();
    return {
      eventHead: conversation.head, coveredThroughSeq: conversation.coveredThroughSeq ?? -1,
      projectionThroughSeq: conversation.head - 1, generation: conversation.generation,
      checkpoint: epoch?.checkpoint || null,
      paperIndex,
      immutablePrefixHash: epoch ? createHash('sha256').update(JSON.stringify(epoch.prefix)).digest('hex') : null,
      metrics: metrics.map(row => ({ model: row.model, estimatedInput: row.estimatedInput,
        reportedInput: row.totalInput, ordinaryInput: row.ordinaryInput,
        cacheRead: row.cacheRead, cacheWrite: row.cacheWrite, output: row.output,
        usageCompleteness: row.usageCompleteness, cost: row.cost, latencyMs: row.latencyMs,
        ttftMs: row.ttftMs, reason: row.reason,
        occurredAt: row.occurredAt })),
    };
  }

  async readSummary(cacheKey: string): Promise<string | null> {
    await this.initialize();
    const value = await this.db.collection('copilot_summary_artifacts').findOne({ _id: cacheKey as any });
    return typeof value?.summary === 'string' ? value.summary : null;
  }

  async saveSummary(cacheKey: string, summary: string): Promise<void> {
    await this.initialize();
    if (!summary || Buffer.byteLength(summary) > 64 * 1024) throw new Error('Invalid summary artifact');
    await this.db.collection('copilot_summary_artifacts').updateOne({ _id: cacheKey as any }, {
      $setOnInsert: { summary, createdAt: new Date() }, $set: { lastUsedAt: new Date() },
    }, { upsert: true });
  }

  async deleteSummary(cacheKey: string): Promise<void> {
    await this.initialize();
    await this.db.collection('copilot_summary_artifacts').deleteOne({ _id: cacheKey as any });
  }

  async open(scope: ContextScope): Promise<ContextSession> {
    await this.initialize();
    if (Object.values(scope).some(value => typeof value !== 'string' || !value.length || value.length > 256) || scope.source !== 'panel') {
      throw new CopilotError('COPILOT_BAD_REQUEST', 'A valid context scope is required', 400);
    }
    const id = this.scopeKey(scope);
    const conversations = this.db.collection('copilot_conversations');
    try {
      await conversations.updateOne({ _id: id as any }, { $setOnInsert: {
        scope, head: 0, generation: 0, fence: 0, leaseUntil: new Date(0), createdAt: new Date(),
      } }, { upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const owner = randomUUID();
    const owned = await conversations.findOneAndUpdate({
      _id: id as any, 'scope.userId': scope.userId, 'scope.projectId': scope.projectId, 'scope.source': scope.source,
      $expr: { $lte: ['$leaseUntil', '$$NOW'] },
    }, [{ $set: { owner, fence: { $add: ['$fence', 1] }, leaseUntil: { $dateAdd: { startDate: '$$NOW', unit: 'second', amount: 30 } } } }], { returnDocument: 'after' });
    if (!owned) {
      throw new CopilotError('COPILOT_CONTEXT_BUSY', 'This conversation is busy or belongs to another project.', 409);
    }
    const fence = owned.fence;
    const ownership = { _id: id as any, owner, fence, $expr: { $gt: ['$leaseUntil', '$$NOW'] } };
    const close = async () => {
      await conversations.updateOne({ _id: id as any, owner, fence }, { $set: { leaseUntil: new Date(0) }, $unset: { owner: '' } });
    };
    try {
      const messages = (await this.history(scope.userId, scope.conversationId))!.messages;
      let head = owned.head;
      let generation = owned.generation;
      const epoch = owned.epoch ? await this.unpack<ContextEpoch>(owned.epoch) : undefined;
      if (head !== messages.length) throw new Error('Context journal head mismatch');
      const receiptKey = (toolCallId: string, beforeMessage = messages.length) => {
        const intent = messages.findLastIndex((m, index) => index < beforeMessage && m.role === 'assistant' && m.content.some(b => b.type === 'toolCall' && b.id === toolCallId));
        if (intent < 0) throw new Error('Tool receipt has no durable intent');
        return `${id}:${intent}:${toolCallId}`;
      };
      return {
        messages, epoch,
        recordTool: async result => {
          const payload = await this.pack(result);
          const transaction = await this.connection.startSession();
          try {
            await transaction.withTransaction(async () => {
              // Updating the owner document conflicts with a simultaneous
              // lease takeover; checking it outside this transaction would not.
              const owned = await conversations.updateOne(ownership, { $inc: { receiptRevision: 1 } }, { session: transaction });
              if (owned.modifiedCount !== 1) throw new Error('Context lease expired before tool receipt');
              await this.db.collection('copilot_tool_receipts').insertOne({
                _id: receiptKey(result.toolCallId) as any, conversation: id, payload,
              }, { session: transaction });
            });
          } finally { await transaction.endSession(); }
        },
        recoverTool: async (toolCallId, beforeMessage) => {
          const receipt = await this.db.collection('copilot_tool_receipts').findOne({ _id: receiptKey(toolCallId, beforeMessage) as any });
          return receipt ? this.unpack<ToolResultMessage>(receipt.payload) : null;
        },
        append: async (message) => {
          const payload = await this.pack(message);
          const firstQuestion = firstAuthorQuestion(message);
          const transaction = await this.connection.startSession();
          try {
            await transaction.withTransaction(async () => {
              const update = firstQuestion
                ? [{ $set: { head: { $add: ['$head', 1] }, lastActivityAt: '$$NOW',
                    firstQuestion: { $ifNull: ['$firstQuestion', firstQuestion] } } }]
                : { $inc: { head: 1 }, $set: { lastActivityAt: new Date() } };
              const result = await conversations.updateOne({ ...ownership, head }, update as any, { session: transaction });
              if (result.modifiedCount !== 1) throw new Error('Context lease or event head changed');
              await this.db.collection('copilot_events').insertOne({
                _id: `${id}:${head}` as any, conversation: id, seq: head, role: message.role, payload,
              }, { session: transaction });
            });
            head++;
            messages.push(structuredClone(message));
          } catch (error) {
            // Do not delete an artifact after an ambiguous commit outcome.
            // It may be referenced by a committed event; maintenance can GC
            // unreferenced artifacts after a retention grace period.
            throw error;
          } finally { await transaction.endSession(); }
        },
        commit: async (next) => {
          if (next.coveredMessages > head || next.generation !== generation + 1 ||
              next.coveredHash !== hashMessages(messages.slice(0, next.coveredMessages))) throw new Error('Invalid context epoch boundary');
          const payload = await this.pack(next);
          const transaction = await this.connection.startSession();
          try {
            await transaction.withTransaction(async () => {
              const result = await conversations.updateOne({ ...ownership, generation }, {
                $set: { epoch: payload, generation: next.generation, coveredThroughSeq: next.coveredMessages - 1 },
              }, { session: transaction });
              if (result.modifiedCount !== 1) throw new Error('Context epoch CAS failed');
              await this.db.collection('copilot_context_epochs').insertOne({
                _id: `${id}:${next.generation}` as any, conversation: id, generation: next.generation,
                coveredThroughSeq: next.coveredMessages - 1, payload,
              }, { session: transaction });
            });
            generation = next.generation;
          } finally { await transaction.endSession(); }
        },
        renew: async () => {
          const result = await conversations.updateOne(ownership, [{ $set: {
            leaseUntil: { $dateAdd: { startDate: '$$NOW', unit: 'second', amount: 30 } },
          } }]);
          if (result.modifiedCount !== 1) throw new Error('Context lease expired');
        },
        close,
      };
    } catch (error) {
      await close();
      throw error;
    }
  }
}

function extractText(message: AgentMessage) {
  if (typeof message.content === 'string') return message.content;
  return message.content.map((block: any) => block.text || '').join('');
}

function firstAuthorQuestion(message: AgentMessage): string | null {
  if (message.role !== 'user') return null;
  const content = extractText(message).replace(
    /^<relevant_memories>[\s\S]*?<\/relevant_memories>\s*/,
    '',
  ).trim();
  if (!content) return null;
  if (!content.startsWith('{')) return content.slice(0, 500);
  try {
    const envelope = JSON.parse(content);
    if (envelope?.MESSAGE_KIND === 'system_event') return null;
    if (typeof envelope?.MESSAGE === 'string' && envelope.MESSAGE.trim()) {
      return envelope.MESSAGE.trim().slice(0, 500);
    }
  } catch { /* A plain author question may begin with a brace. */ }
  return content.slice(0, 500);
}
