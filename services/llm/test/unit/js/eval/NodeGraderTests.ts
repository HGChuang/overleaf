// Unit tests for the node grader (eval/graders/nodeGrader.ts): the five
// deterministic per-call rules over raw traces, plus the aggregate rate math.
// Each rule gets a triggering and a non-triggering case; events are fabricated
// in memory (no recorder/agent needed). IRON RULE under test implicitly:
// gradeNodes only produces verdicts — nothing here touches trial success.

import { expect } from 'chai';
import { gradeNodes } from '../../../../eval/graders/nodeGrader.js';
import { stableStringify } from '../../../../eval/graders/traceGrader.js';
import type { RawToolEvent } from '../../../../eval/rawTrace.js';

const MAIN = 'main.tex';

interface Spec {
  name: string;
  args?: any;
  isError?: boolean;
}

// Fabricate a seq-ordered trace. ok = !isError unless overridden is not
// needed by any rule test (rules key off isError/ok consistently).
function trace(specs: Spec[]): RawToolEvent[] {
  return specs.map((s, i) => ({
    seq: i,
    endSeq: i,
    turn: 1,
    ts: i * 10,
    durationMs: 5,
    toolCallId: `c${i}`,
    name: s.name,
    args: s.args ?? {},
    argsKey: stableStringify(s.args ?? null),
    ok: !(s.isError ?? false),
    isError: s.isError ?? false,
    ...(s.isError ? { errorText: 'boom' } : {}),
    resultText: '',
    resultChars: 0,
  }));
}

const patch = (file?: string) => ({
  name: 'submit_patch',
  args: { hunks: [{ ...(file ? { file } : {}), oldText: 'a', newText: 'b' }], summary: 's' },
});

describe('eval harness: node grader', function () {
  describe('patch-before-read (major)', function () {
    it('flags a patch to a file never read', function () {
      const r = gradeNodes(trace([patch()]), { mainFile: MAIN });
      expect(r.nodes).to.have.length(1);
      expect(r.nodes[0].rule).to.equal('patch-before-read');
      expect(r.nodes[0].severity).to.equal('major');
      expect(r.nodes[0].seq).to.equal(0);
      expect(r.nodes[0].detail).to.include(MAIN);
      expect(r.rates.patchBeforeReadCount).to.equal(1);
    });

    it('does not flag when the target was read first (hunk.file ?? mainFile)', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'main.tex' } },
          patch(), // no file → mainFile
          { name: 'read_file_fragment', args: { path: 'sections/a.tex', startLine: 1, endLine: 9 } },
          patch('sections/a.tex'),
        ]),
        { mainFile: MAIN }
      );
      expect(r.nodes.filter(n => n.rule === 'patch-before-read')).to.have.length(0);
      expect(r.rates.patchBeforeReadCount).to.equal(0);
    });

    it('flags a blind patch even when the patch itself was rejected', function () {
      const r = gradeNodes(trace([{ ...patch(), isError: true }]), { mainFile: MAIN });
      expect(r.rates.patchBeforeReadCount).to.equal(1);
    });
  });

  describe('compile-without-change (minor)', function () {
    it('flags compiles with no accepted patch in between', function () {
      const r = gradeNodes(trace([{ name: 'compile_project' }, { name: 'compile_project' }]), { mainFile: MAIN });
      const hits = r.nodes.filter(n => n.rule === 'compile-without-change');
      expect(hits).to.have.length(2); // trajectory start + no patch since first compile
      expect(hits.every(n => n.severity === 'minor')).to.equal(true);
    });

    it('does not flag a compile that follows an accepted patch; rejected patches do not count', function () {
      const r = gradeNodes(
        trace([
          { name: 'compile_project' }, // flagged (start)
          { name: 'read_file', args: { path: 'main.tex' } },
          patch(), // accepted
          { name: 'compile_project' }, // clean: patch since last compile
          { ...patch(), isError: true }, // dry-run-rejected — NOT accepted
          { name: 'compile_project' }, // flagged again
        ]),
        { mainFile: MAIN }
      );
      const hits = r.nodes.filter(n => n.rule === 'compile-without-change');
      expect(hits.map(n => n.seq)).to.deep.equal([0, 5]);
    });
  });

  describe('repeat-identical-call (major)', function () {
    it('flags from the 3rd identical call onward', function () {
      const specs = Array.from({ length: 4 }, () => ({ name: 'search_project', args: { query: '1.8' } }));
      const r = gradeNodes(trace(specs), { mainFile: MAIN });
      const hits = r.nodes.filter(n => n.rule === 'repeat-identical-call');
      expect(hits.map(n => n.seq)).to.deep.equal([2, 3]); // occurrences 3 and 4
    });

    it('does not flag two identical calls; different args never group', function () {
      const r = gradeNodes(
        trace([
          { name: 'search_project', args: { query: 'a' } },
          { name: 'search_project', args: { query: 'a' } },
          { name: 'search_project', args: { query: 'b' } },
        ]),
        { mainFile: MAIN }
      );
      expect(r.nodes.filter(n => n.rule === 'repeat-identical-call')).to.have.length(0);
    });

    it('groups by key-order-insensitive argsKey (F5)', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'a.tex', limit: 10 } },
          { name: 'read_file', args: { limit: 10, path: 'a.tex' } },
          { name: 'read_file', args: { path: 'a.tex', limit: 10 } },
        ]),
        { mainFile: MAIN }
      );
      // 3 identical-fingerprint reads → repeat-identical fires on the 3rd
      // (the 2nd/3rd are also redundant-rereads — separate rule, both stand).
      expect(r.nodes.some(n => n.rule === 'repeat-identical-call' && n.seq === 2)).to.equal(true);
    });
  });

  describe('redundant-reread (minor)', function () {
    it('flags a re-read of the same path with no accepted patch in between', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'main.tex' } },
          { name: 'compile_project' },
          { name: 'read_file', args: { path: 'main.tex' } },
        ]),
        { mainFile: MAIN }
      );
      const hits = r.nodes.filter(n => n.rule === 'redundant-reread');
      expect(hits).to.have.length(1);
      expect(hits[0].seq).to.equal(2);
    });

    it('read → accepted patch → re-read is NOT redundant (content changed)', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'main.tex' } },
          patch(),
          { name: 'read_file', args: { path: 'main.tex' } },
        ]),
        { mainFile: MAIN }
      );
      expect(r.nodes.filter(n => n.rule === 'redundant-reread')).to.have.length(0);
    });

    it('fragments flag only when line ranges intersect', function () {
      const overlapping = gradeNodes(
        trace([
          { name: 'read_file_fragment', args: { path: 'main.tex', startLine: 10, endLine: 20 } },
          { name: 'read_file_fragment', args: { path: 'main.tex', startLine: 15, endLine: 25 } },
        ]),
        { mainFile: MAIN }
      );
      expect(overlapping.nodes.filter(n => n.rule === 'redundant-reread')).to.have.length(1);

      const disjoint = gradeNodes(
        trace([
          { name: 'read_file_fragment', args: { path: 'main.tex', startLine: 10, endLine: 20 } },
          { name: 'read_file_fragment', args: { path: 'main.tex', startLine: 30, endLine: 40 } },
        ]),
        { mainFile: MAIN }
      );
      expect(disjoint.nodes.filter(n => n.rule === 'redundant-reread')).to.have.length(0);
    });
  });

  describe('error-ignored (major) + errorRecoveryRate', function () {
    it('flags a verbatim retry of an errored call; recovery rate 0', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'ghost.tex' }, isError: true },
          { name: 'read_file', args: { path: 'ghost.tex' } },
        ]),
        { mainFile: MAIN }
      );
      const hits = r.nodes.filter(n => n.rule === 'error-ignored');
      expect(hits).to.have.length(1);
      expect(hits[0].seq).to.equal(1);
      expect(r.rates.errorRecoveryRate).to.equal(0);
    });

    it('error → changed-args retry (or another tool) is RECOVERY, not a finding', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'ghost.tex' }, isError: true },
          { name: 'read_file', args: { path: 'main.tex' } }, // changed args
          { name: 'submit_patch', args: { hunks: [] }, isError: true },
          { name: 'read_file', args: { path: 'main.tex' } }, // switched tool
        ]),
        { mainFile: MAIN }
      );
      expect(r.nodes.filter(n => n.rule === 'error-ignored')).to.have.length(0);
      expect(r.rates.errorRecoveryRate).to.equal(1); // both errors recovered
    });

    it('is null when the trace has no error events', function () {
      const r = gradeNodes(trace([{ name: 'read_file', args: { path: 'main.tex' } }]), { mainFile: MAIN });
      expect(r.rates.errorRecoveryRate).to.equal(null);
    });

    it('an error as the LAST event is not recovered', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'main.tex' } },
          { name: 'compile_project', isError: true },
        ]),
        { mainFile: MAIN }
      );
      expect(r.rates.errorRecoveryRate).to.equal(0);
    });
  });

  describe('rates math', function () {
    it('computes necessary/redundancy rates and findingCounts exactly', function () {
      const r = gradeNodes(
        trace([
          { name: 'read_file', args: { path: 'main.tex' } }, // 0 clean
          patch(), // 1 clean (read first)
          { name: 'compile_project' }, // 2 clean (patch since start)
          { name: 'compile_project' }, // 3 compile-without-change
          { name: 'read_file', args: { path: 'main.tex' } }, // 4 clean (post-patch read)
          { name: 'read_file', args: { path: 'main.tex' } }, // 5 redundant-reread
        ]),
        { mainFile: MAIN }
      );
      expect(r.rates.totalCalls).to.equal(6);
      expect(r.rates.necessaryRate).to.be.closeTo(4 / 6, 1e-9);
      expect(r.rates.redundancyRate).to.be.closeTo(1 / 6, 1e-9);
      expect(r.rates.errorRecoveryRate).to.equal(null);
      expect(r.rates.patchBeforeReadCount).to.equal(0);
      expect(r.findingCounts).to.deep.equal({
        'compile-without-change:minor': 1,
        'redundant-reread:minor': 1,
        // e0/e4/e5 are the same read_file call 3x → repeat-identical fires on
        // e5 (which ALSO carries the redundant-reread finding).
        'repeat-identical-call:major': 1,
      });
    });

    it('empty trace: null rates, zero counts, no findings', function () {
      const r = gradeNodes([], { mainFile: MAIN });
      expect(r.nodes).to.have.length(0);
      expect(r.rates.totalCalls).to.equal(0);
      expect(r.rates.necessaryRate).to.equal(null);
      expect(r.rates.redundancyRate).to.equal(null);
      expect(r.rates.errorRecoveryRate).to.equal(null);
      expect(r.findingCounts).to.deep.equal({});
    });
  });
});
