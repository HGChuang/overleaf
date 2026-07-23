// Central React context for the Overleaf Copilot feature.
//
// Owns: pane open/close, a single unified conversation (one conversationId —
// the backend keys memory by conversationId, so every question shares one
// thread), the unified message stream, the editor selection chip, and the
// action that calls the /api/v1/copilot/chat endpoint. Project context
// (fileList/outline/files) is built server-side by the web layer, so we only
// send `projectId` + conversation/context/message.

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
import { copilotChatStream, CopilotError } from '../utils/copilot-api'
import type { CompileErrorEntry, CopilotMessage } from '../utils/types'

type Status = 'idle' | 'loading'

// Caps mirror the llm-side normalization (context.service.ts).
const MAX_COMPILE_ERRORS = 20
const MAX_COMPILE_ERROR_MESSAGE = 300
// Loop bound for the self-healing cycle: at most this many automatic
// post-accept verification turns per conversation.
const MAX_AUTO_VERIFY_PER_CONVERSATION = 3

export interface CopilotSelection {
  file: string | null
  fromLine: number
  toLine: number
  text: string
}

interface ContinueSeed {
  seedText?: string
}

export interface CopilotContextValue {
  // pane
  isOpen: boolean
  openCopilot: (seed?: ContinueSeed) => void
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

  // status + errors
  status: Status
  error: string | null
  clearError: () => void

  // actions
  sendMessage: (text: string) => void
  startNewChat: () => void
  continueInCopilot: (seed: ContinueSeed) => void
  // called by PatchBlock after a patch was applied — may trigger an
  // automatic compile-verification turn (self-healing loop)
  notifyPatchAccepted: () => void
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
  // Compile state of the user's last compile (parsed log entries) — pushed to
  // the agent as structured errors so compile-fix turns start from the real
  // log, not from source-guessing (self-healing loop, input half).
  const { logEntries } = useDetachCompileContext()

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
  const [error, setError] = useState<string | null>(null)

  // abort controller for the in-flight chat request
  const chatAbortRef = useRef<AbortController | null>(null)

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

  // Latest compile errors, normalized to the wire shape (parser `line` can be
  // a string; force number|null). Read via ref inside sendMessage so the
  // callback identity stays stable across compiles.
  const compileErrorsRef = useRef<CompileErrorEntry[]>([])
  useEffect(() => {
    const errors = (logEntries?.errors || [])
      .slice(0, MAX_COMPILE_ERRORS)
      .map((entry: any) => ({
        file: typeof entry?.file === 'string' ? entry.file : null,
        line: Number.isFinite(Number(entry?.line)) ? Number(entry.line) : null,
        message: String(entry?.message || '').slice(
          0,
          MAX_COMPILE_ERROR_MESSAGE
        ),
      }))
    compileErrorsRef.current = errors
  }, [logEntries])

  // Self-healing loop bookkeeping: did the last sent turn carry compile
  // errors (i.e. is this a compile-fix conversation), and how many automatic
  // verification turns have we already fired for this conversation.
  const lastSentCompileErrorCountRef = useRef(0)
  const autoVerifyCountRef = useRef(0)

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
    (seed?: ContinueSeed) => {
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
      openCopilot(seed)
    },
    [openCopilot]
  )

  const clearSeed = useCallback(() => setSeedText(null), [])
  const clearSelection = useCallback(() => setSelection(null), [])
  const clearError = useCallback(() => setError(null), [])

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
    lastSentCompileErrorCountRef.current = 0
    autoVerifyCountRef.current = 0
    if (chatAbortRef.current) chatAbortRef.current.abort()
  }, [setConversationId])

  // ----- chat -----
  const sendMessage = useCallback(
    (text: string) => {
      const content = text.trim()
      if (!content) return

      if (chatAbortRef.current) chatAbortRef.current.abort()
      const controller = new AbortController()
      chatAbortRef.current = controller

      setError(null)
      setStatus('loading')

      const userMessage: CopilotMessage = { role: 'user', content }
      const pendingAssistant: CopilotMessage = {
        role: 'assistant',
        content: '',
        pending: true,
      }
      setMessages(prev => [...prev, userMessage, pendingAssistant])

      const sel = selectionRef.current
      const compileErrors = compileErrorsRef.current
      lastSentCompileErrorCountRef.current = compileErrors.length
      const body = {
        projectId,
        conversation: { conversationId, source: 'panel' },
        context: {
          currentFile: getCurrentFileRef.current(),
          selectedText: sel?.text || '',
          attachedFiles: [] as string[],
          ...(compileErrors.length ? { compileErrors } : {}),
        },
        message: { role: 'user', content },
      }

      copilotChatStream(body, {
        signal: controller.signal,
        onEvent: event => {
          // Mid-turn updates land on the pending assistant placeholder:
          // text deltas accumulate into its content; tool activity replaces
          // the "Thinking…" label until the terminal `done` swaps in the
          // final message (patch blocks included).
          if (event.type === 'text_delta') {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (!last?.pending) return prev
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + event.delta },
              ]
            })
          } else if (event.type === 'tool_start') {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (!last?.pending) return prev
              return [
                ...prev.slice(0, -1),
                { ...last, toolActivity: event.toolName },
              ]
            })
          } else if (event.type === 'tool_end') {
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (!last?.pending) return prev
              return [...prev.slice(0, -1), { ...last, toolActivity: undefined }]
            })
          }
        },
      })
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
        })
    },
    [projectId, conversationId, describeError]
  )

  // ----- self-healing loop: post-accept auto-verification -----
  // Called by PatchBlock after the patch's hunks were applied to the editor
  // (they sync to the server via sharejs). When this conversation's last turn
  // carried compile errors, fire ONE automatic follow-up turn asking the
  // agent to verify via compile_project — closing the fix→verify loop.
  // Bounded per conversation; a turn already in flight suppresses the trigger.
  const notifyPatchAccepted = useCallback(() => {
    if (status === 'loading') return
    if (!lastSentCompileErrorCountRef.current) return
    if (autoVerifyCountRef.current >= MAX_AUTO_VERIFY_PER_CONVERSATION) return
    autoVerifyCountRef.current += 1
    sendMessage(
      '[自动验证] 补丁已应用。请调用 compile_project 触发重新编译：若仍有错误，请用 read_file_fragment 定位后继续修复并提交新 patch；若编译通过（errorCount 为 0），请简短确认修复成功。'
    )
  }, [status, sendMessage])

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
      status,
      error,
      clearError,
      sendMessage,
      startNewChat,
      continueInCopilot,
      notifyPatchAccepted,
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
      status,
      error,
      clearError,
      sendMessage,
      startNewChat,
      continueInCopilot,
      notifyPatchAccepted,
    ]
  )

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  )
}
