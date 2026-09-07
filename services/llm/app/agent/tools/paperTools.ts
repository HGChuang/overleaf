import { PaperIndex } from '../context/paper-index.js';
import { defineTool } from './baseTool.js';
import type { ToolPoolDeps } from './provider.js';

export function buildPaperTools(context: any, deps: ToolPoolDeps) {
  let index: PaperIndex | undefined;
  const getIndex = () => {
    if (!deps.loadFile || !deps.userId || !context.project.sourceSnapshot?.id) throw new Error('Versioned paper index unavailable for this source');
    return index ||= new PaperIndex({ userId: deps.userId, projectId: context.project.projectId,
      conversationId: context.conversation.conversationId }, context.project.sourceSnapshot, deps.loadFile);
  };
  return [
    defineTool({ name: 'search_paper', description: 'Search exact-version paper source windows and citation/definition locators. Does not imply a review. Page with nextCursor.',
      parameters: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 1000 }, cursor: { type: 'integer', minimum: 0, maximum: 100000 } }, required: ['query'] },
      handler: async ({ query, cursor = 0 }) => JSON.stringify(await getIndex().search(query, cursor)) }),
    defineTool({ name: 'read_evidence', description: 'Materialize original source for a paper node and its reference/definition dependency closure, one exact window per call. Follow nextDependencyCursor with the SAME nodeId until null. IDs alone are not visible evidence.',
      parameters: { type: 'object', properties: { nodeId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, dependencyCursor: { type: 'integer', minimum: 0, maximum: 10000 } }, required: ['nodeId'] },
      handler: async ({ nodeId, dependencyCursor = 0 }) => JSON.stringify(await getIndex().evidence(nodeId, dependencyCursor)) }),
    defineTool({ name: 'record_paper_review', description: 'Record an explicit model review against an exact quote and criterion. Separate from read coverage, compile results, patch application and academic truth. Only current-version source quotes are accepted.',
      parameters: { type: 'object', properties: { nodeId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, quote: { type: 'string', minLength: 1, maxLength: 4096 }, criterion: { type: 'string', minLength: 1, maxLength: 1000 }, verdict: { type: 'string', enum: ['pass', 'risk', 'unknown'] } }, required: ['nodeId', 'quote', 'criterion', 'verdict'] },
      handler: async args => JSON.stringify(await getIndex().recordReview(args)) }),
    defineTool({ name: 'paper_review_status', description: 'Get explicit review coverage and outstanding windows at this snapshot; older snapshot reviews are stale, not current completed coverage.',
      parameters: { type: 'object', properties: {} }, handler: async () => JSON.stringify(await getIndex().status()) }),
  ];
}
