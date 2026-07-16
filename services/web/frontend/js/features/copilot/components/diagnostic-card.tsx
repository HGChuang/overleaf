// Structured compile-error diagnostic card (entry 4, Fix tab).
// Fixed blocks: What happened / Likely cause / Suggested fix / Location / actions.

import { FC } from 'react'
import type { Diagnostic } from '../utils/types'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { extractLatexFromMarkdown } from '../utils/markdown'
import { insertIntoEditor } from '../utils/editor-bridge'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

interface DiagnosticCardProps {
  diagnostic: Diagnostic
  onRegenerate?: () => void
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="copilot-diag-section">
      <div className="copilot-diag-section-label">{label}</div>
      <div className="copilot-diag-section-body">{children}</div>
    </div>
  )
}

export const DiagnosticCard: FC<DiagnosticCardProps> = ({
  diagnostic,
  onRegenerate,
}) => {
  const { syncToEntry } = useDetachCompileContext()
  const fix = diagnostic.suggestedFix
    ? extractLatexFromMarkdown(diagnostic.suggestedFix) || diagnostic.suggestedFix
    : null

  const loc = diagnostic.location
  const hasLoc = !!(loc && (loc.file || loc.line != null))

  return (
    <div className="copilot-diag">
      <div className="copilot-diag-title">{diagnostic.title}</div>

      <Section label="What happened">
        {diagnostic.whatHappened}
      </Section>
      <Section label="Likely cause">
        {diagnostic.likelyCause}
      </Section>
      <Section label="Suggested fix">
        {diagnostic.suggestedFix}
      </Section>

      {hasLoc && (
        <div className="copilot-diag-location">
          <span className="copilot-diag-location-label">Location:</span>
          <button
            className="copilot-diag-location-link"
            onClick={() => syncToEntry({ file: loc?.file, line: loc?.line })}
          >
            {loc?.file || 'current file'}
            {loc?.line != null ? `:${loc.line}` : ''}
          </button>
        </div>
      )}

      <div className="copilot-diag-actions">
        {hasLoc && (
          <button
            className="copilot-btn"
            onClick={() => syncToEntry({ file: loc?.file, line: loc?.line })}
          >
            Jump to line
          </button>
        )}
        {fix && (
          <>
            <button className="copilot-btn" onClick={() => copyText(fix)}>
              Copy
            </button>
            <button
              className="copilot-btn copilot-btn-primary"
              onClick={() => insertIntoEditor(fix)}
            >
              Insert fix
            </button>
          </>
        )}
        {onRegenerate && (
          <button className="copilot-btn" onClick={onRegenerate}>
            Regenerate
          </button>
        )}
      </div>
    </div>
  )
}

export default DiagnosticCard
