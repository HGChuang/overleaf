import { EvaluationFailure } from '../headless/failureTaxonomy.js'
import type { PilotCase } from './types.js'

export function assertEvalUserFollowupContract(
  caseDefinition: PilotCase,
  userTurn: number,
  decision: { continue_conversation: boolean; user_message: string },
) {
  const contract = caseDefinition.expected_behavior.eval_user_followups?.find(
    (item) => item.user_turn === userTurn,
  )
  if (!contract) return
  const message = decision.user_message.toLowerCase()
  const satisfied =
    decision.continue_conversation &&
    contract.fact_groups.every((group) =>
      group.some((value) => message.includes(value.toLowerCase())),
    )
  if (!satisfied) {
    throw new EvaluationFailure(
      `eval_user turn ${userTurn} violated the benchmark follow-up contract`,
      {
        category: 'infrastructure',
        phase: 'runner',
        type: 'EVAL_USER_CONTRACT_VIOLATION',
        source: 'dynamic_eval_user_protocol',
        retryable: true,
      },
    )
  }
}
