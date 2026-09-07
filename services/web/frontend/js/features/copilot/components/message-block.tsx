import { getJSON, postJSON } from '@/infrastructure/fetch-json'
// Renders a single MessageBlock by type. Used by the chat message list
// (Ask/Write/Fix) and the Checks explain view. Markdown/code blocks are
// rendered via the shared marked renderer; LaTeX copy buttons are handled
// by delegated click on the container.

import { FC, useCallback, useEffect, useState } from 'react'
import type { MessageBlock, FileRef, ActionItem, Patch } from '../utils/types'
import { extractLatexFromMarkdown } from '../utils/markdown'
import {
  insertIntoEditor,
  applyFixAsTrackedChange,
  showPatchPreview,
  clearPatchPreview,
} from '../utils/editor-bridge'
import MarkdownContent from './markdown-content'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import type { DocumentContainer } from '@/features/ide-react/editor/document-container'
import { useProjectContext } from '@/shared/context/project-context'
import { useCopilotContext } from '../context/copilot-context'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

// Bounds for waiting on the sharejs op round-trip after a patch is applied.
// On timeout the verification fires anyway — that degrades to the old racy
// behavior, never worse.
const OPS_DRAIN_TIMEOUT_MS = 4000
const OPS_DRAIN_POLL_MS = 100

// Wait until the open document has no buffered sharejs ops (pending or
// inflight). real-time only acks (clearing the inflight op) AFTER docupdater
// has applied the update, so a drained queue guarantees a fresh compile sees
// the patched content. Without this, the post-accept verification compile can
// read pre-patch content (op travel time browser→docupdater is ~2s in dev)
// and the agent "fixes" an already-fixed file — the accept/verify loop.
async function waitForEditorOpsToDrain(
  doc: DocumentContainer | null
): Promise<void> {
  if (!doc) return
  // Let the CM6 → sharejs op conversion land first.
  await new Promise<void>(resolve => setTimeout(resolve, 50))
  const deadline = Date.now() + OPS_DRAIN_TIMEOUT_MS
  do {
    // Force an immediate send instead of waiting out the single-user
    // batching delay (no-op while another op is inflight).
    doc.flush()
    if (!doc.hasBufferedOps()) return
    await new Promise<void>(resolve => setTimeout(resolve, OPS_DRAIN_POLL_MS))
  } while (Date.now() < deadline)
}

const FileRefs: FC<{ items: FileRef[] }> = ({ items }) => {
  const { syncToEntry } = useDetachCompileContext()
  return (
    <div className="copilot-file-refs">
      <div className="copilot-file-refs-title">Referenced files</div>
      {items.map((ref, i) => (
        <button
          key={i}
          className="copilot-file-ref"
          onClick={() => syncToEntry({ file: ref.path, line: ref.line })}
          title={`Open ${ref.path}${ref.line ? `:${ref.line}` : ''}`}
        >
          <span className="copilot-file-ref-path">{ref.path}</span>
          {ref.line != null && (
            <span className="copilot-file-ref-line">:{ref.line}</span>
          )}
          {ref.label && (
            <span className="copilot-file-ref-label">{ref.label}</span>
          )}
        </button>
      ))}
    </div>
  )
}

const Actions: FC<{ items: ActionItem[] }> = ({ items }) => {
  const { syncToEntry } = useDetachCompileContext()
  return (
    <div className="copilot-actions">
      {items.map((a, i) => (
        <button
          key={i}
          className="copilot-btn copilot-action-btn"
          onClick={() => {
            if (a.type === 'open_file' && a.path) {
              syncToEntry({ file: a.path })
            }
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

const SuggestedFix: FC<{ text: string; language?: string }> = ({
  text,
  language,
}) => {
  const latex = extractLatexFromMarkdown(text) || text
  return (
    <div className="copilot-suggested-fix">
      <div className="copilot-suggested-fix-text">{text}</div>
      <div className="copilot-suggested-fix-actions">
        <button
          className="copilot-btn"
          onClick={() => copyText(latex)}
        >
          Copy
        </button>
        <button
          className="copilot-btn"
          onClick={() => insertIntoEditor(latex)}
        >
          Insert
        </button>
      </div>
      {language && <span className="copilot-code-lang">{language}</span>}
    </div>
  )
}

const CodeBlock: FC<{ text: string; language?: string }> = ({ text }) => {
  const latex = extractLatexFromMarkdown(text) || text
  return (
    <div className="copilot-code">
      <button
        className="copilot-code-copy copilot-btn"
        onClick={() => copyText(latex)}
      >
        Copy
      </button>
      <button
        className="copilot-code-insert copilot-btn"
        onClick={() => insertIntoEditor(latex)}
      >
        Insert
      </button>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}

// The backend owns per-hunk status and atomic document receipts. The editor
// preview is local, while Accept/Reject always updates the persistent record.
const PatchBlock: FC<{ patch: Patch }> = ({ patch }) => {
  const editorManager = useEditorManagerContext()
  const { syncToEntry } = useDetachCompileContext()
  const { features, _id: projectId } = useProjectContext()
  const { notifyPatchAccepted } = useCopilotContext()
  const [status, setStatus] = useState<
    'pending' | 'accepted' | 'rejected' | 'submitted' | 'partially_applied' | 'conflicted' | 'unknown'
  >('pending')
  const [remoteHunks, setRemoteHunks] = useState<Array<{ index: number; status: string }>>(
    patch.hunks.map((_hunk, index) => ({ index, status: 'proposed' }))
  )
  const [selected, setSelected] = useState<Set<number>>(() => new Set(patch.hunks.map((_hunk, index) => index)))
  const [candidateVerification, setCandidateVerification] = useState<{ status: string; errorCount?: number | null } | null>(null)
  const currentFile = editorManager.currentDocument?.docName || null
  // "Submit as revision" lands the patch as tracked changes attributed to the
  // Copilot pseudo-user; only meaningful when the review UI is available.
  const canSubmitAsRevision = Boolean(features?.trackChanges)

  // (re)show the ghost preview when the block mounts or the open doc changes,
  // so cross-file hunks render once the user opens the target file.
  useEffect(() => {
    clearPatchPreview()
    const preview = patch.hunks.filter((_hunk, index) => selected.has(index) &&
      (remoteHunks.find(item => item.index === index)?.status || 'proposed') === 'proposed')
    if (preview.length) showPatchPreview(preview)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentFile, selected, remoteHunks, patch.hunks])

  // Clear the ghost when the block unmounts (e.g. new turn supersedes it).
  useEffect(() => {
    return () => {
      clearPatchPreview()
    }
  }, [])

  const [applyError, setApplyError] = useState<string | null>(null)
  const endpoint = `/project/${projectId}/copilot/patch/${patch.id}`
  const reflectResult = useCallback((result: { status: string; hunks?: Array<{ index: number; status: string }>; candidateVerification?: { status: string; errorCount?: number | null } }) => {
    setStatus(result.status === 'applied' ? 'accepted' : result.status === 'proposed' ? 'pending' : result.status as typeof status)
    if (result.hunks) {
      setRemoteHunks(result.hunks)
      setSelected(new Set(result.hunks.filter(hunk => hunk.status === 'proposed').map(hunk => hunk.index)))
    }
    if (result.candidateVerification) setCandidateVerification(result.candidateVerification)
  }, [])
  useEffect(() => {
    let cancelled = false
    getJSON<{ status: string; hunks: Array<{ index: number; status: string }>; candidateVerification?: { status: string; errorCount?: number | null } }>(endpoint).then(result => {
      if (!cancelled) reflectResult(result)
    }).catch(() => { /* Legacy cards have no application record. */ })
    return () => { cancelled = true }
  }, [endpoint, reflectResult])
  useEffect(() => {
    if (!remoteHunks.some(hunk => hunk.status === 'applying')) return
    const timer = window.setTimeout(() => {
      getJSON<{ status: string; hunks: Array<{ index: number; status: string }>; candidateVerification?: { status: string; errorCount?: number | null } }>(endpoint)
        .then(reflectResult).catch(error => setApplyError(error instanceof Error ? error.message : 'Could not reconcile patch status'))
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [remoteHunks, endpoint, reflectResult])

  const accept = useCallback(async () => {
    setApplyError(null)
    try {
      await waitForEditorOpsToDrain(editorManager.currentDocument)
      const result = await postJSON<{ status: string; hunks: Array<{ index: number; status: string }> }>(endpoint,
        { body: { action: 'accept', hunks: [...selected] } })
      clearPatchPreview()
      reflectResult(result)
      if (result.hunks.some(hunk => selected.has(hunk.index) && hunk.status === 'applied')) notifyPatchAccepted()
    } catch (error) { setApplyError(error instanceof Error ? error.message : 'Patch application failed') }
  }, [endpoint, editorManager, notifyPatchAccepted, selected, reflectResult])

  const reject = useCallback(async () => {
    try {
      const result = await postJSON<{ status: string; hunks: Array<{ index: number; status: string }> }>(endpoint,
        { body: { action: 'reject', hunks: [...selected] } })
      clearPatchPreview()
      reflectResult(result)
    } catch (error) { setApplyError(error instanceof Error ? error.message : 'Could not record rejection') }
  }, [endpoint, selected, reflectResult])

  // Submit the patch as TRACKED CHANGES attributed to the Copilot pseudo-user:
  // the edits show up in the review panel (struck/added markup) for any
  // collaborator to accept/reject, instead of landing silently. Pure
  // insertions have no anchor for the tracked-apply path, so they keep the
  // direct-insert behavior (the prompt discourages them anyway).
  const submitAsRevision = useCallback(async () => {
    setApplyError(null)
    try {
      for (const [index, hunk] of patch.hunks.entries()) {
        if (!selected.has(index)) continue
        const targetFile = hunk.file || null
        const edit = {
          file: targetFile,
          line: hunk.line ?? null,
          oldText: hunk.oldText,
          newText: hunk.newText,
        }
        if (!hunk.oldText) {
          insertIntoEditor(hunk.newText)
        } else if (
          !targetFile ||
          targetFile === (editorManager.currentDocument?.docName || null)
        ) {
          applyFixAsTrackedChange(edit)
        } else {
          syncToEntry({ file: targetFile, line: hunk.line ?? undefined })
          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>(resolve => setTimeout(resolve, 700))
          applyFixAsTrackedChange(edit)
        }
      }
      clearPatchPreview()
      await waitForEditorOpsToDrain(editorManager.currentDocument)
      const result = await postJSON<{ status: string; hunks: Array<{ index: number; status: string }> }>(endpoint,
        { body: { action: 'revision_submitted', hunks: [...selected] } })
      reflectResult(result)
    } catch (error) { setApplyError(error instanceof Error ? error.message : 'Could not submit tracked changes') }
  }, [patch.hunks, editorManager, syncToEntry, endpoint, selected, reflectResult])

  const hasProposed = remoteHunks.some(hunk => hunk.status === 'proposed')

  return (
    <div className="copilot-patch">
      {applyError && <div role="alert">{applyError}</div>}
      {candidateVerification && <div role="status">候选编译：{candidateVerification.status}
        {candidateVerification.errorCount != null ? `（${candidateVerification.errorCount} 个错误）` : ''}</div>}
      {["partially_applied", "conflicted", "unknown"].includes(status) && <div role="status">{status}</div>}
      {patch.title && <div className="copilot-patch-title">{patch.title}</div>}
      <div className="copilot-patch-hunks">
        {patch.hunks.map((h, i) => (
          <div className="copilot-patch-hunk" key={i}>
            {(remoteHunks.find(item => item.index === i)?.status || 'proposed') === 'proposed' &&
              <input type="checkbox" aria-label={`Select patch hunk ${i + 1}`} checked={selected.has(i)}
                onChange={event => setSelected(current => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(i); else next.delete(i)
                  return next
                })} />}
            {h.file && (
              <button
                className="copilot-patch-loc"
                onClick={() =>
                  syncToEntry({ file: h.file!, line: h.line ?? undefined })
                }
                title={`Open ${h.file}${h.line != null ? `:${h.line}` : ''}`}
              >
                {h.file}
                {h.line != null ? `:${h.line}` : ''}
              </button>
            )}
            {h.oldText && <pre className="copilot-patch-old">{h.oldText}</pre>}
            <pre className="copilot-patch-new">{h.newText}</pre>
            <span>{remoteHunks.find(item => item.index === i)?.status || 'proposed'}</span>
          </div>
        ))}
      </div>
      <div className="copilot-patch-actions">
        <span className={`copilot-patch-status copilot-patch-status-${status}`}>
          {status === 'submitted' ? 'submitted as revision' : status}
        </span>
        {hasProposed && (
          <>
            <button className="copilot-btn" onClick={reject} disabled={selected.size === 0}>
              Reject
            </button>
            {canSubmitAsRevision && (
              <button
                className="copilot-btn"
                onClick={submitAsRevision}
                disabled={selected.size === 0}
                title="Apply as tracked changes attributed to Copilot, so collaborators can review them in the review panel"
              >
                Submit as revision
              </button>
            )}
            <button
              className="copilot-btn"
              onClick={accept}
              disabled={selected.size === 0}
            >
              Accept
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export const MessageBlockView: FC<{ block: MessageBlock }> = ({ block }) => {
  let inner: JSX.Element | null
  switch (block.type) {
    case 'text':
    case 'markdown':
      inner = <MarkdownContent content={block.text} />
      break
    case 'code':
      inner = <CodeBlock text={block.text} language={block.language} />
      break
    case 'suggested_fix':
      inner = <SuggestedFix text={block.text} language={block.language} />
      break
    case 'file_refs':
      inner = <FileRefs items={block.items} />
      break
    case 'actions':
      inner = <Actions items={block.items} />
      break
    case 'patch':
      inner = <PatchBlock patch={block.patch} />
      break
    default:
      inner = null
  }

  return (
    <div className={`copilot-block copilot-block-${block.type}`}>
      {inner}
    </div>
  )
}

export default MessageBlockView
