// Decoupled bridge from the Copilot panel to the CodeMirror editor.
//
// The panel lives in main-layout and has no direct access to the EditorView,
// so "Insert at cursor" is dispatched as a CustomEvent; the source editor
// (`codemirror-editor.tsx`) listens for it and inserts the text at the cursor.

export function insertIntoEditor(text: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('copilot:insert-text', { detail: { text } })
  )
}

export interface FixEdit {
  file?: string | null
  line?: number | null
  oldText: string
  newText: string
}

/**
 * Apply a concrete fix in the editor: replace the first occurrence of
 * `oldText` (preferring the one nearest `line`) with `newText`. If `oldText`
 * is not found, falls back to inserting `newText` at the cursor. The source
 * editor (`codemirror-editor.tsx`) listens for this event.
 */
export function applyFixInEditor(edit: FixEdit): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('copilot:apply-fix', { detail: edit })
  )
}

/**
 * Show a pending patch as an inline-diff ghost preview in the editor: struck/
 * dimmed `oldText` + a gray `newText` widget right after it. The source editor
 * (`codemirror-editor.tsx`) listens for this event and feeds the hunks to the
 * `copilotPatchPreview` CM6 extension. Only hunks whose `oldText` is found in
 * the currently open document are decorated; cross-file hunks render once the
 * user opens the target file (the extension re-evaluates on doc change).
 */
export function showPatchPreview(hunks: FixEdit[]): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('copilot:show-patch', { detail: { hunks } })
  )
}

/**
 * Clear any pending patch ghost preview in the editor (on reject, or after an
 * accept has applied the edit). Idempotent.
 */
export function clearPatchPreview(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('copilot:clear-patch'))
}
