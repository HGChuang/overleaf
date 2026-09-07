// The unified Copilot chat view. Handles project Q&A and structured
// generation (abstracts, tables, formulas, algorithms) in one conversation.
// Suggestion chips send prompts as ordinary chat messages. Editor selection
// is surfaced as a chip in the composer and sent as context.

import { FC, useEffect, useRef, useState } from 'react'
import { useCopilotContext } from '../context/copilot-context'
import MessageList from './message-list'
import Composer from './composer'
import { copilotCompact, copilotDecideMemory, copilotGetContext, copilotGetMemories } from '../utils/copilot-api'
import { useProjectContext } from '@/shared/context/project-context'

interface Chip {
  label: string
  onClick: () => void
  disabled?: boolean
}

export const ChatView: FC = () => {
  const {
    messages,
    status,
    contextStatus,
    hasEarlierMessages,
    loadEarlierMessages,
    seedText,
    clearSeed,
    selection,
    clearSelection,
    sendMessage,
    conversationId,
  } = useCopilotContext()
  const { _id: projectId } = useProjectContext()
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null)
  const [memories, setMemories] = useState<any[]>([])
  const [memoryEdits, setMemoryEdits] = useState<Record<string, string>>({})

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Pin to the bottom on every message update — `messages` changes identity
  // on each streamed delta, so this also tracks the timeline as it grows
  // (length/status alone only fired on message count / turn boundaries).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, status])

  const loading = status === 'loading'

  const chips: Chip[] = [
    {
      label: '总结项目结构',
      onClick: () =>
        sendMessage('总结一下这个项目的结构，并告诉我 main 文件可能是哪一个'),
    },
    {
      label: '生成摘要',
      onClick: () => sendMessage('根据当前论文内容生成一段 abstract'),
    },
    {
      label: '生成表格',
      onClick: () => sendMessage('根据当前内容生成一个 LaTeX 表格'),
    },
    { label: '生成公式', onClick: () => sendMessage('生成一个 LaTeX 公式') },
    {
      label: '生成算法',
      onClick: () => sendMessage('生成一个 LaTeX algorithm 环境'),
    },
  ]

  const isEmpty = messages.length === 0
  const refreshDiagnostics = () => Promise.all([
    copilotGetContext(conversationId, projectId),
    copilotGetMemories(projectId),
  ]).then(([context, saved]) => {
    setDiagnostics(context)
    setMemories(saved)
    setDiagnosticError(null)
  }).catch(error => setDiagnosticError(error.message))
  const latestMetric = diagnostics?.metrics?.[0]
  const cacheUsage = latestMetric?.usageCompleteness === 'complete'
    ? `${latestMetric.cacheRead || 0} read / ${latestMetric.cacheWrite || 0} written`
    : 'unknown (provider did not return complete cache usage)'

  return (
    <div className="copilot-tab-content copilot-tab-chat">
      <div className="copilot-tab-scroll" ref={scrollRef}>
        {hasEarlierMessages && (
          <button type="button" onClick={loadEarlierMessages} disabled={loading}>
            加载更早的消息
          </button>
        )}
        {isEmpty ? (
          <div className="copilot-empty">
            <div className="copilot-empty-title">Ask Copilot</div>
            <div className="copilot-empty-sub">
              Ask about the project, or generate abstracts, tables, formulas,
              and algorithms. Select text in the editor to include it as
              context.
            </div>
            <div className="copilot-chips">
              {chips.map(c => (
                <button
                  key={c.label}
                  className="copilot-chip"
                  onClick={c.onClick}
                  disabled={c.disabled}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {contextStatus && <div role="status" aria-live="polite">{contextStatus}</div>}

      <details className="copilot-context-details">
        <summary onClick={() => {
          if (!diagnostics) refreshDiagnostics()
        }}>上下文与费用</summary>
        {diagnosticError && <p role="alert">{diagnosticError}</p>}
        {diagnostics && <div>
          <p>Epoch {diagnostics.generation} · 事件 {diagnostics.eventHead} · 已压缩至 {diagnostics.coveredThroughSeq}</p>
          <p>作者要求 {diagnostics.checkpoint?.authorRequests?.length || 0} · 读取证据 {diagnostics.checkpoint?.toolLedger?.filter((entry: any) => entry.source)?.length || 0} · 补丁 {diagnostics.checkpoint?.patches?.length || 0} · 验证 {diagnostics.checkpoint?.verifications?.length || 0}</p>
          {diagnostics.paperIndex && <p>论文索引 {diagnostics.paperIndex.sourceWindows} 个原文窗口 · 已审核 {diagnostics.paperIndex.reviewedWindows} · 旧版本审核 {diagnostics.paperIndex.staleReviews} · 语义检索 {diagnostics.paperIndex.semanticStatus}</p>}
          {latestMetric && <div>
            <p>最近请求：估算输入 {latestMetric.estimatedInput ?? 'unknown'} · 供应商输入 {latestMetric.reportedInput ?? 'unknown'} · 输出 {latestMetric.output ?? 'unknown'}</p>
            <p>KV/prompt cache：{cacheUsage} · 费用 {typeof latestMetric.cost === 'number' ? latestMetric.cost.toFixed(6) : 'unknown'} · TTFT {latestMetric.ttftMs ?? 'unknown'} ms · 原因 {latestMetric.reason || 'ordinary'}</p>
          </div>}
          {!latestMetric && <p>尚无模型 usage。缓存命中必须以供应商 usage 为准。</p>}
          <p>冻结前缀 {diagnostics.immutablePrefixHash ? diagnostics.immutablePrefixHash.slice(0, 16) : '尚未建立'}；它用于检查稳定性，不代表缓存已经命中。</p>
          <button type="button" disabled={loading} onClick={refreshDiagnostics}>刷新诊断</button>{' '}
          <button type="button" disabled={loading} onClick={() => copilotCompact(conversationId, projectId)
            .then(refreshDiagnostics)
            .catch(error => setDiagnosticError(error.message))}>立即整理上下文</button>
          <h4>长期论文记忆</h4>
          {memories.length === 0 && <p>暂无记忆。</p>}
          {memories.map(memory => <div key={memory.id}>
            <input aria-label={`记忆内容 ${memory.id}`} maxLength={1000}
              value={memoryEdits[memory.id] ?? memory.value}
              onChange={event => setMemoryEdits(values => ({ ...values, [memory.id]: event.target.value }))} />
            <span> · {memory.scope} · {memory.status}</span>
            {memory.status === 'candidate' && <button type="button" onClick={() =>
              copilotDecideMemory(projectId, memory.id, 'confirm', memoryEdits[memory.id] ?? memory.value).then(updated =>
                setMemories(items => items.map(item => item.id === updated.id ? updated : item))
              ).catch(error => setDiagnosticError(error.message))}>确认</button>}
            {memory.status === 'confirmed' && memoryEdits[memory.id] !== undefined && memoryEdits[memory.id] !== memory.value &&
              <button type="button" onClick={() =>
                copilotDecideMemory(projectId, memory.id, 'confirm', memoryEdits[memory.id]).then(updated =>
                  setMemories(items => items.map(item => item.id === updated.id ? updated : item))
                ).catch(error => setDiagnosticError(error.message))}>保存</button>}
            <button type="button" onClick={() => copilotDecideMemory(projectId, memory.id, 'delete').then(() =>
              setMemories(items => items.filter(item => item.id !== memory.id))
            ).catch(error => setDiagnosticError(error.message))}>删除</button>
          </div>)}
        </div>}
      </details>

      <Composer
        onSend={text => sendMessage(text)}
        disabled={loading}
        placeholder="Ask a question or describe what to write…"
        seedText={seedText}
        onClearSeed={clearSeed}
        selection={selection}
        onClearSelection={clearSelection}
      />
    </div>
  )
}

export default ChatView
