// Unit tests for the P0-0 harness prerequisites:
//   F13  assert DSL file-level kinds (file-exists / file-not-exists /
//        file-count / unchanged-file) — instruction constraints gradeable
//   F14  deterministic text metrics (word-count / sentence-count /
//        literal-count) + judge hard pre-gate (hard metrics off the judge)
//   P0-0 holdout discovery — suite 'all' never includes holdout by default
// All pure/in-memory — no mongo/clsi/provider (stillCompiles:false throughout).

import { expect } from 'chai';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  gradeAssert,
  stripLatex,
  countWords,
  countSentences,
  countLiteral,
} from '../../../../eval/graders/assertGrader.js';
import { gradeJudge } from '../../../../eval/graders/judgeGrader.js';
import { discoverFixtures, loadCohort } from '../../../../eval/taskDiscovery.js';
import { emptyUsage } from '../../../../eval/usageTap.js';

const files = (entries: [string, string][]) => entries.map(([path, content]) => ({ path, content }));
const refOf = (fs: { path: string; content: string }[]) => ({ current: fs });

describe('eval harness: F14 deterministic text metrics', function () {
  it('stripLatex removes comments, math and commands but keeps brace contents', function () {
    const text = stripLatex('Hello world \\section{Intro} % a comment\nmore $a+b$ text');
    expect(countWords(text)).to.equal(5); // Hello world Intro more text
  });

  it('countWords counts CJK chars individually', function () {
    expect(countWords('你好世界')).to.equal(4);
    expect(countWords('这是 test')).to.equal(3);
  });

  it('countSentences counts terminator groups, latin and CJK', function () {
    expect(countSentences('One. Two! 三个。四？')).to.equal(4);
    expect(countSentences('No terminator here')).to.equal(0);
  });

  it('countLiteral is plain-string (regex metachars are inert)', function () {
    expect(countLiteral('a.b a-b a.b', 'a.b')).to.equal(2);
    expect(countLiteral('0.8472 appears 0.8472 twice', '0.8472')).to.equal(2);
  });
});

describe('eval harness: F13/F14 assert DSL new kinds', function () {
  const projectFiles = files([
    ['main.tex', '\\section{A}\nOne two three four.\n'],
    ['refs.bib', '@article{x}\n'],
  ]);

  async function gradeWith(assertions: any[], current = projectFiles, original = projectFiles) {
    return gradeAssert({ assertions, stillCompiles: false }, refOf(current), 'main.tex', original);
  }

  it('file-exists passes when present, fails when absent', async function () {
    expect((await gradeWith([{ kind: 'file-exists', file: 'refs.bib' }])).success).to.equal(true);
    const res = await gradeWith([{ kind: 'file-exists', file: 'appendix.tex' }]);
    expect(res.success).to.equal(false);
    expect(res.failureDetail).to.include('appendix.tex');
  });

  it('file-not-exists passes when absent, fails when created', async function () {
    expect((await gradeWith([{ kind: 'file-not-exists', file: 'appendix.tex' }])).success).to.equal(true);
    const res = await gradeWith(
      [{ kind: 'file-not-exists', file: 'appendix.tex' }],
      [...projectFiles, { path: 'appendix.tex', content: 'x' }]
    );
    expect(res.success).to.equal(false);
    expect(res.failureReason).to.equal('assertion_failed');
  });

  it('file-count compares total project files', async function () {
    expect((await gradeWith([{ kind: 'file-count', op: 'eq', count: 2 }])).success).to.equal(true);
    expect((await gradeWith([{ kind: 'file-count', op: 'gte', count: 3 }])).success).to.equal(false);
  });

  it('unchanged-file passes on identical content, fails on any edit', async function () {
    expect((await gradeWith([{ kind: 'unchanged-file', file: 'refs.bib' }])).success).to.equal(true);
    const edited = files([
      ['main.tex', '\\section{A}\nOne two three four.\n'],
      ['refs.bib', '@article{x}\n@book{y}\n'],
    ]);
    const res = await gradeWith([{ kind: 'unchanged-file', file: 'refs.bib' }], edited, projectFiles);
    expect(res.success).to.equal(false);
    expect(res.failureDetail).to.include('expected unchanged');
  });

  it('word-count / sentence-count grade deterministically', async function () {
    expect((await gradeWith([{ kind: 'word-count', file: 'main.tex', op: 'lte', count: 6 }])).success).to.equal(true);
    expect((await gradeWith([{ kind: 'word-count', file: 'main.tex', op: 'eq', count: 2 }])).success).to.equal(false);
    expect((await gradeWith([{ kind: 'sentence-count', file: 'main.tex', op: 'eq', count: 1 }])).success).to.equal(true);
  });

  it('literal-count needs no regex escaping', async function () {
    const withNumber = files([['main.tex', 'score 0.8472 and again 0.8472\n']]);
    expect((await gradeWith([{ kind: 'literal-count', file: 'main.tex', literal: '0.8472', op: 'eq', count: 2 }], withNumber, withNumber)).success).to.equal(true);
    expect((await gradeWith([{ kind: 'literal-count', file: 'main.tex', literal: '0.8472', op: 'eq', count: 1 }], withNumber, withNumber)).success).to.equal(false);
  });

  it('partial credit: one failing assertion flips success but keeps N/M', async function () {
    const res = await gradeWith([
      { kind: 'file-exists', file: 'main.tex' },
      { kind: 'file-exists', file: 'missing.tex' },
    ]);
    expect(res.success).to.equal(false);
    expect(res.assertionsPassed).to.equal(1);
    expect(res.assertionsTotal).to.equal(2);
    expect(res.score).to.equal(0.5);
  });
});

describe('eval harness: F14 judge hard pre-gate', function () {
  const original = files([['main.tex', 'word '.repeat(50)]]);
  const rubric = '5: excellent; 4: good; 3: ok; 2: poor; 1: bad — long enough rubric text';

  it('fails as assertion_failed WITHOUT touching the judge client', async function () {
    // model: null would explode if the gate failed to short-circuit.
    const res = await gradeJudge(
      {
        focusFile: 'main.tex',
        rubric,
        passScore: 4,
        stillCompiles: false,
        assertions: [{ kind: 'word-count', file: 'main.tex', op: 'lte', count: 10 }],
      },
      refOf(original),
      'main.tex',
      original,
      'shorten it',
      { model: null, apiKey: '' } as any,
      emptyUsage()
    );
    expect(res.success).to.equal(false);
    expect(res.failureReason).to.equal('assertion_failed');
    expect(res.assertionsPassed).to.equal(0);
    expect(res.assertionsTotal).to.equal(1);
  });

  it('a passing gate falls through to the normal judge path (focusFile check)', async function () {
    const res = await gradeJudge(
      {
        focusFile: 'missing.tex',
        rubric,
        passScore: 4,
        stillCompiles: false,
        assertions: [{ kind: 'word-count', file: 'main.tex', op: 'gte', count: 10 }],
      },
      refOf(original),
      'main.tex',
      original,
      'polish it',
      { model: null, apiKey: '' } as any,
      emptyUsage()
    );
    expect(res.success).to.equal(false);
    expect(res.failureReason).to.equal('judge_score_low');
    expect(res.failureDetail).to.include('focusFile not found');
  });
});

describe('eval harness: holdout discovery (P0-0)', function () {
  function writeFixture(root: string, category: string, id: string, suite: string) {
    mkdirSync(join(root, category), { recursive: true });
    writeFileSync(
      join(root, category, `${id}.json`),
      JSON.stringify({ id, category, suite, difficulty: 'easy', instruction: 'x'.repeat(10), project: { mainFile: 'main.tex', files: [{ path: 'main.tex', content: 'x' }] }, grader: { type: 'noop' } })
    );
  }

  function makeDir(): string {
    const root = mkdtempSync(join(tmpdir(), 'eval-fixtures-'));
    writeFixture(root, 'compile', 'compile-reg', 'regression');
    writeFixture(root, 'compile', 'compile-hold', 'holdout');
    writeFixture(root, 'noop', 'noop-cap', 'capability');
    return root;
  }

  it("suite 'all' excludes holdout by default", function () {
    const ids = discoverFixtures({}, makeDir()).map(t => t.id);
    expect(ids).to.have.members(['compile-reg', 'noop-cap']);
  });

  it("--suite holdout selects only holdout", function () {
    const ids = discoverFixtures({ suite: 'holdout' }, makeDir()).map(t => t.id);
    expect(ids).to.have.members(['compile-hold']);
  });

  it('includeHoldout brings holdout into an all run', function () {
    const ids = discoverFixtures({ includeHoldout: true }, makeDir()).map(t => t.id);
    expect(ids).to.have.members(['compile-reg', 'compile-hold', 'noop-cap']);
  });

  it('explicit --task bypasses holdout exclusion (deliberate act)', function () {
    const ids = discoverFixtures({ task: 'compile-hold' }, makeDir()).map(t => t.id);
    expect(ids).to.have.members(['compile-hold']);
  });

  it('--task substring selects a batch (bvar- style)', function () {
    const ids = discoverFixtures({ task: 'compile-' }, makeDir()).map(t => t.id);
    expect(ids).to.have.members(['compile-reg', 'compile-hold']);
  });

  it('suite filter still applies normally', function () {
    const ids = discoverFixtures({ suite: 'regression' }, makeDir()).map(t => t.id);
    expect(ids).to.have.members(['compile-reg']);
  });
});

// iter16/17: --exclude-cohort drops a named cohort (eval/cohorts.json) from
// the real fixture set. The 'easy' cohort = the ~112 textbook-easy tasks
// (~99% pass, zero discrimination) that pad the regression gate. Excluding
// 'easy' is the user-facing "stop using the trivial tasks" switch. 4 tasks
// from the original-116 are NOT trivial (still flaky/capability) and stay in.
// This integration test pins the cohorts.json ↔ fixtures/ invariant.
describe('eval harness: cohort exclusion (iter16)', function () {
  const REAL_FIXTURE_COUNT = 275; // compile/structure/semantic/noop, excl. holdout
  const EASY_COUNT = 112;

  it('excludes exactly the easy cohort from the real fixture set', function () {
    const all = discoverFixtures({ suite: 'all' });
    const hard = discoverFixtures({ suite: 'all', excludeCohort: 'easy' });
    expect(all.length).to.equal(REAL_FIXTURE_COUNT);
    expect(hard.length).to.equal(REAL_FIXTURE_COUNT - EASY_COUNT);
    const dropped = new Set(all.map(t => t.id).filter(id => !hard.some(h => h.id === id)));
    expect(dropped.size).to.equal(EASY_COUNT);
  });

  it('easy cohort excludes only trivial tasks — keeps the 4 hard originals', function () {
    // equation-to-split is original-116 BUT still a capability task — excluding
    // 'easy' must NOT drop it. (Bug found in iter17: excluding the whole
    // original-116 wrongly removed a still-hard task.)
    const hard = discoverFixtures({ suite: 'all', excludeCohort: 'easy' });
    expect(hard.some(t => t.id === 'structure-equation-to-split')).to.equal(true);
    expect(hard.some(t => t.id === 'compile-undefined-command')).to.equal(true);
  });

  it('excludeCohort stacks with suite filter (hard regression gate)', function () {
    const hardReg = discoverFixtures({ suite: 'regression', excludeCohort: 'easy' });
    const easy = loadCohort('easy');
    expect(easy, 'cohorts.json must exist and list "easy"').to.not.equal(null);
    expect(hardReg.every(t => !easy!.has(t.id))).to.equal(true);
  });

  it('unknown cohort name is a no-op (does not crash, does not drop)', function () {
    const all = discoverFixtures({ suite: 'all' });
    const none = discoverFixtures({ suite: 'all', excludeCohort: 'does-not-exist' });
    expect(none.length).to.equal(all.length);
  });
});
