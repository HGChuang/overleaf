import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUnifiedSystemPrompt } from '../../app/agent/prompts.js'

test('edit prompt requires minimal semantic patch planning', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file', 'submit_patch'])

  assert.match(prompt, /MINIMAL SEMANTIC PATCH PLANNING/)
  assert.match(prompt, /root-cause definition\/command/)
  assert.match(prompt, /Change only what is required/)
  assert.match(prompt, /smallest in-place repair/)
  assert.match(prompt, /do not substitute a stylistically nicer equivalent/)
})

test('minimal semantic patch planning is absent without submit_patch', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file'])

  assert.doesNotMatch(prompt, /MINIMAL SEMANTIC PATCH PLANNING/)
})
