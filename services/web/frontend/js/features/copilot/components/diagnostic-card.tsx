// Structured compile-error diagnostic card (entry 4, Fix tab).
// Fixed blocks: What happened / Likely cause / Suggested fix / Location / actions.

import { FC, useCallback, useEffect, useState } from 'react'
import type { Diagnostic } from '../utils/types'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import {
  applyFixInEditor,
  showPatchPreview,
  clearPatchPreview,
} from '../utils/editor-bridge'

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
  const editorManager = useEditorManagerContext()

  // `fix` is the structured one-click edit {oldText, newText} produced by the
  // agent. `suggestedFix` (prose) is only for display.
  const fix = diagnostic.fix
  const hasFix = !!(fix && fix.oldText && fix.newText)

  const loc = diagnostic.location
  const hasLoc = !!(loc && (loc.file || loc.line != null))

  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>(
    'pending'
  )

  // Clear any live ghost preview when the card unmounts (e.g. the diagnose turn
  // is regenerated). Idempotent.
  useEffect(() => {
    return () => {
      clearPatchPreview()
    }
  }, [])

  // Show this card's fix as an inline-diff ghost in the editor. Explicit (not on
  // mount) because a diagnose can yield many cards, each with its own fix — only
  // one ghost can be live at a time, so the user picks which to preview.
  const previewFix = useCallback(() => {
    const f = diagnostic.fix
    if (!f || !f.oldText || !f.newText) return
    showPatchPreview([
      {
        file: loc?.file ?? null,
        line: loc?.line ?? null,
        oldText: f.oldText,
        newText: f.newText,
      },
    ])
  }, [diagnostic.fix, loc?.file, loc?.line])

  const rejectFix = useCallback(() => {
    clearPatchPreview()
    setStatus('rejected')
  }, [])

  // Apply this card's fix. Same cross-file open-then-apply sequence as before,
  // followed by clearing the ghost preview.
  const acceptFix = useCallback(() => {
    const f = diagnostic.fix
    if (!f || !f.oldText || !f.newText) return
    const targetFile = loc?.file || null
    const currentFile = editorManager.currentDocument?.docName || null
    const edit = {
      file: targetFile,
      line: loc?.line ?? null,
      oldText: f.oldText,
      newText: f.newText,
    }
    if (!targetFile || targetFile === currentFile) {
      // error is in the currently open doc — apply directly
      applyFixInEditor(edit)
    } else {
      // open the target file, then apply once it has (likely) loaded
      syncToEntry({ file: targetFile, line: loc?.line })
      window.setTimeout(() => applyFixInEditor(edit), 700)
    }
    clearPatchPreview()
    setStatus('accepted')
  }, [diagnostic.fix, loc?.file, loc?.line, editorManager, syncToEntry])

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
        {hasFix && (
          <button
            className="copilot-btn"
            onClick={() => copyText(fix!.newText)}
            title="Copy the replacement text"
          >
            Copy
          </button>
        )}
        {hasFix && status === 'pending' && (
          <>
            <button
              className="copilot-btn"
              onClick={previewFix}
              title="Preview this fix as gray ghost text in the editor"
            >
              Preview
            </button>
            <button className="copilot-btn" onClick={rejectFix}>
              Reject
            </button>
            <button
              className="copilot-btn copilot-btn-primary"
              onClick={acceptFix}
            >
              Accept
            </button>
          </>
        )}
        {hasFix && status !== 'pending' && (
          <span className={`copilot-patch-status copilot-patch-status-${status}`}>
            {status}
          </span>
        )}
        {!hasFix && (
          <span
            className="copilot-patch-status copilot-patch-status-none"
            title="No direct fix available"
          >
            no direct fix
          </span>
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
