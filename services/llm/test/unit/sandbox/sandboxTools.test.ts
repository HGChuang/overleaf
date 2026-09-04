import { strict as assert } from 'node:assert';
import { SandboxWorkspace } from '../../../app/agent/sandbox/workspace.js';
import { buildSandboxTools } from '../../../app/agent/tools/sandboxTools.js';
import { extractSubmittedPatch, mapMessagesForView } from '../../../app/agent/patchBlocks.js';
import { buildToolPool } from '../../../app/agent/tools/provider.js';

function tool(tools: any[], name: string) {
  const found = tools.find((item) => item.name === name);
  assert.ok(found, `missing tool ${name}`);
  return found;
}

describe('sandbox tools', () => {
  it('replaces the legacy submit tool in the default pool', () => {
    const tools = buildToolPool(
      {
        project: {
          projectId: 'p1',
          files: [{ path: 'main.tex', content: 'x' }],
        },
        context: { currentFile: 'main.tex' },
      },
      { webClient: {} as any }
    );
    const names = tools.map((item) => item.name);
    assert.ok(names.includes('sandbox_apply_patch'));
    assert.ok(names.includes('sandbox_compile'));
    assert.ok(names.includes('submit_sandbox'));
    assert.ok(!names.includes('submit_patch'));
  });

  it('requires a matching zero-error compile before submitting a server-derived patch', async () => {
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: '\\bad\n' }], 'main.tex');
    const calls: any[] = [];
    const webClient = {
      async compileSandbox(_projectId: string, body: any) {
        calls.push(body);
        return {
          status: 'success',
          errorCount: 0,
          errors: [],
          warningCount: 0,
          inputWorkspaceHash: body.workspaceHash,
        };
      },
    };
    const tools = buildSandboxTools(
      { project: { projectId: 'p1' } },
      { workspace, webClient: webClient as any }
    );
    await assert.rejects(tool(tools, 'submit_sandbox').execute('submit-early', { summary: 'x' }));
    await tool(tools, 'sandbox_apply_patch').execute('apply', {
      hunks: [{ file: 'main.tex', line: 1, oldText: '\\bad', newText: 'good' }],
    });
    await tool(tools, 'sandbox_compile').execute('compile', {});
    const result = await tool(tools, 'submit_sandbox').execute('submit', {
      summary: 'fixed',
    });
    assert.equal(result.terminate, true);
    assert.equal(calls.length, 1);
    assert.equal((result.details as any).sandboxPatch.hunks[0].oldText.includes('\\bad'), true);
    assert.equal((result.details as any).sandboxPatch.verification.errorCount, 0);
  });

  it('rejects a forged compile attestation hash', async () => {
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: 'bad' }]);
    const tools = buildSandboxTools(
      { project: { projectId: 'p1' } },
      {
        workspace,
        webClient: {
          compileSandbox: async () => ({
            status: 'success',
            errorCount: 0,
            errors: [],
            warningCount: 0,
            inputWorkspaceHash: '0'.repeat(64),
          }),
        } as any,
      }
    );
    workspace.apply([{ file: 'main.tex', line: 1, oldText: 'bad', newText: 'good' }]);
    await assert.rejects(tool(tools, 'sandbox_compile').execute('compile', {}), /attestation/);
  });

  it('keeps failed compiles unsubmitable and enforces the per-turn compile budget', async () => {
    const workspace = new SandboxWorkspace([{ path: 'main.tex', content: 'bad' }]);
    const tools = buildSandboxTools(
      { project: { projectId: 'p1' } },
      {
        workspace,
        webClient: {
          compileSandbox: async (_projectId: string, body: any) => ({
            status: 'success',
            errorCount: 1,
            errors: [{ file: 'main.tex', line: 1, message: 'bad' }],
            warningCount: 0,
            inputWorkspaceHash: body.workspaceHash,
          }),
        } as any,
      }
    );
    workspace.apply([{ file: 'main.tex', line: 1, oldText: 'bad', newText: 'still bad' }]);
    for (let i = 0; i < 3; i++) await tool(tools, 'sandbox_compile').execute(`compile-${i}`, {});
    await assert.rejects(tool(tools, 'submit_sandbox').execute('submit', { summary: 'x' }));
    await assert.rejects(
      tool(tools, 'sandbox_compile').execute('compile-over-budget', {}),
      /budget exhausted/
    );
  });

  it('rebuilds a verified patch card from the sandbox tool result', () => {
    const call = {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 's1',
          name: 'submit_sandbox',
          arguments: { summary: 'ignored' },
        },
      ],
      timestamp: 1,
    } as any;
    const result = {
      role: 'toolResult',
      toolCallId: 's1',
      toolName: 'submit_sandbox',
      content: [{ type: 'text', text: '{"submitted":true}' }],
      details: {
        sandboxPatch: {
          summary: 'verified',
          hunks: [
            {
              file: 'main.tex',
              line: 1,
              oldText: 'bad',
              newText: 'good',
            },
          ],
          verification: {
            status: 'success',
            errorCount: 0,
            workspaceHash: 'abc',
          },
        },
      },
      isError: false,
      timestamp: 2,
    } as any;
    assert.equal(extractSubmittedPatch([call, result])?.summary, 'verified');
    const view = mapMessagesForView([call, result]);
    assert.equal((view[0].blocks as any)[0].patch.verification.errorCount, 0);
  });
});
