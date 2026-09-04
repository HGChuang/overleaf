// General project-navigation tools for the unified Copilot agent. These give
// the chat path real hands — it can list files, read source (whole or a
// fragment), and grep — so answers are grounded in the actual project source
// instead of only the file paths dumped into the system prompt.
//
// `buildProjectTools(context)` returns closures over the request `context`
// (specifically `context.project`), using the shared `fileMap` helpers.

import { defineTool } from './baseTool.js';
import { buildFileMap, lookupFile, readFileFragment } from './fileMap.js';
import type { SandboxWorkspace } from '../sandbox/workspace.js';

// Hard output caps. The tool result rides into the model context verbatim and
// microCompact keeps the most recent tool results INTACT — a couple of
// unbounded full-file reads can blow the whole context window on their own
// (the 120KB request budget covers the request, not the accumulated history).
// 20KB ≈ 5-6k tokens, safe alongside the system prompt + a few more results.
const MAX_READ_CHARS = 20_000;
const MAX_FRAGMENT_LINES = 200;

function capContent(content: string, totalLines: number): string {
  if (content.length <= MAX_READ_CHARS) return content;
  return (
    content.slice(0, MAX_READ_CHARS) +
    `\n... [truncated at ${MAX_READ_CHARS} chars of a ${totalLines}-line file — ` +
    `use read_file_fragment with a line range to read more]`
  );
}

// Word-count algorithm vendored from eval/graders/assertGrader.ts
// (stripLatex + countWords) — KEEP IN SYNC with that file: eval graders judge
// length constraints with exactly this math, so the number the tool reports
// must equal the number the grader will compute. (app/ must not import from
// eval/, hence the copy; a cross-check unit test pins the equivalence.)
function stripLatexMarkup(text: string): string {
  return text
    .replace(/(?<!\\)%.*/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\\[([\s\S]*?)\\\]/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/\\./g, ' ')
    .replace(/[{}]/g, ' ');
}

function countWordsInText(text: string): number {
  const latin = text.match(/[A-Za-z0-9]+(?:[’'\-][A-Za-z0-9]+)*/g) || [];
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || [];
  return latin.length + cjk.length;
}

export function buildProjectTools(context: any = {}, workspace?: SandboxWorkspace) {
  const project = context.project || {};
  const fileMap = buildFileMap(project.files);
  const fileList = Array.isArray(project.fileList) ? project.fileList : [];
  const outline = Array.isArray(project.outline) ? project.outline : [];
  const getContent = (path: string) => workspace ? workspace.get(path) : lookupFile(fileMap, path);
  const currentEntries = () =>
    workspace
      ? workspace.files().map((file) => [file.path, file.content] as const)
      : [...fileMap.entries()];

  const listProjectFiles = defineTool({
    name: 'list_project_files',
    description:
      'List every file in the Overleaf project (paths only, no contents), plus the section outline. Call this first to see what exists before reading specific files. Returns {fileList, outline}.',
    parameters: { type: 'object', properties: {} },
    handler: async () =>
      JSON.stringify({ fileList, outline, total: fileList.length }),
  });

  const readFile = defineTool({
    name: 'read_file',
    description:
      'Read the full contents of a project file by path. Use for small/medium files; for large files prefer read_file_fragment with a line window. Pass an optional `limit` (number of lines from the top) to cap the output.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project file path, e.g. main.tex or sections/intro.tex' },
        limit: { type: 'integer', minimum: 1, description: 'Max lines to return from the top' },
      },
      required: ['path'],
    },
    handler: async ({ path, limit }: { path: string; limit?: number }) => {
      const content = getContent(path);
      if (content == null) {
        return JSON.stringify({
          found: false,
          message: `File not found: ${path}`,
          availablePaths: [...new Set([...fileMap.keys()].filter(k => k === k))].slice(0, 50),
        });
      }
      const lines = content.split('\n');
      const limited =
        limit && limit < lines.length
          ? lines.slice(0, limit).join('\n') + `\n... (${lines.length - limit} more lines)`
          : content;
      return JSON.stringify({
        found: true,
        path,
        totalLines: lines.length,
        content: capContent(limited, lines.length),
      });
    },
  });

  const readFileFragmentTool = defineTool({
    name: 'read_file_fragment',
    description:
      'Read a fragment of a project source file by path and 1-based inclusive line range. Use this to inspect the real code around a specific line (e.g. a compile error). Returns line-numbered source. Pass startLine ~ line-3 and endLine ~ line+3 for context.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project file path, e.g. main.tex' },
        startLine: { type: 'integer', minimum: 1, description: '1-based start line' },
        endLine: { type: 'integer', minimum: 1, description: '1-based end line (inclusive)' },
      },
      required: ['path', 'startLine', 'endLine'],
    },
    handler: async ({ path, startLine, endLine }: { path: string; startLine: number; endLine: number }) => {
      // Clamp absurd windows: the result is also capped to MAX_READ_CHARS.
      const cappedEnd =
        Number.isInteger(endLine) && Number.isInteger(startLine)
          ? Math.min(endLine, startLine + MAX_FRAGMENT_LINES - 1)
          : endLine;
      const fragment = workspace
        ? readFileFragment(new Map(currentEntries()), path, startLine, cappedEnd)
        : readFileFragment(fileMap, path, startLine, cappedEnd);
      if (fragment.found && typeof fragment.content === 'string') {
        fragment.content = capContent(fragment.content, fragment.totalLines || 0);
      }
      return JSON.stringify(fragment);
    },
  });

  const searchProject = defineTool({
    name: 'search_project',
    description:
      'Grep the project source for a query string (case-insensitive). Returns matching {file, line, text} entries across .tex/.bib files. Use to find where a command, label, cite key, or phrase is used.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text to search for (case-insensitive)' },
        filePattern: {
          type: 'string',
          description: 'Optional substring filter on file path, e.g. ".tex" or "sections/"',
        },
      },
      required: ['query'],
    },
    handler: async ({ query, filePattern }: { query: string; filePattern?: string }) => {
      if (!query) return JSON.stringify({ matches: [], note: 'empty query' });
      const needle = String(query).toLowerCase();
      const matches: Array<{ file: string; line: number; text: string }> = [];
      for (const [path, content] of currentEntries()) {
        if (filePattern && !path.includes(filePattern)) continue;
        if (typeof content !== 'string') continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            matches.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (matches.length >= 50) {
              return JSON.stringify({ matches, truncated: true });
            }
          }
        }
      }
      return JSON.stringify({ matches, total: matches.length });
    },
  });

  const countWordsTool = defineTool({
    name: 'count_words',
    description:
      "Return the EXACT word count of a project file's readable text: LaTeX comments, math ($...$, display math), \\begin/\\end markers and command names are stripped first (brace contents are kept), then each latin/number token counts 1 and each CJK character counts 1. Use whenever the user's instruction carries a length constraint (\"shorten by 30%\", \"at most 120 words\"): call it BEFORE editing for the baseline and AFTER your patch is applied to verify the constraint is actually met — never estimate word counts by eye.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project file path, e.g. main.tex or sections/intro.tex' },
      },
      required: ['path'],
    },
    handler: async ({ path }: { path: string }) => {
      const content = getContent(path);
      if (content == null) {
        return JSON.stringify({ found: false, message: `File not found: ${path}` });
      }
      return JSON.stringify({
        found: true,
        path,
        wordCount: countWordsInText(stripLatexMarkup(content)),
      });
    },
  });

  return [listProjectFiles, readFile, readFileFragmentTool, searchProject, countWordsTool];
}
