// Renders a single MessageBlock by type. Used by the chat message list
// (Ask/Write/Fix) and the Checks explain view. Markdown/code blocks are
// rendered via the shared marked renderer; LaTeX copy buttons are handled
// by delegated click on the container.

import { FC, useCallback, useEffect, useState } from 'react'
import type { MessageBlock, FileRef, ActionItem, Patch } from '../utils/types'
import { extractLatexFromMarkdown } from '../utils/markdown'
import {
  insertIntoEditor,
  applyFixInEditor,
  showPatchPreview,
  clearPatchPreview,
} from '../utils/editor-bridge'
import MarkdownContent from './markdown-content'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
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
          className="copilot-btn copilot-btn-primary"
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
        className="copilot-code-insert copilot-btn copilot-btn-primary"
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

// A proposed text edit (from `submit_patch`) rendered as a mini per-hunk diff
// with Accept / Reject. While pending, the hunks are also shown as an inline-diff
// GHOST in the source editor (struck old + gray new) via `showPatchPreview`;
// Accept applies each hunk through the existing `applyFixInEditor` → OT path
// (with the cross-file open-then-apply sequence when a hunk targets another
// file), Reject just clears the ghost. Status is local state — no backend
// round-trip.
const PatchBlock: FC<{ patch: Patch }> = ({ patch }) => {
  const editorManager = useEditorManagerContext()
  const { syncToEntry } = useDetachCompileContext()
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>(
    'pending'
  )
  const currentFile = editorManager.currentDocument?.docName || null

  // (re)show the ghost preview when the block mounts or the open doc changes,
  // so cross-file hunks render once the user opens the target file.
  useEffect(() => {
    if (status === 'pending') {
      showPatchPreview(patch.hunks)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentFile])

  // Clear the ghost when the block unmounts (e.g. new turn supersedes it).
  useEffect(() => {
    return () => {
      clearPatchPreview()
    }
  }, [])

  const accept = useCallback(async () => {
    for (const hunk of patch.hunks) {
      const targetFile = hunk.file || null
      const edit = {
        file: targetFile,
        line: hunk.line ?? null,
        oldText: hunk.oldText,
        newText: hunk.newText,
      }
      if (!hunk.oldText) {
        // pure insertion: best-effort insert at the cursor (apply-fix needs an
        // anchor text; insertions are an edge case the prompt discourages).
        insertIntoEditor(hunk.newText)
      } else if (
        !targetFile ||
        targetFile === (editorManager.currentDocument?.docName || null)
      ) {
        applyFixInEditor(edit)
      } else {
        // open the target file, then apply once it has (likely) loaded
        syncToEntry({ file: targetFile, line: hunk.line ?? undefined })
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>(resolve => setTimeout(resolve, 700))
        applyFixInEditor(edit)
      }
    }
    clearPatchPreview()
    setStatus('accepted')
  }, [patch.hunks, editorManager, syncToEntry])

  const reject = useCallback(() => {
    clearPatchPreview()
    setStatus('rejected')
  }, [])

  return (
    <div className="copilot-patch">
      {patch.title && <div className="copilot-patch-title">{patch.title}</div>}
      <div className="copilot-patch-hunks">
        {patch.hunks.map((h, i) => (
          <div className="copilot-patch-hunk" key={i}>
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
          </div>
        ))}
      </div>
      <div className="copilot-patch-actions">
        <span className={`copilot-patch-status copilot-patch-status-${status}`}>
          {status}
        </span>
        {status === 'pending' && (
          <>
            <button className="copilot-btn" onClick={reject}>
              Reject
            </button>
            <button
              className="copilot-btn copilot-btn-primary"
              onClick={accept}
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
  let inner: JSX.Element
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
