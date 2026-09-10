import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcePage, sourcePageText } from '../../app/agent/context/source-evidence.js';
import { lineCases, numberReadResult, costCases, costReadResult } from './line-experiment.mjs';
import { reducePaperState } from '../../app/agent/context/paper-state.js';

test('Cost candidates preserve exact CRLF/Unicode bytes and context source evidence', () => {
  assert.equal(costCases.length, 27);
  for (const source of ['', '前😀\r\n2: literal\r\n尾', '\n\n', ...costCases.map(c => c.files['main.tex'])]) {
    const page = sourcePage('main.tex', source);
    for (const arm of ['D', 'N', 'T']) {
      const result = costReadResult({ content: [{ type: 'text', text: JSON.stringify(page) }] }, arm);
      const view = JSON.parse(result.content[0].text);
      assert.equal(sourcePageText(view), page.content);
      const history: any = [{ role: 'assistant', content: [{ type: 'toolCall', id: 'r1', name: 'read_file', arguments: {} }] },
        { role: 'toolResult', toolCallId: 'r1', toolName: 'read_file', ...result }];
      assert.equal(reducePaperState(history).toolLedger[0].source?.evidenceId, page.evidenceId);
    }
  }
  assert.throws(() => sourcePageText({ startLine: 2, lines: [[1, 'bad']] }));
  assert.throws(() => sourcePageText({ startLine: 2, lineNumberedContent: '1: bad' }));
});

test('F-L1-02: paired tasks differ only in arm identity and have independent expected lines', () => {
  assert.equal(lineCases.length, 18);
  for (let i = 0; i < lineCases.length; i += 2) {
    const { id: _a, arm: a, ...left } = lineCases[i];
    const { id: _b, arm: b, ...right } = lineCases[i + 1];
    assert.notEqual(a, b); assert.deepEqual(left, right);
    assert.deepEqual(left.expectedLocations, left.variant === 'original' ? { 'tab:main': 10, 'tab:replication': 19 }
      : left.variant === 'prefix-lf' ? { 'tab:main': 13, 'tab:replication': 22 } : { 'tab:main': 15, 'tab:replication': 24 });
  }
});

test('F-L1-02: only presentation field changes; raw source, lines, cursors and budget stay valid', () => {
  for (const c of lineCases) {
    const page = sourcePage('main.tex', c.files['main.tex']);
    const original: any = { content: [{ type: 'text', text: JSON.stringify(page) }], details: {} };
    const snapshot = structuredClone(original);
    const changed = numberReadResult('read_file', original);
    const { lineNumberedContent, ...unchanged } = JSON.parse(changed.content[0].text);
    assert.deepEqual(unchanged, JSON.parse(original.content[0].text));
    assert.deepEqual(original, snapshot);
    for (const [label, line] of Object.entries(c.expectedLocations)) {
      assert.ok(lineNumberedContent.split('\n').some(s => s.startsWith(`${line}: `) && s.includes(`\\label{${label}}`)));
    }
    assert.ok(Buffer.byteLength(changed.content[0].text) + 16 <= 4096);
    assert.equal(numberReadResult('search_project', original), original);
  }
});

test('F-L1-02: fragment and mid-line Unicode cursor retain their source line numbering', () => {
  const source = '头\r\n前😀后\r\n尾\r\n';
  const page = sourcePage('main.tex', source, { startLine: 2, endLine: 3, offsetBytes: Buffer.byteLength('头\r\n前') });
  const result = numberReadResult('read_file_fragment', { content: [{ type: 'text', text: JSON.stringify(page) }] });
  assert.equal(JSON.parse(result.content[0].text).lineNumberedContent, '2: 😀后\r\n3: 尾\r');
});
