// Composer (footer input) for the unified Copilot chat.
// Enter sends, Shift+Enter inserts a newline, Escape clears the input.
// Shows a line-number reference chip when the editor has a selection, and a
// seed-prompt chip (from "Continue in Copilot"). The selected text is sent to
// the backend with the next question (see copilot-context sendMessage).

import { FC, useEffect, useRef, useState, KeyboardEvent } from 'react'
import type { CopilotSelection } from '../context/copilot-context'

interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  seedText?: string | null
  onClearSeed?: () => void
  selection?: CopilotSelection | null
  onClearSelection?: () => void
}

function lineRangeLabel(sel: CopilotSelection): string {
  const file = sel.file ? sel.file.replace(/^.*\//, '') : null
  const range =
    sel.fromLine === sel.toLine
      ? `L${sel.fromLine}`
      : `L${sel.fromLine}–${sel.toLine}`
  return file ? `${file} ${range}` : range
}

export const Composer: FC<ComposerProps> = ({
  onSend,
  disabled,
  placeholder = 'Ask Copilot…',
  seedText,
  onClearSeed,
  selection,
  onClearSelection,
}) => {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // focus the input when the composer mounts
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }, [])

  const send = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSend(value)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    } else if (e.key === 'Escape') {
      setText('')
    }
  }

  const hasContext = Boolean(seedText) || Boolean(selection)

  return (
    <div className="copilot-composer">
      {hasContext && (
        <div className="copilot-composer-context">
          {selection && (
            <div className="copilot-selection-chip" title={selection.text}>
              <span aria-hidden="true">📄</span>
              <span className="copilot-selection-chip-text">
                {lineRangeLabel(selection)}
              </span>
              {onClearSelection && (
                <button
                  className="copilot-selection-chip-clear"
                  onClick={onClearSelection}
                  title="Remove selection context"
                >
                  ×
                </button>
              )}
            </div>
          )}
          {seedText && (
            <div className="copilot-composer-seed">
              <span className="copilot-composer-seed-label">Context:</span>
              <span className="copilot-composer-seed-text" title={seedText}>
                {seedText.length > 60 ? seedText.slice(0, 60) + '…' : seedText}
              </span>
              {onClearSeed && (
                <button
                  className="copilot-composer-seed-clear"
                  onClick={onClearSeed}
                  title="Remove context"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="copilot-composer-input-wrap">
        <textarea
          ref={inputRef}
          className="copilot-composer-input"
          placeholder={placeholder}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          className="copilot-send"
          onClick={send}
          disabled={disabled || !text.trim()}
          title="Send (Enter)"
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Composer
