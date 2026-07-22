// General project-navigation tools for the unified Copilot agent. These give
// the chat path real hands — it can list files, read source (whole or a
// fragment), and grep — so answers are grounded in the actual project source
// instead of only the file paths dumped into the system prompt.
//
// `buildProjectTools(context)` returns closures over the request `context`
// (specifically `context.project`), using the shared `fileMap` helpers so the
// same lookup logic is reused by the compile-diagnose tools.

import { z } from 'zod';
import { defineTool } from './baseTool.js';
import { buildFileMap, lookupFile, readFileFragment } from './fileMap.js';

// Hard output caps. The tool result rides into the model context verbatim and
// microCompact keeps the most recent tool results INTACT — a couple of
// unbounded full-file reads can blow the whole context window on their own
// (the 120KB request budget covers the request, not the accumulated history).
// 20KB ≈ 5-6k tokens, safe alongside the system prompt + a few more results.
const MAX_READ_CHARS = 20_000;
const MAX_FRAGMENT_LINES = 200;

function capContent(content, totalLines) {
  if (content.length <= MAX_READ_CHARS) return content;
  return (
    content.slice(0, MAX_READ_CHARS) +
    `\n... [truncated at ${MAX_READ_CHARS} chars of a ${totalLines}-line file — ` +
    `use read_file_fragment with a line range to read more]`
  );
}

export function buildProjectTools(context = {}) {
  const project = context.project || {};
  const fileMap = buildFileMap(project.files);
  const fileList = Array.isArray(project.fileList) ? project.fileList : [];
  const outline = Array.isArray(project.outline) ? project.outline : [];

  const listProjectFiles = defineTool({
    name: 'list_project_files',
    description:
      'List every file in the Overleaf project (paths only, no contents), plus the section outline. Call this first to see what exists before reading specific files. Returns {fileList, outline}.',
    schema: z.object({}),
    handler: async () =>
      JSON.stringify({ fileList, outline, total: fileList.length }),
  });

  const readFile = defineTool({
    name: 'read_file',
    description:
      'Read the full contents of a project file by path. Use for small/medium files; for large files prefer read_file_fragment with a line window. Pass an optional `limit` (number of lines from the top) to cap the output.',
    schema: z.object({
      path: z.string().describe('Project file path, e.g. main.tex or sections/intro.tex'),
      limit: z.number().int().min(1).optional().describe('Max lines to return from the top'),
    }),
    handler: async ({ path, limit }) => {
      const content = lookupFile(fileMap, path);
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
    schema: z.object({
      path: z.string().describe('Project file path, e.g. main.tex'),
      startLine: z.number().int().min(1).describe('1-based start line'),
      endLine: z.number().int().min(1).describe('1-based end line (inclusive)'),
    }),
    handler: async ({ path, startLine, endLine }) => {
      // Clamp absurd windows: the result is also capped to MAX_READ_CHARS.
      const cappedEnd =
        Number.isInteger(endLine) && Number.isInteger(startLine)
          ? Math.min(endLine, startLine + MAX_FRAGMENT_LINES - 1)
          : endLine;
      const fragment = readFileFragment(fileMap, path, startLine, cappedEnd);
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
    schema: z.object({
      query: z.string().describe('The text to search for (case-insensitive)'),
      filePattern: z
        .string()
        .optional()
        .describe('Optional substring filter on file path, e.g. ".tex" or "sections/"'),
    }),
    handler: async ({ query, filePattern }) => {
      if (!query) return JSON.stringify({ matches: [], note: 'empty query' });
      const needle = String(query).toLowerCase();
      const matches = [];
      for (const [path, content] of fileMap.entries()) {
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

  return [listProjectFiles, readFile, readFileFragmentTool, searchProject];
}
