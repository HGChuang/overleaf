// Renders a conversation (list of CopilotMessage). Assistant messages render
// their markdown `content` plus any structured `blocks` and `suggestedActions`.
// `text`/`markdown` blocks are skipped below — they would duplicate `content`
// (the backend used to echo the answer as a {type:'text'} block as well).

import { FC } from 'react'
import type { CopilotMessage } from '../utils/types'
import MarkdownContent from './markdown-content'
import MessageBlockView from './message-block'

function Spinner() {
  return <span className="copilot-spinner" aria-label="loading" />
}

export const MessageList: FC<{ messages: CopilotMessage[] }> = ({
  messages,
}) => {
  if (messages.length === 0) return null

  return (
    <div className="copilot-message-list">
      {messages.map((msg, i) => {
        const isUser = msg.role === 'user'
        const isPending = msg.pending
        return (
          <div
            key={i}
            className={`copilot-msg ${isUser ? 'copilot-msg-user' : 'copilot-msg-assistant'}`}
          >
            {isUser ? (
              <div className="copilot-msg-bubble copilot-msg-bubble-user">
                {msg.content}
              </div>
            ) : isPending ? (
              <div className="copilot-msg-pending">
                <Spinner />
                <span>Thinking…</span>
              </div>
            ) : (
              <div className="copilot-msg-body">
                {msg.content && <MarkdownContent content={msg.content} />}
                {msg.blocks
                  ?.filter(
                    block => block.type !== 'text' && block.type !== 'markdown'
                  )
                  .map((block, j) => (
                    <MessageBlockView key={j} block={block} />
                  ))}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="copilot-suggested-actions">
                    {msg.suggestedActions.map((a, k) => (
                      <span key={k} className="copilot-suggested-action-chip">
                        {a.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default MessageList
