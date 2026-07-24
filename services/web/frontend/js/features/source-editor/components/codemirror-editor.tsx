// codemirror-editor.tsx
import { ElementType, memo, useRef, useState, useEffect } from 'react'
import useIsMounted from '../../../shared/hooks/use-is-mounted'
import { EditorView } from '@codemirror/view'
import { EditorState, Transaction, StateEffect } from '@codemirror/state'
import CodeMirrorView from './codemirror-view'
import CodeMirrorSearch from './codemirror-search'
import { CodeMirrorToolbar } from './codemirror-toolbar'
import { CodemirrorOutline } from './codemirror-outline'
import { CodeMirrorCommandTooltip } from './codemirror-command-tooltip'
import { dispatchTimer } from '../../../infrastructure/cm6-performance'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'
import { FigureModal } from './figure-modal/figure-modal'
import LLMToolbar, { type LLMToolbarHandle } from './llm-toolbar'
import { ReviewPanelProviders } from '@/features/review-panel-new/context/review-panel-providers'
import { ReviewPanelMigration } from '@/features/source-editor/components/review-panel/review-panel-migration'
import ReviewTooltipMenu from '@/features/review-panel-new/components/review-tooltip-menu'
import { useFeatureFlag } from '@/shared/context/split-test-context'
import {
  CodeMirrorStateContext,
  CodeMirrorViewContext,
} from './codemirror-context'


import { inlineCompletionExtension, INLINE_COMPLETION_PLUGIN } from './llm-completion'
import {
  setActivePatch,
  setPatchEffect,
  type PatchHunk,
} from '../extensions/copilot-patch-preview'
import useScopeValue from '@/shared/hooks/use-scope-value'
import { DocumentContainer } from '@/features/ide-react/editor/document-container'
import RangesTracker from '@overleaf/ranges-tracker'
import { COPILOT_USER_ID } from '@/features/copilot/utils/editor-bridge'

// TODO: remove this when definitely no longer used
export * from './codemirror-context'

// Find where a Copilot hunk should land: all occurrences of `oldText`, then
// the one nearest to the reported 1-based `line` (if any). Returns null when
// `oldText` is empty (pure insertion — handled at the cursor by the caller)
// or when the text is not found in the open doc (caller should no-op rather
// than insert blindly).
function findHunkPosition(
  view: EditorView,
  oldText: string,
  line?: number | null
): number | null {
  if (!oldText) return null
  const doc = view.state.doc
  const full = doc.toString()
  const occurrences: number[] = []
  let from = full.indexOf(oldText)
  while (from !== -1) {
    occurrences.push(from)
    from = full.indexOf(oldText, from + 1)
  }
  if (occurrences.length === 0) return null
  if (line != null && line >= 1 && line <= doc.lines) {
    const target = doc.line(line).from
    return occurrences.reduce((best, o) =>
      Math.abs(o - target) < Math.abs(best - target) ? o : best
    , occurrences[0])
  }
  return occurrences[0]
}

const sourceEditorComponents = importOverleafModules(
  'sourceEditorComponents'
) as { import: { default: ElementType }; path: string }[]

const sourceEditorToolbarComponents = importOverleafModules(
  'sourceEditorToolbarComponents'
) as { import: { default: ElementType }; path: string }[]

function CodeMirrorEditor() {
  // create the initial state
  const [state, setState] = useState(() => {
    return EditorState.create()
  })

  const isMounted = useIsMounted()

  const newReviewPanel = useFeatureFlag('review-panel-redesign')

  // create the view using the initial state and intercept transactions
  const viewRef = useRef<EditorView | null>(null)
  const llmToolbarref = useRef<LLMToolbarHandle>(null)
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null)

  // The active sharejs document, tracked in a ref so the window-event
  // listeners below (registered once) always see the current doc.
  const [currentDoc] = useScopeValue<DocumentContainer | null>(
    'editor.sharejs_doc'
  )
  const currentDocRef = useRef<DocumentContainer | null>(null)
  useEffect(() => {
    currentDocRef.current = currentDoc
  }, [currentDoc])

  // Handle text selection changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const handleSelectionChange = () => {
      const selection = view.state.selection.main

      // Skip if selection hasn't changed
      if (lastSelectionRef.current &&
        lastSelectionRef.current.from === selection.from &&
        lastSelectionRef.current.to === selection.to) {
        return
      }
      lastSelectionRef.current = { from: selection.from, to: selection.to }

      // Bridge the selection to the Copilot pane so its composer can show a
      // line-number reference chip and send the selected text as context.
      if (!selection.empty) {
        const doc = view.state.doc
        const fromLine = doc.lineAt(selection.from).number
        const toLine = doc.lineAt(selection.to).number
        const text = view.state.sliceDoc(selection.from, selection.to)
        window.dispatchEvent(
          new CustomEvent('copilot:selection-change', {
            detail: { fromLine, toLine, text },
          })
        )
      } else {
        window.dispatchEvent(
          new CustomEvent('copilot:selection-change', { detail: null })
        )
      }

      if (!selection.empty && llmToolbarref.current) {
        llmToolbarref.current.show(view)
      } else if (llmToolbarref.current) {
        llmToolbarref.current.hide()
      }
    }

    // Initial check
    handleSelectionChange()

    // Listen for selection changes
    view.dom.addEventListener('mouseup', handleSelectionChange)
    view.dom.addEventListener('keyup', handleSelectionChange)

    return () => {
      view.dom.removeEventListener('mouseup', handleSelectionChange)
      view.dom.removeEventListener('keyup', handleSelectionChange)
    }
  }, [])

  // Bridge from the Copilot panel: insert generated text at the cursor.
  // The panel lives outside the source editor and has no EditorView, so it
  // dispatches a `copilot:insert-text` CustomEvent; we insert here.
  useEffect(() => {
    const handler = (e: Event) => {
      const view = viewRef.current
      if (!view) return
      const text = (e as CustomEvent<{ text: string }>).detail?.text
      if (typeof text !== 'string' || !text) return
      const head = view.state.selection.main.head
      view.dispatch({
        changes: { from: head, insert: text },
        selection: { anchor: head + text.length },
        scrollIntoView: true,
      })
      view.focus()
    }
    window.addEventListener('copilot:insert-text', handler as EventListener)
    return () =>
      window.removeEventListener('copilot:insert-text', handler as EventListener)
  }, [])

  // Bridge from the Copilot panel: apply a concrete fix by replacing the
  // first occurrence of `oldText` (nearest to `line`) with `newText`. Falls
  // back to inserting `newText` at the cursor if `oldText` isn't found.
  useEffect(() => {
    const handler = (e: Event) => {
      const view = viewRef.current
      if (!view) return
      const detail = (e as CustomEvent<{
        oldText?: string
        newText?: string
        line?: number | null
      }>).detail
      const newText = detail?.newText
      if (typeof newText !== 'string' || !newText) return
      const oldText = typeof detail?.oldText === 'string' ? detail.oldText : ''

      if (oldText.length > 0) {
        const pos = findHunkPosition(view, oldText, detail?.line)
        if (pos == null) {
          // oldText not found in the open doc (model didn't copy it verbatim,
          // or the target file isn't open). Don't insert blindly — no-op.
          console.debug('[CodeMirrorEditor] copilot apply-fix: oldText not found, skipping')
          return
        }
        // Idempotence guard: a grow-hunk (newText starts with oldText, e.g.
        // adding a missing brace) that is ALREADY applied still matches —
        // oldText is found as a prefix of the fixed text — and re-applying
        // would replace that prefix again and corrupt the text (`}}`).
        // Skip when the text at the match is already newText. Grow-hunks
        // only: after a shrink-hunk is applied, newText legitimately sits at
        // the match position, so this check would misfire there.
        if (
          newText.length > oldText.length &&
          view.state.doc.sliceString(pos, pos + newText.length) === newText
        ) {
          console.debug('[CodeMirrorEditor] copilot apply-fix: hunk already applied, skipping')
          return
        }
        view.dispatch({
          changes: { from: pos, to: pos + oldText.length, insert: newText },
          selection: { anchor: pos + newText.length },
          scrollIntoView: true,
        })
        view.focus()
      }
    }
    window.addEventListener('copilot:apply-fix', handler as EventListener)
    return () =>
      window.removeEventListener('copilot:apply-fix', handler as EventListener)
  }, [])

  // Bridge from the Copilot panel: apply a fix as a TRACKED CHANGE attributed
  // to the Copilot pseudo-user, so collaborators can review/accept/reject it
  // in the review panel instead of the edit landing silently. The whole
  // sequence below is synchronous, so no user input can interleave and get
  // swept into the tracked update.
  useEffect(() => {
    const handler = (e: Event) => {
      const view = viewRef.current
      const currentDoc = currentDocRef.current
      if (!view || !currentDoc?.doc || !currentDoc.ranges) return
      const detail = (e as CustomEvent<{
        oldText?: string
        newText?: string
        line?: number | null
      }>).detail
      const newText = detail?.newText
      if (typeof newText !== 'string' || !newText) return
      const oldText = typeof detail?.oldText === 'string' ? detail.oldText : ''
      if (!oldText) return // pure insertions stay on the direct-insert path

      const pos = findHunkPosition(view, oldText, detail?.line)
      if (pos == null) {
        console.debug('[CodeMirrorEditor] copilot apply-fix-tracked: oldText not found, skipping')
        return
      }

      const shareJsDoc = currentDoc.doc
      // 1. Flush any of the user's own pending ops first, so they are not
      //    swept into the tracked Copilot update.
      shareJsDoc.flushPendingOps()
      // 2. Ensure track-changes id seeds exist (they are normally maintained
      //    by the review-panel providers, which may be inactive). The seed
      //    must match the local ranges tracker's seed so locally-generated
      //    change ids agree with the server's.
      if (!shareJsDoc.track_changes_id_seeds) {
        const seed =
          currentDoc.ranges.getIdSeed() || RangesTracker.generateIdSeed()
        shareJsDoc.track_changes_id_seeds = { inflight: seed, pending: seed }
      }
      // 3. Attribute the local op to Copilot in the client-side ranges
      //    tracker, and arm the one-shot wire marker (meta.agent + meta.tc).
      const prevTrackChangesAs = currentDoc.track_changes_as
      currentDoc.track_changes_as = COPILOT_USER_ID
      shareJsDoc.agentEditForNextUpdate = true
      try {
        view.dispatch({
          changes: { from: pos, to: pos + oldText.length, insert: newText },
          selection: { anchor: pos + newText.length },
          scrollIntoView: true,
        })
        // 4. Flush immediately so the update carries the marker. If another
        //    op is still inflight, the one-shot marker stays armed until our
        //    op flips to inflight and is sent.
        shareJsDoc.flushPendingOps()
      } finally {
        currentDoc.track_changes_as = prevTrackChangesAs
      }
      view.focus()
    }
    window.addEventListener('copilot:apply-fix-tracked', handler as EventListener)
    return () =>
      window.removeEventListener('copilot:apply-fix-tracked', handler as EventListener)
  }, [])

  // Bridge from the Copilot panel: show a pending patch as an inline-diff ghost
  // preview (struck old + gray new), or clear it. The panel lives outside the
  // source editor and dispatches `copilot:show-patch` / `copilot:clear-patch`
  // CustomEvents; we forward the hunks to the `copilotPatchPreview` extension.
  // Only hunks whose `oldText` is in the currently-open doc are decorated;
  // cross-file hunks render once the user opens the target file (the extension
  // rebuilds from module-level state on every doc change).
  useEffect(() => {
    const showHandler = (e: Event) => {
      const view = viewRef.current
      const detail = (
        e as CustomEvent<{ hunks: PatchHunk[] }>
      ).detail
      const hunks = Array.isArray(detail?.hunks) ? detail.hunks : []
      setActivePatch(hunks)
      if (view) {
        view.dispatch({ effects: setPatchEffect.of(hunks) })
      }
    }
    const clearHandler = () => {
      const view = viewRef.current
      setActivePatch(null)
      if (view) {
        view.dispatch({ effects: setPatchEffect.of(null) })
      }
    }
    window.addEventListener('copilot:show-patch', showHandler as EventListener)
    window.addEventListener('copilot:clear-patch', clearHandler as EventListener)
    return () => {
      window.removeEventListener('copilot:show-patch', showHandler as EventListener)
      window.removeEventListener('copilot:clear-patch', clearHandler as EventListener)
    }
  }, [])

  if (viewRef.current === null) {
    const timer = dispatchTimer()

    // @ts-ignore (disable EditContext-based editing until stable)
    EditorView.EDIT_CONTEXT = false

    const view = new EditorView({
      state,
      dispatchTransactions: (trs: readonly Transaction[]) => {
        timer.start(trs)
        view.update(trs)
        if (isMounted.current) {
          setState(view.state)
        }

        timer.end(trs, view)


        try {
          const hasPlugin = !!(view.plugin && view.plugin(INLINE_COMPLETION_PLUGIN))
          if (!hasPlugin) {

            setTimeout(() => {
              try {
                view.dispatch({
                  effects: StateEffect.appendConfig.of([inlineCompletionExtension()])
                })
                console.debug("[CodeMirrorEditor] re-appended inlineCompletionExtension (plugin missing after transaction).")
              } catch (e) {
                console.error("[CodeMirrorEditor] failed to re-append inlineCompletionExtension:", e)
              }
            }, 0)
          }
        } catch (e) {
          console.error("[CodeMirrorEditor] plugin existence check failed:", e)
        }
      },
    })


    try { (window as any).__cm_view_for_debug = view } catch (e){}

    viewRef.current = view


    setTimeout(() => {
      try {
        view.dispatch({
          effects: StateEffect.appendConfig.of([inlineCompletionExtension()])
        })
        console.debug("[CodeMirrorEditor] appended inlineCompletionExtension to view (initial).")
      } catch (e) {
        console.error("[CodeMirrorEditor] append inlineCompletionExtension failed (initial):", e);
      }
    }, 50);


    if (isMounted.current) {
      setState(view.state)
    }
  }

  return (
    <CodeMirrorStateContext.Provider value={state}>
      <CodeMirrorViewContext.Provider value={viewRef.current}>
        <ReviewPanelProviders>
          <CodemirrorOutline />
          <CodeMirrorView />
          <FigureModal />
          <CodeMirrorSearch />
          <CodeMirrorToolbar />
          {sourceEditorToolbarComponents.map(
            ({ import: { default: Component }, path }) => (
              <Component key={path} />
            )
          )}
          <CodeMirrorCommandTooltip />

          {newReviewPanel && <ReviewTooltipMenu />}
          <ReviewPanelMigration />

          {sourceEditorComponents.map(
            ({ import: { default: Component }, path }) => (
              <Component key={path} />
            )
          )}

          <LLMToolbar ref={llmToolbarref} />
        </ReviewPanelProviders>
      </CodeMirrorViewContext.Provider>
    </CodeMirrorStateContext.Provider>
  )
}

export default memo(CodeMirrorEditor)
