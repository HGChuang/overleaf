import { defineTool } from './baseTool.js';
import type { ToolPoolDeps } from './provider.js';

export function buildMemoryTools(deps: ToolPoolDeps) {
  return deps.proposeMemory ? [defineTool({
    name: 'propose_memory',
    description: 'Propose a durable author preference using an exact quote from the author. It remains a candidate until the user confirms it in the context panel.',
    parameters: { type: 'object', properties: { value: { type: 'string', minLength: 1, maxLength: 1000 },
      sourceQuote: { type: 'string', minLength: 1, maxLength: 2000 },
      scope: { type: 'string', enum: ['project', 'user'] } }, required: ['value', 'sourceQuote', 'scope'] },
    handler: async args => JSON.stringify(await deps.proposeMemory!(args)),
  })] : [];
}
