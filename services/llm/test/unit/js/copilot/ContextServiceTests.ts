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

  it('normalizes compileErrors: coerces line, caps count and message length', function () {
    const errors = Array.from({ length: 30 }, (_, i) => ({
      file: 'main.tex',
      line: String(i + 1), // parser line can be a string
      message: `error ${i} ` + 'x'.repeat(400),
    }));
    const context = this.service.normalizeChatContext({
      project: { projectId: 'project-1' },
      context: { compileErrors: errors },
      message: { role: 'user', content: 'fix' },
    });

    expect(context.context.compileErrors).to.have.length(20);
    expect(context.context.compileErrors[0].line).to.equal(1);
    expect(context.context.compileErrors[0].message).to.have.length(300);
  });

  it('defaults compileErrors to [] when absent or malformed', function () {
    const base = {
      project: { projectId: 'project-1' },
      message: { role: 'user', content: 'hi' },
    };
    expect(
      this.service.normalizeChatContext({ ...base, context: {} }).context
        .compileErrors
    ).to.deep.equal([]);
    expect(
      this.service.normalizeChatContext({
        ...base,
        context: { compileErrors: 'not-an-array' },
      }).context.compileErrors
    ).to.deep.equal([]);
    // non-string file / non-numeric line become null
    const normalized = this.service.normalizeChatContext({
      ...base,
      context: { compileErrors: [{ file: 42, line: 'abc', message: 'm' }] },
    });
    expect(normalized.context.compileErrors[0]).to.deep.equal({
      file: null,
      line: null,
      message: 'm',
    });
  });
});
