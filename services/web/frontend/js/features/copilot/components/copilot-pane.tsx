// The Copilot native right-side pane (entry 3). Rendered as a real
// <Panel> in main-layout (side-by-side with the editor/preview, like the
// Chat pane) — NOT a fixed overlay. Content is kept mounted once opened
// (mirrors the chat pane's chatOpenedOnce) so composer input survives
// collapse/expand. The pane owns a header with a "start new chat" action and
// a close button; the body is the unified chat view.

import { FC, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import { useCopilotContext } from '../context/copilot-context'
import ChatView from './copilot-chat-view'

const CopilotPaneImpl: FC = () => {
  const { t } = useTranslation()
  const { isOpen, setIsOpen, startNewChat, error, clearError } = useCopilotContext()

  // keep mounted once opened (mirrors the chat pane's chatOpenedOnce) so
  // composer input/state survive collapse/expand — and so the composer (which
  // autofocuses on mount) doesn't steal focus while the pane is collapsed.
  const [openedOnce, setOpenedOnce] = useState(isOpen)
  useEffect(() => {
    if (isOpen) {
      setOpenedOnce(true)
    }
  }, [isOpen])

  // Esc to close
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    },
    [setIsOpen]
  )
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  if (!openedOnce) return null

  return (
    <>
      <style>{PANE_CSS}</style>
      <aside
        className="copilot-pane"
        role="complementary"
        aria-label={t('copilot') || 'Copilot'}
      >
        <header className="copilot-header">
          <div className="copilot-header-title">Copilot</div>
          <div className="copilot-header-actions">
            <button
              className="copilot-icon-btn copilot-new-chat"
              onClick={startNewChat}
              title="Start new chat"
              aria-label="Start new chat"
            >
              <MaterialIcon type="add_comment" className="align-middle" />
            </button>
          </div>
        </header>

        {error && (
          <div className="copilot-error-banner" role="alert">
            <span className="copilot-error-text">{error}</span>
            <button className="copilot-error-dismiss" onClick={clearError}>
              ×
            </button>
          </div>
        )}

        <div className="copilot-pane-body">
          <ChatView />
        </div>
      </aside>
    </>
  )
}

export const CopilotPane: FC = () => <CopilotPaneImpl />

export default CopilotPane

// ---------------------------------------------------------------------------
// Styles (injected once; .copilot-* namespaced to avoid collisions).
// Only content styling — the panel sizing/positioning is handled by
// react-resizable-panels in main-layout.
// ---------------------------------------------------------------------------

const PANE_CSS = `
.copilot-pane {
  /* dark theme tokens (scoped to the pane so they don't leak) */
  --copilot-bg: #313a4b;
  --copilot-fg: #e7e9ec;
  --copilot-fg-muted: #9aa0a8;
  --copilot-edge: #414b5e;
  --copilot-hover: #2a3343;
  --copilot-accent: #5b9dff;
  --copilot-input-bg: #494e55;

  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--copilot-bg);
  color: var(--copilot-fg);
  font-size: 14px;
}

.copilot-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--copilot-edge);
  flex: 0 0 auto;
}
.copilot-header-title { font-weight: 600; font-size: 15px; }
.copilot-header-actions { display: flex; align-items: center; gap: 2px; }
.copilot-icon-btn {
  border: none; background: transparent; cursor: pointer;
  color: var(--copilot-fg-muted);
  padding: 4px 6px; border-radius: 6px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
}
.copilot-icon-btn:hover { background: var(--copilot-hover); color: var(--copilot-fg); }
.copilot-close { font-size: 20px; }
.copilot-new-chat { font-size: 20px; }

.copilot-error-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin: 8px 12px; padding: 8px 10px;
  background: #3a1f24; border: 1px solid #6b2a30; color: #ffb4b4;
  border-radius: 8px; font-size: 13px; flex: 0 0 auto;
}
.copilot-error-dismiss {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #ffb4b4;
}

.copilot-pane-body {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.copilot-tab-content {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.copilot-tab-scroll {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px;
}

.copilot-empty {
  text-align: center; padding: 24px 8px; color: var(--copilot-fg-muted);
}
.copilot-empty-title { font-size: 15px; font-weight: 600; color: var(--copilot-fg); margin-bottom: 6px; }
.copilot-empty-sub { font-size: 13px; margin-bottom: 16px; line-height: 1.45; }
.copilot-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.copilot-chip {
  border: 1px solid var(--copilot-edge); background: var(--copilot-hover);
  border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer;
  color: var(--copilot-fg);
}
.copilot-chip:hover { border-color: var(--copilot-accent); color: var(--copilot-accent); }
.copilot-chip:disabled { opacity: 0.5; cursor: not-allowed; }

.copilot-btn {
  border: 1px solid var(--copilot-edge); background: var(--copilot-hover);
  color: var(--copilot-fg); border-radius: 6px; padding: 6px 10px;
  font-size: 13px; cursor: pointer;
}
.copilot-btn:hover { background: #2c343f; }
.copilot-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.copilot-btn-primary {
  background: var(--copilot-accent); border-color: var(--copilot-accent); color: #0b1220;
}
.copilot-btn-primary:hover { background: #7bb0ff; }

/* composer */
.copilot-composer {
  flex: 0 0 auto; border-top: 1px solid var(--copilot-edge); padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.copilot-composer-context { display: flex; flex-direction: column; gap: 6px; }
.copilot-composer-seed, .copilot-selection-chip {
  display: flex; align-items: center; gap: 6px; font-size: 12px;
  background: var(--copilot-hover); border: 1px solid var(--copilot-edge);
  border-radius: 8px; padding: 6px 8px; color: var(--copilot-fg-muted);
}
.copilot-composer-seed-text, .copilot-selection-chip-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copilot-composer-seed-clear, .copilot-selection-chip-clear { border: none; background: transparent; cursor: pointer; color: inherit; }

/* textarea + inline send button (send button floats at bottom-right).
   Fixed single-line height — the input stays a consistent low height and
   does NOT auto-grow on typing (auto-grow caused a jarring tall→low jump
   when the cursor entered the field). Long pastes scroll inside the box. */
.copilot-composer-input-wrap {
  position: relative; display: block;
}
.copilot-composer-input {
  display: block; width: 100%; resize: none; height: 44px; overflow-y: auto;
  border: 1px solid var(--copilot-edge); border-radius: 10px; padding: 10px 44px 10px 12px;
  font-family: inherit; font-size: 14px; line-height: 1.4; color: var(--copilot-fg);
  background: var(--copilot-input-bg);
  outline: none; box-sizing: border-box;
}
.copilot-composer-input::placeholder { color: #8b9099; }
.copilot-composer-input:focus { border-color: var(--copilot-accent); box-shadow: 0 0 0 2px rgba(91,157,255,0.18); }
.copilot-send {
  position: absolute; right: 6px; bottom: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  height: 30px; width: 30px; padding: 0; border: none; border-radius: 8px;
  background: var(--copilot-accent); color: #0b1220; cursor: pointer;
}
.copilot-send:hover { background: #7bb0ff; }
.copilot-send:disabled { background: #3a4150; color: #6a7178; cursor: not-allowed; }

/* messages */
.copilot-message-list { display: flex; flex-direction: column; gap: 14px; }
.copilot-msg { display: flex; flex-direction: column; }
.copilot-msg-user { align-items: flex-end; }
.copilot-msg-assistant { align-items: flex-start; }
.copilot-msg-bubble-user {
  background: var(--copilot-accent); color: #0b1220; border-radius: 12px;
  padding: 8px 12px; max-width: 85%; word-break: break-word; white-space: pre-wrap;
}
.copilot-msg-body {
  max-width: 100%; background: var(--copilot-hover); border: 1px solid var(--copilot-edge);
  border-radius: 12px; padding: 10px 12px; word-break: break-word;
}
.copilot-msg-pending { display: flex; align-items: center; gap: 8px; color: var(--copilot-fg-muted); padding: 8px 12px; }
.copilot-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--copilot-edge); border-top-color: var(--copilot-accent);
  animation: copilot-spin 0.8s linear infinite; display: inline-block;
}
@keyframes copilot-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

/* markdown rendering (shared) */
.copilot-md { line-height: 1.55; }
.copilot-md p { margin: 6px 0; }
.copilot-md h1, .copilot-md h2, .copilot-md h3 { margin: 10px 0 6px; line-height: 1.3; }
.copilot-md ul, .copilot-md ol { margin: 6px 0; padding-left: 22px; }
.copilot-md a { color: var(--copilot-accent); }
.copilot-md pre {
  background: #11161d; color: #e7e9ec; padding: 10px; border-radius: 8px;
  overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-width: 100%; margin: 8px 0;
}
.copilot-md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.copilot-md :not(pre) > code { background: var(--copilot-hover); padding: 1px 4px; border-radius: 4px; }
.copilot-md table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.copilot-md th, .copilot-md td { border: 1px solid var(--copilot-edge); padding: 4px 8px; }

/* blocks */
.copilot-block { margin: 8px 0; }
.copilot-code, .copilot-suggested-fix {
  position: relative; background: var(--copilot-hover);
  border: 1px solid var(--copilot-edge); border-radius: 8px; padding: 8px 10px; margin: 8px 0;
}
.copilot-code pre { background: transparent; color: inherit; padding: 6px 0 0; margin: 0; }
.copilot-code-copy, .copilot-code-insert, .copilot-suggested-fix-actions {
  display: inline-flex; gap: 6px;
}
.copilot-code .copilot-code-copy, .copilot-code .copilot-code-insert {
  position: absolute; top: 6px; right: 6px;
}
.copilot-code .copilot-code-copy { right: 70px; }
.copilot-code-lang { font-size: 11px; color: var(--copilot-fg-muted); }
.copilot-suggested-fix-text { margin-bottom: 6px; }
.copilot-suggested-fix-actions { display: flex; gap: 6px; justify-content: flex-end; }
.copilot-latex-block { position: relative; }
.copilot-latex-block pre { background: #11161d; color: #e7e9ec; padding: 10px; border-radius: 8px; overflow-x: auto; margin: 0; }
.copilot-copy-latex { font-size: 12px; }

/* file refs */
.copilot-file-refs { margin: 8px 0; }
.copilot-file-refs-title { font-size: 12px; color: var(--copilot-fg-muted); margin-bottom: 4px; }
.copilot-file-ref {
  display: inline-flex; align-items: center; gap: 4px; margin: 3px 4px 3px 0;
  background: var(--copilot-hover); border: 1px solid var(--copilot-edge);
  border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 13px;
}
.copilot-file-ref:hover { border-color: var(--copilot-accent); color: var(--copilot-accent); }
.copilot-file-ref-line { color: var(--copilot-fg-muted); }
.copilot-file-ref-label { color: var(--copilot-fg-muted); font-size: 12px; }

/* actions */
.copilot-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.copilot-suggested-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.copilot-suggested-action-chip {
  background: var(--copilot-hover); border: 1px dashed var(--copilot-edge);
  border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--copilot-fg-muted);
}

/* patch block (AI-proposed edit with inline-diff preview + accept/reject).
   The EDITOR ghost decorations use the .cm-copilot-patch-* classes styled by
   the copilotPatchPreview extension's baseTheme; the rules below style the
   mini-diff shown in the chat card itself. */
.copilot-patch {
  border: 1px solid var(--copilot-edge); border-radius: 8px; padding: 10px 12px;
  margin: 8px 0; background: var(--copilot-hover);
}
.copilot-patch-title { font-weight: 600; margin-bottom: 6px; }
.copilot-patch-hunks { display: flex; flex-direction: column; gap: 8px; }
.copilot-patch-hunk { border: 1px dashed var(--copilot-edge); border-radius: 6px; padding: 6px 8px; }
.copilot-patch-loc {
  background: none; border: none; cursor: pointer; color: var(--copilot-accent);
  font-size: 12px; padding: 0 0 4px; text-decoration: underline; display: block;
}
.copilot-patch-old {
  margin: 4px 0 0; padding: 6px 8px; background: #3a1f24; border: 1px solid #6b2a30;
  color: #ffb4b4; border-radius: 6px; white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.45; text-decoration: line-through;
}
.copilot-patch-new {
  margin: 4px 0 0; padding: 6px 8px; background: #1f2a3a; border: 1px solid #2a3f6b;
  color: #9ec1ff; border-radius: 6px; white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.45;
}
.copilot-patch-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; justify-content: flex-end; }
.copilot-patch-status { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--copilot-fg-muted); }
.copilot-patch-status-accepted { color: #7fcf9b; }
.copilot-patch-status-rejected { color: #ff9b9b; }
.copilot-patch-status-none { color: var(--copilot-fg-muted); font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 12px; }
`
