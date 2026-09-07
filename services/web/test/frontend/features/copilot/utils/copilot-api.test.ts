import { expect } from 'chai'
import sinon from 'sinon'
import {
  normalizeInlineCompletion,
  runCopilotEditorAction,
  copilotChatStream,
  copilotGetConversation,
  copilotListConversations,
  copilotCompact,
} from '@/features/copilot/utils/copilot-api'

describe('Copilot editor actions', function () {
  afterEach(function () {
    sinon.restore()
  })

  it('routes selection actions through the unified Copilot endpoint', async function () {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      ok: true,
      json: sinon.stub().resolves({
        success: true,
        data: { message: { role: 'assistant', content: 'rewritten' } },
      }),
    } as unknown as Response)

    const result = await runCopilotEditorAction({
      projectId: 'project-1',
      selectedText: 'original',
      message: 'Paraphrase this text',
      action: { kind: 'selection', mode: 1 },
    })

    expect(result).to.equal('rewritten')
    expect(fetchStub).to.have.been.calledOnce
    expect(fetchStub.firstCall.args[0]).to.equal('/api/v1/copilot/chat')
    const request = fetchStub.firstCall.args[1] as RequestInit
    expect(JSON.parse(String(request.body))).to.deep.include({
      projectId: 'project-1',
      conversation: { source: 'selection' },
      context: {
        currentFile: null,
        selectedText: 'original',
        editorAction: { kind: 'selection', mode: 1 },
      },
    })
  })

  it('routes inline completion through the same endpoint', async function () {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      ok: true,
      json: sinon.stub().resolves({
        success: true,
        data: {
          message: { role: 'assistant', content: '<COMPLETION>next' },
        },
      }),
    } as unknown as Response)

    const result = await runCopilotEditorAction({
      projectId: 'project-1',
      currentFile: 'main.tex',
      message: 'Complete the text at the cursor.',
      action: {
        kind: 'completion',
        leftContext: 'left',
        rightContext: 'right',
        language: 'latex',
        maxLength: 60,
      },
    })

    expect(result).to.equal('next')
    expect(fetchStub.firstCall.args[0]).to.equal('/api/v1/copilot/chat')
    const request = fetchStub.firstCall.args[1] as RequestInit
    const body = JSON.parse(String(request.body))
    expect(body.conversation.source).to.equal('inline-completion')
    expect(body.context.editorAction).to.deep.equal({
      kind: 'completion',
      leftContext: 'left',
      rightContext: 'right',
      language: 'latex',
      maxLength: 60,
    })
  })

  it('normalizes accidental completion wrappers', function () {
    expect(
      normalizeInlineCompletion('```latex\n\\section{Intro}\n```')
    ).to.equal('\\section{Intro}')
    expect(normalizeInlineCompletion('<COMPLETION>continued text')).to.equal(
      'continued text'
    )
  })

  it('forwards compression lifecycle events while preserving the final chat response', async function () {
    const text = [
      'event: context_compacting\ndata: {"reason":"capacity"}\n\n',
      'event: context_degraded\ndata: {"reason":"summary unavailable"}\n\n',
      'event: context_compacted\ndata: {"generation":2,"beforeTokens":9000,"afterTokens":5000}\n\n',
      'event: done\ndata: {"message":{"role":"assistant","content":"continued"}}\n\n',
    ].join('')
    const read = sinon.stub()
    read.onFirstCall().resolves({ done: false, value: new TextEncoder().encode(text) })
    read.onSecondCall().resolves({ done: true })
    sinon.stub(globalThis, 'fetch').resolves({
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => ({ read, releaseLock: () => {} }) },
    } as unknown as Response)
    const events: string[] = []
    const result = await copilotChatStream({
      projectId: 'project-1', message: { role: 'user', content: 'continue' },
    }, { onEvent: event => events.push(event.type) })
    expect(events).to.deep.equal(['context_compacting', 'context_degraded', 'context_compacted'])
    expect(result.message.content).to.equal('continued')
  })

  it('sends the CSRF token on manual compaction', async function () {
    document.head.insertAdjacentHTML('beforeend', '<meta name="ol-csrfToken" content="csrf-1">')
    window.metaAttributesCache.delete('ol-csrfToken')
    const request = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, json: async () => ({ success: true, data: { generation: 1 } }),
    } as unknown as Response)
    await copilotCompact('conversation-1', 'project-1')
    const options = request.firstCall.args[1] as RequestInit
    expect((options.headers as Record<string, string>)['X-Csrf-Token']).to.equal('csrf-1')
  })

  it('lists conversations within the current project', async function () {
    const request = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, json: async () => ({ success: true, data: { conversations: [] } }),
    } as unknown as Response)
    await copilotListConversations('project-1')
    expect(request.firstCall.args[0]).to.equal('/api/v1/copilot/conversations?projectId=project-1')
  })

  it('includes project scope and cursor when reloading persistent history', async function () {
    const request = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, json: async () => ({ success: true, data: { messages: [], nextBefore: null } }),
    } as unknown as Response)
    await copilotGetConversation('conversation-1', 'project-1', undefined, 12)
    expect(request.firstCall.args[0]).to.equal('/api/v1/copilot/conversations/conversation-1?projectId=project-1&before=12')
  })
})
