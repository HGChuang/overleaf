// One immutable-baseline overlay contract for counts, proposals and compiles.
function applyHunks(content, hunks) {
  const edits = hunks.map(h => {
    if (typeof h.oldText !== 'string' || typeof h.newText !== 'string') {
      throw new Error('Invalid patch hunk');
    }
    let start;
    if (!h.oldText) {
      const lines = content.split('\n');
      if (!Number.isInteger(h.line) || h.line < 1 || h.line > lines.length + 1) {
        throw new Error('Insertion requires a valid line');
      }
      start = h.line === lines.length + 1 ? content.length :
        lines.slice(0, h.line - 1).reduce((n, line) => n + line.length + 1, 0);
    } else {
      start = content.indexOf(h.oldText);
      if (start < 0 || content.indexOf(h.oldText, start + 1) >= 0) {
        throw Object.assign(new Error('Patch anchor is missing or ambiguous; copy more surrounding source'), { status: 409 });
      }
    }
    return { start, end: start + h.oldText.length, text: h.newText };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start <= edits[i - 1].start || edits[i].start < edits[i - 1].end) {
      throw new Error('Patch hunks overlap');
    }
  }
  for (const edit of edits.reverse()) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  return content;
}

function compileOutcome(result) {
  if (result?.errorCount == null || !Number.isInteger(result.errorCount) || result.errorCount < 0) return 'unavailable';
  if (result.errorCount > 0 || ['failure', 'stopped-on-first-error'].includes(result.status)) return 'failed';
  return result.status === 'success' && result.logComplete === true && typeof result.buildId === 'string' && result.buildId.length > 0
    ? 'passed' : 'unavailable';
}

exports.applyHunks = applyHunks;
exports.compileOutcome = compileOutcome;
