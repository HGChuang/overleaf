// Unit tests for the eval-harness ruler-hardening batch (量尺定型批):
//   - shouldEnterVerifyTurn  verify replay extended to structure/semantic
//   - CircuitBreaker         F4: K consecutive provider_error aborts the run
//   - resolveProviderMeta    F5: run.json provenance (EVAL_MODEL_ID wins)
// All pure functions — no mongo/clsi/provider touched here.

import { expect } from 'chai';
import { shouldEnterVerifyTurn, MAX_VERIFY_TURNS } from '../../../../eval/contextBuilder.js';
import { CircuitBreaker, CIRCUIT_BREAKER_THRESHOLD } from '../../../../eval/circuitBreaker.js';
import { resolveProviderMeta, type EvalCreds } from '../../../../eval/creds.js';
import { parseVerdict, buildExcerpts } from '../../../../eval/graders/judgeGrader.js';

describe('eval harness: shouldEnterVerifyTurn', function () {
  it('compile tasks enter verify turns while budget remains', function () {
    expect(shouldEnterVerifyTurn('compile', 0, MAX_VERIFY_TURNS)).to.equal(true);
  });

  it('structure tasks enter verify turns (full-category replay)', function () {
    expect(shouldEnterVerifyTurn('structure', 0, MAX_VERIFY_TURNS)).to.equal(true);
  });

  it('semantic tasks enter verify turns (full-category replay)', function () {
    expect(shouldEnterVerifyTurn('semantic', 0, MAX_VERIFY_TURNS)).to.equal(true);
  });

  it('noop tasks never enter verify turns', function () {
    expect(shouldEnterVerifyTurn('noop', 0, MAX_VERIFY_TURNS)).to.equal(false);
  });

  it('stops once the verify budget is exhausted', function () {
    expect(shouldEnterVerifyTurn('compile', MAX_VERIFY_TURNS, MAX_VERIFY_TURNS)).to.equal(false);
    expect(shouldEnterVerifyTurn('structure', MAX_VERIFY_TURNS, MAX_VERIFY_TURNS)).to.equal(false);
  });

  it('respects a per-task maxVerifyTurns override', function () {
    expect(shouldEnterVerifyTurn('semantic', 1, 1)).to.equal(false);
    expect(shouldEnterVerifyTurn('semantic', 0, 1)).to.equal(true);
  });
});

describe('eval harness: CircuitBreaker (F4)', function () {
  const providerError = (detail = 'HTTP 500: upstream boom') =>
    ({ failureReason: 'provider_error', failureDetail: detail }) as any;
  const otherFailure = () => ({ failureReason: 'compile_still_failing', failureDetail: 'still red' }) as any;
  const success = () => ({ failureReason: null, failureDetail: null }) as any;

  it('does not trip below the threshold', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD - 1; i++) b.record(providerError());
    expect(b.tripped).to.equal(false);
    expect(b.abortMessage()).to.equal(null);
  });

  it('trips at exactly K consecutive provider_error records', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) b.record(providerError());
    expect(b.tripped).to.equal(true);
    expect(b.abortMessage()).to.include(`${CIRCUIT_BREAKER_THRESHOLD} consecutive provider_error`);
  });

  it('resets the streak on any non-provider_error record', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD - 1; i++) b.record(providerError());
    b.record(otherFailure());
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD - 1; i++) b.record(providerError());
    expect(b.tripped).to.equal(false);
  });

  it('resets the streak on a success record', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD - 1; i++) b.record(providerError());
    b.record(success());
    b.record(providerError());
    expect(b.tripped).to.equal(false);
  });

  it('flags provider-noise keywords (余额不足/429) in the abort message', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) b.record(providerError('HTTP 429: 余额不足，请充值'));
    expect(b.tripped).to.equal(true);
    expect(b.abortMessage()).to.include('余额不足|429');
  });

  it('omits the noise annotation for plain provider errors', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) b.record(providerError());
    expect(b.abortMessage()).to.not.include('余额不足|429');
  });

  it('latches the FIRST tripping detail once tripped', function () {
    const b = new CircuitBreaker();
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) b.record(providerError('first boom'));
    b.record(providerError('later boom'));
    expect(b.abortMessage()).to.include('first boom');
    expect(b.abortMessage()).to.not.include('later boom');
  });
});

describe('eval harness: judge parseVerdict (F6)', function () {
  it('parses VALID JSON with correctly-escaped LaTeX (reasoning-model judges)', function () {
    // The F6 regression case: judge emits $\\mathcal — valid JSON that the
    // old sanitize-first chain double-escaped into an illegal sequence.
    const raw = '{"score": 5, "rationale": "All five instances were changed to $\\\\mathcal{L}$, while $L_{rec}$ remains."}';
    const v = parseVerdict(raw);
    expect(v).to.not.equal(null);
    expect(v!.score).to.equal(5);
    expect(v!.rationale).to.include('\\mathcal{L}');
  });

  it('still repairs sloppy JSON with RAW single backslashes', function () {
    // Raw (illegal) JSON: $\mathcal{L}$ with a lone backslash inside the string.
    const raw = '{"score": 4, "rationale": "Changed to $\\mathcal{L}$ correctly."}';
    const v = parseVerdict(raw);
    expect(v).to.not.equal(null);
    expect(v!.score).to.equal(4);
    expect(v!.rationale).to.include('\\mathcal{L}');
  });

  it('tolerates code fences and leading prose', function () {
    const raw = 'Here is my verdict:\n```json\n{"score": 3, "rationale": "Partial."}\n```';
    const v = parseVerdict(raw);
    expect(v).to.not.equal(null);
    expect(v!.score).to.equal(3);
  });

  it('rejects out-of-range scores', function () {
    expect(parseVerdict('{"score": 0, "rationale": "x"}')).to.equal(null);
    expect(parseVerdict('{"score": 6, "rationale": "x"}')).to.equal(null);
    expect(parseVerdict('{"score": "five", "rationale": "x"}')).to.equal(null);
  });

  it('returns null when no JSON object exists', function () {
    expect(parseVerdict('no json here at all')).to.equal(null);
  });
});

describe('eval harness: judge buildExcerpts (F39)', function () {
  // F39: head-only 4000-char excerpts false-failed correct full-document
  // rewrites on long docs (caption-rewrite-8: judge saw 3 of 8 rewritten
  // captions and assumed the rest unchanged). Excerpts now cover up to
  // 12000 chars and window around the changed region beyond that.
  const para = (n: number) => `paragraph ${n} ` + 'x'.repeat(90) + '\n';

  it('passes both documents through verbatim when both fit the cap', function () {
    const { originalExcerpt, revisedExcerpt } = buildExcerpts('short original', 'short revised');
    expect(originalExcerpt).to.equal('short original');
    expect(revisedExcerpt).to.equal('short revised');
  });

  it('shows the FULL revised document when a 7-9k doc changed throughout', function () {
    // caption-rewrite-8 regression case: 7.4k doc, captions rewritten across
    // the whole file — the old 4000-char head hid 5 of them.
    const original = Array.from({ length: 80 }, (_, i) => para(i)).join('');
    const revised = original.replace('paragraph 40', 'paragraph FORTY');
    const { revisedExcerpt } = buildExcerpts(original, revised);
    expect(revisedExcerpt).to.equal(revised);
  });

  it('windows around a head-region change on a >12k doc (tail omitted, marked)', function () {
    // abstract-synthesis shape: 13k doc, edit right after \maketitle.
    const tail = Array.from({ length: 130 }, (_, i) => para(i)).join('');
    const original = '\\maketitle\n' + tail;
    const revised = '\\maketitle\n\\begin{abstract}New abstract.\\end{abstract}\n' + tail;
    const { originalExcerpt, revisedExcerpt } = buildExcerpts(original, revised);
    expect(revisedExcerpt).to.include('New abstract.');
    expect(revisedExcerpt).to.include('unchanged lines omitted below');
    expect(revisedExcerpt).to.not.include('paragraph 129');
    expect(originalExcerpt).to.include('unchanged lines omitted below');
    // Both excerpts cover the SAME window so the diff stays visible.
    expect(originalExcerpt).to.include('\\maketitle');
  });

  it('omits a big unchanged head when the change is at the end', function () {
    const head = Array.from({ length: 130 }, (_, i) => para(i)).join('');
    const original = head + 'last line old\n';
    const revised = head + 'last line new\n';
    const { originalExcerpt, revisedExcerpt } = buildExcerpts(original, revised);
    expect(revisedExcerpt).to.include('unchanged lines omitted above');
    expect(revisedExcerpt).to.include('last line new');
    expect(originalExcerpt).to.include('last line old');
  });

  it('head-slices with a truncation marker when changes are scattered everywhere', function () {
    // terminology-20x shape: 20 scattered edits — no big common middle-free
    // region, so the excerpt falls back to a marked head slice (still 3x the
    // old budget).
    const base = Array.from({ length: 140 }, (_, i) => para(i)).join('');
    let revised = base;
    for (let i = 0; i < 140; i += 7) revised = revised.replace(`paragraph ${i} `, `PARA${i} `);
    const { revisedExcerpt } = buildExcerpts(base, revised);
    expect(revisedExcerpt).to.include('truncated');
    expect(revisedExcerpt.length).to.be.at.most(12_200);
  });

  it('never exceeds the cap (+markers) on pathological inputs', function () {
    const a = 'A'.repeat(50_000);
    const b = 'B'.repeat(50_000);
    const { originalExcerpt, revisedExcerpt } = buildExcerpts(a, b);
    expect(originalExcerpt.length).to.be.at.most(12_200);
    expect(revisedExcerpt.length).to.be.at.most(12_200);
  });

  it('identical long documents fall back to plain head slices (no empty window)', function () {
    const doc = Array.from({ length: 140 }, (_, i) => para(i)).join('');
    const { originalExcerpt, revisedExcerpt } = buildExcerpts(doc, doc);
    expect(originalExcerpt).to.equal(doc.slice(0, 12_000));
    expect(revisedExcerpt).to.equal(doc.slice(0, 12_000));
  });
});

describe('eval harness: resolveProviderMeta (F5)', function () {
  const creds: EvalCreds = {
    userIdentifier: 'user-1',
    usingLlm: 1,
    llminfo: [
      { baseUrl: 'https://api.deepseek.com/v1', models: [{ id: 'deepseek-chat' }], usingChatModel: 0 },
      { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [{ id: 'glm-a' }, { id: 'glm-b' }], usingChatModel: 1 },
    ],
  };

  afterEach(function () {
    delete process.env.EVAL_MODEL_ID;
  });

  it('reads baseUrl and the selected chat model from the usingLlm entry', function () {
    const meta = resolveProviderMeta(creds);
    expect(meta.baseUrl).to.equal('https://ark.cn-beijing.volces.com/api/v3');
    expect(meta.modelId).to.equal('glm-b');
  });

  it('EVAL_MODEL_ID wins over the mongo-stored selection', function () {
    process.env.EVAL_MODEL_ID = 'deepseek-v4-flash-260425';
    const meta = resolveProviderMeta(creds);
    expect(meta.modelId).to.equal('deepseek-v4-flash-260425');
    expect(meta.baseUrl).to.equal('https://ark.cn-beijing.volces.com/api/v3');
  });

  it('defaults usingChatModel to 0 when unset', function () {
    const meta = resolveProviderMeta({
      userIdentifier: 'u',
      usingLlm: 0,
      llminfo: [{ baseUrl: 'https://x.example/v1', models: [{ id: 'm0' }] }],
    });
    expect(meta.modelId).to.equal('m0');
  });

  it('degrades to nulls on an out-of-range entry', function () {
    const meta = resolveProviderMeta({ userIdentifier: 'u', usingLlm: 9, llminfo: [] });
    expect(meta.baseUrl).to.equal(null);
    expect(meta.modelId).to.equal(null);
  });
});
