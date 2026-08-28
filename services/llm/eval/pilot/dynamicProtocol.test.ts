import assert from 'node:assert/strict'
import test from 'node:test'
import { validateEvalUserDecision } from './dynamicProtocol.js'

test('dynamic eval_user turn requires a message when continuing', () => {
  assert.throws(
    () =>
      validateEvalUserDecision(
        {
          continue_conversation: true,
          user_message: '',
          termination_reason: 'continue',
        },
        'turn_decision_required',
      ),
    /requires a user_message/,
  )
})

test('rejected patch requires natural follow-up feedback', () => {
  assert.throws(
    () =>
      validateEvalUserDecision(
        {
          continue_conversation: false,
          user_message: '',
          termination_reason: 'reject',
          patch_decision: 'reject',
        },
        'patch_decision_required',
      ),
    /requires continuing user feedback/,
  )
})

test('accepted patch decision can continue to automatic verification', () => {
  assert.deepEqual(
    validateEvalUserDecision(
      {
        continue_conversation: false,
        user_message: '',
        termination_reason: 'accept preview',
        patch_decision: 'accept',
      },
      'patch_decision_required',
    ),
    {
      continue_conversation: false,
      user_message: '',
      termination_reason: 'accept preview',
      patch_decision: 'accept',
    },
  )
})
