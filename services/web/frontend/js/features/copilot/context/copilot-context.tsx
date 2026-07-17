// Central React context for the Overleaf Copilot feature.
//
// Owns: pane open/close, a single unified conversation (one conversationId —
// the backend keys memory by conversationId, so chat + diagnose + checks +
// explain all share one thread, and a follow-up after a diagnose inherits the
// diagnose tool-call memory), the unified message stream (ask/write Q&A,
// folded-in compile diagnostics and checks issues), the editor selection chip,
// and the actions that call the /api/v1/copilot/* endpoints. Project context
// (fileList/outline/files) is built server-side by the web layer, so we only
// send `projectId` + conversation/context/compile/checks.

import {
  createContext,
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import usePersistedState from '@/shared/hooks/use-persisted-state'
import { useProjectContext } from '@/shared/context/project-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import { copilotChat, CopilotError } from '../utils/copilot-api'
import type {
  CopilotMessage,
  CopilotTab,
  CheckIssue,
} from '../utils/types'

type Status = 'idle' | 'loading'
type LoadingAction = 'chat' | 'diagnose' | 'checks' | 'explain' | null

export interface CopilotSelection {
  file: string | null
  fromLine: number
  toLine: number
  text: string
}

interface ContinueSeed {
  tab?: CopilotTab
  seedText?: string
}

export interface CopilotContextValue {
  // pane
  isOpen: boolean
  openCopilot: (tab?: CopilotTab, seed?: ContinueSeed) => void
  closeCopilot: () => void
  setIsOpen: (open: boolean) => void

  // seeding (Continue in Copilot pre-fill prompt)
  seedText: string | null
  clearSeed: () => void

  // editor selection chip
  selection: CopilotSelection | null
  clearSelection: () => void

  // unified conversation
  conversationId: string
  messages: CopilotMessage[]
  hasCompileLog: boolean

  // status + errors
  status: Status
  loadingAction: LoadingAction
  error: string | null
  clearError: () => void

  // actions
  sendMessage: (text: string, tab?: CopilotTab) => void
  startNewChat: () => void
  openCompileDiagnose: () => void
  regenerateCompileDiagnose: () => void
  runChecks: (checks?: string[]) => void
  explainIssue: (issue: CheckIssue) => void
  continueInCopilot: (seed: ContinueSeed) => void
}

export const CopilotContext = createContext<CopilotContextValue | undefined>(
  undefined
)

export function useCopilotContext(): CopilotContextValue {
  const ctx = useContext(CopilotContext)
  if (!ctx) {
    throw new Error('useCopilotContext is only available inside CopilotProvider')
  }
  return ctx
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

// Remove the last diagnose turn (synthetic user "Explain…" + assistant with
// diagnostic blocks) from the stream — used by "regenerate".
function trimLastDiagnoseTurn(messages: CopilotMessage[]): CopilotMessage[] {
  let idx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (
      m.role === 'assistant' &&
      m.blocks?.some(b => b.type === 'diagnostic')
    ) {
      idx = i
      break
    }
  }
  if (idx === -1) return messages
  const start =
    idx > 0 && messages[idx - 1].role === 'user' ? idx - 1 : idx
  return [...messages.slice(0, start), ...messages.slice(idx + 1)]
}

export const CopilotProvider: FC = ({ children }) => {
  const { _id: projectId } = useProjectContext()
  const editorManager = useEditorManagerContext()
  const compile = useDetachCompileContext()

  // --- persisted state ---
  const [isOpen, setIsOpen] = usePersistedState<boolean>('copilot:open', false)
  const conversationIdDefault = useMemo(() => genId('conv_panel'), [])
  const [conversationId, setConversationId] = usePersistedState<string>(
    'copilot:conv:panel',
    conversationIdDefault
  )

  // --- ephemeral state ---
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [seedText, setSeedText] = useState<string | null>(null)
  const [selection, setSelection] = useState<CopilotSelection | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
  const [error, setError] = useState<string | null>(null)

  // abort controllers per action kind
  const chatAbortRef = useRef<AbortController | null>(null)
  const diagnoseAbortRef = useRef<AbortController | null>(null)
  const checksAbortRef = useRef<AbortController | null>(null)
  const explainAbortRef = useRef<AbortController | null>(null)

  // refs to read the latest value inside stable callbacks without churning
  // their identity on every selection/seed change.
  const getCurrentFile = useCallback((): string | null => {
    return editorManager.currentDocument?.docName || null
  }, [editorManager])

  const getCurrentFileRef = useRef(getCurrentFile)
  useEffect(() => {
    getCurrentFileRef.current = getCurrentFile
  }, [getCurrentFile])

  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const seedTextRef = useRef(seedText)
  useEffect(() => {
    seedTextRef.current = seedText
  }, [seedText])

  const describeError = useCallback((err: unknown): string => {
    if (err instanceof CopilotError) {
      return err.message || err.code
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return '' // aborted, no error to show
    }
    return (err as Error)?.message || 'Something went wrong. Please try again.'
  }, [])

  // ----- open / close / seed -----
  const openCopilot = useCallback(
    (tab?: CopilotTab, seed?: ContinueSeed) => {
      setIsOpen(true)
      setError(null)
      if (seed?.seedText) {
        setSeedText(seed.seedText)
      }
    },
    [setIsOpen]
  )

  const closeCopilot = useCallback(() => setIsOpen(false), [setIsOpen])

  const continueInCopilot = useCallback(
    (seed: ContinueSeed) => {
      openCopilot(seed.tab || 'ask', seed)
    },
    [openCopilot]
  )

  const clearSeed = useCallback(() => setSeedText(null), [])
  const clearSelection = useCallback(() => setSelection(null), [])
  const clearError = useCallback(() => setError(null), [])

  // whether the latest compile produced a log we can diagnose
  const hasCompileLog =
    Boolean(compile.rawLog) ||
    Boolean((compile.logEntries?.errors || []).length)

  // track the editor selection via the codemirror-editor bridge
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        fromLine: number
        toLine: number
        text: string
      } | null>).detail
      if (!detail || !detail.text) {
        setSelection(null)
        return
      }
      setSelection({
        file: getCurrentFileRef.current(),
        fromLine: detail.fromLine,
        toLine: detail.toLine,
        text: detail.text,
      })
    }
    window.addEventListener('copilot:selection-change', handler as EventListener)
    return () =>
      window.removeEventListener(
        'copilot:selection-change',
        handler as EventListener
      )
  }, [])

  // ----- start new chat -----
  const startNewChat = useCallback(() => {
    setConversationId(genId('conv_panel'))
    setMessages([])
    setError(null)
    setSelection(null)
    setSeedText(null)
    setStatus('idle')
    setLoadingAction(null)
    if (chatAbortRef.current) chatAbortRef.current.abort()
    if (diagnoseAbortRef.current) diagnoseAbortRef.current.abort()
    if (checksAbortRef.current) checksAbortRef.current.abort()
  }, [setConversationId])

  // ----- chat (ask / write) -----
  const sendMessage = useCallback(
    (text: string, tab: CopilotTab = 'ask') => {
      const content = text.trim()
      if (!content) return

      if (chatAbortRef.current) chatAbortRef.current.abort()
      const controller = new AbortController()
      chatAbortRef.current = controller

      setError(null)
      setStatus('loading')
      setLoadingAction('chat')

      const userMessage: CopilotMessage = { role: 'user', content }
      const pendingAssistant: CopilotMessage = {
        role: 'assistant',
        content: '',
        pending: true,
      }
      setMessages(prev => [...prev, userMessage, pendingAssistant])

      const sel = selectionRef.current
      const body = {
        intent: 'chat',
        projectId,
        conversation: { conversationId, source: 'panel', tab },
        context: {
          currentFile: getCurrentFileRef.current(),
          selectedText: sel?.text || '',
          selectionRange: sel
            ? { file: sel.file, fromLine: sel.fromLine, toLine: sel.toLine }
            : null,
          attachedFiles: [] as string[],
          recentCompileErrorId: null,
        },
        message: { role: 'user', content },
      }

      copilotChat(body, controller.signal)
        .then(data => {
          const assistant: CopilotMessage = {
            role: 'assistant',
            content: data.message?.content || '',
            blocks: data.message?.blocks,
            suggestedActions:
              data.suggestedActions || data.message?.suggestedActions,
          }
          setMessages(prev => [...prev.slice(0, -1), assistant])
          if (seedTextRef.current) setSeedText(null)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            setMessages(prev =>
              prev.length && prev[prev.length - 1]?.pending
                ? prev.slice(0, -1)
                : prev
            )
            setStatus('idle')
            setLoadingAction(null)
            return
          }
          const msg = describeError(err)
          if (msg) setError(msg)
          setMessages(prev =>
            prev.length && prev[prev.length - 1]?.pending
              ? prev.slice(0, -1)
              : prev
          )
        })
        .finally(() => {
          setStatus('idle')
          setLoadingAction(null)
        })
    },
    [projectId, conversationId, describeError]
  )

  // Shared helper: append a synthetic user bubble + a pending assistant bubble,
  // POST the unified `/copilot/chat` body, and replace the pending bubble with
  // the resolved assistant message. Every intent returns the same
  // {message, suggestedActions} shape, so the mapping is uniform — structured
  // extras (diagnostic cards, issue lists) ride as message.blocks. Used by
  // diagnose / checks / explain (sendMessage has its own inline copy that also
  // clears the seed prompt on success).
  const runAssistantTurn = useCallback(
  (
    action: Exclude<LoadingAction, null>,
    abortRef: { current: AbortController | null },
    userLabel: string,
    body: Record<string, unknown>
  ) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setStatus('loading')
    setLoadingAction(action)

    setMessages(prev => [
      ...prev,
      { role: 'user', content: userLabel },
      { role: 'assistant', content: '', pending: true },
    ])

    copilotChat(body, controller.signal)
      .then(data => {
        const assistant: CopilotMessage = {
          role: 'assistant',
          content: data.message?.content || '',
          blocks: data.message?.blocks,
          suggestedActions:
            data.suggestedActions || data.message?.suggestedActions,
        }
        setMessages(prev => [...prev.slice(0, -1), assistant])
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          setMessages(prev =>
            prev.length && prev[prev.length - 1]?.pending
              ? prev.slice(0, -1)
              : prev
          )
          setStatus('idle')
          setLoadingAction(null)
          return
        }
        const msg = describeError(err)
        if (msg) setError(msg)
        setMessages(prev =>
          prev.length && prev[prev.length - 1]?.pending
            ? prev.slice(0, -1)
            : prev
        )
      })
      .finally(() => {
        setStatus('idle')
        setLoadingAction(null)
      })
  },
  [describeError]
  )

  // ----- compile diagnose (folded into the chat) -----
  const runDiagnose = useCallback(() => {
    // guard: the compile-diagnose backend requires a log.
    if (
      !compile.rawLog &&
      !((compile.logEntries?.errors || []) as any[]).length
    ) {
      setError(
        'No compile log available. Run a compile that fails, then click "Explain errors" in the compile log.'
      )
      setStatus('idle')
      setLoadingAction(null)
      return
    }

    const annotations = (compile.logEntries?.errors || [])
      .filter((e: any) => e)
      .map((e: any) => ({
        file: e.file,
        line: e.line,
        severity: e.level || 'error',
        message: e.message,
      }))

    runAssistantTurn('diagnose', diagnoseAbortRef, 'Explain the latest compile errors', {
      intent: 'compile-diagnose',
      projectId,
      conversation: { conversationId, source: 'compile', tab: 'fix' },
      compile: {
        status: 'failed',
        logText: compile.rawLog || '',
        annotations,
        clsiServerId: compile.clsiServerId,
      },
      editor: { currentFile: getCurrentFileRef.current() },
    })
  }, [
    compile.rawLog,
    compile.logEntries,
    compile.clsiServerId,
    projectId,
    conversationId,
    runAssistantTurn,
  ])

  const openCompileDiagnose = useCallback(() => {
    setIsOpen(true)
    setError(null)
    runDiagnose()
  }, [setIsOpen, runDiagnose])

  const regenerateCompileDiagnose = useCallback(() => {
    setMessages(prev => trimLastDiagnoseTurn(prev))
    runDiagnose()
  }, [runDiagnose])

  // ----- checks (folded into the chat) -----
  const runChecks = useCallback(
    (checks?: string[]) => {
      runAssistantTurn('checks', checksAbortRef, 'Run checks', {
        intent: 'run-checks',
        projectId,
        conversation: { conversationId, source: 'checks', tab: 'check' },
        checks:
          checks && checks.length
            ? checks
            : ['citations', 'references', 'figures_tables', 'terminology'],
        options: { includeSuggestions: true },
      })
    },
    [projectId, conversationId, runAssistantTurn]
  )

  // ----- checks (explain, folded into the chat) -----
  const explainIssue = useCallback(
    (issue: CheckIssue) => {
      runAssistantTurn('explain', explainAbortRef, `Explain: ${issue.title}`, {
        intent: 'explain-issue',
        projectId,
        conversation: { conversationId, source: 'checks', tab: 'check' },
        issue: {
          id: issue.id,
          type: issue.type,
          title: issue.title,
          description: issue.description,
          location: issue.location,
        },
      })
    },
    [projectId, conversationId, runAssistantTurn]
  )

  const value = useMemo<CopilotContextValue>(
    () => ({
      isOpen,
      openCopilot,
      closeCopilot,
      setIsOpen,
      seedText,
      clearSeed,
      selection,
      clearSelection,
      conversationId,
      messages,
      hasCompileLog,
      status,
      loadingAction,
      error,
      clearError,
      sendMessage,
      startNewChat,
      openCompileDiagnose,
      regenerateCompileDiagnose,
      runChecks,
      explainIssue,
      continueInCopilot,
    }),
    [
      isOpen,
      openCopilot,
      closeCopilot,
      seedText,
      clearSeed,
      selection,
      clearSelection,
      conversationId,
      messages,
      hasCompileLog,
      status,
      loadingAction,
      error,
      clearError,
      sendMessage,
      startNewChat,
      openCompileDiagnose,
      regenerateCompileDiagnose,
      runChecks,
      explainIssue,
      continueInCopilot,
    ]
  )

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  )
}
