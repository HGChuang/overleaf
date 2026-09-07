import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { sourcePage, candidateText, digest } from '../../../app/agent/context/source-evidence.js';
import { buildProjectTools } from '../../../app/agent/tools/projectTools.js';
import { buildFileMap, lookupFile } from '../../../app/agent/tools/fileMap.js';
import { reducePaperState } from '../../../app/agent/context/paper-state.js';

describe('paper source evidence', () => {
  it('reassembles a very long CJK/LaTeX line exactly without splitting UTF-8 or losing quotes', () => {
    const text = '论文\\cite{key} "may"😀\t'.repeat(1000);
    let offset = 0;
    let reconstructed = '';
    const evidence = new Set<string>();
    do {
      const page = sourcePage('main.tex', text, { offsetBytes: offset });
      assert.ok(Buffer.byteLength(JSON.stringify(page)) + 16 <= 4096);
      assert.equal(page.sourceHash, digest(text));
      assert.ok(!page.content.includes('\ufffd'));
      assert.equal(page.startByte, Buffer.byteLength(reconstructed));
      reconstructed += page.content;
      evidence.add(page.evidenceId);
      if (page.nextOffsetBytes === null) break;
      assert.ok(page.nextOffsetBytes > offset);
      offset = page.nextOffsetBytes;
    } while (true);
    assert.equal(reconstructed, text);
    assert.ok(evidence.size > 1);
  });
  it('returns exact requested lines and rejects invalid byte/range cursors', () => {
    assert.equal(sourcePage('x.tex', 'a\n论文\nc', { startLine: 2, endLine: 2 }).content, '论文');
    assert.throws(() => sourcePage('x.tex', '论文', { offsetBytes: 1 }), /UTF-8/);
    assert.throws(() => sourcePage('x.tex', 'a\nb', { startLine: 2, endLine: 1 }), /range/);
  });
  it('counts an isolated candidate overlay and rejects ambiguous/overlapping anchors', async () => {
    const original = 'alpha beta gamma delta';
    assert.equal(candidateText(original, [{ oldText: 'beta gamma', newText: 'beta' }]), 'alpha beta delta');
    assert.throws(() => candidateText('alpha alpha', [{ oldText: 'alpha', newText: 'beta' }]), /exactly once/);
    assert.throws(() => candidateText(original, [{ oldText: 'alpha beta', newText: '' }, { oldText: 'beta gamma', newText: '' }]), /overlap/);
    const tool = buildProjectTools({ project: { files: [{ path: 'main.tex', content: original }] } }).find(t => t.name === 'count_words')!;
    const result = await tool.execute('count', { path: 'main.tex', candidateHunks: [{ oldText: 'beta gamma', newText: 'beta' }] });
    const value = JSON.parse((result.content[0] as any).text);
    assert.equal(value.wordCount, 3);
    assert.equal(value.basis, 'candidate-overlay-not-applied');
    assert.equal(value.sourceHash, digest(original));
  });
  it('does not duplicate case aliases in searches or resolve ambiguous file names', () => {
    const files = buildFileMap([{ path: 'Main.tex', content: 'one' }, { path: 'main.tex', content: 'two' }]);
    assert.equal(files.size, 2);
    assert.equal(lookupFile(files, 'MAIN.TEX'), null);
    assert.equal(lookupFile(files, 'Main.tex'), 'one');
  });
  it('retains selected source, scope and file manifest when the original user envelope is compacted', () => {
    const envelope = { MESSAGE: 'Rewrite only this selection', CONTEXT: { currentFile: 'methods.tex', selectedText: 'may improve by 2%' },
      PROJECT: { projectId: 'paper', sourceManifest: [{ path: 'methods.tex', sha256: 'version' }] } };
    const state = reducePaperState([{ role: 'user', content: JSON.stringify(envelope), timestamp: 1 }]);
    assert.equal(state.authorRequests[0].text, envelope.MESSAGE);
    assert.deepEqual(state.authorRequests[0].context, envelope.CONTEXT);
    assert.deepEqual(state.projectBase, envelope.PROJECT);
  });
});
