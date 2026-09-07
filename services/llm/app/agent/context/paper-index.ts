import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import mongoose from 'mongoose';
import { sourcePage } from './source-evidence.js';
import { SemanticIndex } from './semantic-index.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function terms(text: string) {
  const normalized = text.toLowerCase();
  const result = new Set(normalized.match(/[\p{L}\p{N}_:-]+/gu) || []);
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) || []) {
    const chars = [...run];
    for (const char of chars) result.add(char);
    for (let index = 0; index + 1 < chars.length; index++) result.add(chars[index] + chars[index + 1]);
  }
  return [...result];
}
async function flush(collection: any, operations: any[]) {
  if (!operations.length) return;
  await collection.bulkWrite(operations.splice(0), { ordered: false });
}
function includeSymbol(target: string, extension = '.tex') {
  const clean = target.trim().replace(/^\.\//, '');
  const withExtension = posix.extname(clean) ? clean : `${clean}${extension}`;
  return `file:${posix.normalize(withExtension)}`;
}
export interface PaperNode {
  id: string; path: string; sourceHash: string; startByte: number; endByte: number;
  kind: 'section' | 'paragraph' | 'equation' | 'table' | 'figure' | 'bibliography' | 'definition';
  anchor?: string; parserVersion: 2; terms: string[];
  defines: string[]; uses: string[]; atoms: string[];
}

/** Static locators are evidence, not a claim to completely interpret arbitrary TeX. */
export class PaperIndex {
  private ready?: Promise<void>;
  private initialized?: Promise<void>;
  private nodes: PaperNode[] = [];
  private indexId?: string;
  private definitions = new Map<string, PaperNode[]>();
  private semantic = new SemanticIndex();
  constructor(private scope: { userId: string; projectId: string; conversationId: string },
    private snapshot: any, private loadFile: (path: string) => Promise<string>) {}
  private get db() {
    if (!mongoose.connection.db) throw new Error('Paper index database unavailable');
    return mongoose.connection.db;
  }
  private owner() { return { userId: this.scope.userId, projectId: this.scope.projectId, conversationId: this.scope.conversationId }; }
  private rebuildDefinitions() {
    this.definitions.clear();
    for (const node of this.nodes) for (const symbol of node.defines) {
      this.definitions.set(symbol, [...(this.definitions.get(symbol) || []), node]);
    }
  }
  private initialize() {
    return this.initialized ||= (async () => {
      // Creating the versioned index also creates the collection on a fresh
      // deployment, so the following index inventory is always defined.
      await this.db.collection('copilot_paper_indexes').createIndex(
        { projectId: 1, snapshotId: 1, parserVersion: 1 },
        { name: 'project_snapshot_parser' },
      );
      const indexes = await this.db.collection('copilot_paper_indexes').indexes();
      const legacy = indexes.find(index => index.unique && index.key?.projectId === 1 &&
        index.key?.snapshotId === 1 && Object.keys(index.key).length === 2);
      if (legacy) try { await this.db.collection('copilot_paper_indexes').dropIndex(legacy.name!); }
      catch (error) { if ((error as { code?: number }).code !== 27) throw error; }
      await Promise.all([
        this.db.collection('copilot_paper_nodes').createIndex({ indexId: 1 }),
        this.db.collection('copilot_paper_terms').createIndex({ indexId: 1, term: 1 }),
        this.db.collection('copilot_paper_edges').createIndex({ indexId: 1, from: 1 }),
        this.db.collection('copilot_paper_reviews').createIndex({ userId: 1, projectId: 1, conversationId: 1, snapshotId: 1 }),
      ]);
    })().catch(error => { this.initialized = undefined; throw error; });
  }
  async ensure() {
    if (!this.ready) this.ready = this.build().catch(error => { this.ready = undefined; throw error; });
    return this.ready;
  }
  private async build() {
    await this.initialize();
    const cacheId = hash(`${this.scope.projectId}:${this.snapshot.id}:paper-index-v2`);
    this.indexId = cacheId;
    const existing = await this.db.collection('copilot_paper_indexes').findOne({ _id: cacheId as any });
    if (existing?.complete) {
      await this.db.collection('copilot_paper_indexes').updateOne({ _id: cacheId as any }, { $set: { lastUsedAt: new Date() } });
      this.nodes = (await this.db.collection('copilot_paper_nodes').find({ indexId: cacheId }).toArray()).map(row => row.node as PaperNode);
      this.nodes.sort((a, b) => a.path.localeCompare(b.path) || a.startByte - b.startByte);
      this.rebuildDefinitions();
      return;
    }
    const nodes: PaperNode[] = [];
    const semanticNodes: Array<PaperNode & { text: string }> = [];
    for (const file of this.snapshot.docs) {
      const source = await this.loadFile(file.path);
      if (hash(source) !== file.sha256) throw new Error('Index source version mismatch');
      // Preserve exact source offsets. Chunk boundaries are retrieval windows,
      // not inferred chapter/claim boundaries; dynamic TeX remains unresolved.
      let start = 0;
      while (start < Buffer.byteLength(source)) {
        const page = sourcePage(file.path, source, { offsetBytes: start,
          snapshotId: this.snapshot.id, docId: file.docId, version: file.version });
        const text = page.content;
        const defines: string[] = [], uses: string[] = [];
        if (start === 0) defines.push(`file:${file.path}`);
        for (const m of text.matchAll(/\\label\{([^}]+)\}|@\w+\s*\{\s*([^,]+),|\\(?:newcommand|renewcommand|providecommand)\*?\s*\{?(\\[a-zA-Z@]+)/g)) {
          defines.push(m[1] ? `label:${m[1]}` : m[2] ? `cite:${m[2].trim()}` : `macro:${m[3]}`);
        }
        for (const m of text.matchAll(/\\(?:ref|eqref|autoref|cref|Cref)\{([^}]+)\}|\\cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]+)\}|(\\[a-zA-Z@]+)/g)) {
          if (m[1]) uses.push(...m[1].split(',').map(x => `label:${x.trim()}`));
          else if (m[2]) uses.push(...m[2].split(',').map(x => `cite:${x.trim()}`));
          else uses.push(`macro:${m[3]}`);
        }
        for (const match of text.matchAll(/\\(?:input|include|subfile)\{([^}]+)\}/g)) uses.push(includeSymbol(match[1]));
        for (const match of text.matchAll(/\\bibliography\{([^}]+)\}/g)) {
          for (const target of match[1].split(',')) uses.push(includeSymbol(target, '.bib'));
        }
        for (const match of text.matchAll(/\\addbibresource(?:\[[^\]]*\])?\{([^}]+)\}/g)) uses.push(includeSymbol(match[1], '.bib'));
        const atoms = [...text.matchAll(/\b(?:may|might|could|suggests?|significant(?:ly)?|not|only|approximately)\b|[-+]?\d+(?:\.\d+)?(?:\s*(?:%|ms|s|kg|mm|cm|Hz|MHz|GHz|MB|GB|KiB|MiB))?|\$[^$\n]+\$|\\\[[\s\S]*?\\\]/g)].map(m => m[0]);
        const section = [...text.matchAll(/\\(?:part|chapter|section|subsection|subsubsection)\*?\{([^}]*)\}/g)].at(-1)?.[1];
        const kind: PaperNode['kind'] = file.path.endsWith('.bib') ? 'bibliography'
          : /\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?)\}/.test(text) ? 'equation'
            : /\\begin\{(?:table\*?|tabular\*?)\}/.test(text) ? 'table'
              : /\\begin\{figure\*?\}/.test(text) ? 'figure'
                : defines.some(x => x.startsWith('macro:')) ? 'definition'
                  : section ? 'section' : 'paragraph';
        nodes.push({ id: hash(`${cacheId}:${file.docId || file.path}:${start}:${page.endByte}`), path: file.path,
          sourceHash: file.sha256, startByte: start, endByte: page.endByte,
          kind, anchor: section, parserVersion: 2,
          terms: terms(text), defines, uses: [...new Set(uses)], atoms });
        semanticNodes.push({ ...nodes[nodes.length - 1], text });
        start = page.endByte;
      }
    }
    const definitions = new Map<string, string[]>();
    for (const node of nodes) for (const symbol of node.defines) definitions.set(symbol, [...(definitions.get(symbol) || []), node.id]);
    const nodeOps: any[] = [], edgeOps: any[] = [], termOps: any[] = [];
    for (const node of nodes) {
      nodeOps.push({ updateOne: { filter: { _id: node.id as any }, update: { $setOnInsert: {
        indexId: cacheId, projectId: this.scope.projectId, snapshotId: this.snapshot.id, node,
      } }, upsert: true } });
      for (const symbol of node.uses) for (const target of definitions.get(symbol) || []) {
        const id = hash(`${node.id}:${symbol}:${target}`);
        edgeOps.push({ updateOne: { filter: { _id: id as any }, update: { $setOnInsert: {
          indexId: cacheId, from: node.id, to: target, symbol, basis: 'static-source-reference',
        } }, upsert: true } });
      }
      for (const term of node.terms) termOps.push({ updateOne: {
        filter: { _id: hash(`${cacheId}:${term}:${node.id}`) as any },
        update: { $setOnInsert: { indexId: cacheId, term, nodeId: node.id } }, upsert: true,
      } });
      if (nodeOps.length >= 500) await flush(this.db.collection('copilot_paper_nodes'), nodeOps);
      if (edgeOps.length >= 1000) await flush(this.db.collection('copilot_paper_edges'), edgeOps);
      if (termOps.length >= 1000) await flush(this.db.collection('copilot_paper_terms'), termOps);
    }
    await flush(this.db.collection('copilot_paper_nodes'), nodeOps);
    await flush(this.db.collection('copilot_paper_edges'), edgeOps);
    await flush(this.db.collection('copilot_paper_terms'), termOps);
    await this.db.collection('copilot_paper_indexes').updateOne({ _id: cacheId as any }, { $set: {
      complete: true, count: nodes.length, snapshotId: this.snapshot.id,
      projectId: this.scope.projectId, parserVersion: 2, semanticStatus: 'building', createdAt: new Date(), lastUsedAt: new Date(),
    } }, { upsert: true });
    this.nodes = nodes;
    this.rebuildDefinitions();
    void this.semantic.index(this.scope.projectId, this.snapshot.id, semanticNodes)
      .then(result => this.db.collection('copilot_paper_indexes').updateOne({ _id: cacheId as any }, {
        $set: { semanticStatus: result.status, semanticUpdatedAt: new Date() },
      })).catch(error => this.db.collection('copilot_paper_indexes').updateOne({ _id: cacheId as any }, {
        $set: { semanticStatus: 'degraded', semanticReason: error instanceof Error ? error.message : String(error), semanticUpdatedAt: new Date() },
      }));
  }
  async search(query: string, cursor = 0) {
    if (!query.trim() || query.length > 1000 || !Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid paper search');
    await this.ensure();
    const words = terms(query);
    const nodeMap = new Map(this.nodes.map(node => [node.id, node]));
    const termHits = words.length ? await this.db.collection('copilot_paper_terms').aggregate([
      { $match: { indexId: this.indexId, term: { $in: words } } },
      { $group: { _id: '$nodeId', score: { $sum: 1 } } },
      { $sort: { score: -1, _id: 1 } },
      { $limit: Math.min(1000, cursor + 64) },
    ]).toArray() : [];
    const ranked = termHits.map(row => ({ node: nodeMap.get(String(row._id)), score: Number(row.score) }))
      .filter((entry): entry is { node: PaperNode; score: number } => Boolean(entry.node));
    const semantic = cursor === 0 ? await this.semantic.search(this.scope.projectId, this.snapshot.id, query) : { status: 'paged', matches: [] };
    const merged = [...ranked.map(x => ({ ...x.node, terms: undefined, atoms: undefined, score: x.score, retrieval: 'lexical' })),
      ...semantic.matches.map((x: any) => ({ ...x, retrieval: 'semantic' }))]
      .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
    return { snapshotId: this.snapshot.id, matches: merged.slice(cursor, cursor + 8),
      nextCursor: cursor + 8 < merged.length ? cursor + 8 : null,
      semanticStatus: semantic.status, semanticReason: (semantic as any).reason,
      limitation: 'Static source windows; dynamic TeX and reference support require explicit review.' };
  }
  async evidence(nodeId: string, dependencyCursor = 0) {
    if (!/^[a-f0-9]{64}$/.test(nodeId) || !Number.isSafeInteger(dependencyCursor) || dependencyCursor < 0) throw new Error('Invalid evidence locator');
    await this.ensure();
    const node = this.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error('Evidence does not belong to the current snapshot');
    const wanted = [node];
    const visited = new Set([node.id]);
    const unresolved = new Set<string>();
    const dynamicOrBuiltinMacros = new Set<string>();
    for (let i = 0; i < wanted.length; i++) for (const symbol of wanted[i].uses) {
      const definitions = this.definitions.get(symbol) || [];
      if (!definitions.length) {
        if (symbol.startsWith('macro:')) dynamicOrBuiltinMacros.add(symbol);
        else unresolved.add(symbol);
      }
      for (const definition of definitions) if (!visited.has(definition.id)) { visited.add(definition.id); wanted.push(definition); }
    }
    const chosen = wanted[dependencyCursor];
    if (!chosen) throw new Error('Dependency cursor outside evidence closure');
    const source = await this.loadFile(chosen.path);
    const content = Buffer.from(source).subarray(chosen.startByte, chosen.endByte).toString('utf8');
    if (hash(source) !== chosen.sourceHash) throw new Error('Evidence is stale');
    return { node: { ...chosen, terms: undefined }, content, snapshotId: this.snapshot.id, authority: 'source',
      nextDependencyCursor: dependencyCursor + 1 < wanted.length ? dependencyCursor + 1 : null,
      dependencyCount: wanted.length, unresolved: [...unresolved],
      dynamicOrBuiltinMacros: [...dynamicOrBuiltinMacros].slice(0, 50), auditStatus: 'not-implied-by-reading' };
  }
  async recordReview(input: { nodeId: string; verdict: string; quote: string; criterion: string }) {
    await this.ensure();
    const evidence = await this.evidence(input.nodeId);
    if (!input.quote || input.quote.length > 4096 || !evidence.content.includes(input.quote) ||
      !input.criterion || input.criterion.length > 1000 || !['pass', 'risk', 'unknown'].includes(input.verdict)) throw new Error('Review requires exact evidence, criterion and a supported verdict');
    const id = hash(JSON.stringify([this.owner(), this.snapshot.id, input]));
    await this.db.collection('copilot_paper_reviews').updateOne({ _id: id as any }, { $setOnInsert: {
      ...this.owner(), snapshotId: this.snapshot.id, fileHash: evidence.node.sourceHash,
      sourceRange: { path: evidence.node.path, startByte: evidence.node.startByte, endByte: evidence.node.endByte },
      ...input, basis: 'model-reviewed-not-independently-verified', createdAt: new Date(),
    } }, { upsert: true });
    return { id, status: 'review-recorded', basis: 'model-reviewed-not-independently-verified', snapshotId: this.snapshot.id };
  }
  async status() {
    await this.ensure();
    const reviews = await this.db.collection('copilot_paper_reviews').find(this.owner()).toArray();
    const current = reviews.filter(x => x.snapshotId === this.snapshot.id);
    const byKind = Object.fromEntries([...new Set(this.nodes.map(node => node.kind))].map(kind => [kind, {
      total: this.nodes.filter(node => node.kind === kind).length,
      reviewed: new Set(current.filter(review => this.nodes.find(node => node.id === review.nodeId)?.kind === kind).map(review => review.nodeId)).size,
    }]));
    return { snapshotId: this.snapshot.id, sourceWindows: this.nodes.length,
      reviewedWindows: new Set(current.map(x => x.nodeId)).size, staleReviews: reviews.length - current.length,
      byKind,
      remainingNodeIds: this.nodes.filter(node => !current.some(x => x.nodeId === node.id)).slice(0, 30).map(node => node.id),
      risks: current.filter(x => x.verdict !== 'pass').slice(0, 20), coverageMeaning: 'explicit model review, not academic truth or compile verification' };
  }
}
