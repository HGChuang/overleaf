import settings from '@overleaf/settings';
import type { AgentTool, AgentToolResult } from '../core/types.js';
import type { WebApiClient } from '../../llm/webApiClient.js';
import { SandboxWorkspace, type SandboxPatchHunk } from '../sandbox/workspace.js';
import { defineTool } from './baseTool.js';

const MAX_COMPILES = Math.max(1, Math.min(10, Number(settings.COPILOT_SANDBOX_MAX_COMPILES) || 3));

const HunkSchema = {
  type: 'object',
  properties: {
    file: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    line: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    oldText: {
      type: 'string',
      description: 'Exact non-empty text in the current sandbox snapshot',
    },
    newText: { type: 'string' },
  },
  required: ['file', 'line', 'oldText', 'newText'],
};

export function buildSandboxTools(
  context: any,
  { workspace, webClient }: { workspace: SandboxWorkspace; webClient: WebApiClient }
) {
  const projectId = context.project?.projectId;

  const applyPatch = defineTool({
    name: 'sandbox_apply_patch',
    description:
      'Apply replacement hunks ONLY to the private shadow workspace. This never changes the live Overleaf project. oldText must match the CURRENT sandbox source; after a failed compile, inspect the sandbox with read_file/read_file_fragment and apply an incremental repair. Pure insertions and file creation are not supported in this iteration.',
    parameters: {
      type: 'object',
      properties: {
        hunks: { type: 'array', items: HunkSchema, minItems: 1, maxItems: 50 },
      },
      required: ['hunks'],
    },
    executionMode: 'sequential',
    handler: async ({ hunks }: { hunks: SandboxPatchHunk[] }) =>
      JSON.stringify({
        applied: true,
        ...workspace.apply(hunks),
        liveProjectChanged: false,
      }),
  });

  const compile = defineTool({
    name: 'sandbox_compile',
    description:
      'Compile the CURRENT private shadow workspace through the restricted Web→CLSI compile broker. Does not compile or mutate the live project. Must be called after sandbox_apply_patch and before submit_sandbox. At most three calls are allowed per agent turn.',
    parameters: { type: 'object', properties: {} },
    executionMode: 'sequential',
    handler: async () => {
      if (!projectId) throw new Error('project.projectId is missing from context');
      if (workspace.currentHash === workspace.baseHash)
        throw new Error('sandbox has no changes to compile');
      if (workspace.compileCount >= MAX_COMPILES) {
        throw new Error(`sandbox compile budget exhausted (${MAX_COMPILES}/${MAX_COMPILES})`);
      }
      const ordinal = workspace.beginCompile();
      const result = await webClient.compileSandbox(projectId, {
        baseHash: workspace.baseHash,
        workspaceHash: workspace.currentHash,
        files: workspace.files(),
      });
      if (result.inputWorkspaceHash !== workspace.currentHash) {
        throw new Error('sandbox compile attestation does not match the submitted workspace');
      }
      workspace.recordVerification({
        status: result.status,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
      });
      return JSON.stringify({
        ...result,
        compileOrdinal: ordinal,
        liveProjectChanged: false,
      });
    },
  });

  const submit: AgentTool<any, Record<string, unknown>> = {
    name: 'submit_sandbox',
    label: 'submit_sandbox',
    description:
      'Submit the compiled sandbox delta for user review and END the turn. Takes only a summary: the server derives safe oldText/newText hunks from the immutable base snapshot. Refuses unless the CURRENT sandbox workspace most recently compiled with status=success and errorCount=0.',
    parameters: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    } as any,
    executionMode: 'sequential',
    async execute(_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> {
      const patch = workspace.exportPatch(
        String((params as any)?.summary || 'Verified sandbox change')
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              submitted: true,
              count: patch.hunks.length,
              verified: true,
            }),
          },
        ],
        details: { sandboxPatch: patch },
        terminate: true,
      };
    },
  };

  return [applyPatch, compile, submit];
}
