// Read-only post-run audit. Run from repo root with the artifacts directory.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const directory = process.argv[2];
assert.ok(directory, 'Provide experiment artifacts directory');
const read = name => JSON.parse(fs.readFileSync(`${directory}/${name}`, 'utf8'));
const rows = read('results.json');
const dataset = read('dataset.json');
const config = read('config.json');
const sha = text => createHash('sha256').update(text).digest('hex');
assert.equal(rows.length, 18, 'Do not silently drop incomplete trials');
const cases = [];
const firstRequests = new Map();
for (const r of rows) {
  const events = fs.readFileSync(`${directory}/${r.id}/events.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  const files = fs.readdirSync(`${directory}/${r.id}`);
  const requests = files.filter(f => /^wire-\d+-request.json$/.test(f)).sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  firstRequests.set(r.id, read(`${r.id}/${requests[0]}`).body);
  let tokens = 0;
  for (const f of requests) {
    const wire = fs.readFileSync(`${directory}/${r.id}/${f.replace('-request.json', '-response.txt')}`, 'utf8');
    const usages = wire.split('\n').filter(s => s.startsWith('data: ') && s !== 'data: [DONE]').flatMap(s => {
      try { const d = JSON.parse(s.slice(6)); return d.usage ? [d.usage] : []; } catch { return []; }
    });
    assert.ok(usages.length, `${r.id}: missing wire usage`);
    tokens += usages.at(-1).total_tokens;
  }
  assert.equal(tokens, r.reportedTotalTokens, `${r.id}: usage accounting`);
  let readCount = 0, rawBytes = 0, shownBytes = 0;
  for (const e of events.filter(e => e.kind === 'read_evidence')) {
    readCount++;
    const { raw, shown } = e.data;
    const expected = structuredClone(raw);
    for (let i = 0; i < raw.content.length; i++) {
      if (raw.content[i].type !== 'text') continue;
      rawBytes += Buffer.byteLength(raw.content[i].text);
      shownBytes += Buffer.byteLength(shown.content[i].text);
      const input = JSON.parse(raw.content[i].text);
      const output = JSON.parse(shown.content[i].text);
      if (r.arm === 'B' && input.found) {
        const numbered = input.content.split('\n').map((s, n) => `${input.startLine + n}: ${s}`).join('\n');
        assert.equal(output.lineNumberedContent, numbered);
        delete output.lineNumberedContent;
        assert.deepEqual(output, input);
        expected.content[i].text = shown.content[i].text;
      }
      assert.ok(Buffer.byteLength(shown.content[i].text) + 16 <= 4096);
    }
    assert.deepEqual(shown, expected, `${r.id}: non-factor tool result change`);
  }
  cases.push({ id: r.id, pairId: r.pairId, arm: r.arm, variant: r.variant, coreChecksPassed: r.checksPassed,
    calls: r.calls, tokens, inputTokens: r.usage.reduce((n, u) => n + u.input + u.cacheRead + u.cacheWrite, 0),
    outputTokens: r.usage.reduce((n, u) => n + u.output, 0), elapsedMs: r.elapsedMs,
    readCount, rawBytes, shownBytes, presentationDeltaBytes: shownBytes - rawBytes,
    expectedLocations: dataset.find(c => c.id === r.id).expectedLocations, answer: r.answer });
}
const pairs = [...new Set(cases.map(c => c.pairId))].map(pairId => {
  const a = cases.find(c => c.pairId === pairId && c.arm === 'A');
  const b = cases.find(c => c.pairId === pairId && c.arm === 'B');
  assert.ok(a && b);
  assert.deepEqual(firstRequests.get(a.id), firstRequests.get(b.id), `${pairId}: initial model payload differs`);
  return { pairId, initialPayloadIdentical: true, initialPayloadHash: sha(JSON.stringify(firstRequests.get(a.id))),
    bothArmsReadSource: a.readCount > 0 && b.readCount > 0,
    tokenDeltaBMinusA: b.tokens - a.tokens, callDeltaBMinusA: b.calls - a.calls };
});
const sourceUnchanged = Object.entries(config.sourceManifest).every(([p, hash]) => sha(fs.readFileSync(p)) === hash);
assert.ok(sourceUnchanged, 'Source changed during experiment');
fs.writeFileSync(`${directory}/line-audit.json`, JSON.stringify({ cases, pairs, sourceUnchanged }, null, 2));
console.log(JSON.stringify({ pairs: pairs.length, initialPayloadsIdentical: pairs.every(p => p.initialPayloadIdentical),
  exposedPairs: pairs.filter(p => p.bothArmsReadSource).length,
  calls: cases.reduce((n, c) => n + c.calls, 0), tokens: cases.reduce((n, c) => n + c.tokens, 0) }, null, 2));
