import { expect } from 'chai';
import { ContextService } from '../../../../app/services/context.service.js';

describe('ContextService', function () {
  beforeEach(function () {
    this.service = new ContextService({
      maxContextBytes: 10_000,
      maxAttachFiles: 2,
    });
  });

  it('normalizes chat context and truncates attached files', function () {
    const context = this.service.normalizeChatContext({
      conversation: { conversationId: 'conv-1', source: 'panel' },
      project: { projectId: 'project-1', rootDocId: 'root', fileList: ['main.tex'] },
      context: {
        currentFile: 'main.tex',
        attachedFiles: [{ path: 'a.tex' }, { path: 'b.tex' }, { path: 'c.tex' }],
      },
      message: { role: 'user', content: 'hello' },
    });

    expect(context.context.attachedFiles).to.have.length(2);
    expect(context.conversation.source).to.equal('panel');
  });

  it('rejects an oversized context', function () {
    expect(() =>
      this.service.normalizeChatContext({
        project: { projectId: 'project-1' },
        context: {},
        message: { role: 'user', content: 'x'.repeat(20_000) },
      })
    ).to.throw(/too large/);
  });

  it('requires project.projectId and a user message', function () {
    expect(() =>
      this.service.normalizeChatContext({
        project: {},
        context: {},
        message: { role: 'user', content: 'hi' },
      })
    ).to.throw(/projectId/);
    expect(() =>
      this.service.normalizeChatContext({
        project: { projectId: 'project-1' },
        context: {},
        message: { role: 'assistant', content: 'hi' },
      })
    ).to.throw(/message.role/);
  });
});
