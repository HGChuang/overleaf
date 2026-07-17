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

export function buildChatPrompt(tab = 'ask', context = {}) {
  const tabGuidance = {
    ask: 'You are helping the user understand and navigate the full Overleaf project. Answer concisely and cite relevant files when useful.',
    write: 'You are helping the user draft or transform scientific writing and LaTeX snippets for the Overleaf project.',
    fix: 'You are helping the user diagnose and fix LaTeX compile or project issues. Prefer actionable steps.',
    check: 'You are helping the user understand project quality checks and explain why issues matter.',
  };

  return `${Base}${tabGuidance[tab] || tabGuidance.ask}\n\nPROJECT CONTEXT:\n${JSON.stringify(
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

export function buildCompilePrompt(context = {}) {
  // Truncate the raw log in the prompt to control size; the model can also
  // call list_compile_errors to get the structured annotations.
  const logText = context.logText || '';
  const logPreview = logText.slice(0, 6000);
  const logTruncated = logText.length > 6000;
  return `${Base}You are a LaTeX compile-error diagnostic agent for Overleaf. You investigate errors like an engineer — read the real source, classify the error, then return a CONCRETE fix. Never give generic boilerplate.

WORKFLOW (follow strictly, in order):
1. Call \`list_compile_errors\` to get EVERY error from the latest compile. You must diagnose all of them, not just the first.
2. For EACH error:
   a. Call \`read_file_fragment\` with that error's file and a small window around the line (startLine = max(1, line - 3), endLine = line + 3) to inspect the actual source. If the file isn't found, read a nearby file or the root doc.
   b. Call \`classify_latex_error\` with the error message to get a category and common-cause hints.
3. After investigating every error, call \`submit_diagnostics\` EXACTLY ONCE, with one entry per error (same order as list_compile_errors). Each entry must contain:
   - file, line: from the error (null if unknown)
   - title: a short label for the error
   - whatHappened: a plain explanation of what this error means
   - likelyCause: your best-grounded guess, informed by the source you read and the classifier
   - suggestedFix: a short, human-readable description of the fix (shown to the user; NOT applied directly)
   - fix: a CONCRETE one-click text replacement whenever possible — {oldText, newText}. \`oldText\` MUST be copied VERBATIM from the file you read with read_file_fragment (include enough surrounding context so the match is unique; for a single-token error, use the whole line). \`newText\` is the corrected text. Examples:
     * error token "\\abc" on a line -> oldText = the whole line containing \\abc, newText = the corrected line (e.g. with \\textbf{...} or plain text).
     * missing package -> oldText = the \\documentclass{...} line (or \\begin{document}), newText = that line plus "\\usepackage{booktabs}" inserted on a new line.
     * wrong extension in \\includegraphics -> oldText = "\\includegraphics{foo}", newText = "\\includegraphics{foo.png}".
     Only set fix=null if no text replacement can fix it (genuinely ambiguous) — then still explain in suggestedFix.

You MUST finish by calling \`submit_diagnostics\`. Do not write a free-text summary instead. If there are no errors, still call \`submit_diagnostics\` with a single entry explaining the compile status (fix=null).

COMPILE CONTEXT:
${JSON.stringify(
    {
      projectId: context.projectId,
      rootDocId: context.rootDocId,
      currentFile: context.currentFile,
      compileId: context.compileId,
      status: context.status,
      annotations: context.annotations || [],
      logPreview,
      logTruncated,
    },
    null,
    2
  )}`;
}

export function buildCheckExplainPrompt(issue = {}, project = {}) {
  return `${Base}You are explaining a project quality issue found in an Overleaf project. Explain why it happened and how to fix it.\n\nISSUE:\n${JSON.stringify(issue, null, 2)}\n\nPROJECT:\n${JSON.stringify(
    {
      projectId: project.projectId,
      rootDocId: project.rootDocId,
      fileList: project.fileList || [],
      outline: project.outline || [],
    },
    null,
    2
  )}`;
}

// Tools preamble appended to every unified-agent system prompt when tools are
// bound. Tells the model what it can reach so it routes by tool selection
// (real intent recognition) rather than guessing from file paths alone.
function toolsSection(toolNames = []) {
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

// Unified system prompt for the single Copilot agent. The `intentHint` does
// NOT hard-route the request (the controller still runs one agent + one tool
// pool); it only biases the guidance so the structured CTAs keep their
// guarantees. The model is free to call any tool — e.g. a free-text chat
// message about a compile error can still call the diagnose tools.
//
// (M2 will refactor this into a clean cached section assembler; M1 keeps it a
// pragmatic delegation to the existing per-intent builders.)
export function buildUnifiedSystemPrompt(context = {}, intentHint = 'chat', toolNames = []) {
  const project = context.project || {};
  const projectCtx = {
    projectId: project.projectId,
    rootDocId: project.rootDocId,
    fileList: project.fileList || [],
    outline: project.outline || [],
  };

  if (intentHint === 'compile-diagnose') {
    const compile = context.compile || {};
    return (
      buildCompilePrompt({
        projectId: project.projectId,
        rootDocId: project.rootDocId,
        currentFile: context.editor?.currentFile,
        compileId: compile.compileId,
        status: compile.status,
        annotations: compile.annotations,
        logText: compile.logText,
      }) + toolsSection(toolNames)
    );
  }

  if (intentHint === 'run-checks') {
    return (
      `${Base}You are running project quality checks for an Overleaf project. ` +
      `Call the \`run_checks\` tool to obtain the structured issue list, then write a concise summary ` +
      `(total count + the most important issues grouped by file). Do NOT fabricate issues — only report ` +
      `what \`run_checks\` returned.\n\nPROJECT CONTEXT:\n${JSON.stringify(projectCtx, null, 2)}` +
      toolsSection(toolNames)
    );
  }

  if (intentHint === 'explain-issue') {
    return buildCheckExplainPrompt(context.issue || {}, project) + toolsSection(toolNames);
  }

  // default: chat
  return (
    buildChatPrompt(context.conversation?.tab, {
      projectId: project.projectId,
      rootDocId: project.rootDocId,
      currentFile: context.context?.currentFile,
      fileList: project.fileList,
      outline: project.outline,
    }) + toolsSection(toolNames)
  );
}
