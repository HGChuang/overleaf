import { strict as assert } from 'node:assert';
import { SandboxWorkspace, workspaceHash } from '../../../app/agent/sandbox/workspace.js';

describe('SandboxWorkspace', () => {
  it('hashes a workspace independently of file order', () => {
    const a = [
      { path: 'b.tex', content: 'B' },
      { path: 'a.tex', content: 'A' },
    ];
    assert.equal(workspaceHash(a), workspaceHash([...a].reverse()));
  });

  it('applies a multi-hunk call transactionally', () => {
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: 'one\ntwo\nthree\n' }]);
    assert.throws(() =>
      workspace.apply([
        { file: 'main.tex', line: 1, oldText: 'one', newText: 'ONE' },
        { file: '../escape.tex', line: 1, oldText: 'x', newText: 'y' },
      ])
    );
    assert.equal(workspace.get('main.tex'), 'one\ntwo\nthree\n');
  });

  it('uses the line anchor for repeated text and invalidates verification after edits', () => {
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: 'same\nkeep\nsame\n' }]);
    workspace.apply([{ file: 'main.tex', line: 3, oldText: 'same', newText: 'fixed' }]);
    assert.equal(workspace.get('main.tex'), 'same\nkeep\nfixed\n');
    workspace.beginCompile();
    workspace.recordVerification({
      status: 'success',
      errorCount: 0,
      warningCount: 0,
    });
    assert.equal(workspace.exportPatch('fix').hunks.length, 1);
    workspace.apply([{ file: 'main.tex', line: 1, oldText: 'same', newText: 'first' }]);
    assert.throws(() => workspace.exportPatch('stale'));
  });

  it('exports a base-to-current hunk which reproduces the compiled workspace', () => {
    const base = 'before\nwrong command\nafter\n';
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: base }]);
    workspace.apply([
      {
        file: 'main.tex',
        line: 2,
        oldText: 'wrong command',
        newText: 'right command',
      },
    ]);
    workspace.beginCompile();
    workspace.recordVerification({
      status: 'success',
      errorCount: 0,
      warningCount: 1,
    });
    const patch = workspace.exportPatch('verified');
    const hunk = patch.hunks[0];
    assert.equal(base.replace(hunk.oldText, hunk.newText), workspace.get('main.tex'));
    assert.equal(patch.verification.errorCount, 0);
  });

  it('refuses traversal, pure insertion, no-op, and unverified submission', () => {
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: 'hello' }]);
    assert.throws(() => workspace.get('../main.tex'));
    assert.throws(() => workspace.get('/main.tex'));
    assert.throws(() => workspace.get('C:\\main.tex'));
    assert.throws(() =>
      workspace.apply([{ file: 'main.tex', line: 1, oldText: '', newText: 'x' }])
    );
    assert.throws(() =>
      workspace.apply([{ file: 'main.tex', line: 1, oldText: 'hello', newText: 'hello' }])
    );
    assert.throws(() => workspace.exportPatch('not compiled'));
  });
});
