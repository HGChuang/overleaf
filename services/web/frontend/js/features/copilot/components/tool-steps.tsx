// Renders the agent's tool-call workflow as a vertical step list, Claude
// Code-style: one row per tool call (status icon + friendly label + salient
// argument + duration), with an indented result preview once the call
// finishes. Shown live inside the pending message while a turn streams, and
// kept on the completed assistant message so the process stays auditable.
//
// Only capped I/O previews reach the browser (llm-side summarizeToolArgs /
// summarizeToolResult) — raw tool args and results stay server-side.

import { FC } from 'react'
import type { CopilotToolStep } from '../utils/types'

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Human-friendly one-line label: display name + the salient argument.
// Exported so the pending status line can reuse it ("Read main.tex:1-5…").
export function toolStepLabel(step: CopilotToolStep): {
  name: string
  detail: string | null
} {
  const args = step.args || {}
  switch (step.name) {
    case 'read_file':
      return { name: 'Read', detail: str(args.path) }
    case 'read_file_fragment': {
      const path = str(args.path)
      const start = num(args.startLine)
      const end = num(args.endLine)
      const range = start != null ? `:${start}-${end ?? '?'}` : ''
      return { name: 'Read', detail: path ? `${path}${range}` : null }
    }
    case 'search_project': {
      const query = str(args.query)
      return { name: 'Search', detail: query ? `"${query}"` : null }
    }
    case 'list_project_files':
      return { name: 'List project files', detail: null }
    case 'compile_project':
      return { name: 'Compile project', detail: null }
    case 'submit_patch':
      return { name: 'Submit patch', detail: str(args.summary) }
    case 'todo_write':
      return { name: 'Update plan', detail: null }
    default:
      return { name: step.name, detail: null }
  }
}

// Compact result line. The summaries are capped JSON one-liners, so extract
// the salient fields with regexes (robust even when the JSON tail was
// truncated by the server-side cap); fall back to the raw preview.
function resultLine(step: CopilotToolStep): string | null {
  const raw = step.resultSummary
  if (!raw) return step.status === 'error' ? 'tool call failed' : null
  if (step.status === 'error') return truncate(raw, 160)

  switch (step.name) {
    case 'compile_project': {
      const countMatch = raw.match(/"errorCount"\s*:\s*(\d+|null)/)
      const count = countMatch
        ? countMatch[1] === 'null'
          ? null
          : Number(countMatch[1])
        : undefined
      if (count === 0) return 'compiled clean — 0 errors'
      if (count === null) return 'verification unavailable (see note)'
      if (typeof count === 'number') {
        const firstMsg = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)
        const suffix = firstMsg ? ` — ${firstMsg[1]}` : ''
        return truncate(
          `${count} error${count === 1 ? '' : 's'}${suffix}`,
          160
        )
      }
      break
    }
    case 'submit_patch': {
      const hunks = raw.match(/"count"\s*:\s*(\d+)/)
      if (hunks) {
        const n = Number(hunks[1])
        return `${n} hunk${n === 1 ? '' : 's'} submitted for review`
      }
      break
    }
    case 'read_file':
    case 'read_file_fragment': {
      const found = raw.match(/"found"\s*:\s*(false|true)/)
      if (found?.[1] === 'false') return 'file not found'
      const total = raw.match(/"totalLines"\s*:\s*(\d+)/)
      if (total) return `${total[1]} lines`
      break
    }
    case 'search_project': {
      const matches = raw.match(/"matches"\s*:\s*\[/g)
      if (matches && /"matches"\s*:\s*\[\s*\]/.test(raw)) return 'no matches'
      break
    }
    default:
      break
  }
  return truncate(raw, 160)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000)}s`
}

const StepIcon: FC<{ status: CopilotToolStep['status'] }> = ({ status }) => {
  if (status === 'running') {
    return <span className="copilot-spinner copilot-step-spinner" />
  }
  return (
    <span
      className={`copilot-step-icon copilot-step-icon-${status}`}
      aria-label={status}
    >
      {status === 'success' ? '✓' : '✗'}
    </span>
  )
}

export const ToolSteps: FC<{ steps: CopilotToolStep[] }> = ({ steps }) => {
  if (!steps?.length) return null
  return (
    <div className="copilot-steps">
      {steps.map(step => {
        const label = toolStepLabel(step)
        const result = resultLine(step)
        return (
          <div
            key={step.id}
            className={`copilot-step copilot-step-${step.status}`}
          >
            <div className="copilot-step-head">
              <StepIcon status={step.status} />
              <span className="copilot-step-name">{label.name}</span>
              {label.detail && (
                <span className="copilot-step-detail" title={label.detail}>
                  {label.detail}
                </span>
              )}
              {step.status !== 'running' && step.durationMs != null && (
                <span className="copilot-step-duration">
                  {formatDuration(step.durationMs)}
                </span>
              )}
            </div>
            {result && (
              <div
                className={`copilot-step-result${
                  step.status === 'error' ? ' copilot-step-result-error' : ''
                }`}
                title={step.resultSummary}
              >
                <span className="copilot-step-result-marker">⎿</span>
                {result}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ToolSteps
