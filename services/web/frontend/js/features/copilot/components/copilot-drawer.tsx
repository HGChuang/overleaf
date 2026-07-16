// The Copilot right-side overlay drawer (entry 3). Rendered via a portal to
// document.body; kept mounted once opened (mirrors the chat pane's
// chatOpenedOnce pattern) so composer input survives toggling. Visibility is
// controlled by a CSS transform so there is no remount cost.

import { FC, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import { useCopilotContext } from '../context/copilot-context'
import type { CopilotTab } from '../utils/types'
import AskWriteTab from './tabs/ask-write-tab'
import FixTab from './tabs/fix-tab'
import CheckTab from './tabs/check-tab'

const TABS: { key: CopilotTab; label: string }[] = [
  { key: 'ask', label: 'Ask' },
  { key: 'fix', label: 'Fix' },
  { key: 'check', label: 'Check' },
]

const CopilotDrawerImpl: FC = () => {
  const { t } = useTranslation()
  const {
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
    error,
    clearError,
  } = useCopilotContext()

  // keep mounted once opened so input/state survive toggling
  const [mountedOnce, setMountedOnce] = useState(isOpen)
  useEffect(() => {
    if (isOpen) setMountedOnce(true)
  }, [isOpen])

  // Esc to close
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    },
    [isOpen, setIsOpen]
  )
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  if (!mountedOnce) return null

  return createPortal(
    <>
      <style>{DRAWER_CSS}</style>
      <aside
        className={classNames('copilot-drawer', {
          'copilot-drawer-open': isOpen,
          'copilot-drawer-closed': !isOpen,
        })}
        role="complementary"
        aria-label={t('copilot') || 'Copilot'}
        aria-hidden={!isOpen}
      >
        <header className="copilot-header">
          <div className="copilot-header-title">Copilot</div>
          <button
            className="copilot-close"
            onClick={() => setIsOpen(false)}
            title="Close (Esc)"
            aria-label="Close Copilot"
          >
            ×
          </button>
        </header>

        <nav className="copilot-tab-bar" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={classNames('copilot-tab', {
                'copilot-tab-active': activeTab === tab.key,
              })}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {error && (
          <div className="copilot-error-banner" role="alert">
            <span className="copilot-error-text">{error}</span>
            <button className="copilot-error-dismiss" onClick={clearError}>
              ×
            </button>
          </div>
        )}

        <div className="copilot-drawer-body">
          {activeTab === 'ask' && <AskWriteTab />}
          {activeTab === 'fix' && <FixTab />}
          {activeTab === 'check' && <CheckTab />}
        </div>
      </aside>
    </>,
    document.body
  )
}

export const CopilotDrawer: FC = () => <CopilotDrawerImpl />

export default CopilotDrawer

// ---------------------------------------------------------------------------
// Styles (injected once; .copilot-* namespaced to avoid collisions)
// ---------------------------------------------------------------------------

const DRAWER_CSS = `
.copilot-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 92vw;
  height: 100vh;
  background: var(--copilot-bg, #ffffff);
  color: var(--copilot-fg, #1f2328);
  border-left: 1px solid var(--copilot-edge, #e1e4e8);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  z-index: 200;
  font-size: 14px;
  transition: transform 220ms ease;
  will-change: transform;
}
.copilot-drawer-open { transform: translateX(0); }
.copilot-drawer-closed { transform: translateX(100%); pointer-events: none; }

.copilot-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--copilot-edge, #e1e4e8);
  flex: 0 0 auto;
}
.copilot-header-title { font-weight: 600; font-size: 15px; }
.copilot-close {
  border: none; background: transparent; font-size: 22px; line-height: 1;
  cursor: pointer; color: var(--copilot-fg-muted, #6a737d);
  padding: 2px 6px; border-radius: 6px;
}
.copilot-close:hover { background: var(--copilot-hover, #f6f8fa); }

.copilot-tab-bar {
  display: flex; flex: 0 0 auto;
  border-bottom: 1px solid var(--copilot-edge, #e1e4e8);
  padding: 0 8px;
}
.copilot-tab {
  flex: 1; border: none; background: transparent; cursor: pointer;
  padding: 10px 4px; font-size: 13px; font-weight: 500;
  color: var(--copilot-fg-muted, #6a737d);
  border-bottom: 2px solid transparent;
}
.copilot-tab:hover { color: var(--copilot-fg, #1f2328); }
.copilot-tab-active {
  color: var(--copilot-accent, #1a7f64);
  border-bottom-color: var(--copilot-accent, #1a7f64);
}

.copilot-error-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin: 8px 12px; padding: 8px 10px;
  background: #fff5f5; border: 1px solid #ffd6d6; color: #922;
  border-radius: 8px; font-size: 13px;
}
.copilot-error-dismiss {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #922;
}

.copilot-drawer-body {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.copilot-tab-content {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.copilot-tab-scroll {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px;
}

.copilot-empty {
  text-align: center; padding: 24px 8px; color: var(--copilot-fg-muted, #6a737d);
}
.copilot-empty-title { font-size: 15px; font-weight: 600; color: var(--copilot-fg, #1f2328); margin-bottom: 6px; }
.copilot-empty-sub { font-size: 13px; margin-bottom: 16px; line-height: 1.45; }
.copilot-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.copilot-chip {
  border: 1px solid var(--copilot-edge, #e1e4e8); background: var(--copilot-hover, #f6f8fa);
  border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer;
  color: var(--copilot-fg, #1f2328);
}
.copilot-chip:hover { border-color: var(--copilot-accent, #1a7f64); color: var(--copilot-accent, #1a7f64); }

.copilot-btn {
  border: 1px solid var(--copilot-edge, #d1d5da); background: var(--copilot-hover, #f6f8fa);
  color: var(--copilot-fg, #1f2328); border-radius: 6px; padding: 6px 10px;
  font-size: 13px; cursor: pointer;
}
.copilot-btn:hover { background: var(--copilot-edge, #eaecef); }
.copilot-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.copilot-btn-primary {
  background: var(--copilot-accent, #1a7f64); border-color: var(--copilot-accent, #1a7f64); color: #fff;
}
.copilot-btn-primary:hover { background: #16604f; }

/* composer */
.copilot-composer {
  flex: 0 0 auto; border-top: 1px solid var(--copilot-edge, #e1e4e8); padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.copilot-composer-seed {
  display: flex; align-items: center; gap: 6px; font-size: 12px;
  background: var(--copilot-hover, #f6f8fa); border: 1px solid var(--copilot-edge, #e1e4e8);
  border-radius: 8px; padding: 6px 8px; color: var(--copilot-fg-muted, #6a737d);
}
.copilot-composer-seed-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copilot-composer-seed-clear { border: none; background: transparent; cursor: pointer; color: inherit; }
.copilot-composer-row { display: flex; align-items: flex-end; gap: 8px; }
.copilot-composer-input {
  flex: 1; resize: none; min-height: 40px; max-height: 200px; overflow-y: auto;
  border: 1px solid var(--copilot-edge, #d1d5da); border-radius: 8px; padding: 8px 10px;
  font-family: inherit; font-size: 14px; color: var(--copilot-fg, #1f2328); background: #fff;
  outline: none; box-sizing: border-box;
}
.copilot-composer-input:focus { border-color: var(--copilot-accent, #1a7f64); box-shadow: 0 0 0 2px rgba(26,127,100,0.12); }
.copilot-send { display: inline-flex; align-items: center; justify-content: center; height: 40px; width: 40px; padding: 0; }

/* messages */
.copilot-message-list { display: flex; flex-direction: column; gap: 14px; }
.copilot-msg { display: flex; flex-direction: column; }
.copilot-msg-user { align-items: flex-end; }
.copilot-msg-assistant { align-items: flex-start; }
.copilot-msg-bubble-user {
  background: var(--copilot-accent, #1a7f64); color: #fff; border-radius: 12px;
  padding: 8px 12px; max-width: 85%; word-break: break-word; white-space: pre-wrap;
}
.copilot-msg-body {
  max-width: 100%; background: var(--copilot-hover, #f6f8fa); border: 1px solid var(--copilot-edge, #e1e4e8);
  border-radius: 12px; padding: 10px 12px; word-break: break-word;
}
.copilot-msg-pending { display: flex; align-items: center; gap: 8px; color: var(--copilot-fg-muted, #6a737d); padding: 8px 12px; }
.copilot-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--copilot-edge, #d1d5da); border-top-color: var(--copilot-accent, #1a7f64);
  animation: copilot-spin 0.8s linear infinite; display: inline-block;
}
@keyframes copilot-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

/* markdown rendering (shared) */
.copilot-md { line-height: 1.55; }
.copilot-md p { margin: 6px 0; }
.copilot-md h1, .copilot-md h2, .copilot-md h3 { margin: 10px 0 6px; line-height: 1.3; }
.copilot-md ul, .copilot-md ol { margin: 6px 0; padding-left: 22px; }
.copilot-md a { color: var(--copilot-accent, #1a7f64); }
.copilot-md pre {
  background: #1f2328; color: #f6f8fa; padding: 10px; border-radius: 8px;
  overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-width: 100%; margin: 8px 0;
}
.copilot-md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.copilot-md :not(pre) > code { background: var(--copilot-hover, #f6f8fa); padding: 1px 4px; border-radius: 4px; }
.copilot-md table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.copilot-md th, .copilot-md td { border: 1px solid var(--copilot-edge, #e1e4e8); padding: 4px 8px; }

/* blocks */
.copilot-block { margin: 8px 0; }
.copilot-code, .copilot-suggested-fix {
  position: relative; background: var(--copilot-hover, #f6f8fa);
  border: 1px solid var(--copilot-edge, #e1e4e8); border-radius: 8px; padding: 8px 10px; margin: 8px 0;
}
.copilot-code pre { background: transparent; color: inherit; padding: 6px 0 0; margin: 0; }
.copilot-code-copy, .copilot-code-insert, .copilot-suggested-fix-actions {
  display: inline-flex; gap: 6px;
}
.copilot-code .copilot-code-copy, .copilot-code .copilot-code-insert {
  position: absolute; top: 6px; right: 6px;
}
.copilot-code .copilot-code-copy { right: 70px; }
.copilot-code-lang { font-size: 11px; color: var(--copilot-fg-muted, #6a737d); }
.copilot-suggested-fix-text { margin-bottom: 6px; }
.copilot-suggested-fix-actions { display: flex; gap: 6px; justify-content: flex-end; }
.copilot-latex-block { position: relative; }
.copilot-latex-block pre { background: #1f2328; color: #f6f8fa; padding: 10px; border-radius: 8px; overflow-x: auto; margin: 0; }
.copilot-copy-latex { font-size: 12px; }

/* file refs */
.copilot-file-refs { margin: 8px 0; }
.copilot-file-refs-title { font-size: 12px; color: var(--copilot-fg-muted, #6a737d); margin-bottom: 4px; }
.copilot-file-ref {
  display: inline-flex; align-items: center; gap: 4px; margin: 3px 4px 3px 0;
  background: var(--copilot-hover, #f6f8fa); border: 1px solid var(--copilot-edge, #e1e4e8);
  border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 13px;
}
.copilot-file-ref:hover { border-color: var(--copilot-accent, #1a7f64); color: var(--copilot-accent, #1a7f64); }
.copilot-file-ref-line { color: var(--copilot-fg-muted, #6a737d); }
.copilot-file-ref-label { color: var(--copilot-fg-muted, #6a737d); font-size: 12px; }

/* actions */
.copilot-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.copilot-suggested-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.copilot-suggested-action-chip {
  background: var(--copilot-hover, #f6f8fa); border: 1px dashed var(--copilot-edge, #d1d5da);
  border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--copilot-fg-muted, #6a737d);
}

/* diagnostics (Fix tab) */
.copilot-diag {
  background: #fff; border: 1px solid var(--copilot-edge, #e1e4e8); border-left: 3px solid #d93025;
  border-radius: 8px; padding: 10px 12px; margin: 10px 0;
}
.copilot-diag-title { font-weight: 600; margin-bottom: 6px; }
.copilot-diag-section { margin: 6px 0; }
.copilot-diag-section-label { font-size: 12px; font-weight: 600; color: var(--copilot-fg-muted, #6a737d); margin-bottom: 2px; }
.copilot-diag-section-body { line-height: 1.5; }
.copilot-diag-location { font-size: 13px; margin: 6px 0; }
.copilot-diag-location-link { background: none; border: none; color: var(--copilot-accent, #1a7f64); cursor: pointer; padding: 0; text-decoration: underline; }
.copilot-diag-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.copilot-diag-summary { background: #fff5f5; border: 1px solid #ffd6d6; color: #922; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }

/* checks (Check tab) */
.copilot-check-controls { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.copilot-check-types { display: flex; flex-wrap: wrap; gap: 6px; }
.copilot-check-type {
  display: inline-flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--copilot-edge, #e1e4e8); border-radius: 999px; padding: 4px 10px;
  background: #fff; color: var(--copilot-fg, #1f2328);
}
.copilot-check-type.active { border-color: var(--copilot-accent, #1a7f64); color: var(--copilot-accent, #1a7f64); }
.copilot-check-summary { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; margin-bottom: 8px; color: var(--copilot-fg-muted, #6a737d); }
.copilot-check-total { font-weight: 600; color: var(--copilot-fg, #1f2328); }
.copilot-issue-group { margin-bottom: 14px; }
.copilot-issue-group-title { font-size: 13px; font-weight: 600; color: var(--copilot-fg-muted, #6a737d); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.copilot-issue {
  border: 1px solid var(--copilot-edge, #e1e4e8); border-radius: 8px; padding: 10px 12px; margin: 8px 0; background: #fff;
}
.copilot-issue-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.copilot-issue-title { font-weight: 500; }
.copilot-issue-type { font-size: 11px; color: var(--copilot-fg-muted, #6a737d); text-transform: uppercase; }
.copilot-badge { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 2px 8px; text-transform: uppercase; }
.copilot-sev-error { background: #ffe0e0; color: #b00020; }
.copilot-sev-warning { background: #fff3d6; color: #8a6100; }
.copilot-sev-info { background: #e0eaff; color: #1a4fb0; }
.copilot-issue-loc { background: none; border: none; cursor: pointer; color: var(--copilot-accent, #1a7f64); font-size: 12px; padding: 0; text-decoration: underline; }
.copilot-issue-desc { font-size: 13px; color: var(--copilot-fg, #1f2328); margin: 6px 0; line-height: 1.5; }
.copilot-issue-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.copilot-issue-explain { margin-top: 8px; border-top: 1px dashed var(--copilot-edge, #e1e4e8); padding-top: 8px; }
.copilot-issue-list-fallback { margin: 6px 0; padding-left: 18px; }
`
