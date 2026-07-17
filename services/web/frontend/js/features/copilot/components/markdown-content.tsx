// Renders assistant markdown content (the unified answer text). LaTeX code
// fences are turned into a block with a base64-encoded "Copy" button by the
// marked renderer (see utils/markdown.ts); this component owns the delegated
// click handler that decodes + copies that LaTeX. The handler MUST be attached
// to the container that holds the rendered HTML — previously it only lived on
// MessageBlockView's root, so the Copy buttons inside `msg.content` markdown
// (rendered directly by the message list) did nothing.

import { FC, useEffect, useRef } from 'react'
import { renderMarkdown, decodeCodeBlock } from '../utils/markdown'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

export const MarkdownContent: FC<{
  content: string
  className?: string
}> = ({ content, className = 'copilot-md' }) => {
  const rootRef = useRef<HTMLDivElement | null>(null)

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

  return (
    <div
      ref={rootRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  )
}

export default MarkdownContent
