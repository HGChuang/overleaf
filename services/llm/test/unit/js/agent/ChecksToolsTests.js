import { expect } from 'chai';
import { runChecksOver } from '../../../../app/agent/tools/checksTools.js';

// Pure scanner loop (no langchain, no LLM) — the body of the `run_checks`
// tool and of the `runChecksFallback` in copilot.service.js. Mirrors the
// deterministic ChecksService.runChecks behaviour.
describe('runChecksOver (run_checks tool body)', function () {
  const project = {
    files: [
      { path: 'main.tex', content: 'see \\cite{smith2020} and \\cite{jones2021}.\n' },
      { path: 'refs.bib', content: '@article{smith2020,\n title={X},\n}\n' },
    ],
  };

  it('runs all scanners by default and returns the structured envelope', function () {
    const r = runChecksOver(project);
    expect(r).to.have.nested.property('summary.total');
    expect(r.summary.total).to.equal(1); // jones2021 undefined
    expect(r.issues).to.have.length(1);
    expect(r.issues[0].title).to.contain('jones2021');
    expect(r.issues[0].location.file).to.equal('main.tex');
    expect(r.issues[0].location.line).to.equal(1);
    expect(r.summary.byType).to.have.property('citations', 1);
  });

  it('honours an explicit types list', function () {
    const r = runChecksOver(project, ['references']); // EmptyScanner -> []
    expect(r.issues).to.have.length(0);
    expect(r.summary.total).to.equal(0);
  });

  it('tolerates unknown check types (skips them)', function () {
    const r = runChecksOver(project, ['nope']);
    expect(r.issues).to.have.length(0);
  });

  it('respects the maxIssues cap', function () {
    const manyFiles = {
      files: Array.from({ length: 5 }, (_, i) => ({
        path: `f${i}.tex`,
        content: `\\cite{missing${i}}\n`,
      })),
    };
    const r = runChecksOver(manyFiles, ['citations'], 2);
    expect(r.issues).to.have.length(2);
  });
});
