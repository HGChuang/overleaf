import { createHash } from 'node:crypto';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Exact UTF-8 source ranges with a byte cursor, including very long CJK lines. */
export function sourcePage(path: string, text: string, options: {
  startLine?: number; endLine?: number; offsetBytes?: number;
  snapshotId?: string; docId?: string; version?: number;
} = {}) {
  const bytes = Buffer.from(text);
  const lines = text.split('\n');
  const startLine = options.startLine || 1;
  const endLine = Math.min(options.endLine || lines.length, lines.length);
  if (startLine < 1 || startLine > lines.length || endLine < startLine) throw new Error('Invalid source line range');
  const rangeStart = Buffer.byteLength(lines.slice(0, startLine - 1).join('\n')) + (startLine > 1 ? 1 : 0);
  const rangeEnd = Buffer.byteLength(lines.slice(0, endLine).join('\n'));
  const start = options.offsetBytes ?? rangeStart;
  if (!Number.isSafeInteger(start) || start < rangeStart || start > rangeEnd || (start < bytes.length && (bytes[start] & 0xc0) === 0x80)) {
    throw new Error('Invalid UTF-8 source cursor');
  }
  let end = Math.min(rangeEnd, start + 3000);
  const hash = digest(bytes);
  const render = () => {
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    const content = bytes.subarray(start, end).toString('utf8');
    return {
      found: true, path, sourceHash: hash, evidenceId: digest(`${path}:${hash}:${start}:${end}`),
      consistency: options.snapshotId ? 'immutable-snapshot' : 'request-local',
      snapshotId: options.snapshotId, docId: options.docId, version: options.version,
      startByte: start, endByte: end,
      startLine: bytes.subarray(0, start).toString('utf8').split('\n').length,
      totalLines: lines.length, content,
      nextOffsetBytes: end < rangeEnd ? end : null,
      rangeEndByte: rangeEnd, fileBytes: bytes.length,
    };
  };
  let page = render();
  while (Buffer.byteLength(JSON.stringify(page)) + 16 > 4096 && end > start) {
    end = start + Math.floor((end - start) * 0.8);
    page = render();
  }
  if (Buffer.byteLength(JSON.stringify(page)) + 16 > 4096) throw new Error('Source metadata exceeds read budget');
  return page;
}

/** Count against a candidate overlay without mutating the request source. */
export function candidateText(content: string, hunks: Array<{ oldText: string; newText: string; line?: number | null }>): string {
  const edits = hunks.map(h => {
    if (!h.oldText) {
      const lines = content.split('\n');
      if (!Number.isInteger(h.line) || h.line! < 1 || h.line! > lines.length + 1) throw new Error('Insertion requires a valid line');
      const start = h.line === lines.length + 1 ? content.length : lines.slice(0, h.line! - 1).reduce((n, line) => n + line.length + 1, 0);
      return { start, end: start, text: h.newText };
    }
    const start = content.indexOf(h.oldText);
    if (start < 0 || content.indexOf(h.oldText, start + 1) >= 0) throw new Error('Candidate oldText must match exactly once; include more surrounding source');
    return { start, end: start + h.oldText.length, text: h.newText };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start < edits[i - 1].end || edits[i].start === edits[i - 1].start) throw new Error('Candidate hunks overlap');
  }
  let result = content;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}
