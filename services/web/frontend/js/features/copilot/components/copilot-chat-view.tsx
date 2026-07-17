// The unified Copilot chat view (no more Ask/Fix/Check tabs). Handles
// project Q&A, structured generation, and folded-in compile diagnostics /
// checks issues in one conversation. Suggestion chips hint the backend with a
// per-message `tab` ('ask' for Q&A, 'write' for generation). Editor selection
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
    openCompileDiagnose,
    runChecks,
    hasCompileLog,
  } = useCopilotContext()

  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, status])

  const loading = status === 'loading'

  const chips: Chip[] = [
    {
      label: '总结项目结构',
      onClick: () =>
        sendMessage('总结一下这个项目的结构，并告诉我 main 文件可能是哪一个', 'ask'),
    },
    {
      label: '解释最近编译错误',
      onClick: openCompileDiagnose,
      disabled: !hasCompileLog || loading,
    },
    { label: '检查引用问题', onClick: () => runChecks(), disabled: loading },
    {
      label: '生成摘要',
      onClick: () => sendMessage('根据当前论文内容生成一段 abstract', 'write'),
    },
    {
      label: '生成表格',
      onClick: () => sendMessage('根据当前内容生成一个 LaTeX 表格', 'write'),
    },
    { label: '生成公式', onClick: () => sendMessage('生成一个 LaTeX 公式', 'write') },
    {
      label: '生成算法',
      onClick: () => sendMessage('生成一个 LaTeX algorithm 环境', 'write'),
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
        onSend={text => sendMessage(text, 'ask')}
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
