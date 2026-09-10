import { createHash } from 'node:crypto';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Recover exact source bytes from either legacy or line-annotated evidence. */
export function sourcePageText(page: any): string {
  if (typeof page.content === 'string') return page.content;
  if (!Number.isSafeInteger(page.startLine) || page.startLine < 1) throw new Error('Invalid source start line');
  if (Array.isArray(page.lines)) return page.lines.map((row: any, index: number) => {
    if (!Array.isArray(row) || row.length !== 2 || row[0] !== page.startLine + index || typeof row[1] !== 'string' || row[1].includes('\n')) throw new Error('Invalid source line tuple');
    return row[1];
  }).join('\n');
  if (typeof page.lineNumberedContent === 'string') return page.lineNumberedContent.split('\n').map((line: string, index: number) => {
    const prefix = `${page.startLine + index}: `;
    if (!line.startsWith(prefix)) throw new Error('Invalid source line annotation');
    return line.slice(prefix.length);
  }).join('\n');
  throw new Error('Missing source content');
}

type SourcePageOptions = {
  startLine?: number; endLine?: number; offsetBytes?: number;
  snapshotId?: string; docId?: string; version?: number;
};
type SourcePage = {
  found: boolean; path: string; sourceHash: string; evidenceId: string;
  consistency: string; snapshotId?: string; docId?: string; version?: number;
  startByte: number; endByte: number; startLine: number; totalLines: number;
  content: string; nextOffsetBytes: number | null; rangeEndByte: number; fileBytes: number;
};

/** Fit the actual wire representation, keeping cursors on UTF-8 boundaries. */
function paginateSource<T>(path: string, text: string, options: SourcePageOptions, view: (page: SourcePage) => T): T {
  const bytes = Buffer.from(text);
  const lines = text.split('\n');
  const startLine = options.startLine ?? 1;
  const endLine = Math.min(options.endLine ?? lines.length, lines.length);
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(options.endLine ?? lines.length) || startLine < 1 || startLine > lines.length || endLine < startLine) throw new Error('Invalid source line range');
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
    return view({
      found: true, path, sourceHash: hash, evidenceId: digest(`${path}:${hash}:${start}:${end}`),
      consistency: options.snapshotId ? 'immutable-snapshot' : 'request-local',
      snapshotId: options.snapshotId, docId: options.docId, version: options.version,
      startByte: start, endByte: end,
      startLine: bytes.subarray(0, start).toString('utf8').split('\n').length,
      totalLines: lines.length, content,
      nextOffsetBytes: end < rangeEnd ? end : null,
      rangeEndByte: rangeEnd, fileBytes: bytes.length,
    });
  };
  let page = render();
  // Search for the largest fitting page; many short/blank lines can make
  // annotations larger than the source itself. Avoid wasting a model turn
  // on an unnecessarily short page or returning a non-advancing cursor.
  if (Buffer.byteLength(JSON.stringify(page)) + 16 > 4096) {
    let low = start, high = end;
    while (low < high) {
      const candidate = Math.ceil((low + high) / 2);
      end = candidate;
      const attempt = render();
      if (Buffer.byteLength(JSON.stringify(attempt)) + 16 <= 4096) low = candidate;
      else high = candidate - 1;
    }
    end = low;
    page = render();
  }
  if (Buffer.byteLength(JSON.stringify(page)) + 16 > 4096) throw new Error('Source metadata exceeds read budget');
  if (end === start && start < rangeEnd) throw new Error('Source read budget cannot fit a UTF-8 character');
  return page;
}

/** Raw evidence for internal indexing and quote verification. */
export function sourcePage(path: string, text: string, options: SourcePageOptions = {}) {
  return paginateSource(path, text, options, page => page);
}

/** Model-facing source: one numbered copy, with exact bytes after each prefix. */
export function readSourcePage(path: string, text: string, options: SourcePageOptions = {}) {
  return paginateSource(path, text, options, ({ content, ...page }) => ({
    ...page,
    lineNumberedContent: content.split('\n').map((line, index) => `${page.startLine + index}: ${line}`).join('\n'),
  }));
}

/** Count against a candidate overlay without mutating the request source. */
export { applyHunks as candidateText } from '@overleaf/copilot-contracts';
