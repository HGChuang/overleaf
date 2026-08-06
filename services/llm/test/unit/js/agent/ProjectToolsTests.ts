import { expect } from 'chai';
import { buildProjectTools } from '../../../../app/agent/tools/projectTools.js';
// Anti-drift guard: the app-side count_words tool vendors its algorithm from
// the eval grader. This test imports BOTH and pins equivalence on a battery of
// samples, so a future edit to one side without the other fails loudly here.
import { stripLatex, countWords } from '../../../../eval/graders/assertGrader.js';

const CONTEXT = {
  project: {
    projectId: 'project-1',
    fileList: ['main.tex'],
    files: [
      {
        path: 'main.tex',
        content: [
          '\\section{Introduction}', // brace contents kept → "Introduction" (1)
          'The quick brown fox jumps over 12 dogs. % a trailing comment', // 8 words, comment gone
          'Math $x+y$ and $$a_b$$ are stripped, \\textbf{bold} keeps text.', // Math/and/are/stripped/bold/keeps/text = 7
          '结果是 42 个样本。', // CJK: 结果是个样本 = 6 chars wait — count below
        ].join('\n'),
      },
    ],
  },
};

function makeTool(name: string, context: any = CONTEXT) {
  const tool = buildProjectTools(context).find(t => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

async function callJson(tool: any, params: any) {
  const result = await tool.execute('call_1', params);
  return JSON.parse(result.content[0].text);
}

describe('count_words tool', function () {
  it('strips LaTeX commands/comments/math and counts latin tokens + CJK chars', async function () {
    const tool = makeTool('count_words');
    const out = await callJson(tool, { path: 'main.tex' });
    // Introduction=1; line2: The quick brown fox jumps over 12 dogs = 8;
    // line3: Math and are stripped bold keeps text = 7; line4: 结果是个样本... compute:
    // CJK chars in "结果是 42 个样本。" = 结 果 是 个 样 本 = 6, plus "42" = 1 → 7
    expect(out.found).to.equal(true);
    expect(out.wordCount).to.equal(1 + 8 + 7 + 7);
  });

  it('normalizes a leading slash in the path', async function () {
    const tool = makeTool('count_words');
    const out = await callJson(tool, { path: '/main.tex' });
    expect(out.found).to.equal(true);
  });

  it('reports found:false for a missing file', async function () {
    const tool = makeTool('count_words');
    const out = await callJson(tool, { path: 'nope.tex' });
    expect(out.found).to.equal(false);
  });

  it('counts an empty file as zero words', async function () {
    const tool = makeTool('count_words', {
      project: { projectId: 'p', fileList: ['empty.tex'], files: [{ path: 'empty.tex', content: '' }] },
    });
    const out = await callJson(tool, { path: 'empty.tex' });
    expect(out.wordCount).to.equal(0);
  });

  it('matches the eval grader algorithm on a sample battery (anti-drift)', async function () {
    const tool = makeTool('count_words');
    const samples = [
      'Plain text only.',
      '\\section{Intro}\nSome $math$ and \\[display\\] here. % comment',
      '\\begin{itemize}\n\\item First point\n\\item Second point\n\\end{itemize}',
      '数字金融指数的系数仍然显著为正，其点估计为 0.142。',
      "Escapes: \\% \\& \\~ and apostrophe's hyphen-ated em—dash.",
    ];
    for (const sample of samples) {
      const ctx = {
        project: { projectId: 'p', fileList: ['s.tex'], files: [{ path: 's.tex', content: sample }] },
      };
      const t = buildProjectTools(ctx).find(x => x.name === 'count_words')!;
      const out = await callJson(t, { path: 's.tex' });
      const expected = countWords(stripLatex(sample));
      expect(out.wordCount, `sample: ${sample.slice(0, 40)}`).to.equal(expected);
    }
  });
});
