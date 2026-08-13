// Patch applier: plays the role of "the user clicked Accept" in the offline
// loop. Semantics mirror the frontend's findHunkPosition (codemirror-editor.tsx)
// so patch-apply failures in eval mean the same thing as accept-time failures
// in production:
//
//   - non-empty oldText: find ALL occurrences in the target file; pick the one
//     nearest to the hunk's 1-based `line` anchor; no anchor → first occurrence
//   - empty oldText: pure insertion — insert newText at the END of the `line`
//     line, or at EOF when no anchor is given
//   - file: hunk.file, or the task's mainFile when null
//
// ATOMIC: every hunk position is resolved BEFORE any mutation; a single
// unresolvable hunk fails the whole patch (partial application would poison
// the grader's final-state judgement). Within a file, resolved hunks apply in
// DESCENDING position order so earlier offsets stay valid.
//
// The frontend's grow-hunk idempotence guard is deliberately NOT mirrored:
// eval applies each patch exactly once.

interface PatchHunk {
  file: string | null;
  line: number | null;
  oldText: string;
  newText: string;
}

interface FilesRef {
  current: { path: string; content: string }[];
}

type ApplyResult = { applied: number } | { applied?: undefined; failed: { hunkIndex: number; file: string; reason: string } };

function normalizePath(p: string): string {
  return p.replace(/^\//, '');
}

function lineStartOffset(content: string, oneBasedLine: number): number {
  if (oneBasedLine <= 1) return 0;
  let offset = 0;
  for (let i = 1; i < oneBasedLine; i++) {
    const nl = content.indexOf('\n', offset);
    if (nl === -1) return content.length;
    offset = nl + 1;
  }
  return offset;
}

function lineEndOffset(content: string, oneBasedLine: number): number {
  const start = lineStartOffset(content, oneBasedLine);
  const nl = content.indexOf('\n', start);
  return nl === -1 ? content.length : nl;
}

interface Resolved {
  hunkIndex: number;
  fileIndex: number;
  start: number;
  deleteLen: number;
  insert: string;
}

// Resolve one hunk to a concrete (start, deleteLen) span. Returns null when
// unresolvable (unknown file / oldText not found).
function resolveHunk(hunk: PatchHunk, hunkIndex: number, filesRef: FilesRef, mainFile: string): Resolved | null {
  const targetPath = normalizePath(hunk.file || mainFile).replace(/^\.\//, '');
  // Path resolution mirrors the dry-run's resolveExisting (R3 hardening):
  // tolerate trivial variants (`./x`, leading slash, case) — production's
  // accept path anchors by oldText in the open doc and largely ignores
  // hunk.file, so a variant naming a real file applies fine there. Only a
  // path matching nothing even normalized is a true hallucination (the
  // applier still fails it, keeping eval's F9 measurement meaningful).
  const fileIndex = filesRef.current.findIndex(f => {
    const p = normalizePath(f.path);
    return p === targetPath || p.toLowerCase() === targetPath.toLowerCase();
  });
  if (fileIndex === -1) return null;
  const content = filesRef.current[fileIndex].content;

  if (!hunk.oldText) {
    // Pure insertion: end of the anchored line, or EOF without an anchor.
    const at = hunk.line != null ? lineEndOffset(content, hunk.line) : content.length;
    return { hunkIndex, fileIndex, start: at, deleteLen: 0, insert: hunk.newText };
  }

  const occurrences: number[] = [];
  let from = 0;
  while (true) {
    const idx = content.indexOf(hunk.oldText, from);
    if (idx === -1) break;
    occurrences.push(idx);
    from = idx + 1;
  }
  if (occurrences.length === 0) return null;

  let start = occurrences[0];
  if (hunk.line != null && occurrences.length > 1) {
    const anchor = lineStartOffset(content, hunk.line);
    let best = Infinity;
    for (const idx of occurrences) {
      const dist = Math.abs(idx - anchor);
      if (dist < best) {
        best = dist;
        start = idx;
      }
    }
  }
  return { hunkIndex, fileIndex, start, deleteLen: hunk.oldText.length, insert: hunk.newText };
}

export function applyPatch(filesRef: FilesRef, hunks: PatchHunk[], mainFile: string): ApplyResult {
  const resolved: Resolved[] = [];
  for (let i = 0; i < hunks.length; i++) {
    const r = resolveHunk(hunks[i], i, filesRef, mainFile);
    if (!r) {
      const h = hunks[i];
      const targetPath = normalizePath(h.file || mainFile).replace(/^\.\//, '');
      const known = filesRef.current.some(f => {
        const p = normalizePath(f.path);
        return p === targetPath || p.toLowerCase() === targetPath.toLowerCase();
      });
      return {
        failed: {
          hunkIndex: i,
          file: targetPath,
          reason: known
            ? `oldText not found (${h.oldText.slice(0, 60).replace(/\n/g, '\\n')}…)`
            : 'unknown file',
        },
      };
    }
    resolved.push(r);
  }

  // Descending position per file keeps earlier resolutions valid while mutating.
  const byFile = new Map<number, Resolved[]>();
  for (const r of resolved) {
    const list = byFile.get(r.fileIndex) || [];
    list.push(r);
    byFile.set(r.fileIndex, list);
  }
  for (const [fileIndex, list] of byFile) {
    list.sort((a, b) => b.start - a.start);
    const file = filesRef.current[fileIndex];
    let content = file.content;
    for (const r of list) {
      content = content.slice(0, r.start) + r.insert + content.slice(r.start + r.deleteLen);
    }
    file.content = content;
  }
  return { applied: hunks.length };
}
