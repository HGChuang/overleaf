import {
  Base,
  Chat,
  Paraphrase,
  Scientific,
  Concise,
  Punchy,
  Split,
  Join,
  Summarize,
  Explain,
  TitleGenerator,
  AbstractGenerator,
} from '../../config/index.js';

const MODE_PROMPTS = new Map([
  [0, Chat],
  [1, Paraphrase],
  [2, Scientific],
  [3, Concise],
  [4, Punchy],
  [5, Split],
  [6, Join],
  [7, Summarize],
  [8, Explain],
  [9, TitleGenerator],
  [10, AbstractGenerator],
]);

export function buildSystemPrompt(mode = 0) {
  return `${Base}${MODE_PROMPTS.get(mode) || Chat}`;
}

export function buildChatPrompt(context: any = {}) {
  return `${Base}You are helping the user understand and navigate the full Overleaf project. Answer concisely and cite relevant files when useful.\n\nPROJECT CONTEXT:\n${JSON.stringify(
    {
      projectId: context.projectId,
      rootDocId: context.rootDocId,
      currentFile: context.currentFile,
      fileList: context.fileList || [],
      outline: context.outline || [],
    },
    null,
    2
  )}`;
}

// Tools preamble appended to every unified-agent system prompt when tools are
// bound. Tells the model what it can reach so it routes by tool selection
// (real intent recognition) rather than guessing from file paths alone.
function toolsSection(toolNames: string[] = []) {
  if (!toolNames.length) return '';
  let section = `\n\nTOOLS AVAILABLE: ${toolNames.join(', ')}. Use them to ground your answer in the real project source — read a file before claiming what it contains, and prefer \`read_file\` / \`read_file_fragment\` over guessing. Multiple tool calls may be made in one turn.`;
  if (toolNames.includes('todo_write')) {
    section +=
      '\nFor any task with 3+ steps, call `todo_write` FIRST to lay out the plan, then work through the items (keep one in_progress, mark completed as you go).';
  }
  if (toolNames.includes('submit_patch')) {
    section +=
      '\nWhen the user asks you to FIX, MODIFY, CORRECT, or REWRITE existing text in their files, do NOT return the whole document. Call `submit_patch` with one or more `{oldText, newText}` hunks: `oldText` copied VERBATIM from the source (read the file with `read_file` / `read_file_fragment` first so the editor can anchor the inline-diff preview), `newText` the replacement. Group nearby edits into separate hunks rather than one giant `oldText`. The user reviews an inline-diff preview (struck old + gray new) and Accepts/Rejects; the edit applies only after acceptance.';
  }
  return section;
}

// Unified system prompt for the single Copilot agent. The model is free to
// call any tool — intent is recognized by which tools it picks.
export function buildUnifiedSystemPrompt(context: any = {}, toolNames: string[] = []) {
  const project = context.project || {};
  return (
    buildChatPrompt({
      projectId: project.projectId,
      rootDocId: project.rootDocId,
      currentFile: context.context?.currentFile,
      fileList: project.fileList,
      outline: project.outline,
    }) + toolsSection(toolNames)
  );
}
