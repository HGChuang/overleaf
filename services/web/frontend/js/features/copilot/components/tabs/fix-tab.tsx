// Fix tab — structured compile diagnostics (entry 4). Shows a "run diagnose"
// hero when empty, otherwise a list of DiagnosticCards plus a follow-up
// composer that continues the compile conversation.

import { FC, useEffect, useRef } from 'react'
import { useCopilotContext } from '../../context/copilot-context'
import DiagnosticCard from '../diagnostic-card'
import MessageList from '../message-list'
import Composer from '../composer'

export const FixTab: FC = () => {
  const {
    diagnostics,
    fixSummary,
    fixMessages,
    status,
    loadingTab,
    openCompileDiagnose,
    regenerateCompileDiagnose,
    sendMessage,
  } = useCopilotContext()

  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [diagnostics.length, fixMessages.length, status])

  const loading = status === 'loading' && loadingTab === 'fix'
  const hasDiagnostics = diagnostics.length > 0
  const hasMessages = fixMessages.length > 0

  return (
    <div className="copilot-tab-content copilot-tab-fix">
      <div className="copilot-tab-scroll" ref={scrollRef}>
        {!hasDiagnostics && !hasMessages && (
          <div className="copilot-empty">
            <div className="copilot-empty-title">Fix compile errors</div>
            <div className="copilot-empty-sub">
              Run Copilot on the latest compile log to get structured error
              explanations and suggested fixes.
            </div>
            <button
              className="copilot-btn copilot-btn-primary"
              onClick={openCompileDiagnose}
              disabled={loading}
            >
              {loading ? 'Diagnosing…' : 'Explain compile errors'}
            </button>
          </div>
        )}

        {hasDiagnostics && (
          <div className="copilot-diag-list">
            {fixSummary && (
              <div className="copilot-diag-summary">{fixSummary}</div>
            )}
            {diagnostics.map((d, i) => (
              <DiagnosticCard
                key={d.id || i}
                diagnostic={d}
                onRegenerate={regenerateCompileDiagnose}
              />
            ))}
          </div>
        )}

        {hasMessages && <MessageList messages={fixMessages} />}
      </div>

      <Composer
        onSend={text => sendMessage(text, 'fix')}
        disabled={loading}
        placeholder="Ask about the error…"
      />
    </div>
  )
}

export default FixTab
