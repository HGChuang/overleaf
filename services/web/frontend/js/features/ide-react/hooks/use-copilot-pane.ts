import { useCallback, useRef, useState } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'
import useCollapsiblePanel from '@/features/ide-react/hooks/use-collapsible-panel'
import { useCopilotContext } from '@/features/copilot'

// Mirrors useChatPane, but reads open state from the Copilot context (a
// persisted React value) instead of the Angular-bridged layout scope — so the
// Copilot pane needs no new scope value.
export const useCopilotPane = () => {
  const { isOpen, setIsOpen } = useCopilotContext()
  const [resizing, setResizing] = useState(false)
  const panelRef = useRef<ImperativePanelHandle>(null)

  useCollapsiblePanel(isOpen, panelRef)

  const togglePane = useCallback(() => {
    setIsOpen(!isOpen)
  }, [isOpen, setIsOpen])

  const handlePaneExpand = useCallback(() => {
    setIsOpen(true)
  }, [setIsOpen])

  const handlePaneCollapse = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  return {
    isOpen,
    setIsOpen,
    panelRef,
    resizing,
    setResizing,
    togglePane,
    handlePaneExpand,
    handlePaneCollapse,
  }
}
