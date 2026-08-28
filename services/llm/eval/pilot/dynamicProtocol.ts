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

  constructor() {
    this.readline = createInterface({ input: stdin, output: stdout })
  }

  async request(event: EvalUserProtocolEvent): Promise<EvalUserDecision> {
    stdout.write(`${EVAL_PROTOCOL_PREFIX}${JSON.stringify(event)}\n`)
    const line = await this.readline.question('')
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
    this.readline.close()
  }
}
