// Unified per-request tool pool for the Copilot agent.
//
// `buildToolPool(context, intentHint)` returns ONE flat array of tools spanning
// every domain the agent can reach:
//   - project navigation (list_project_files, read_file, read_file_fragment,
//     search_project) — always available, so the chat path finally has hands;
//   - quality checks (run_checks) — always available; the model calls it when
//     the user asks to "check" the project (model-driven intent, no longer a
//     hardcoded path);
//   - compile-diagnose tools (list_compile_errors, classify_latex_error,
//     submit_diagnostics) — only when a compile log / annotations are in
//     context, so the model can drive the structured diagnosis flow.
//
// The `intentHint` does NOT route — it only biases the system prompt (see
// prompts.js). The MODEL decides which tools to call. That is the
// "意图识别 = model-driven tool selection" design.

import { buildProjectTools } from './projectTools.js';
import { buildChecksTools } from './checksTools.js';
import { buildCompileTools } from './compileTools.js';
import { buildEditTools } from './editTools.js';
import { buildTodoTools } from './todoTool.js';

export function buildToolPool(context = {}, intentHint = 'chat') {
  const tools = [
    ...buildProjectTools(context),
    ...buildChecksTools(context),
    ...buildTodoTools(),
  ];

  // Compile-diagnose tools are only meaningful when there is a compile log or
  // parsed annotations in context. The compile-diagnose intent always carries
  // one; a free-text chat about a compile error only includes them if the
  // client attached a compile context.
  const compile = context?.compile || {};
  const hasCompileSignal =
    intentHint === 'compile-diagnose' ||
    Boolean(compile.logText) ||
    (Array.isArray(compile.annotations) && compile.annotations.length > 0);
  if (hasCompileSignal) {
    tools.push(...buildCompileTools(context));
  }

  // `submit_patch` lets the chat / write / fix / explain-issue path propose a
  // structured {oldText,newText} patch (inline-diff preview + Accept/Reject)
  // instead of returning the whole document. The compile path already carries
  // per-error fixes inside `submit_diagnostics`, and run-checks is read-only, so
  // neither gets `submit_patch`.
  if (intentHint !== 'run-checks' && !hasCompileSignal) {
    tools.push(...buildEditTools());
  }

  return tools;
}
