import React, { useState } from 'react'
import { putJSON, FetchError } from '@/infrastructure/fetch-json'

export interface ModelLimits {
  contextWindow: number
  maxTokens: number
}

export default function ModelContextSettings({ name, model, onSaved }: {
  name: string
  model: { id: string; contextWindow?: number; maxTokens?: number }
  onSaved: (limits: ModelLimits) => void
}) {
  const id = `model-limits-${encodeURIComponent(JSON.stringify([name, model.id]))}`
  const [windowValue, setWindowValue] = useState(String(model.contextWindow ?? ''))
  const [outputValue, setOutputValue] = useState(String(model.maxTokens ?? 16000))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const contextWindow = Number(windowValue)
    const maxTokens = Number(outputValue)
    const reserve = Math.max(2048, Math.ceil(contextWindow * 0.05))
    if (!Number.isSafeInteger(contextWindow) || !Number.isSafeInteger(maxTokens) ||
      contextWindow <= 0 || maxTokens <= 0 || contextWindow <= maxTokens + reserve) {
      setError('Enter positive whole numbers. The context window must exceed the output limit plus a safety reserve of 2048 tokens or 5%, whichever is larger.')
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const response = await putJSON<{ success: boolean; data: ModelLimits | string }>('/api/v1/llm/modelLimits', {
        body: { name, modelId: model.id, contextWindow, maxTokens },
      })
      if (!response.success || typeof response.data === 'string') {
        throw new Error(typeof response.data === 'string' ? response.data : 'Unable to save model limits.')
      }
      onSaved(response.data)
      setSaved(true)
    } catch (failure) {
      const message = failure instanceof FetchError && typeof failure.data?.data === 'string'
        ? failure.data.data : failure instanceof Error ? failure.message : 'Unable to save model limits.'
      setError(message)
    } finally { setSaving(false) }
  }

  return (
    <details style={{ marginTop: 8 }}>
      <summary>{model.contextWindow ? `${model.contextWindow.toLocaleString()} token context` : 'Configure context window'}</summary>
      <form onSubmit={save} style={{ marginTop: 8 }}>
        <p>Limits for {model.id}. Use the total input + output window supported by your inference service.</p>
        <label htmlFor={`${id}-window`}>Context window (tokens)</label>
        <input id={`${id}-window`} type="number" min="1" step="1" required className="form-control"
          value={windowValue} disabled={saving}
          onChange={event => { setWindowValue(event.target.value); setSaved(false) }} />
        <label htmlFor={`${id}-output`}>Output limit per request (tokens)</label>
        <input id={`${id}-output`} type="number" min="1" step="1" required className="form-control"
          value={outputValue} disabled={saving}
          onChange={event => { setOutputValue(event.target.value); setSaved(false) }} />
        <p>The remaining budget is used for the paper, conversation and tools. Changes apply to the next request.</p>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save limits'}
        </button>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Model limits saved.</p>}
      </form>
    </details>
  )
}
