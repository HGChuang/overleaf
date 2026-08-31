import { createInterface, type Interface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { ReplacementHunk } from '../headless/replacementPatch.js'

export const EVAL_PROTOCOL_PREFIX = '__OVERLEAF_EVAL_PROTOCOL_V1__'

export interface EvalUserProtocolEvent {
  protocol: 'overleaf-eval-user/v1'
  type: 'patch_decision_required' | 'turn_decision_required'
  case_id: string
  user_turn: number
  copilot_response: string
  patch_preview?: ReplacementHunk[]
  workspace_hash: string
}

export interface EvalUserDecision {
  continue_conversation: boolean
  user_message: string
  termination_reason: string
  patch_decision?: 'accept' | 'reject'
}

export const DEFAULT_EVAL_USER_PROTOCOL_TIMEOUT_MS = 120_000

/** A missing eval_user response is a runner failure, not a model response. */
export class EvalUserProtocolError extends Error {
  readonly code = 'EVAL_USER_TIMEOUT'

  constructor(timeoutMs: number) {
    super(`eval_user protocol response timed out after ${timeoutMs}ms`)
    this.name = 'EvalUserProtocolError'
  }
}

export interface EvalUserProtocolIO {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
}

function configuredTimeoutMs(): number {
  const raw = process.env.EVAL_USER_PROTOCOL_TIMEOUT_MS
  if (raw === undefined || raw === '') return DEFAULT_EVAL_USER_PROTOCOL_TIMEOUT_MS
  const timeoutMs = Number(raw)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      'EVAL_USER_PROTOCOL_TIMEOUT_MS must be a positive number of milliseconds',
    )
  }
  return timeoutMs
}

export function validateEvalUserDecision(
  value: unknown,
  eventType: EvalUserProtocolEvent['type'],
): EvalUserDecision {
  if (!value || typeof value !== 'object') {
    throw new Error('eval_user decision must be a JSON object')
  }
  const decision = value as Record<string, unknown>
  if (typeof decision.continue_conversation !== 'boolean') {
    throw new Error('eval_user decision requires continue_conversation')
  }
  if (typeof decision.user_message !== 'string') {
    throw new Error('eval_user decision requires a string user_message')
  }
  if (typeof decision.termination_reason !== 'string') {
    throw new Error('eval_user decision requires a string termination_reason')
  }
  if (
    decision.continue_conversation &&
    !decision.user_message.trim() &&
    eventType === 'turn_decision_required'
  ) {
    throw new Error('continuing eval_user decision requires a user_message')
  }
  if (eventType === 'patch_decision_required') {
    if (!['accept', 'reject'].includes(String(decision.patch_decision))) {
      throw new Error('patch decision must be accept or reject')
    }
    if (
      decision.patch_decision === 'reject' &&
      (!decision.continue_conversation || !decision.user_message.trim())
    ) {
      throw new Error('rejected patch requires continuing user feedback')
    }
  }
  return decision as unknown as EvalUserDecision
}

export class DynamicEvalUserProtocol {
  private readonly readline: Interface
  private readonly output: NodeJS.WritableStream
  private readonly timeoutMs: number
  private closed = false

  constructor(
    timeoutMs = configuredTimeoutMs(),
    io: EvalUserProtocolIO = { input: stdin, output: stdout },
  ) {
    this.timeoutMs = timeoutMs
    this.output = io.output
    this.readline = createInterface({ input: io.input, output: io.output })
  }

  async request(event: EvalUserProtocolEvent): Promise<EvalUserDecision> {
    if (this.closed) throw new Error('eval_user protocol is closed')
    this.output.write(`${EVAL_PROTOCOL_PREFIX}${JSON.stringify(event)}\n`)
    let timeout: NodeJS.Timeout | undefined
    const line = await Promise.race([
      this.readline.question(''),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          this.close()
          reject(new EvalUserProtocolError(this.timeoutMs))
        }, this.timeoutMs)
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout)
    })
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (error) {
      throw new Error(
        `eval_user returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return validateEvalUserDecision(parsed, event.type)
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.readline.close()
  }

  get isClosed() {
    return this.closed
  }
}
