import { cases } from './cases.mjs';

const original = cases.find(c => c.id === 'L1-09');
const variants = [
  ['original', original.files['main.tex'], original.prompt],
  ['prefix-lf', '% Synthetic location fixture.\n% Preserve manuscript source.\n\n' + original.files['main.tex'],
    original.prompt + '请先列出两个候选的标签、文件路径和各自 caption 所在的准确行号，再让我确认。'],
  ['prefix-crlf', ('% Synthetic location fixture.\n\n% Keep both tables.\n% Line ending fixture.\n\n' + original.files['main.tex']).replaceAll('\n', '\r\n'),
    original.prompt + '请先列出两个候选的标签、文件路径和各自 caption 所在的准确行号，再让我确认。'],
];

export const lineExperiment = {
  id: 'f-l1-02-numbered-content-v1', factor: 'append lineNumberedContent to successful read_file/read_file_fragment results',
  repeats: 3, order: 'alternating AB/BA across 9 pairs',
  controls: 'same paired source/prompt/IDs/model/schema; clean isolated DB for each arm; unchanged source content and page boundaries',
};

export const lineCases = variants.flatMap(([variant, source, prompt], variantIndex) =>
  Array.from({ length: 3 }, (_, repetition) => {
    const pairId = `F02-${variant}-${repetition + 1}`;
    const arms = (variantIndex * 3 + repetition) % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
    return arms.map(arm => ({ ...original, id: `${pairId}-${arm}`, pairId, arm, variant,
      prompt, files: { 'main.tex': source }, family: 'line-evidence-ab',
      expectedLocations: Object.fromEntries(source.split('\n').flatMap((line, index) => {
        const match = line.match(/\\caption\{Main results\}\\label\{([^}]+)\}/);
        return match ? [[match[1], index + 1]] : [];
      })),
    }));
  }).flat());

export const costExperiment = { id: 'line-cost-v1', repeats: 3,
  factor: 'D: raw plus numbered copy; N: numbered only; T: line/text tuples',
  controls: 'same source, identities, model and common format-aware tool descriptions; clean DB per trial' };
export const costCases = lineCases.filter(c => c.arm === 'A').flatMap((c, index) => {
  const order = ['D', 'N', 'T'];
  return [...order.slice(index % 3), ...order.slice(0, index % 3)].map(arm => ({ ...c, arm,
    id: `${c.pairId}-${arm}` }));
});
export function costReadResult(result, arm) {
  return { ...result, content: result.content.map(block => {
    if (block.type !== 'text') return block;
    const page = JSON.parse(block.text);
    if (page.found && typeof page.content !== 'string') throw new Error('Cost experiment requires the frozen raw-content tool baseline');
    if (!page.found || typeof page.content !== 'string') return block;
    const { content, ...meta } = page;
    const lines = content.split('\n');
    const numbered = lines.map((line, i) => `${page.startLine + i}: ${line}`).join('\n');
    const view = arm === 'D' ? { ...page, lineNumberedContent: numbered }
      : arm === 'N' ? { ...meta, lineNumberedContent: numbered }
        : { ...meta, lines: lines.map((line, i) => [page.startLine + i, line]) };
    const text = JSON.stringify(view);
    if (Buffer.byteLength(text) + 16 > 4096) throw new Error('Cost experiment page exceeds budget');
    return { ...block, text };
  }) };
}

// Pure presentation intervention. Keep exact copyable source and byte cursor.
// Oversize output invalidates the experiment instead of silently changing the
// page boundary or triggering history archival only in treatment.
export function numberReadResult(name, result) {
  if (!['read_file', 'read_file_fragment'].includes(name)) return result;
  return { ...result, content: result.content.map(block => {
    if (block.type !== 'text') return block;
    const page = JSON.parse(block.text);
    if (page.found && typeof page.content !== 'string') throw new Error('A/B experiment requires the frozen raw-content tool baseline');
    if (!page.found || typeof page.content !== 'string') return block;
    if (!Number.isInteger(page.startLine) || page.startLine < 1) throw new Error('Invalid line-evidence startLine');
    const text = JSON.stringify({ ...page,
      lineNumberedContent: page.content.split('\n').map((line, index) => `${page.startLine + index}: ${line}`).join('\n'),
    });
    if (Buffer.byteLength(text) + 16 > 4096) throw new Error('Line-evidence experiment invalid: treatment exceeds existing page budget');
    return { ...block, text };
  }) };
}
