// General project-navigation tools for the unified Copilot agent. These give
// the chat path real hands — it can list files, read source (whole or a
// fragment), and grep — so answers are grounded in the actual project source
// instead of only the file paths dumped into the system prompt.
//
// `buildProjectTools(context)` returns closures over the request `context`
// (specifically `context.project`), using the shared `fileMap` helpers.

import { defineTool } from './baseTool.js';
import { buildFileMap, lookupFile } from './fileMap.js';
import { readSourcePage, candidateText, digest } from '../context/source-evidence.js';

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

export function buildProjectTools(context: any = {}, deps: { loadFile?: (path: string) => Promise<string> } = {}) {
  const project = context.project || {};
  const fileMap = buildFileMap(project.files);
  const contentCache = new Map<string, Promise<string>>();
  const resolvePath = (path: string) => {
    const clean = path.replace(/^\//, '');
    const candidates = [...fileMap.keys()].filter(key => key === clean || key.toLowerCase() === clean.toLowerCase());
    return fileMap.has(clean) ? clean : candidates.length === 1 ? candidates[0] : null;
  };
  const getContent = async (path: string): Promise<string | null> => {
    const canonical = resolvePath(path);
    if (!canonical) return null;
    if (!deps.loadFile) return lookupFile(fileMap, canonical);
    if (!contentCache.has(canonical)) contentCache.set(canonical, deps.loadFile(canonical));
    return contentCache.get(canonical)!;
  };
  const fileList = Array.isArray(project.fileList) ? project.fileList : [];
  const outline = Array.isArray(project.outline) ? project.outline : [];
  const sourceMeta = new Map((project.files || []).map((file: any) => [file.path, file]));
  const pageOptions = (path: string) => ({ snapshotId: project.sourceSnapshot?.id,
    docId: (sourceMeta.get(path) as any)?.docId, version: (sourceMeta.get(path) as any)?.version });

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
      'Read source as lineNumberedContent (N: text), hash and byte range within 4096 bytes. N is the authoritative 1-based source line; remove only this outer prefix in quotes and patches, preserving source whitespace/CRLF. Follow nextOffsetBytes using offsetBytes; pages may split a line. A page is partial coverage, not a completed audit. Optional limit restricts the line range.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project file path, e.g. main.tex or sections/intro.tex' },
        limit: { type: 'integer', minimum: 1, description: 'Max lines to return from the top' },
        offsetBytes: { type: 'integer', minimum: 0, description: 'Exact nextOffsetBytes returned by the preceding page' },
      },
      required: ['path'],
    },
    handler: async ({ path, limit, offsetBytes }: { path: string; limit?: number; offsetBytes?: number }) => {
      const content = await getContent(path);
      if (content == null) return JSON.stringify({ found: false, message: `File not found or ambiguous: ${path}` });
      const canonical = resolvePath(path)!;
      return JSON.stringify(readSourcePage(canonical, content, { ...pageOptions(canonical), endLine: limit, offsetBytes }));
    },
  });

  const readFileFragmentTool = defineTool({
    name: 'read_file_fragment',
    description:
      'Read a 1-based inclusive source line range as lineNumberedContent (N: text), hash and byte cursor within 4096 bytes. N is the authoritative source line; remove only this outer prefix in quotes and patches, preserving source whitespace/CRLF. Follow nextOffsetBytes with the same range; pages may split a line. For compile errors, request a few surrounding lines.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project file path, e.g. main.tex' },
        startLine: { type: 'integer', minimum: 1, description: '1-based start line' },
        endLine: { type: 'integer', minimum: 1, description: '1-based end line (inclusive)' },
        offsetBytes: { type: 'integer', minimum: 0 },
      },
      required: ['path', 'startLine', 'endLine'],
    },
    handler: async ({ path, startLine, endLine, offsetBytes }: { path: string; startLine: number; endLine: number; offsetBytes?: number }) => {
      const content = await getContent(path);
      if (content == null) return JSON.stringify({ found: false, message: `File not found or ambiguous: ${path}` });
      const canonical = resolvePath(path)!;
      return JSON.stringify(readSourcePage(canonical, content, { ...pageOptions(canonical), startLine, endLine, offsetBytes }));
    },
  });

  const searchProject = defineTool({
    name: 'search_project',
    description:
      'Grep the project source for a query string (case-insensitive). Returns matching {file, line, text} entries across .tex/.bib files. Use to find where a command, label, cite key, or phrase is used.',
    parameters: {
      type: 'object',
      properties: {
        cursor: { type: 'integer', minimum: 0, description: 'nextCursor from the previous search page' },
        query: { type: 'string', description: 'The text to search for (case-insensitive)' },
        filePattern: {
          type: 'string',
          description: 'Optional substring filter on file path, e.g. ".tex" or "sections/"',
        },
      },
      required: ['query'],
    },
    handler: async ({ query, filePattern, cursor = 0 }: { query: string; filePattern?: string; cursor?: number }) => {
      if (!query) return JSON.stringify({ matches: [], note: 'empty query' });
      const needle = String(query).toLowerCase();
      const matches: Array<{ file: string; line: number; text: string; sourceHash: string }> = [];
      let visited = 0;
      let used = 128;
      for (const path of fileMap.keys()) {
        if (filePattern && !path.includes(filePattern)) continue;
        const content = await getContent(path);
        if (content === null) continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].toLowerCase().includes(needle)) continue;
          if (visited++ < cursor) continue;
          const match = { file: path, line: i + 1, text: lines[i].slice(0, 160), sourceHash: digest(content) };
          const size = Buffer.byteLength(JSON.stringify(match)) + 1;
          if (used + size > 3800 && matches.length) return JSON.stringify({ matches, nextCursor: visited - 1, truncated: true });
          matches.push(match);
          used += size;
        }
      }
      return JSON.stringify({ matches, nextCursor: null, total: visited, truncated: false });
    },
  });

  const countWordsTool = defineTool({
    name: 'count_words',
    description:
      "Return the EXACT word count of a project file's readable text: LaTeX comments, math ($...$, display math), \\begin/\\end markers and command names are stripped first (brace contents are kept), then each latin/number token counts 1 and each CJK character counts 1. Use whenever the user's instruction carries a length constraint (\"shorten by 30%\", \"at most 120 words\"): call it BEFORE editing for the baseline and pass candidateHunks to measure the proposed overlay BEFORE submit_patch. Candidate counts do not prove the edit was applied — never estimate word counts by eye.",
    parameters: {
      type: 'object',
      properties: {
        candidateHunks: { type: 'array', items: { type: 'object', required: ['oldText', 'newText'], properties: {
          oldText: { type: 'string' }, newText: { type: 'string' }, line: { type: 'integer', minimum: 1 },
        } } },
        path: { type: 'string', description: 'Project file path, e.g. main.tex or sections/intro.tex' },
      },
      required: ['path'],
    },
    handler: async ({ path, candidateHunks }: { path: string; candidateHunks?: Array<{ oldText: string; newText: string; line?: number }> }) => {
      const content = await getContent(path);
      if (content == null) {
        return JSON.stringify({ found: false, message: `File not found: ${path}` });
      }
      return JSON.stringify({
        found: true,
        path,
        basis: candidateHunks ? 'candidate-overlay-not-applied' : 'request-source',
        sourceHash: digest(content),
        wordCount: countWordsInText(stripLatexMarkup(candidateHunks ? candidateText(content, candidateHunks) : content)),
      });
    },
  });

  return [listProjectFiles, readFile, readFileFragmentTool, searchProject, countWordsTool];
}
