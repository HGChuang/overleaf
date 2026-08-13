// Compile runner for the eval harness: drives a REAL LaTeX compile of the
// current in-memory project files through the dev clsi service (the exact
// backend production compiles use), then parses output.log with the SAME
// LatexLogParser the web CopilotCompileController uses, returning the
// compile_project tool's wire shape: {status, errorCount, errors, warningCount}.
//
// Why clsi HTTP instead of `docker run texlive-full`: the eval runs inside
// the develop-llm container (no docker CLI), and clsi already exposes
// POST /project/:id/compile accepting inline `content` resources — no
// project/docstore seeding needed. `eval/` is bind-mounted into the container;
// clsi is reachable as http://clsi:3013 on the compose network.

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { LatexParser } = require('./vendor-LatexLogParser.cjs');

const CLSI_URL = process.env.EVAL_CLSI_URL || 'http://clsi:3013';
const COMPILE_TIMEOUT_MS = Number(process.env.EVAL_COMPILE_TIMEOUT_MS || 120_000);
const MAX_LOG_CHARS = 1_000_000;
const MAX_ERRORS = 30;
const MAX_MESSAGE_CHARS = 500;

export interface EvalCompileResult {
  status: string;
  errorCount: number | null;
  errors: { file: string | null; line: number | null; message: string }[];
  warningCount: number | null;
  note?: string;
}

let compileSeq = 0;

// Compile the given files (virtual project) and return structured errors.
// `files` is the task's MUTABLE file list — pass the current (post-patch)
// state so verification compiles what the user would see.
export async function compileFiles(
  files: { path: string; content: string }[],
  mainFile: string
): Promise<EvalCompileResult> {
  // Fresh project id per call: clsi keys compiles by project id, and a stale
  // aux/cache state from a previous task must never leak into this compile.
  const projectId = `eval-${Date.now().toString(36)}-${compileSeq++}`;
  const body = {
    compile: {
      options: {
        compiler: 'pdflatex',
        timeout: Math.floor(COMPILE_TIMEOUT_MS / 1000),
        // Run *latex even when latexmk's fdb thinks targets are up to date —
        // mirrors forceCompile in the production controller.
        flags: ['-g'],
      },
      rootResourcePath: mainFile,
      resources: files.map(f => ({
        path: f.path.replace(/^\//, ''),
        content: f.content,
      })),
    },
  };

  let response: any;
  try {
    const res = await fetch(`${CLSI_URL}/project/${encodeURIComponent(projectId)}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS + 30_000),
    });
    if (!res.ok) {
      return {
        status: `http-${res.status}`,
        errorCount: null,
        errors: [],
        warningCount: null,
        note: `clsi compile returned HTTP ${res.status}`,
      };
    }
    response = await res.json();
  } catch (err: any) {
    return {
      status: 'unavailable',
      errorCount: null,
      errors: [],
      warningCount: null,
      note: `clsi compile request failed: ${err?.message || err}`,
    };
  }

  const compile = response?.compile || {};
  const status = compile.status || 'unknown';
  const logFile = (compile.outputFiles || []).find((f: any) => f.path === 'output.log');
  if (!logFile?.url) {
    return {
      status,
      errorCount: null,
      errors: [],
      warningCount: null,
      note: `no output.log produced (status '${status}')`,
    };
  }

  let logText: string;
  try {
    const logRes = await fetch(logFile.url, { signal: AbortSignal.timeout(30_000) });
    if (!logRes.ok) throw new Error(`HTTP ${logRes.status}`);
    logText = (await logRes.text()).slice(0, MAX_LOG_CHARS);
  } catch (err: any) {
    return {
      status,
      errorCount: null,
      errors: [],
      warningCount: null,
      note: `output.log fetch failed: ${err?.message || err}`,
    };
  }

  const { errors, warnings } = new LatexParser(logText, { ignoreDuplicates: true }).parse();
  return {
    status,
    errorCount: errors.length,
    errors: errors.slice(0, MAX_ERRORS).map((entry: any) => ({
      file: entry.file || null,
      line: entry.line == null ? null : Number(entry.line),
      message: String(entry.message || '').slice(0, MAX_MESSAGE_CHARS),
    })),
    warningCount: warnings.length,
  };
}
