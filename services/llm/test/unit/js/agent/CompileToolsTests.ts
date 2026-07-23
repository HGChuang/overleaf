import { expect } from 'chai';
import sinon from 'sinon';
import { buildCompileTools } from '../../../../app/agent/tools/compileTools.js';

// Unit tests for the compile_project verification tool (self-healing loop).
// The webClient is faked — no HTTP, no real compile.

const CONTEXT = {
  project: { projectId: 'project-1', fileList: ['main.tex'], files: [] },
};

function makeTool(webClient: any, context: any = CONTEXT) {
  const [tool] = buildCompileTools(context, { webClient });
  return tool;
}

describe('compile_project tool', function () {
  it('returns the structured compile result as JSON text', async function () {
    const compileResult = {
      status: 'failure',
      errorCount: 1,
      errors: [{ file: 'main.tex', line: 12, message: 'Undefined control sequence.' }],
      warningCount: 2,
    };
    const webClient = { compileProject: sinon.stub().resolves(compileResult) };
    const tool = makeTool(webClient);

    const result = await tool.execute('call_1', {});

    expect(webClient.compileProject).to.have.been.calledOnceWith('project-1');
    const text = result.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('');
    expect(JSON.parse(text)).to.deep.equal(compileResult);
    expect(result.terminate).to.not.equal(true);
  });

  it('reports a clean compile (errorCount 0) verbatim', async function () {
    const webClient = {
      compileProject: sinon.stub().resolves({
        status: 'success',
        errorCount: 0,
        errors: [],
        warningCount: 1,
      }),
    };
    const tool = makeTool(webClient);

    const result = await tool.execute('call_1', {});
    const text = result.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('');
    expect(JSON.parse(text).errorCount).to.equal(0);
  });

  it('throws when the web call fails (loop encodes as isError)', async function () {
    const webClient = {
      compileProject: sinon.stub().rejects(new Error('Request failed with status code 401')),
    };
    const tool = makeTool(webClient);

    await expect(tool.execute('call_1', {})).to.be.rejectedWith('401');
  });

  it('throws when projectId is missing from context', async function () {
    const webClient = { compileProject: sinon.stub().resolves({}) };
    const tool = makeTool(webClient, { project: {} });

    await expect(tool.execute('call_1', {})).to.be.rejectedWith(/projectId/);
    expect(webClient.compileProject).to.not.have.been.called;
  });
});
