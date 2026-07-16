// Composer (footer input) for the Ask/Write tabs.
// Enter sends, Shift+Enter inserts a newline, Escape clears the input.

import { FC, useEffect, useRef, useState, KeyboardEvent } from 'react'

interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  seedText?: string | null
  onClearSeed?: () => void
}

export const Composer: FC<ComposerProps> = ({
  onSend,
  disabled,
  placeholder = 'Ask Copilot…',
  seedText,
  onClearSeed,
}) => {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // focus the input when the composer mounts
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }, [])

  // auto-grow the textarea up to a max height
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [text])

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

  return (
    <div className="copilot-composer">
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
      <div className="copilot-composer-row">
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
          className="copilot-btn copilot-btn-primary copilot-send"
          onClick={send}
          disabled={disabled || !text.trim()}
          title="Send (Enter)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 5l-6 6h4v7h4v-7h4l-6-6z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default Composer
