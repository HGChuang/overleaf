// A single Checks issue row (entry 5, Check tab).
// Shows title, type badge, severity, file:line, description, and actions
// (View details, Jump to file, Explain with Copilot, Suggest fix).

import { FC, useState } from 'react'
import type { CheckIssue, CopilotMessage } from '../../utils/types'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import MessageBlockView from '../message-block'

interface IssueCardProps {
  issue: CheckIssue
  explainResult?: CopilotMessage
  onExplain?: (issue: CheckIssue) => void
  loading?: boolean
}

const SEVERITY_LABEL: Record<string, string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
}

export const IssueCard: FC<IssueCardProps> = ({
  issue,
  explainResult,
  onExplain,
  loading,
}) => {
  const { syncToEntry } = useDetachCompileContext()
  const [expanded, setExpanded] = useState(false)

  const loc = issue.location
  const hasLoc = !!(loc && (loc.file || loc.line != null))
  const sev = issue.severity || 'warning'

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
        <button
          className="copilot-btn"
          onClick={() => setExpanded(s => !s)}
        >
          {expanded ? 'Hide details' : 'View details'}
        </button>
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
          disabled={loading}
          onClick={() => onExplain?.(issue)}
        >
          {loading ? 'Explaining…' : 'Explain with Copilot'}
        </button>
      </div>

      {expanded && explainResult && (
        <div className="copilot-issue-explain">
          {explainResult.content && (
            <div className="copilot-md">{explainResult.content}</div>
          )}
          {explainResult.blocks?.map((b, i) => (
            <MessageBlockView key={i} block={b} />
          ))}
        </div>
      )}
    </div>
  )
}

export default IssueCard
