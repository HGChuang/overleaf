// Entry 4 — Compile Log Copilot CTA banner. Rendered at the top of the
// compile logs pane. Shows when the latest compile failed and there is a
// parseable log; "Explain errors" opens the Copilot panel's Fix tab and
// triggers /copilot/compile-diagnose with the current log + annotations.

import { FC } from 'react'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { useCopilotContext } from '../context/copilot-context'

export const CopilotCompileCta: FC = () => {
  const { error, rawLog, logEntries } = useDetachCompileContext()
  const { openCompileDiagnose, status, loadingTab } = useCopilotContext()

  const hasLog = Boolean(rawLog) || Boolean((logEntries?.errors || []).length)
  // only show when the compile actually failed and we have a log to explain
  const visible = Boolean(error) && hasLog
  if (!visible) return null

  const loading = status === 'loading' && loadingTab === 'fix'

  return (
    <div className="copilot-cta" role="status">
      <div className="copilot-cta-text">
        <span className="copilot-cta-icon" aria-hidden="true">✦</span>
        <span>Copilot can explain this compile error</span>
      </div>
      <button
        className="copilot-btn copilot-btn-primary copilot-cta-btn"
        onClick={openCompileDiagnose}
        disabled={loading}
      >
        {loading ? 'Diagnosing…' : 'Explain errors'}
      </button>
    </div>
  )
}

export default CopilotCompileCta
