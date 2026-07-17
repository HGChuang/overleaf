// Inline-diff ghost preview for Copilot patches.
//
// When the Copilot panel proposes a patch (a list of {oldText, newText} hunks),
// `showPatchPreview` (utils/editor-bridge.ts) dispatches a `copilot:show-patch`
// CustomEvent; `codemirror-editor.tsx` calls `setActivePatch(hunks)` here and
// dispatches `setPatchEffect` to trigger a rebuild. This extension renders the
// pending edit as an inline diff in the editor: the `oldText` range is
// struck-through/dimmed, and a gray `newText` widget is inserted right after it.
// `clearPatchPreview` / accept / reject clear it.
//
// Source of truth is a MODULE-LEVEL `activeHunks` (not a StateField): a document
// switch creates a new plugin instance, and the constructor rebuilds from the
// module-level store — so cross-file hunks render automatically once the user
// opens the target file, with no extra wiring. `setPatchEffect` is only a
// "please rebuild now" signal for the currently-open view (effects alone don't
// survive a state swap).
//
// Modeled on the decoration pattern in `llm-completion.ts` (GhostTextWidget) and
// the ViewPlugin pattern in `empty-line-filler.ts`. The actual edit on Accept is
// applied client-side by `applyFixInEditor` (→ `copilot:apply-fix` →
// `view.dispatch({changes})`, the OT/sharejs mutation path); this extension only
// renders the preview.

import { StateEffect, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

export interface PatchHunk {
  file?: string | null
  line?: number | null
  oldText: string
  newText: string
}

// Module-level active patch (set/cleared from the window-event bridge). Survives
// document switches (a new doc = a new plugin instance that rebuilds from this).
let activeHunks: PatchHunk[] | null = null

export function setActivePatch(hunks: PatchHunk[] | null): void {
  activeHunks = hunks
}

// Rebuild trigger dispatched into the current view from the bridge listeners.
export const setPatchEffect = StateEffect.define<PatchHunk[] | null>()

// Gray widget rendering the proposed `newText` inline, right after the struck
// old text. Non-interactive (pointer-events: none) so it behaves as a preview,
// not editable text — the real edit lands only on Accept via applyFixInEditor.
class GrayNewWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }

  eq(other: GrayNewWidget): boolean {
    return this.text === other.text
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-copilot-patch-new'
    span.textContent = this.text
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

// Find the occurrence of `oldText` nearest `line` (1-based), mirroring the
// `copilot:apply-fix` listener's anchoring so preview + apply agree. Returns the
// char offset, or -1 if not found.
function nearestOccurrence(doc: string, oldText: string, line: number | null | undefined): number {
  const occurrences: number[] = []
  let from = doc.indexOf(oldText)
  while (from !== -1) {
    occurrences.push(from)
    from = doc.indexOf(oldText, from + 1)
  }
  if (occurrences.length === 0) return -1
  if (line == null || line < 1) return occurrences[0]
  // approximate the line's char offset by counting newlines up to it; cheap and
  // good enough to pick the closest match (apply-fix does the same via doc.line)
  let target = 0
  let l = 1
  for (let i = 0; i < doc.length && l < line; i++) {
    if (doc.charCodeAt(i) === 10) l++
    target = i + 1
  }
  return occurrences.reduce((best, o) =>
    Math.abs(o - target) < Math.abs(best - target) ? o : best
  , occurrences[0])
}

function buildPatchDecorations(view: EditorView): DecorationSet {
  const hunks = activeHunks
  if (!hunks || hunks.length === 0) return Decoration.none
  const doc = view.state.doc.toString()
  const deco: Range<Decoration>[] = []
  const ranges: Array<{ from: number; to: number }> = []

  for (const hunk of hunks) {
    const newText =
      typeof hunk.newText === 'string' ? hunk.newText : ''
    const oldText =
      typeof hunk.oldText === 'string' ? hunk.oldText : ''

    let pos: number
    if (oldText.length > 0) {
      pos = nearestOccurrence(doc, oldText, hunk.line)
      if (pos === -1) continue // oldText not in the open doc — skip (cross-file)
    } else {
      // pure insertion: anchor at the reported line start, else skip
      if (hunk.line == null || hunk.line < 1 || hunk.line > view.state.doc.lines) {
        continue
      }
      pos = view.state.doc.line(hunk.line).from
    }

    // overlap guard: skip if this hunk overlaps one already staged
    const end = oldText.length > 0 ? pos + oldText.length : pos
    if (ranges.some(r => pos < r.to && end > r.from)) continue
    ranges.push({ from: pos, to: end })

    if (oldText.length > 0) {
      deco.push(
        Decoration.mark({ class: 'cm-copilot-patch-old' }).range(pos, end)
      )
    }
    if (newText.length > 0) {
      deco.push(
        Decoration.widget({
          widget: new GrayNewWidget(newText),
          side: 1, // render after the struck old range
        }).range(end)
      )
    }
  }

  if (deco.length === 0) return Decoration.none
  // `true` = sort by position; we already guarded overlaps
  return Decoration.set(deco, true)
}

class PatchPreviewPlugin implements PluginValue {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = buildPatchDecorations(view)
  }

  update(update: ViewUpdate): void {
    const patchEffect = update.transactions.some(tr =>
      tr.effects.some(e => e.is(setPatchEffect))
    )
    if (update.docChanged || update.viewportChanged || patchEffect) {
      this.decorations = buildPatchDecorations(update.view)
    }
  }
}

export function copilotPatchPreview(): Extension {
  return [
    ViewPlugin.fromClass(PatchPreviewPlugin, {
      decorations: v => v.decorations,
    }),
    EditorView.baseTheme({
      '.cm-copilot-patch-old': {
        textDecoration: 'line-through',
        textDecorationColor: 'rgba(192, 57, 43, 0.8)',
        opacity: '0.45',
        color: '#a33',
      },
      '.cm-copilot-patch-new': {
        color: 'var(--cm-ghost-foreground, #6a737d)',
        opacity: '0.85',
        fontStyle: 'italic',
        backgroundColor: 'rgba(106, 115, 125, 0.08)',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
    }),
  ]
}
