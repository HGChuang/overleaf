// Markdown rendering + LaTeX code-block helpers for the Copilot feature.
//
// Mirrors the renderer in `services/web/frontend/js/features/source-editor/components/llm-toolbar.tsx`
// (marked with a custom `code` renderer that wraps LaTeX blocks with a
// base64-encoded copy button). Kept here so both the selection AI toolbar and
// the Copilot panel can share the same rendering behaviour.

import { marked } from 'marked'

// base64 encode/decode unicode-safe (matches llm-toolbar.tsx)
export function base64EncodeUnicode(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch {
    return btoa(str)
  }
}

export function base64DecodeUnicode(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)))
  } catch {
    return atob(b64)
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    c =>
      (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as {
        [k: string]: string
      })[c]) || c
  )
}

let rendererConfigured = false
function ensureRenderer(): marked.Renderer {
  const r = new marked.Renderer()
  // override code rendering to wrap LaTeX blocks with a copy button
  ;(r as any).code = (
    code: string,
    infostring: string | undefined
  ): string => {
    const lang = (infostring || '').trim().toLowerCase()
    const isLatex =
      lang === 'latex' || lang === 'tex' || code.trim().startsWith('\\')
    const safeCodeHtml = escapeHtml(code)
    if (isLatex) {
      const b64 = base64EncodeUnicode(code)
      return (
        '<div class="copilot-latex-block" style="position:relative;">' +
        `<button class="copilot-copy-latex" data-code="${b64}" title="Copy LaTeX" ` +
        'style="position:absolute;right:8px;top:8px;border-radius:6px;padding:4px 6px;border:none;' +
        'background:rgba(255,255,255,0.05);color:inherit;cursor:pointer;opacity:0.85;">Copy</button>' +
        `<pre style="margin:0;"><code class="language-${escapeHtml(
          lang
        )}">${safeCodeHtml}</code></pre>` +
        '</div>'
      )
    }
    return `<pre><code class="language-${escapeHtml(
      lang
    )}">${safeCodeHtml}</code></pre>`
  }
  rendererConfigured = true
  return r
}

let sharedRenderer: marked.Renderer | null = null

export function renderMarkdown(text: string): string {
  if (!sharedRenderer) sharedRenderer = ensureRenderer()
  try {
    return marked.parse(text || '', { renderer: sharedRenderer } as any) as string
  } catch {
    return escapeHtml(text || '')
  }
}

// Decode a base64 `data-code` attribute from a copy button.
export function decodeCodeBlock(b64: string): string {
  return base64DecodeUnicode(b64)
}

/**
 * Extract LaTeX source from a model response so it can be inserted into the
 * document. Mirrors `extractLatexFromMarkdown` in llm-toolbar.tsx:
 * 1) ```latex fences, 2) any fence that looks like LaTeX, 3) $$...$$,
 * 4) $...$ with LaTeX markers, 5) fallback: strip markdown formatting.
 */
export function extractLatexFromMarkdown(md: string): string {
  if (!md) return ''
  let m: RegExpExecArray | null
  let collected = ''

  const fencedLangRegex = /```\s*(?:latex|tex)\n([\s\S]*?)```/gi
  while ((m = fencedLangRegex.exec(md)) !== null)
    collected += m[1].trim() + '\n'
  if (collected) return collected.trim()

  const fencedAny = /```(?:\w+)?\n([\s\S]*?)```/g
  while ((m = fencedAny.exec(md)) !== null) {
    const code = m[1]
    if (/\\begin\{|\\[a-zA-Z]+|\\frac\{|\\end\{/.test(code))
      collected += code.trim() + '\n'
  }
  if (collected) return collected.trim()

  const dollarsRegex = /\$\$([\s\S]*?)\$\$/g
  while ((m = dollarsRegex.exec(md)) !== null)
    collected += m[1].trim() + '\n'
  if (collected) return collected.trim()

  const singleDollar = /\$([^\$\n]{1,1000}?)\$/g
  while ((m = singleDollar.exec(md)) !== null) {
    if (/\\[a-zA-Z]+/.test(m[1])) collected += m[1].trim() + '\n'
  }
  if (collected) return collected.trim()

  const withoutFences = md.replace(/```[\s\S]*?```/g, s =>
    s.replace(/```(?:\w+)?\n/, '').replace(/```$/, '')
  )
  const noMd = withoutFences
    .replace(/(^|\n)#+\s+/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
  return noMd.trim()
}

export { escapeHtml }
