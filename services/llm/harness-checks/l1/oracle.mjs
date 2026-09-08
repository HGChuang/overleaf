import assert from 'node:assert/strict';
// Independent of production applyHunks: tests outcomes against protected byte
// regions, not equality with the implementation's own reconstructed answer.
export function materialize(files, hunks) {
  const result = { ...files };
  for (const path of new Set(hunks.map(h => h.file))) {
    assert.ok(Object.hasOwn(files, path), 'unknown file');
    const source = files[path];
    const edits = hunks.filter(h => h.file === path).map(h => {
      assert.equal(typeof h.oldText, 'string'); assert.equal(typeof h.newText, 'string');
      let start;
      if (h.oldText) {
        start = source.indexOf(h.oldText);
        assert.ok(start >= 0 && source.indexOf(h.oldText, start + 1) < 0, 'nonunique anchor');
      } else {
        const lines = source.split('\n');
        assert.ok(Number.isInteger(h.line) && h.line >= 1 && h.line <= lines.length + 1, 'insertion line');
        start = h.line > lines.length ? source.length : lines.slice(0, h.line - 1).reduce((n, line) => n + line.length + 1, 0);
      }
      return { start, end: start + h.oldText.length, text: h.newText };
    }).sort((a, b) => a.start - b.start);
    for (let i = 1; i < edits.length; i++) assert.ok(edits[i].start > edits[i - 1].start && edits[i].start >= edits[i - 1].end, 'overlap');
    let cursor = 0, output = '';
    for (const e of edits) { output += source.slice(cursor, e.start) + e.text; cursor = e.end; }
    result[path] = output + source.slice(cursor);
  }
  return result;
}

export function checkFiles(c, files) {
  const failures = [];
  if (Object.keys(files).sort().join('\n') !== Object.keys(c.files).sort().join('\n')) failures.push('file set changed');
  for (const [path, source] of Object.entries(c.files)) {
    const regions = c.regions.filter(r => r.file === path);
    // First pack has at most one mutable span per file. Never infer protection
    // boundaries from the candidate itself or accept deletion of a whole file.
    assert.ok(regions.length <= 1);
    if (!regions.length) { if (files[path] !== source) failures.push(`${path}: protected file changed`); continue; }
    const r = regions[0];
    assert.equal(source.split(r.before).length, 2);
    const start = source.indexOf(r.before), prefix = source.slice(0, start), suffix = source.slice(start + r.before.length);
    const candidate = files[path];
    if (typeof candidate !== 'string' || candidate.length < prefix.length + suffix.length || !candidate.startsWith(prefix) || !candidate.endsWith(suffix)) {
      failures.push(`${path}: protected bytes changed`); continue;
    }
    const value = candidate.slice(prefix.length, candidate.length - suffix.length);
    const valid = r.rule.exact !== undefined ? value === r.rule.exact : r.rule.oneOf ? r.rule.oneOf.includes(value) : new RegExp(r.rule.regex).test(value);
    if (!valid) failures.push(`${path}: requested change absent/invalid`);
  }
  return failures;
}

export function checkAnswer(c, text, proposals) {
  const failures = [];
  if (proposals.length) failures.push('unexpected proposal in read-only/clarification task');
  for (const pattern of c.answerChecks || []) if (!new RegExp(pattern, 'i').test(text)) failures.push(`answer lacks ${pattern}`);
  // Lexical checks are triage, not a semantic judge. Preserve full answer for
  // explicit evidence-based review of the three answer/clarification cases.
  return failures;
}
