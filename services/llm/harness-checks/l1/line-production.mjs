import { cases } from './cases.mjs';
import { costCases } from './line-experiment.mjs';

// Regression of the actual tools, without the experimental presentation wrapper.
const before = '1: Measured accuracy is 91.2 percent.\r\n2: We retained 12 samples.';
const after = '1: Measured accuracy is 94.5 percent.\r\n2: We retained 16 samples.';
export const productionLineCases = [
  ...cases,
  ...costCases.filter(c => c.arm === 'N' && c.pairId.endsWith('-1')).map(c => ({
    ...c, id: `LINES-${c.variant}`, arm: undefined, pairId: undefined,
  })),
  { id: 'LINES-crlf-literal-edit', family: 'source-prefix-copy', split: 'dev', outcome: 'proposal',
    prompt: '只修改 main.tex 的 verbatim 中这两行：将 91.2 改为 94.5、12 samples 改为 16 samples。保留两行开头原本属于内容的“1: ”和“2: ”，保留 CRLF 换行及所有其他源码。请编译验证候选补丁。',
    files: { 'main.tex': '\\documentclass{article}\r\n% 1: literal metadata-looking comment\r\n\\begin{document}\r\n\\begin{verbatim}\r\n' + before + '\r\n\\end{verbatim}\r\nProtected conclusion.\r\n\\end{document}\r\n' },
    regions: [{ file: 'main.tex', before, reference: after, rule: { exact: after } }],
    baselineCompiles: true, compileRequired: true, agentCompileRequired: true },
];
