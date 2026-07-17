import { expect } from 'chai';
import {
  buildFileMap,
  lookupFile,
  readFileFragment,
} from '../../../../app/agent/tools/fileMap.js';

// Pure helpers (no langchain, no LLM) shared by projectTools and compileTools.
describe('fileMap helpers', function () {
  const files = [
    { path: 'main.tex', content: 'line1\nline2\nline3\n' },
    { path: 'sections/intro.tex', content: 'intro body' },
  ];

  it('builds a map and resolves paths with case/leading-slash tolerance', function () {
    const fm = buildFileMap(files);
    expect(lookupFile(fm, 'main.tex')).to.equal('line1\nline2\nline3\n');
    expect(lookupFile(fm, '/main.tex')).to.equal('line1\nline2\nline3\n');
    expect(lookupFile(fm, 'MAIN.TEX')).to.equal('line1\nline2\nline3\n');
    expect(lookupFile(fm, 'sections/intro.tex')).to.equal('intro body');
    expect(lookupFile(fm, 'missing.tex')).to.equal(null);
  });

  it('readFileFragment returns line-numbered source within the window', function () {
    const fm = buildFileMap(files);
    const frag = readFileFragment(fm, 'main.tex', 2, 3);
    expect(frag.found).to.equal(true);
    expect(frag.path).to.equal('main.tex');
    // trailing newline -> 4 split segments (last empty), but only 2-3 returned
    expect(frag.content).to.equal('2: line2\n3: line3');
  });

  it('readFileFragment reports not-found with available paths', function () {
    const fm = buildFileMap(files);
    const frag = readFileFragment(fm, 'nope.tex', 1, 1);
    expect(frag.found).to.equal(false);
    expect(frag.availablePaths).to.be.an('array').that.is.not.empty;
  });

  it('handles an empty file list without throwing', function () {
    const fm = buildFileMap([]);
    expect(lookupFile(fm, 'main.tex')).to.equal(null);
  });
});
