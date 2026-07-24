// The unified Copilot chat view. Handles project Q&A and structured
// generation (abstracts, tables, formulas, algorithms) in one conversation.
// Suggestion chips send prompts as ordinary chat messages. Editor selection
// is surfaced as a chip in the composer and sent as context.

import { FC, useEffect, useRef } from 'react'
import { useCopilotContext } from '../context/copilot-context'
import MessageList from './message-list'
import Composer from './composer'

interface Chip {
  label: string
  onClick: () => void
  disabled?: boolean
}

export const ChatView: FC = () => {
  const {
    messages,
    status,
    seedText,
    clearSeed,
    selection,
    clearSelection,
    sendMessage,
  } = useCopilotContext()

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Pin to the bottom on every message update — `messages` changes identity
  // on each streamed delta, so this also tracks the timeline as it grows
  // (length/status alone only fired on message count / turn boundaries).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, status])

  const loading = status === 'loading'

  const chips: Chip[] = [
    {
      label: '总结项目结构',
      onClick: () =>
        sendMessage('总结一下这个项目的结构，并告诉我 main 文件可能是哪一个'),
    },
    {
      label: '生成摘要',
      onClick: () => sendMessage('根据当前论文内容生成一段 abstract'),
    },
    {
      label: '生成表格',
      onClick: () => sendMessage('根据当前内容生成一个 LaTeX 表格'),
    },
    { label: '生成公式', onClick: () => sendMessage('生成一个 LaTeX 公式') },
    {
      label: '生成算法',
      onClick: () => sendMessage('生成一个 LaTeX algorithm 环境'),
    },
  ]

  const isEmpty = messages.length === 0

  return (
    <div className="copilot-tab-content copilot-tab-chat">
      <div className="copilot-tab-scroll" ref={scrollRef}>
        {isEmpty ? (
          <div className="copilot-empty">
            <div className="copilot-empty-title">Ask Copilot</div>
            <div className="copilot-empty-sub">
              Ask about the project, or generate abstracts, tables, formulas,
              and algorithms. Select text in the editor to include it as
              context.
            </div>
            <div className="copilot-chips">
              {chips.map(c => (
                <button
                  key={c.label}
                  className="copilot-chip"
                  onClick={c.onClick}
                  disabled={c.disabled}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      <Composer
        onSend={text => sendMessage(text)}
        disabled={loading}
        placeholder="Ask a question or describe what to write…"
        seedText={seedText}
        onClearSeed={clearSeed}
        selection={selection}
        onClearSelection={clearSelection}
      />
    </div>
  )
}

export default ChatView
