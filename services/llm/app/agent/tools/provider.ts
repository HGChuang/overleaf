// Per-request tool pool for the Copilot agent.
//
// `buildToolPool(context)` returns ONE flat array of tools spanning every
// domain the agent can reach:
//   - project navigation (list_project_files, read_file, read_file_fragment,
//     search_project) — always available, so the chat path has hands;
//   - todo_write — plan tracking for multi-step tasks;
//   - submit_patch — propose a structured {oldText,newText} patch (inline-diff
//     preview + Accept/Reject) instead of returning the whole document.
//
// The MODEL decides which tools to call. That is the "意图识别 = model-driven
// tool selection" design.

import { buildPaperTools } from './paperTools.js';
import { buildProjectTools } from './projectTools.js';
import { buildEditTools } from './editTools.js';
import { buildTodoTools } from './todoTool.js';
import { buildCompileTools } from './compileTools.js';
import { buildMemoryTools } from './memoryTools.js';
import type { WebApiClient } from '../../llm/webApiClient.js';

export interface ToolPoolDeps {
  /** Required for compile_project; when absent (e.g. unit tests that don't
   * exercise verification) the compile tool is simply omitted from the pool. */
  webClient?: WebApiClient;
  userId?: string;
  loadFile?: (path: string) => Promise<string>;
  proposeMemory?: (args: { value: string; sourceQuote: string; scope: 'project' | 'user' }) => Promise<unknown>;
}

export function buildToolPool(context = {}, deps: ToolPoolDeps = {}) {
  return [
    ...buildProjectTools(context, deps),
    ...buildPaperTools(context, deps),
    ...buildMemoryTools(deps),
    ...buildTodoTools(),
    ...buildEditTools(context, deps),
    ...(deps.webClient ? buildCompileTools(context, { webClient: deps.webClient, userId: deps.userId }) : []),
  ];
}
