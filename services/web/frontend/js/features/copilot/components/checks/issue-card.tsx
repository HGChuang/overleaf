// A single Checks issue row (entry 5), now rendered inline inside the unified
// chat (via the `issue_list` message block). Shows title, type badge,
// severity, file:line, description, and actions (Jump to file, Explain with
// Copilot). "Explain" appends the explanation as the next chat message.
// Self-contained: reads explain state from the Copilot context so it can be
// rendered by MessageBlockView with no prop drilling.

import { FC } from 'react'
import type { CheckIssue } from '../../utils/types'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { useCopilotContext } from '../../context/copilot-context'

const SEVERITY_LABEL: Record<string, string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
}

export const IssueCard: FC<{ issue: CheckIssue }> = ({ issue }) => {
  const { syncToEntry } = useDetachCompileContext()
  const { explainIssue, status, loadingAction } = useCopilotContext()

  const loc = issue.location
  const hasLoc = !!(loc && (loc.file || loc.line != null))
  const sev = issue.severity || 'warning'
  const explaining = status === 'loading' && loadingAction === 'explain'

  return (
    <div className={`copilot-issue copilot-sev-${sev}`}>
      <div className="copilot-issue-head">
        <span className={`copilot-badge copilot-sev-${sev}`}>
          {SEVERITY_LABEL[sev] || sev}
        </span>
        <span className="copilot-issue-type">{issue.type}</span>
        <span className="copilot-issue-title">{issue.title}</span>
      </div>

      {hasLoc && (
        <button
          className="copilot-issue-loc"
          onClick={() => syncToEntry({ file: loc?.file, line: loc?.line })}
        >
          {loc?.file || 'file'}
          {loc?.line != null ? `:${loc.line}` : ''}
        </button>
      )}

      {issue.description && (
        <div className="copilot-issue-desc">{issue.description}</div>
      )}

      <div className="copilot-issue-actions">
        {hasLoc && (
          <button
            className="copilot-btn"
            onClick={() => syncToEntry({ file: loc?.file, line: loc?.line })}
          >
            Jump to file
          </button>
        )}
        <button
          className="copilot-btn copilot-btn-primary"
          disabled={explaining}
          onClick={() => explainIssue(issue)}
        >
          {explaining ? 'Explaining…' : 'Explain with Copilot'}
        </button>
      </div>
    </div>
  )
}

export default IssueCard
