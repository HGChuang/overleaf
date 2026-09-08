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
export { applyHunks as candidateText } from '@overleaf/copilot-contracts';
