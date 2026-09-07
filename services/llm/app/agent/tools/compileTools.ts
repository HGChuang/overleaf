// Compile-verification tool for the self-healing loop. `compile_project`
// asks the web service to run a FRESH LaTeX compile (post-patch source,
// flushed to Mongo web-side) and returns the parsed error list — the
// authoritative verifier signal the agent must use instead of guessing
// whether its fix worked.
//
// The tool THROWS on transport failure (baseTool/agent-loop encodes it as an
// isError tool result the model can read and react to).

import type { WebApiClient } from '../../llm/webApiClient.js';
import type { AgentTool } from '../core/types.js';

export function buildCompileTools(
  context: any = {},
  { webClient, userId }: { webClient: WebApiClient; userId?: string }
) {
  const projectId = context.project?.projectId;

  const compileProject: AgentTool<any, Record<string, never>> = {
    name: 'compile_project',
    label: 'compile_project',
    description:
      'Compile an immutable whole-project source version and return {snapshotId, patchId?, candidateHash?, status, errorCount, errors, warningCount}. Pass patchId to compile the exact proposed patch over its baseline before asking the author to apply it; omit patchId to verify the current snapshot. A clean candidate compile proves only compilation, not semantic correctness or application. Call once per distinct verification target. errorCount=null means unavailable and must not be retried blindly.',
    parameters: { type: 'object', properties: { patchId: { type: 'string', pattern: '^patch_[a-f0-9]{24}$' } }, additionalProperties: false },
    async execute(toolCallId, args: { patchId?: string }) {
      if (!projectId) {
        throw new Error('project.projectId is missing from context');
      }
      const result = await webClient.compileProject(projectId, userId, context.project?.sourceSnapshot?.id, toolCallId, args.patchId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: {} };
    },
  };

  return [compileProject];
}
