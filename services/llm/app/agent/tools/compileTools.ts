// Compile-verification tool for the self-healing loop. `compile_project`
// asks the web service to run a FRESH LaTeX compile (post-patch source,
// flushed to Mongo web-side) and returns the parsed error list — the
// authoritative verifier signal the agent must use instead of guessing
// whether its fix worked.
//
// The tool THROWS on transport failure (baseTool/agent-loop encodes it as an
// isError tool result the model can read and react to).

import { defineTool } from './baseTool.js';
import type { WebApiClient } from '../../llm/webApiClient.js';

export function buildCompileTools(
  context: any = {},
  { webClient }: { webClient: WebApiClient }
) {
  const projectId = context.project?.projectId;

  const compileProject = defineTool({
    name: 'compile_project',
    description:
      'Trigger a FRESH LaTeX compile of the whole project and return the authoritative parse result: {status, errorCount, errors: [{file, line, message}], warningCount}. EXPENSIVE (up to ~2 minutes) — call exactly ONCE per verification round: after the user applied your patch (verify the fix), or when you need the real compile error list instead of inferring from source. errorCount=0 means the compile is clean — only then may you declare the fix successful. errorCount=null means verification was unavailable (see note); tell the user instead of retrying blindly.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      if (!projectId) {
        throw new Error('project.projectId is missing from context');
      }
      const result = await webClient.compileProject(projectId);
      return JSON.stringify(result);
    },
  });

  return [compileProject];
}
