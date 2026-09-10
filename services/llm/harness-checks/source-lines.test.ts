import test from 'node:test';
import assert from 'node:assert/strict';
import * as evidence from '../app/agent/context/source-evidence.js';
import { reducePaperState } from '../app/agent/context/paper-state.js';

for (const [name, text] of [
  ['empty', ''], ['blank lines', '\n'.repeat(2000)],
  ['Unicode CRLF', ('甲😀\\alpha\r\n\r\n').repeat(1000)],
  ['one very long Unicode line', '中😀'.repeat(2000)],
  ['literal annotation-looking source', '1: actual text\n2: \\textbf{keep}\nend'],
]) test(`Numbered source: ${name} round-trips bytes with bounded progressing pages`, () => {
  let cursor = 0, rebuilt = '', pages = 0;
  const read = evidence.readSourcePage;
  do {
    const page = read('main.tex', text, { offsetBytes: cursor, snapshotId: 'a'.repeat(64) });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) + 16 <= 4096);
    const content = evidence.sourcePageText(page);
    assert.equal(Buffer.byteLength(content), page.endByte - page.startByte);
    assert.equal(page.startLine, Buffer.from(text).subarray(0, cursor).toString().split('\n').length);
    assert.equal(page.sourceHash, evidence.digest(text));
    rebuilt += content;
    const state = reducePaperState([
      { role: 'assistant', content: [{ type: 'toolCall', id: 'r', name: 'read_file', arguments: {} }] },
      { role: 'toolResult', toolCallId: 'r', toolName: 'read_file', content: [{ type: 'text', text: JSON.stringify(page) }] },
    ] as any);
    assert.equal(state.toolLedger[0].source?.evidenceId, page.evidenceId);
    if (page.nextOffsetBytes === null) break;
    assert.ok(page.nextOffsetBytes > cursor);
    cursor = page.nextOffsetBytes;
  } while (++pages < 200);
  assert.equal(rebuilt, text);
});

test('Numbered source: fragment/UTF-8 cursor validation and oversized metadata', () => {
  const read = evidence.readSourcePage;
  const text = '头\r\n前😀后\r\n尾\r\n末';
  const page = read('main.tex', text, { startLine: 2, endLine: 3, offsetBytes: Buffer.byteLength('头\r\n前') });
  assert.equal(evidence.sourcePageText(page), '😀后\r\n尾\r');
  assert.equal(page.startLine, 2);
  assert.throws(() => read('main.tex', text, { offsetBytes: 1 }), /UTF-8/);
  assert.throws(() => read('x'.repeat(5000), 'source'), /budget/);
  // Metadata fits but not even one UTF-8 character does: fail rather than
  // emitting nextOffsetBytes equal to the current cursor indefinitely.
  const fullSize = Buffer.byteLength(JSON.stringify(read('', '😀'))) + 16;
  assert.throws(() => read('x'.repeat(4096 - fullSize + 1), '😀'), /budget/);
  for (const startLine of [0, -1, 1.5, NaN]) assert.throws(() => read('main.tex', text, { startLine }), /range/);
});
