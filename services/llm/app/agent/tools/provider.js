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

import { buildProjectTools } from './projectTools.js';
import { buildEditTools } from './editTools.js';
import { buildTodoTools } from './todoTool.js';

export function buildToolPool(context = {}) {
  return [
    ...buildProjectTools(context),
    ...buildTodoTools(),
    ...buildEditTools(),
  ];
}
