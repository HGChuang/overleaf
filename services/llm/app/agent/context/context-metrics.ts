import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import type { Usage, Model } from '../core/llm-types.js';
import { requestCost } from './cache-policy.js';

export class ContextMetrics {
  private initialized?: Promise<void>;
  private get collection() {
    if (!mongoose.connection.db) throw new Error('Metrics database unavailable');
    return mongoose.connection.db.collection('copilot_request_metrics');
  }
  private initialize() {
    return this.initialized ||= Promise.all([
      this.collection.createIndex({ profile: 1, occurredAt: -1 }),
      this.collection.createIndex({ userId: 1, projectId: 1, conversationId: 1, occurredAt: -1 }),
      mongoose.connection.db!.collection('copilot_request_metric_daily').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).then(() => {}).catch(error => { this.initialized = undefined; throw error; });
  }
  async calibration(profile: string) {
    await this.initialize();
    const rows = await this.collection.find({ profile, estimationError: { $gte: 0 } })
      .sort({ occurredAt: -1 }).limit(500).project({ estimationError: 1, cacheRead: 1,
        totalInput: 1, usageCompleteness: 1, occurredAt: 1 }).toArray();
    const errors = rows.map(row => row.estimationError as number).sort((a, b) => a - b);
    const p99 = errors.length ? errors[Math.min(errors.length - 1, Math.floor(errors.length * 0.99))] : 0;
    const complete = rows.filter(row => row.usageCompleteness === 'complete');
    const cacheHitRate = complete.length ? complete.filter(row => row.cacheRead > 0).length / complete.length : 0;
    return { p99, cacheHitRate, samples: rows.length, completeSamples: complete.length };
  }
  async record(args: { requestId: string; runId: string; userId: string; projectId: string;
    conversationId: string; model: Model; epoch: number; prefixHash?: string;
    estimatedInput: number; usage: Usage; latencyMs: number; ttftMs?: number; reason?: string }) {
    await this.initialize();
    const rates = args.model.cost;
    const totalInput = args.usage.input + args.usage.cacheRead + args.usage.cacheWrite;
    const price = requestCost(args.usage, rates);
    const profile = `${args.model.baseUrl}|${args.model.id}|${args.model.compat?.profileVersion || '1'}`;
    const inserted = await this.collection.updateOne({ _id: args.requestId as any }, { $setOnInsert: {
      requestId: args.requestId, runId: args.runId, userId: args.userId,
      projectId: args.projectId, conversationId: args.conversationId,
      model: args.model.id, epoch: args.epoch, prefixHash: args.prefixHash,
      estimatedInput: args.estimatedInput, latencyMs: args.latencyMs, ttftMs: args.ttftMs,
      reason: args.reason, profile, totalInput,
      estimationError: Math.max(0, totalInput - args.estimatedInput),
      ordinaryInput: args.usage.input, cacheRead: args.usage.cacheRead,
      cacheWrite: args.usage.cacheWrite, output: args.usage.output,
      usageCompleteness: args.usage.cacheReadKnown && args.usage.cacheWriteKnown ? 'complete' : 'partial',
      priceScheduleVersion: args.model.compat?.profileVersion || null,
      cost: price, occurredAt: new Date(),
    } }, { upsert: true });
    if (inserted.upsertedCount) {
      const occurredAt = new Date();
      const day = occurredAt.toISOString().slice(0, 10);
      const dailyId = createHash('sha256').update(JSON.stringify([args.userId, profile, day])).digest('hex');
      await mongoose.connection.db!.collection('copilot_request_metric_daily').updateOne({
        _id: dailyId as any,
      }, {
        $setOnInsert: { userId: args.userId, profile, model: args.model.id, day,
          expiresAt: new Date(occurredAt.getTime() + 180 * 24 * 60 * 60 * 1000) },
        $inc: { calls: 1, estimatedInput: args.estimatedInput, totalInput,
          ordinaryInput: args.usage.input, cacheRead: args.usage.cacheRead,
          cacheWrite: args.usage.cacheWrite, output: args.usage.output,
          completeUsageCalls: args.usage.cacheReadKnown && args.usage.cacheWriteKnown ? 1 : 0,
          knownCost: price || 0, knownCostCalls: price === null ? 0 : 1,
          latencyMs: args.latencyMs, ttftMs: args.ttftMs || 0 },
      }, { upsert: true });
    }
  }
}
