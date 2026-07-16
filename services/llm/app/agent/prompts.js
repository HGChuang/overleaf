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
  return `${Base}You are diagnosing Overleaf LaTeX compile failures. Explain the error, likely cause, and practical fix. Prefer concise, structured answers.\n\nCOMPILE CONTEXT:\n${JSON.stringify(
    {
      projectId: context.projectId,
      rootDocId: context.rootDocId,
      currentFile: context.currentFile,
      compileId: context.compileId,
      status: context.status,
      annotations: context.annotations || [],
      logText: context.logText || '',
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
