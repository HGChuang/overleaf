import assert from 'node:assert/strict'
import test from 'node:test'
import { EvaluationFailure } from '../headless/failureTaxonomy.js'
import { getPilotCase } from './caseRegistry.js'
import { assertEvalUserFollowupContract } from './evalUserContract.js'

const titleCase = getPilotCase('v3.interaction-title-clarification.v1')

test('eval_user follow-up contract accepts the declared hidden fact', () => {
  assert.doesNotThrow(() =>
    assertEvalUserFollowupContract(titleCase, 2, {
      continue_conversation: true,
      user_message: '请选择 Theoretical Framework，并只修改该标题。',
    }),
  )
})

test('eval_user follow-up contract classifies simulator drift as infrastructure', () => {
  assert.throws(
    () =>
      assertEvalUserFollowupContract(titleCase, 2, {
        continue_conversation: true,
        user_message: '请选择另一个临时候选标题。',
      }),
    (error) =>
      error instanceof EvaluationFailure &&
      error.classification.category === 'infrastructure' &&
      error.classification.type === 'EVAL_USER_CONTRACT_VIOLATION' &&
      error.classification.retryable,
  )
})

test('cases without a follow-up contract remain dynamically simulated', () => {
  const caseDefinition = getPilotCase(
    'v3.interaction2-conference-page-limit-clarification.v1',
  )
  assert.doesNotThrow(() =>
    assertEvalUserFollowupContract(caseDefinition, 2, {
      continue_conversation: false,
      user_message: '',
    }),
  )
})
