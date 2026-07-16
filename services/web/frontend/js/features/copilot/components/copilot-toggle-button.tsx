// Top navigation toolbar toggle button for the Copilot drawer (entry 3 entry
// point). Mirrors the chat-toggle-button pattern but reads the Copilot context
// directly, so it needs no extra props threaded through ToolbarHeader.

import { FC, useCallback } from 'react'
import classNames from 'classnames'
import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import { useCopilotContext } from '../context/copilot-context'

export const CopilotToggleButton: FC = () => {
  const { t } = useTranslation()
  const { isOpen, setIsOpen } = useCopilotContext()

  const onClick = useCallback(() => {
    setIsOpen(!isOpen)
  }, [isOpen, setIsOpen])

  const classes = classNames('btn', 'btn-full-height', {
    active: isOpen,
  })

  return (
    <div className="toolbar-item">
      <button
        type="button"
        className={classes}
        onClick={onClick}
        title={t('copilot') || 'Copilot'}
        aria-label={t('copilot') || 'Copilot'}
        aria-pressed={isOpen}
      >
        <MaterialIcon type="auto_awesome" className="align-middle" />
        <p className="toolbar-label">Copilot</p>
      </button>
    </div>
  )
}

export default CopilotToggleButton
