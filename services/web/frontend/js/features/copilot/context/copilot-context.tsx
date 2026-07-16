// Central React context for the Overleaf Copilot feature.
//
// Owns: drawer open/close + active tab, per-source conversationIds, message
// streams (ask/write, fix), compile diagnostics, checks issues/summary, and
// the actions that call the /api/v1/copilot/* endpoints. Project context
// (fileList/outline/files) is built server-side by the web layer, so we only
// send `projectId` + conversation/context/compile/checks.

import {
  createContext,
  FC,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import usePersistedState from '@/shared/hooks/use-persisted-state'
import { useProjectContext } from '@/shared/context/project-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useDetachCompileContext } from '@/shared/context/detach-compile-context'
import {
  copilotChat,
  copilotCompileDiagnose,
  copilotRunChecks,
  copilotExplainIssue,
  CopilotError,
} from '../utils/copilot-api'
import type {
  CopilotMessage,
  CopilotTab,
  Diagnostic,
  CheckIssue,
  CheckSummary,
} from '../utils/types'

type Status = 'idle' | 'loading'

interface ContinueSeed {
  tab: CopilotTab
  seedText?: string
  selectionText?: string
}

export interface CopilotContextValue {
  // drawer
  isOpen: boolean
  openCopilot: (tab?: CopilotTab, seed?: ContinueSeed) => void
  closeCopilot: () => void
  setIsOpen: (open: boolean) => void

  // tab + seeding
  activeTab: CopilotTab
  setActiveTab: (tab: CopilotTab) => void
  seedText: string | null
  clearSeed: () => void

  // conversation state
  panelMessages: CopilotMessage[]
  fixMessages: CopilotMessage[]
  diagnostics: Diagnostic[]
  fixSummary: string | null
  issues: CheckIssue[]
  checkSummary: CheckSummary | null
  explainResults: Record<string, CopilotMessage>

  // status + errors
  status: Status
  loadingTab: CopilotTab | null
  error: string | null
  clearError: () => void

  // actions
  sendMessage: (text: string, tab: CopilotTab) => void
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

export const CopilotProvider: FC = ({ children }) => {
  const { _id: projectId } = useProjectContext()
  const editorManager = useEditorManagerContext()
  const compile = useDetachCompileContext()

  // --- persisted state ---
  const [isOpen, setIsOpen] = usePersistedState<boolean>(
    'copilot:open',
    false
  )
  // generate stable conversation ids once (memoised so we don't regenerate
  // every render); persisted so a reload keeps the same conversation
  const panelIdDefault = useMemo(() => genId('conv_panel'), [])
  const fixIdDefault = useMemo(() => genId('conv_fix'), [])
  const checkIdDefault = useMemo(() => genId('conv_check'), [])
  const [panelConversationId] = usePersistedState<string>(
    'copilot:conv:panel',
    panelIdDefault
  )
  const [fixConversationId] = usePersistedState<string>(
    'copilot:conv:fix',
    fixIdDefault
  )
  const [checkConversationId] = usePersistedState<string>(
    'copilot:conv:check',
    checkIdDefault
  )

  // --- ephemeral state ---
  const [activeTab, setActiveTab] = useState<CopilotTab>('ask')
  const [seedText, setSeedText] = useState<string | null>(null)
  const [pendingSelectionText, setPendingSelectionText] = useState<string>('')

  const [panelMessages, setPanelMessages] = useState<CopilotMessage[]>([])
  const [fixMessages, setFixMessages] = useState<CopilotMessage[]>([])
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [fixSummary, setFixSummary] = useState<string | null>(null)
  const [issues, setIssues] = useState<CheckIssue[]>([])
  const [checkSummary, setCheckSummary] = useState<CheckSummary | null>(null)
  const [explainResults, setExplainResults] = useState<
    Record<string, CopilotMessage>
  >({})

  const [status, setStatus] = useState<Status>('idle')
  const [loadingTab, setLoadingTab] = useState<CopilotTab | null>(null)
  const [error, setError] = useState<string | null>(null)

  // abort controllers per action kind
  const chatAbortRef = useRef<AbortController | null>(null)
  const diagnoseAbortRef = useRef<AbortController | null>(null)
  const checksAbortRef = useRef<AbortController | null>(null)
  const explainAbortRef = useRef<AbortController | null>(null)

  const getCurrentFile = useCallback((): string | null => {
    return editorManager.currentDocument?.docName || null
  }, [editorManager])

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
    (tab: CopilotTab = 'ask', seed?: ContinueSeed) => {
      setIsOpen(true)
      setActiveTab(tab)
      setError(null)
      if (seed?.seedText) {
        setSeedText(seed.seedText)
        setPendingSelectionText(seed.selectionText || seed.seedText)
      }
    },
    [setIsOpen]
  )

  const closeCopilot = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  const continueInCopilot = useCallback(
    (seed: ContinueSeed) => {
      openCopilot(seed.tab || 'write', seed)
    },
    [openCopilot]
  )

  const clearSeed = useCallback(() => {
    setSeedText(null)
    setPendingSelectionText('')
  }, [])

  const clearError = useCallback(() => setError(null), [])

  // ----- chat (ask / write) -----
  const sendMessage = useCallback(
    (text: string, tab: CopilotTab) => {
      const content = text.trim()
      if (!content) return

      // abort any in-flight chat
      if (chatAbortRef.current) chatAbortRef.current.abort()
      const controller = new AbortController()
      chatAbortRef.current = controller

      setError(null)
      setStatus('loading')
      setLoadingTab(tab)

      const userMessage: CopilotMessage = { role: 'user', content }
      const pendingAssistant: CopilotMessage = {
        role: 'assistant',
        content: '',
        pending: true,
      }
      // ask + write share the panel conversation; fix follow-ups continue the
      // compile conversation (source: compile, fixConversationId)
      const isFix = tab === 'fix'
      const conversationId = isFix ? fixConversationId : panelConversationId
      const source = isFix ? 'compile' : 'panel'
      const setMessages = isFix ? setFixMessages : setPanelMessages
      setMessages(prev => [...prev, userMessage, pendingAssistant])

      const body = {
        projectId,
        conversation: {
          conversationId,
          source,
          tab,
        },
        context: {
          currentFile: getCurrentFile(),
          selectedText: pendingSelectionText || '',
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
            suggestedActions: data.suggestedActions || data.message?.suggestedActions,
          }
          setMessages(prev => [
            ...prev.slice(0, -1), // drop pending placeholder
            assistant,
          ])
          // consume the seed after first use
          if (pendingSelectionText) setPendingSelectionText('')
          if (seedText) setSeedText(null)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            // drop the pending placeholder silently
            setMessages(prev =>
              prev.length && prev[prev.length - 1]?.pending
                ? prev.slice(0, -1)
                : prev
            )
            setStatus('idle')
            setLoadingTab(null)
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
          setLoadingTab(null)
        })
    },
    [
      projectId,
      panelConversationId,
      fixConversationId,
      getCurrentFile,
      pendingSelectionText,
      seedText,
      describeError,
    ]
  )

  // ----- compile diagnose (fix) -----
  const runDiagnose = useCallback(
    () => {
      if (diagnoseAbortRef.current) diagnoseAbortRef.current.abort()
      const controller = new AbortController()
      diagnoseAbortRef.current = controller

      setError(null)
      setStatus('loading')
      setLoadingTab('fix')

      const annotations = (compile.logEntries?.errors || [])
        .filter((e: any) => e)
        .map((e: any) => ({
          file: e.file,
          line: e.line,
          severity: e.level || 'error',
          message: e.message,
        }))

      const body = {
        projectId,
        conversation: {
          conversationId: fixConversationId,
          source: 'compile',
          tab: 'fix',
        },
        compile: {
          status: 'failed',
          logText: compile.rawLog || '',
          annotations,
          clsiServerId: compile.clsiServerId,
        },
        editor: { currentFile: getCurrentFile() },
      }

      copilotCompileDiagnose(body, controller.signal)
        .then(data => {
          setDiagnostics(data.diagnostics || [])
          setFixSummary(data.summary || null)
          setFixMessages([])
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
          setError(describeError(err))
        })
        .finally(() => {
          setStatus('idle')
          setLoadingTab(null)
        })
    },
    [
      projectId,
      fixConversationId,
      compile.rawLog,
      compile.logEntries,
      compile.clsiServerId,
      getCurrentFile,
      describeError,
    ]
  )

  const openCompileDiagnose = useCallback(() => {
    setIsOpen(true)
    setActiveTab('fix')
    setError(null)
    runDiagnose()
  }, [setIsOpen, runDiagnose])

  const regenerateCompileDiagnose = useCallback(() => {
    runDiagnose()
  }, [runDiagnose])

  // ----- checks (run) -----
  const runChecks = useCallback(
    (checks?: string[]) => {
      if (checksAbortRef.current) checksAbortRef.current.abort()
      const controller = new AbortController()
      checksAbortRef.current = controller

      setError(null)
      setStatus('loading')
      setLoadingTab('check')

      const body = {
        projectId,
        conversation: {
          conversationId: checkConversationId,
          source: 'checks',
          tab: 'check',
        },
        checks: checks && checks.length
          ? checks
          : ['citations', 'references', 'figures_tables', 'terminology'],
        options: { includeSuggestions: true },
      }

      copilotRunChecks(body, controller.signal)
        .then(data => {
          setIssues(data.issues || [])
          setCheckSummary(data.summary || null)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
          setError(describeError(err))
        })
        .finally(() => {
          setStatus('idle')
          setLoadingTab(null)
        })
    },
    [projectId, checkConversationId, describeError]
  )

  // ----- checks (explain) -----
  const explainIssue = useCallback(
    (issue: CheckIssue) => {
      if (explainAbortRef.current) explainAbortRef.current.abort()
      const controller = new AbortController()
      explainAbortRef.current = controller

      setError(null)
      setStatus('loading')
      setLoadingTab('check')

      const body = {
        projectId,
        conversation: {
          conversationId: checkConversationId,
          source: 'checks',
          tab: 'check',
        },
        issue: {
          id: issue.id,
          type: issue.type,
          title: issue.title,
          description: issue.description,
          location: issue.location,
        },
      }

      copilotExplainIssue(body, controller.signal)
        .then(data => {
          setExplainResults(prev => ({
            ...prev,
            [issue.id]: data.message || { role: 'assistant', content: '' },
          }))
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
          setError(describeError(err))
        })
        .finally(() => {
          setStatus('idle')
          setLoadingTab(null)
        })
    },
    [projectId, checkConversationId, describeError]
  )

  const value = useMemo<CopilotContextValue>(
    () => ({
      isOpen,
      openCopilot,
      closeCopilot,
      setIsOpen,
      activeTab,
      setActiveTab,
      seedText,
      clearSeed,
      panelMessages,
      fixMessages,
      diagnostics,
      fixSummary,
      issues,
      checkSummary,
      explainResults,
      status,
      loadingTab,
      error,
      clearError,
      sendMessage,
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
      activeTab,
      seedText,
      clearSeed,
      panelMessages,
      fixMessages,
      diagnostics,
      fixSummary,
      issues,
      checkSummary,
      explainResults,
      status,
      loadingTab,
      error,
      clearError,
      sendMessage,
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
