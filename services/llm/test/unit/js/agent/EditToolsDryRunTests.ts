import { expect } from 'chai';
import { buildEditTools } from '../../../../app/agent/tools/editTools.js';
import {
  computeRejectedSubmitPatchIds,
  extractSubmittedPatch,
} from '../../../../app/agent/patchBlocks.js';

// Unit tests for the submit_patch server-side dry-run (eval iteration 1,
// cluster B): hunks are validated against the actual project files in the
// request context BEFORE the patch is accepted; rejections throw (isError →
// turn continues) and the 3rd consecutive rejection terminates the turn.

const FILE_CONTENT = [
  '\\documentclass{article}',
  '\\begin{document}',
  'The quick brown fox jumps over the lazy dog.',
  '\\end{document}',
  '',
].join('\n');

const OTHER_CONTENT = '\\section{Other}\nA entirely different file body.\n';

function makeContext(overrides: any = {}) {
  return {
    project: {
      projectId: 'project-1',
      rootDocId: 'main.tex',
      files: [
        { path: 'main.tex', content: FILE_CONTENT },
        { path: 'chapters/other.tex', content: OTHER_CONTENT },
      ],
      ...(overrides.project || {}),
    },
    context: { currentFile: 'main.tex', ...(overrides.context || {}) },
  };
}

function makeTool(context: any = makeContext()) {
  const [tool] = buildEditTools(context);
  return tool;
}

function hunk(overrides: any = {}) {
  return {
    file: 'main.tex',
    line: 3,
    oldText: 'The quick brown fox jumps over the lazy dog.',
    newText: 'The quick brown fox jumps over the lazy cat.',
    ...overrides,
  };
}

async function expectRejection(promise: Promise<any>): Promise<string> {
  try {
    await promise;
  } catch (err: any) {
    return err.message;
  }
  throw new Error('expected the patch to be rejected, but it was accepted');
}

describe('submit_patch dry-run validation', function () {
  it('accepts a patch whose oldText occurs verbatim in the target file', async function () {
    const tool = makeTool();
    const result = await tool.execute('c1', { hunks: [hunk()], summary: 'dog→cat' });
    expect(result.terminate).to.equal(true);
    const text = result.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
    expect(JSON.parse(text)).to.deep.equal({ submitted: true, count: 1 });
  });

  it('rejects oldText that is not in the file, with a divergence hint', async function () {
    const tool = makeTool();
    const message = await expectRejection(
      tool.execute('c2', {
        hunks: [hunk({ oldText: 'The quick brown fox jumps over the lazy fog.' })],
      })
    );
    expect(message).to.include('oldText not found');
    expect(message).to.include('Diverges after');
    expect(message).to.include('your continuation');
    expect(message).to.include('actual file');
    expect(message).to.include('NO hunks took effect');
    expect(message).to.include('MUST include ALL hunks');
  });

  it('shows the no-prefix variant when nothing matches at all', async function () {
    const tool = makeTool();
    const message = await expectRejection(
      tool.execute('c3', { hunks: [hunk({ oldText: 'ZZZ not in the file at all' })] })
    );
    expect(message).to.include('No prefix of your oldText occurs');
  });

  it('rejects a truly unknown file and lists available paths', async function () {
    const tool = makeTool();
    const message = await expectRejection(
      tool.execute('c4', { hunks: [hunk({ file: 'chapters/ghost.tex' })] })
    );
    expect(message).to.include('unknown file');
    expect(message).to.include('main.tex');
  });

  it('resolves trivial path variants (./, leading slash, case) to the real file', async function () {
    const tool = makeTool();
    // The production apply path anchors by oldText search in the open doc —
    // a variant that still names a real project file would apply fine and
    // must not burn a rejection (R3).
    for (const variant of ['./main.tex', '/main.tex', 'Main.tex', 'MAIN.TEX']) {
      const result = await tool.execute(`c5-${variant}`, { hunks: [hunk({ file: variant })] });
      expect(result.terminate, `variant ${variant} accepted`).to.equal(true);
    }
  });

  it('tolerates a leading slash in the hunk file path', async function () {
    const tool = makeTool();
    const result = await tool.execute('c6', { hunks: [hunk({ file: '/main.tex' })] });
    expect(result.terminate).to.equal(true);
  });

  it('rejects hunks targeting a binary asset with a not-editable message (R6)', async function () {
    const context = makeContext();
    (context.project as any).fileList = ['main.tex', 'chapters/other.tex', 'figures/site_map.pdf'];
    const tool = makeTool(context);
    const message = await expectRejection(
      tool.execute('c6b', { hunks: [hunk({ file: 'figures/site_map.pdf' })] })
    );
    expect(message).to.include('not an editable text file');
    expect(message).to.not.include('unknown file');
  });

  it('accepts a pure insertion (empty oldText) on an existing file', async function () {
    const tool = makeTool();
    const result = await tool.execute('c7', {
      hunks: [hunk({ oldText: '', newText: '\\usepackage{amsmath}' })],
    });
    expect(result.terminate).to.equal(true);
  });

  it('resolves file:null hunks against the current file', async function () {
    const tool = makeTool();
    // oldText only exists in main.tex — a file:null hunk should validate there.
    const ok = await tool.execute('c8', { hunks: [hunk({ file: null })] });
    expect(ok.terminate).to.equal(true);
    // ... and oldText that lives only in ANOTHER file is rejected, with the
    // cross-file note pointing at the real location.
    const message = await expectRejection(
      tool.execute('c9', {
        hunks: [hunk({ file: null, oldText: 'A entirely different file body.' })],
      })
    );
    expect(message).to.include('oldText not found');
    expect(message).to.include('chapters/other.tex');
    expect(message).to.include('wrong file?');
  });

  it('file:null with unresolvable default: accepts oldText found in exactly one file (R4)', async function () {
    // Production parity: rootDocId is a Mongo ObjectId, never a path — the
    // fallback can never resolve there, so validate project-wide instead.
    const context = makeContext();
    delete (context as any).context;
    (context.project as any).rootDocId = '665f1a2b3c4d5e6f7a8b9c0d'; // Mongo id shape
    const tool = makeTool(context);
    const result = await tool.execute('c10', {
      hunks: [hunk({ file: null, oldText: 'A entirely different file body.' })],
    });
    expect(result.terminate).to.equal(true);
  });

  it('file:null with unresolvable default: rejects oldText found in NO file (R4)', async function () {
    const context = makeContext();
    delete (context as any).context;
    (context.project as any).rootDocId = '665f1a2b3c4d5e6f7a8b9c0d';
    const tool = makeTool(context);
    const message = await expectRejection(
      tool.execute('c10b', { hunks: [hunk({ file: null, oldText: 'unverifiable text' })] })
    );
    expect(message).to.include('not found in ANY project file');
  });

  it('fails open when the context carries no project files', async function () {
    const tool = buildEditTools({ project: { projectId: 'p', files: [] } })[0];
    const result = await tool.execute('c11', {
      hunks: [hunk({ oldText: 'anything at all' })],
    });
    expect(result.terminate).to.equal(true);
  });

  it('terminates the turn on the 3rd consecutive rejection, resetting after a success', async function () {
    const tool = makeTool();
    const bad = () => hunk({ oldText: 'definitely not in the file' });

    await expectRejection(tool.execute('r1', { hunks: [bad()] }));
    await expectRejection(tool.execute('r2', { hunks: [bad()] }));
    const third: any = await tool.execute('r3', { hunks: [bad()] });
    expect(third.terminate).to.equal(true);
    expect(third.details?.dryRunRejected).to.equal(true);
    const text = third.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
    expect(text).to.include('turn ends now');

    // A successful submission resets the streak: two more rejections throw…
    await tool.execute('ok', { hunks: [hunk()] });
    await expectRejection(tool.execute('r4', { hunks: [bad()] }));
    await expectRejection(tool.execute('r5', { hunks: [bad()] }));
    // …and only the third terminates again.
    const sixth: any = await tool.execute('r6', { hunks: [bad()] });
    expect(sixth.terminate).to.equal(true);
  });

  it('caps the failure report at 3 hunks', async function () {
    const tool = makeTool();
    const hunks = [0, 1, 2, 3, 4].map(i =>
      hunk({ oldText: `missing text number ${i}` })
    );
    const message = await expectRejection(tool.execute('cap', { hunks }));
    expect(message.match(/oldText not found/g)).to.have.length(3);
    expect(message).to.include('2 more failing hunk(s)');
  });
});

describe('rejected submit_patch filtering', function () {
  const assistantWithPatch = (id: string, oldText: string) => ({
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id,
        name: 'submit_patch',
        arguments: { hunks: [{ file: 'main.tex', line: 1, oldText, newText: 'x' }], summary: `patch ${id}` },
      },
    ],
    timestamp: 1,
  });
  const toolResult = (toolCallId: string, extra: any = {}) => ({
    role: 'toolResult',
    toolCallId,
    toolName: 'submit_patch',
    content: [{ type: 'text', text: 'result' }],
    isError: false,
    timestamp: 2,
    ...extra,
  });

  it('computeRejectedSubmitPatchIds flags isError and dryRunRejected results', function () {
    const messages: any[] = [
      toolResult('a', { isError: true }),
      toolResult('b', { details: { dryRunRejected: true } }),
      toolResult('c', {}),
      { role: 'toolResult', toolCallId: 'd', toolName: 'read_file', content: [], isError: true, timestamp: 3 },
    ];
    const ids = computeRejectedSubmitPatchIds(messages);
    expect([...ids].sort()).to.deep.equal(['a', 'b']);
  });

  it('extractSubmittedPatch skips rejected calls and returns the last clean one', function () {
    const messages: any[] = [
      assistantWithPatch('good-1', 'first'),
      toolResult('good-1'),
      assistantWithPatch('bad-2', 'second'),
      toolResult('bad-2', { isError: true }),
    ];
    const patch = extractSubmittedPatch(messages, computeRejectedSubmitPatchIds(messages));
    expect(patch?.summary).to.equal('patch good-1');
  });

  it('returns null when every submit_patch call was rejected', function () {
    const messages: any[] = [
      assistantWithPatch('bad-1', 'first'),
      toolResult('bad-1', { isError: true }),
      assistantWithPatch('bad-2', 'second'),
      toolResult('bad-2', { details: { dryRunRejected: true } }),
    ];
    const patch = extractSubmittedPatch(messages, computeRejectedSubmitPatchIds(messages));
    expect(patch).to.equal(null);
  });

  it('keeps legacy behavior when no rejections exist', function () {
    const messages: any[] = [assistantWithPatch('only', 'first'), toolResult('only')];
    const patch = extractSubmittedPatch(messages, computeRejectedSubmitPatchIds(messages));
    expect(patch?.summary).to.equal('patch only');
  });
});
