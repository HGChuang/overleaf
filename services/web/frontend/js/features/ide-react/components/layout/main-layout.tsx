import { Panel, PanelGroup } from 'react-resizable-panels'
import { FC } from 'react'
import { HorizontalResizeHandle } from '../resize/horizontal-resize-handle'
import classNames from 'classnames'
import { useLayoutContext } from '@/shared/context/layout-context'
import EditorNavigationToolbar from '@/features/ide-react/components/editor-navigation-toolbar'
import ChatPane from '@/features/chat/components/chat-pane'
import { HorizontalToggler } from '@/features/ide-react/components/resize/horizontal-toggler'
import { HistorySidebar } from '@/features/ide-react/components/history-sidebar'
import EditorSidebar from '@/features/ide-react/components/editor-sidebar'
import { useTranslation } from 'react-i18next'
import { useSidebarPane } from '@/features/ide-react/hooks/use-sidebar-pane'
import { useChatPane } from '@/features/ide-react/hooks/use-chat-pane'
import { useCopilotPane } from '@/features/ide-react/hooks/use-copilot-pane'
import { EditorAndPdf } from '@/features/ide-react/components/editor-and-pdf'
import HistoryContainer from '@/features/ide-react/components/history-container'
import { CopilotPane } from '@/features/copilot'
import getMeta from '@/utils/meta'

export const MainLayout: FC = () => {
  const { view } = useLayoutContext()

  const {
    isOpen: sidebarIsOpen,
    setIsOpen: setSidebarIsOpen,
    panelRef: sidebarPanelRef,
    togglePane: toggleSidebar,
    handlePaneExpand: handleSidebarExpand,
    handlePaneCollapse: handleSidebarCollapse,
    resizing: sidebarResizing,
    setResizing: setSidebarResizing,
  } = useSidebarPane()

  const {
    isOpen: chatIsOpen,
    panelRef: chatPanelRef,
    togglePane: toggleChat,
    resizing: chatResizing,
    setResizing: setChatResizing,
    handlePaneCollapse: handleChatCollapse,
    handlePaneExpand: handleChatExpand,
  } = useChatPane()

  const {
    isOpen: copilotIsOpen,
    setIsOpen: setCopilotIsOpen,
    panelRef: copilotPanelRef,
    togglePane: toggleCopilot,
    resizing: copilotResizing,
    setResizing: setCopilotResizing,
    handlePaneCollapse: handleCopilotCollapse,
    handlePaneExpand: handleCopilotExpand,
  } = useCopilotPane()

  // Copilot and Chat are independent right-side panels: each toolbar button
  // toggles only its own panel state (copilot:open vs ui.chatOpen), and both
  // panels may be open at once.
  //
  // For that independence to hold, the two collapsible panels must NOT be
  // siblings in the same flat PanelGroup. react-resizable-panels donates the
  // space freed by a collapsing panel to its pivot neighbor (and an expanding
  // panel steals from that neighbor first). In a flat [main | chat | copilot]
  // group, collapsing Copilot force-expands Chat from 0 — and the panel's
  // onExpand callback then flips ui.chatOpen to true, so clicking "Copilot"
  // visibly "switched to Chat" (and vice versa). Nesting [main | chat] in its
  // own PanelGroup (below) makes each side panel trade space only with the
  // editor area.
  const chatEnabled = getMeta('ol-chatEnabled')

  const { t } = useTranslation()

  return (
    <div className="ide-react-main">
      <EditorNavigationToolbar />
      <div className="ide-react-body">
        <PanelGroup
          autoSaveId="ide-outer-layout"
          direction="horizontal"
          className={classNames({
            'ide-panel-group-resizing':
              sidebarResizing || chatResizing || copilotResizing,
          })}
        >
          {/* sidebar */}
          <Panel
            ref={sidebarPanelRef}
            id="panel-sidebar"
            order={1}
            defaultSize={15}
            minSize={5}
            maxSize={80}
            collapsible
            onCollapse={handleSidebarCollapse}
            onExpand={handleSidebarExpand}
          >
            <EditorSidebar />
            {view === 'history' && <HistorySidebar />}
          </Panel>

          <HorizontalResizeHandle
            onDoubleClick={toggleSidebar}
            resizable={sidebarIsOpen}
            onDragging={setSidebarResizing}
            hitAreaMargins={{ coarse: 0, fine: 0 }}
          >
            <HorizontalToggler
              id="panel-sidebar"
              togglerType="west"
              isOpen={sidebarIsOpen}
              setIsOpen={setSidebarIsOpen}
              tooltipWhenOpen={t('tooltip_hide_filetree')}
              tooltipWhenClosed={t('tooltip_show_filetree')}
            />
          </HorizontalResizeHandle>

          <Panel id="panel-outer-main" order={2}>
            {/* autoSaveId bumped to v3: the group was restructured — Chat now
              lives in a nested group with the main panel (see comment above),
              so layouts saved for the old flat 3-panel group must be
              discarded. */}
            <PanelGroup autoSaveId="ide-inner-layout-v3" direction="horizontal">
              <Panel id="panel-main-chat" order={1}>
                {/* Nested group: Chat collapses/expands against the main
                  editor panel only, never against Copilot. */}
                <PanelGroup
                  autoSaveId="ide-main-chat-layout"
                  direction="horizontal"
                >
                  <Panel className="ide-react-panel" id="panel-main" order={1}>
                    <HistoryContainer />
                    <EditorAndPdf />
                  </Panel>

                  {chatEnabled && (
                    <>
                      <HorizontalResizeHandle
                        onDoubleClick={toggleChat}
                        resizable={chatIsOpen}
                        onDragging={setChatResizing}
                        hitAreaMargins={{ coarse: 0, fine: 0 }}
                      />

                      {/* chat */}
                      <Panel
                        ref={chatPanelRef}
                        id="panel-chat"
                        order={2}
                        defaultSize={20}
                        minSize={5}
                        maxSize={30}
                        collapsible
                        onCollapse={handleChatCollapse}
                        onExpand={handleChatExpand}
                      >
                        <ChatPane />
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </Panel>

              <HorizontalResizeHandle
                onDoubleClick={toggleCopilot}
                resizable={copilotIsOpen}
                onDragging={setCopilotResizing}
                hitAreaMargins={{ coarse: 0, fine: 0 }}
              >
                <HorizontalToggler
                  id="panel-copilot"
                  togglerType="east"
                  isOpen={copilotIsOpen}
                  setIsOpen={setCopilotIsOpen}
                  tooltipWhenOpen="Hide Copilot"
                  tooltipWhenClosed="Show Copilot"
                />
              </HorizontalResizeHandle>

              {/* copilot */}
              <Panel
                ref={copilotPanelRef}
                id="panel-copilot"
                order={2}
                defaultSize={22}
                minSize={5}
                maxSize={40}
                collapsible
                onCollapse={handleCopilotCollapse}
                onExpand={handleCopilotExpand}
              >
                <CopilotPane />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
