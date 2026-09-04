import { createHash } from 'node:crypto';

export interface SandboxFile {
  path: string;
  content: string;
}

export interface SandboxPatchHunk {
  file: string | null;
  line: number | null;
  oldText: string;
  newText: string;
}

export interface SandboxVerification {
  workspaceHash: string;
  status: string;
  errorCount: number | null;
  warningCount: number | null;
  compileOrdinal: number;
}

const MAX_HUNKS_PER_APPLY = 50;
const MAX_PATCH_CHARS = 120_000;

export function normalizeSandboxPath(path: string): string {
  const raw = String(path || '').replace(/\\/g, '/');
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) {
    throw new Error(`sandbox path must be project-relative: ${path}`);
  }
  const normalized = raw.replace(/^\.\//, '');
  if (!normalized || normalized.includes('\0')) throw new Error('sandbox path is empty or invalid');
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error(`sandbox path escapes the project: ${path}`);
  }
  return normalized;
}

export function workspaceHash(files: SandboxFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const path = normalizeSandboxPath(file.path);
    const content = String(file.content ?? '');
    hash.update(`${Buffer.byteLength(path, 'utf8')}:`);
    hash.update(path);
    hash.update(`${Buffer.byteLength(content, 'utf8')}:`);
    hash.update(content);
  }
  return hash.digest('hex');
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line += 1;
  return line;
}

function occurrences(content: string, needle: string): number[] {
  const result: number[] = [];
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(needle, from);
    if (index < 0) break;
    result.push(index);
    from = index + Math.max(needle.length, 1);
  }
  return result;
}

function chooseOccurrence(content: string, oldText: string, line: number | null): number {
  const matches = occurrences(content, oldText);
  if (matches.length === 0) throw new Error('oldText does not occur in the sandbox file');
  if (!line || matches.length === 1) return matches[0];
  return matches.reduce((best, candidate) =>
    Math.abs(lineAt(content, candidate) - line) < Math.abs(lineAt(content, best) - line)
      ? candidate
      : best
  );
}

function countOccurrences(content: string, needle: string): number {
  return occurrences(content, needle).length;
}

function compactDiff(base: string, current: string, file: string): SandboxPatchHunk {
  let prefix = 0;
  const prefixLimit = Math.min(base.length, current.length);
  while (prefix < prefixLimit && base[prefix] === current[prefix]) prefix += 1;

  let baseSuffix = base.length;
  let currentSuffix = current.length;
  while (
    baseSuffix > prefix &&
    currentSuffix > prefix &&
    base[baseSuffix - 1] === current[currentSuffix - 1]
  ) {
    baseSuffix -= 1;
    currentSuffix -= 1;
  }

  // Expand to complete lines. This gives the editor a stable, readable anchor.
  const lineStart = base.lastIndexOf('\n', Math.max(0, prefix - 1)) + 1;
  const nextBaseNewline = base.indexOf('\n', baseSuffix);
  const nextCurrentNewline = current.indexOf('\n', currentSuffix);
  const lineEndBase = nextBaseNewline < 0 ? base.length : nextBaseNewline + 1;
  const lineEndCurrent = nextCurrentNewline < 0 ? current.length : nextCurrentNewline + 1;
  let oldText = base.slice(lineStart, lineEndBase);
  let newText = current.slice(lineStart, lineEndCurrent);

  // Ambiguous line snippets are unsafe in the browser applier. Fall back to
  // a whole-file replacement, which is exact and unique by construction.
  if (!oldText || countOccurrences(base, oldText) !== 1) {
    oldText = base;
    newText = current;
  }
  if (!oldText) {
    throw new Error(`sandbox cannot safely export an insertion into empty file "${file}"`);
  }
  return { file, line: lineAt(base, base.indexOf(oldText)), oldText, newText };
}

/**
 * Per-request shadow workspace. It never writes to Overleaf persistence or
 * disk; only the explicit sandbox compile broker receives a bounded snapshot.
 */
export class SandboxWorkspace {
  private readonly base = new Map<string, string>();
  private current = new Map<string, string>();
  private verification: SandboxVerification | null = null;
  private compileOrdinal = 0;

  constructor(
    files: SandboxFile[],
    private readonly defaultFile: string | null = null
  ) {
    for (const file of files || []) {
      const path = normalizeSandboxPath(file.path);
      if (this.base.has(path)) throw new Error(`duplicate sandbox file: ${path}`);
      this.base.set(path, String(file.content ?? ''));
    }
    this.current = new Map(this.base);
  }

  get baseHash(): string {
    return workspaceHash(this.baseFiles());
  }

  get currentHash(): string {
    return workspaceHash(this.files());
  }

  get lastVerification(): SandboxVerification | null {
    return this.verification;
  }

  get compileCount(): number {
    return this.compileOrdinal;
  }

  files(): SandboxFile[] {
    return [...this.current.entries()].map(([path, content]) => ({
      path,
      content,
    }));
  }

  baseFiles(): SandboxFile[] {
    return [...this.base.entries()].map(([path, content]) => ({
      path,
      content,
    }));
  }

  get(path: string): string | null {
    return this.current.get(normalizeSandboxPath(path)) ?? null;
  }

  paths(): string[] {
    return [...this.current.keys()];
  }

  apply(hunks: SandboxPatchHunk[]): {
    workspaceHash: string;
    changedFiles: string[];
  } {
    if (!Array.isArray(hunks) || hunks.length === 0)
      throw new Error('at least one sandbox hunk is required');
    if (hunks.length > MAX_HUNKS_PER_APPLY)
      throw new Error(`sandbox apply exceeds ${MAX_HUNKS_PER_APPLY} hunks`);
    const chars = hunks.reduce(
      (sum, h) => sum + String(h.oldText || '').length + String(h.newText || '').length,
      0
    );
    if (chars > MAX_PATCH_CHARS)
      throw new Error(`sandbox patch exceeds ${MAX_PATCH_CHARS} characters`);

    const next = new Map(this.current);
    const changed = new Set<string>();
    for (const [index, hunk] of hunks.entries()) {
      if (!hunk || typeof hunk.oldText !== 'string' || typeof hunk.newText !== 'string') {
        throw new Error(`sandbox hunk ${index} is malformed`);
      }
      if (!hunk.oldText) {
        throw new Error(
          `sandbox hunk ${index} is a pure insertion; replacement hunks are required in this iteration`
        );
      }
      const requested = hunk.file || this.defaultFile;
      if (!requested) throw new Error(`sandbox hunk ${index} has no target file`);
      const path = normalizeSandboxPath(requested);
      const content = next.get(path);
      if (content == null)
        throw new Error(`sandbox hunk ${index} targets unknown text file "${path}"`);
      const at = chooseOccurrence(content, hunk.oldText, hunk.line);
      const updated = content.slice(0, at) + hunk.newText + content.slice(at + hunk.oldText.length);
      if (updated === content) throw new Error(`sandbox hunk ${index} is a no-op`);
      next.set(path, updated);
      changed.add(path);
    }
    this.current = next;
    this.verification = null;
    return {
      workspaceHash: this.currentHash,
      changedFiles: [...changed].sort(),
    };
  }

  beginCompile(): number {
    this.compileOrdinal += 1;
    return this.compileOrdinal;
  }

  recordVerification(
    result: Omit<SandboxVerification, 'workspaceHash' | 'compileOrdinal'>
  ): SandboxVerification {
    this.verification = {
      ...result,
      workspaceHash: this.currentHash,
      compileOrdinal: this.compileOrdinal,
    };
    return this.verification;
  }

  exportPatch(summary: string): {
    hunks: SandboxPatchHunk[];
    summary: string;
    verification: SandboxVerification;
  } {
    if (!this.verification || this.verification.workspaceHash !== this.currentHash) {
      throw new Error('sandbox workspace changed after its last compile');
    }
    if (this.verification.status !== 'success' || this.verification.errorCount !== 0) {
      throw new Error(
        'sandbox patch cannot be submitted until compilation succeeds with zero errors'
      );
    }
    const hunks: SandboxPatchHunk[] = [];
    for (const [path, base] of this.base) {
      const current = this.current.get(path);
      if (current != null && current !== base) hunks.push(compactDiff(base, current, path));
    }
    if (hunks.length === 0) throw new Error('sandbox contains no changes to submit');
    return { hunks, summary, verification: this.verification };
  }
}
