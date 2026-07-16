import { expect } from 'chai';
import { ContextService } from '../../../../app/services/context.service.js';

describe('ContextService', function () {
  beforeEach(function () {
    this.service = new ContextService({
      maxContextBytes: 10_000,
      maxAttachFiles: 2,
      maxCompileLogChars: 10,
      maxCheckFiles: 1,
    });
  });

  it('normalizes chat context and truncates attached files', function () {
    const context = this.service.normalizeChatContext({
      conversation: { conversationId: 'conv-1', tab: 'write' },
      project: { projectId: 'project-1', rootDocId: 'root', fileList: ['main.tex'] },
      context: {
        currentFile: 'main.tex',
        attachedFiles: [{ path: 'a.tex' }, { path: 'b.tex' }, { path: 'c.tex' }],
      },
      message: { role: 'user', content: 'hello' },
    });

    expect(context.context.attachedFiles).to.have.length(2);
    expect(context.conversation.tab).to.equal('write');
  });

  it('truncates compile log content', function () {
    const context = this.service.normalizeCompileContext({
      project: { projectId: 'project-1', rootDocId: 'root' },
      compile: { logText: '1234567890abcdef', annotations: [] },
      editor: { currentFile: 'main.tex' },
    });

    expect(context.compile.logText).to.equal('1234567890');
  });

  it('limits files included in checks run context', function () {
    const context = this.service.normalizeChecksRunContext({
      project: {
        projectId: 'project-1',
        files: [{ path: 'a.tex' }, { path: 'b.tex' }],
      },
      checks: ['citations'],
    });

    expect(context.project.files).to.have.length(1);
  });
});
