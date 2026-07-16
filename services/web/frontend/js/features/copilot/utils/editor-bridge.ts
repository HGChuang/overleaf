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
