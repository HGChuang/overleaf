// Unified chat tab (Ask + Write merged). Handles both project-level Q&A and
// structured generation in one conversation. Suggestion chips hint the backend
// with a per-message `tab` ('ask' for Q&A, 'write' for generation) so the
// backend can still branch, even though there is only one visible tab.

import { FC, useEffect, useRef } from 'react'
import { useCopilotContext } from '../../context/copilot-context'
import MessageList from '../message-list'
import Composer from '../composer'

interface Chip {
  label: string
  onClick: () => void
}

export const AskWriteTab: FC = () => {
  const {
    panelMessages,
    status,
    loadingTab,
    sendMessage,
    seedText,
    clearSeed,
    openCompileDiagnose,
    runChecks,
    setActiveTab,
  } = useCopilotContext()

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // auto-scroll to the latest message
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [panelMessages.length, status])

  // combined suggestions: Q&A (tab: ask) + generation (tab: write)
  const chips: Chip[] = [
    { label: '总结项目结构', onClick: () => sendMessage('总结一下这个项目的结构，并告诉我 main 文件可能是哪一个', 'ask') },
    { label: '解释最近编译错误', onClick: openCompileDiagnose },
    { label: '检查引用问题', onClick: () => { setActiveTab('check'); runChecks() } },
    { label: '生成摘要', onClick: () => sendMessage('根据当前论文内容生成一段 abstract', 'write') },
    { label: '生成表格', onClick: () => sendMessage('根据当前内容生成一个 LaTeX 表格', 'write') },
    { label: '生成公式', onClick: () => sendMessage('生成一个 LaTeX 公式', 'write') },
    { label: '生成算法', onClick: () => sendMessage('生成一个 LaTeX algorithm 环境', 'write') },
  ]

  const isEmpty = panelMessages.length === 0
  // the chat tab covers both 'ask' and 'write' (per-message) requests
  const loading =
    status === 'loading' && (loadingTab === 'ask' || loadingTab === 'write')

  return (
    <div className="copilot-tab-content copilot-tab-askwrite">
      <div className="copilot-tab-scroll" ref={scrollRef}>
        {isEmpty ? (
          <div className="copilot-empty">
            <div className="copilot-empty-title">Ask Copilot</div>
            <div className="copilot-empty-sub">
              Ask about the project, or generate abstracts, tables, formulas,
              and algorithms.
            </div>
            <div className="copilot-chips">
              {chips.map(c => (
                <button
                  key={c.label}
                  className="copilot-chip"
                  onClick={c.onClick}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={panelMessages} />
        )}
      </div>

      <Composer
        onSend={text => sendMessage(text, 'ask')}
        disabled={loading}
        placeholder="Ask a question or describe what to write…"
        seedText={seedText}
        onClearSeed={clearSeed}
      />
    </div>
  )
}

export default AskWriteTab
