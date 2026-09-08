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
import { compileOutcome } from '@overleaf/copilot-contracts';

export function buildCompileTools(
  context: any = {},
  { webClient, userId }: { webClient: WebApiClient; userId?: string }
) {
  const projectId = context.project?.projectId;
  const snapshotId = context.project?.sourceSnapshot?.id;
  const requests = new Map<string, ReturnType<WebApiClient['compileProject']>>();

  const compileProject: AgentTool<any, Record<string, never>> = {
    name: 'compile_project',
    label: 'compile_project',
    description:
      'Compile an immutable whole-project source version and return {snapshotId, patchId?, candidateHash?, status, verificationStatus, errorCount, errors, warningCount}. Only verificationStatus=passed proves successful compilation. Pass patchId to compile the exact proposed patch over its baseline before asking the author to apply it; omit patchId to verify the current snapshot. A clean candidate compile proves only compilation, not semantic correctness or application. Calls for the same target share one request within this turn. Unavailable verification must not be retried blindly.',
    parameters: { type: 'object', properties: { patchId: { type: 'string', pattern: '^patch_[a-f0-9]{24}$' } }, additionalProperties: false },
    executionMode: 'sequential',
    async execute(toolCallId, args: { patchId?: string }, signal) {
      signal?.throwIfAborted();
      if (!projectId) {
        throw new Error('project.projectId is missing from context');
      }
      if (!snapshotId) throw new Error('A versioned project snapshot is required for compilation');
      const target = args.patchId || 'snapshot';
      // Preserve even a rejected/unknown request for this turn: a new model
      // call ID is not evidence that it is safe to repeat a remote compile.
      if (!requests.has(target)) requests.set(target, webClient.compileProject(projectId, userId, snapshotId, toolCallId, args.patchId, signal));
      const result = await requests.get(target)!;
      if (result.snapshotId !== snapshotId || (result.patchId || undefined) !== args.patchId) {
        throw new Error('Compile result does not match the requested snapshot/patch');
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, verificationStatus: compileOutcome(result) }) }], details: {} };
    },
  };

  return [compileProject];
}
