// Check tab — project-level structured checks (entry 5). "Run checks" button
// with type selectors, a summary, and a grouped issue list. Each issue can
// be explained inline via /copilot/checks/explain.

import { FC, useState } from 'react'
import { useCopilotContext } from '../../context/copilot-context'
import type { CheckIssue, CheckType } from '../../utils/types'
import IssueCard from '../checks/issue-card'

const ALL_CHECKS: { key: CheckType; label: string }[] = [
  { key: 'citations', label: 'Citations' },
  { key: 'references', label: 'References' },
  { key: 'figures_tables', label: 'Figures & Tables' },
  { key: 'terminology', label: 'Terminology' },
]

const GROUP_LABEL: Record<string, string> = {
  citations: 'Citations',
  references: 'References',
  figures_tables: 'Figures & Tables',
  terminology: 'Terminology',
}

export const CheckTab: FC = () => {
  const {
    issues,
    checkSummary,
    explainResults,
    status,
    loadingTab,
    runChecks,
    explainIssue,
  } = useCopilotContext()

  const [selected, setSelected] = useState<CheckType[]>(
    ALL_CHECKS.map(c => c.key)
  )

  const toggle = (key: CheckType) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const loading = status === 'loading' && loadingTab === 'check'
  const hasIssues = issues.length > 0

  // group issues by type
  const groups = issues.reduce<Record<string, CheckIssue[]>>((acc, issue) => {
    const key = issue.type || 'other'
    ;(acc[key] || (acc[key] = [])).push(issue)
    return acc
  }, {})

  return (
    <div className="copilot-tab-content copilot-tab-check">
      <div className="copilot-tab-scroll">
        <div className="copilot-check-controls">
          <div className="copilot-check-types">
            {ALL_CHECKS.map(c => (
              <label
                key={c.key}
                className={`copilot-check-type ${selected.includes(c.key) ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c.key)}
                  onChange={() => toggle(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
          <button
            className="copilot-btn copilot-btn-primary"
            onClick={() => runChecks(selected)}
            disabled={loading || selected.length === 0}
          >
            {loading ? 'Running…' : 'Run checks'}
          </button>
        </div>

        {checkSummary && (
          <div className="copilot-check-summary">
            <span className="copilot-check-total">
              {checkSummary.total} issue{checkSummary.total === 1 ? '' : 's'} found
            </span>
            {checkSummary.byType &&
              Object.entries(checkSummary.byType).map(([type, count]) => (
                <span key={type} className="copilot-check-bytype">
                  {GROUP_LABEL[type] || type}: {count as number}
                </span>
              ))}
          </div>
        )}

        {!loading && !hasIssues && checkSummary && (
          <div className="copilot-empty-sub">No issues found. 🎉</div>
        )}

        {hasIssues && (
          <div className="copilot-issue-list">
            {Object.entries(groups).map(([type, list]) => (
              <div key={type} className="copilot-issue-group">
                <div className="copilot-issue-group-title">
                  {GROUP_LABEL[type] || type}
                </div>
                {list.map(issue => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    explainResult={explainResults[issue.id]}
                    onExplain={explainIssue}
                    loading={loading}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CheckTab
