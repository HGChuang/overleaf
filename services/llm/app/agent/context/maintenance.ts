import mongoose from 'mongoose';
import { SemanticIndex } from './semantic-index.js';

export class ContextMaintenance {
  private timer?: NodeJS.Timeout;
  start() {
    if (this.timer) return;
    void this.run().catch(() => {});
    this.timer = setInterval(() => void this.run().catch(() => {}), 24 * 60 * 60 * 1000);
    this.timer.unref();
  }
  async run(now = new Date()) {
    if (!mongoose.connection.db) return;
    const db = mongoose.connection.db;
    const grace = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const refs = new Set<string>();
    const collect = (value: any) => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.blob === 'string') refs.add(value.blob);
      for (const child of Object.values(value)) collect(child);
    };
    for (const name of ['copilot_events', 'copilot_tool_receipts', 'copilot_context_epochs', 'copilot_conversations']) {
      for await (const row of db.collection(name).find({}, { projection: { payload: 1, epoch: 1 } })) collect(row);
    }
    const files = db.collection('copilot_context_artifacts.files');
    for await (const file of files.find({ uploadDate: { $lt: grace } }, { projection: { _id: 1 } })) {
      if (refs.has(file._id.toHexString())) continue;
      await db.collection('copilot_context_artifacts.chunks').deleteMany({ files_id: file._id });
      await files.deleteOne({ _id: file._id });
    }
    await db.collection('copilot_request_metrics').deleteMany({ occurredAt: { $lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } });
    await db.collection('copilot_summary_artifacts').deleteMany({ lastUsedAt: { $lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } });
    await db.collection('copilot_memories').deleteMany({ validity: 'superseded', deletedAt: { $lt: grace } });
    const indexGrace = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    for await (const index of db.collection('copilot_paper_indexes').find({
      $or: [{ lastUsedAt: { $lt: indexGrace } }, { lastUsedAt: { $exists: false }, createdAt: { $lt: indexGrace } }],
    }, { projection: { _id: 1, projectId: 1, snapshotId: 1 } })) {
      await Promise.all([
        db.collection('copilot_paper_nodes').deleteMany({ indexId: index._id }),
        db.collection('copilot_paper_terms').deleteMany({ indexId: index._id }),
        db.collection('copilot_paper_edges').deleteMany({ indexId: index._id }),
      ]);
      await db.collection('copilot_paper_indexes').deleteOne({ _id: index._id });
      if (index.projectId && index.snapshotId) await new SemanticIndex().deleteSnapshot(index.projectId, index.snapshotId).catch(() => {});
    }
  }
}
