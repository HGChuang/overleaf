import settings from '@overleaf/settings';

type SemanticNode = { id: string; path: string; sourceHash: string; startByte: number; endByte: number; text: string };
const configured = () => Boolean(settings.COPILOT_QDRANT_URL && settings.COPILOT_EMBEDDING_URL && settings.COPILOT_EMBEDDING_MODEL);
const uuid = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

export class SemanticIndex {
  private collection = 'copilot_paper_nodes_v1';
  private headers() { return { 'content-type': 'application/json', ...(settings.COPILOT_QDRANT_API_KEY ? { 'api-key': settings.COPILOT_QDRANT_API_KEY } : {}) }; }
  private async embedding(text: string) {
    const response = await fetch(`${String(settings.COPILOT_EMBEDDING_URL).replace(/\/$/, '')}/embeddings`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(settings.COPILOT_EMBEDDING_API_KEY ? { authorization: `Bearer ${settings.COPILOT_EMBEDDING_API_KEY}` } : {}) },
      body: JSON.stringify({ model: settings.COPILOT_EMBEDDING_MODEL, input: text }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding HTTP ${response.status}`);
    const data: any = await response.json();
    if (!Array.isArray(data.data?.[0]?.embedding) || !data.data[0].embedding.length ||
      data.data[0].embedding.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid embedding response');
    return data.data[0].embedding as number[];
  }
  async index(projectId: string, snapshotId: string, nodes: SemanticNode[]) {
    if (!configured() || !nodes.length) return { status: 'disabled' };
    const first = await this.embedding(nodes[0].text);
    const collection = await fetch(`${settings.COPILOT_QDRANT_URL}/collections/${this.collection}`, { method: 'PUT', headers: this.headers(),
      body: JSON.stringify({ vectors: { size: first.length, distance: 'Cosine' } }), signal: AbortSignal.timeout(30_000) });
    if (!collection.ok && collection.status !== 409) throw new Error(`Qdrant collection HTTP ${collection.status}`);
    for (let offset = 0; offset < nodes.length; offset += 32) {
      const batch = nodes.slice(offset, offset + 32);
      const vectors = await Promise.all(batch.map((node, index) => offset === 0 && index === 0 ? first : this.embedding(node.text)));
      const response = await fetch(`${settings.COPILOT_QDRANT_URL}/collections/${this.collection}/points?wait=true`, {
        method: 'PUT', headers: this.headers(), signal: AbortSignal.timeout(30_000), body: JSON.stringify({ points: batch.map((node, index) => ({
          id: uuid(node.id), vector: vectors[index], payload: { projectId, snapshotId, ...node, text: undefined },
        })) }),
      });
      if (!response.ok) throw new Error(`Qdrant upsert HTTP ${response.status}`);
    }
    return { status: 'ready' };
  }
  async search(projectId: string, snapshotId: string, query: string) {
    if (!configured()) return { matches: [], status: 'disabled' };
    try {
      const vector = await this.embedding(query);
      const response = await fetch(`${settings.COPILOT_QDRANT_URL}/collections/${this.collection}/points/search`, {
        method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(30_000), body: JSON.stringify({ vector, limit: 8,
          filter: { must: [{ key: 'projectId', match: { value: projectId } }, { key: 'snapshotId', match: { value: snapshotId } }] }, with_payload: true }),
      });
      if (!response.ok) throw new Error(`Qdrant search HTTP ${response.status}`);
      const data: any = await response.json();
      return { status: 'ready', matches: (data.result || []).map((item: any) => ({ ...item.payload, score: item.score })) };
    } catch (error) {
      return { matches: [], status: 'degraded', reason: error instanceof Error ? error.message : String(error) };
    }
  }
  async deleteSnapshot(projectId: string, snapshotId: string) {
    if (!configured()) return;
    await fetch(`${settings.COPILOT_QDRANT_URL}/collections/${this.collection}/points/delete?wait=true`, {
      method: 'POST', headers: this.headers(), signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ filter: { must: [
        { key: 'projectId', match: { value: projectId } },
        { key: 'snapshotId', match: { value: snapshotId } },
      ] } }),
    });
  }
}
