import React from 'react'
import { expect } from 'chai'
import sinon from 'sinon'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ModelContextSettings from '@/features/settings/components/llm/ModelContextSettings'

describe('Model context settings', function () {
  afterEach(function () { cleanup(); sinon.restore() })

  it('saves window and output limits for the selected provider/model with CSRF protection', async function () {
    const request = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, status: 200, headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: { contextWindow: 128000, maxTokens: 16000 } }),
    } as Response)
    const onSaved = sinon.spy()
    render(<ModelContextSettings name="My provider" model={{ id: 'my-model' }} onSaved={onSaved} />)
    fireEvent.click(screen.getByText('Configure context window'))
    fireEvent.change(screen.getByLabelText('Context window (tokens)'), { target: { value: '128000' } })
    fireEvent.click(screen.getByText('Save limits'))
    await waitFor(() => expect(onSaved).to.have.been.calledOnce)
    expect(request.firstCall.args[0]).to.equal('/api/v1/llm/modelLimits')
    const options = request.firstCall.args[1] as RequestInit
    expect(options.method).to.equal('PUT')
    expect(options.headers).to.have.property('X-Csrf-Token')
    expect(JSON.parse(options.body as string)).to.deep.equal({ name: 'My provider', modelId: 'my-model', contextWindow: 128000, maxTokens: 16000 })
    expect(screen.getByRole('status').textContent).to.equal('Model limits saved.')
  })

  it('does not save a window that cannot accommodate output and the safety reserve', async function () {
    const request = sinon.stub(globalThis, 'fetch')
    render(<ModelContextSettings name="My provider" model={{ id: 'small-model', contextWindow: 8192, maxTokens: 16000 }} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('8,192 token context'))
    fireEvent.click(screen.getByText('Save limits'))
    expect(screen.getByRole('alert').textContent).to.contain('safety reserve')
    expect(request).not.to.have.been.called
  })

  it('loads different saved values when the selected model changes', function () {
    const view = render(<ModelContextSettings key="alpha" name="provider" model={{ id: 'alpha', contextWindow: 128000, maxTokens: 16000 }} onSaved={() => {}} />)
    view.rerender(<ModelContextSettings key="beta" name="provider" model={{ id: 'beta', contextWindow: 64000, maxTokens: 8000 }} onSaved={() => {}} />)
    expect((screen.getByLabelText('Context window (tokens)') as HTMLInputElement).value).to.equal('64000')
    expect((screen.getByLabelText('Output limit per request (tokens)') as HTMLInputElement).value).to.equal('8000')
  })
})
