// Renders a single MessageBlock by type. Used by the chat message list
// (Ask/Write/Fix) and the Checks explain view. Markdown/code blocks are
// rendered via the shared marked renderer; LaTeX copy buttons are handled
// by delegated click on the container.

import { useEffect, useRef, FC } from 'react'
import type { MessageBlock, FileRef, ActionItem } from '../utils/types'
import {
  renderMarkdown,
  decodeCodeBlock,
  extractLatexFromMarkdown,
} from '../utils/markdown'
import { insertIntoEditor } from '../utils/editor-bridge'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'

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

export const MessageBlockView: FC<{ block: MessageBlock }> = ({ block }) => {
  const rootRef = useRef<HTMLDivElement | null>(null)

  // delegated click handler for LaTeX copy buttons inside rendered markdown
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const btn = target?.closest?.('.copilot-copy-latex') as HTMLElement | null
      if (!btn) return
      const b64 = btn.getAttribute('data-code')
      if (!b64) return
      e.preventDefault()
      const code = decodeCodeBlock(b64)
      copyText(code).then(() => {
        const prev = btn.innerText
        btn.innerText = '✓'
        window.setTimeout(() => {
          btn.innerText = prev
        }, 900)
      })
    }
    root.addEventListener('click', handler)
    return () => root.removeEventListener('click', handler)
  }, [])

  let inner: JSX.Element
  switch (block.type) {
    case 'text':
    case 'markdown':
      inner = (
        <div
          className="copilot-md"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }}
        />
      )
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
    case 'diagnostic':
      // diagnostic blocks are rendered by the Fix tab directly; fall back to text
      inner = (
        <div className="copilot-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(block.diagnostic.title) }} />
      )
      break
    case 'issue_list':
      // issue lists are rendered by the Check tab; fall back to a simple list
      inner = (
        <ul className="copilot-issue-list-fallback">
          {block.items.map((it, i) => (
            <li key={i}>{it.title}</li>
          ))}
        </ul>
      )
      break
    default:
      inner = null
  }

  return (
    <div className={`copilot-block copilot-block-${block.type}`} ref={rootRef}>
      {inner}
    </div>
  )
}

export default MessageBlockView
