import assert from 'node:assert/strict'
import test from 'node:test'
import { PassThrough, Writable } from 'node:stream'
import {
  DynamicEvalUserProtocol,
  EvalUserProtocolError,
  validateEvalUserDecision,
} from './dynamicProtocol.js'

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

test('dynamic protocol timeout closes readline and reports a structured timeout', async () => {
  const input = new PassThrough()
  const output = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  const protocol = new DynamicEvalUserProtocol(10, { input, output })

  await assert.rejects(
    protocol.request({
      protocol: 'overleaf-eval-user/v1',
      type: 'turn_decision_required',
      case_id: 'timeout-test',
      user_turn: 1,
      copilot_response: '等待用户决定',
      workspace_hash: 'hash',
    }),
    (error: unknown) =>
      error instanceof EvalUserProtocolError &&
      error.code === 'EVAL_USER_TIMEOUT',
  )
  assert.equal(protocol.isClosed, true)
  protocol.close()
  input.destroy()
  output.destroy()
})
