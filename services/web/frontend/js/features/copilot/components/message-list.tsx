// Renders a conversation (list of CopilotMessage). An assistant turn is
// modeled as a chronological TIMELINE (text segments and tool steps
// interleaved in arrival order) — accumulated live while the turn streams
// and frozen onto the completed message. Rendering the timeline in order
// keeps the display faithful to the agent's real sequence: a text segment
// after a tool call appears BELOW that tool's row, and nothing shown
// mid-turn disappears at completion (the terminal `done` payload's content
// is lossy — last text segment only — so it is NOT rendered when a timeline
// exists; its structured `blocks`, e.g. the patch card, still are).
// Messages flagged `hidden` (the automatic post-accept verification trigger)
// are sent to the agent but never rendered.

import { FC } from 'react'
import type {
  CopilotMessage,
  CopilotTimelineItem,
  CopilotToolStep,
} from '../utils/types'
import MarkdownContent from './markdown-content'
import MessageBlockView from './message-block'
import ToolSteps, { toolStepLabel } from './tool-steps'

function Spinner() {
  return <span className="copilot-spinner" aria-label="loading" />
}

// Group consecutive tool items into a single ToolSteps run so step rows keep
// their compact list styling; a text segment breaks the run (it renders
// between the tool calls that surround it).
type TimelineGroup =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tools'; id: string; steps: CopilotToolStep[] }

function groupTimeline(timeline: CopilotTimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = []
  for (const item of timeline) {
    if (item.kind === 'text') {
      groups.push({ kind: 'text', id: item.id, text: item.text })
    } else {
      const tail = groups[groups.length - 1]
      if (tail?.kind === 'tools') {
        tail.steps.push(item.step)
      } else {
        groups.push({ kind: 'tools', id: item.id, steps: [item.step] })
      }
    }
  }
  return groups
}

const TimelineView: FC<{ timeline: CopilotTimelineItem[] }> = ({
  timeline,
}) => (
  <>
    {groupTimeline(timeline).map(group =>
      group.kind === 'text' ? (
        <MarkdownContent key={group.id} content={group.text} />
      ) : (
        <ToolSteps key={group.id} steps={group.steps} />
      )
    )}
  </>
)

// The pending status line mirrors the turn's live edge: a running tool call
// ("Read main.tex:1-5…"), text streaming ("Writing…"), or the model working
// with no output yet ("Thinking…").
function pendingStatusLine(timeline: CopilotTimelineItem[] | undefined): string {
  const running = timeline?.find(
    item => item.kind === 'tool' && item.step.status === 'running'
  )
  if (running?.kind === 'tool') {
    const label = toolStepLabel(running.step)
    return `${label.name}${label.detail ? ` ${label.detail}` : ''}…`
  }
  const tail = timeline?.[timeline.length - 1]
  return tail?.kind === 'text' ? 'Writing…' : 'Thinking…'
}

export const MessageList: FC<{ messages: CopilotMessage[] }> = ({
  messages,
}) => {
  if (messages.length === 0) return null

  return (
    <div className="copilot-message-list">
      {messages.map((msg, i) => {
        if (msg.hidden) return null
        const isUser = msg.role === 'user'
        return (
          <div
            key={i}
            className={`copilot-msg ${isUser ? 'copilot-msg-user' : 'copilot-msg-assistant'}`}
          >
            {isUser ? (
              <div className="copilot-msg-bubble copilot-msg-bubble-user">
                {msg.content}
              </div>
            ) : msg.pending ? (
              <div className="copilot-msg-pending">
                {msg.timeline && <TimelineView timeline={msg.timeline} />}
                <div className="copilot-msg-pending-status">
                  <Spinner />
                  <span>{pendingStatusLine(msg.timeline)}</span>
                </div>
              </div>
            ) : (
              <div className="copilot-msg-body">
                {msg.timeline?.length ? (
                  <TimelineView timeline={msg.timeline} />
                ) : (
                  // Legacy fallback: buffered (non-SSE) responses carry no
                  // timeline — render the payload content directly.
                  msg.content && <MarkdownContent content={msg.content} />
                )}
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
