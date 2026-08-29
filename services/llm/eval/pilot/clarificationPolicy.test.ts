import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUnifiedSystemPrompt } from '../../app/agent/prompts.js'

test('edit prompt requires clarification before choosing among material target alternatives', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file', 'submit_patch'])

  assert.match(prompt, /CLARIFICATION BEFORE EDITS/)
  assert.match(prompt, /overrides the Base preference/)
  assert.match(prompt, /multiple reasonable target sets/)
  assert.match(prompt, /Do not choose an inferred default/)
  assert.match(prompt, /do not edit all candidates/)
  assert.match(prompt, /BEFORE calling `submit_patch`/)
})

test('edit prompt preserves fast execution for uniquely scoped and explicit global edits', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file', 'submit_patch'])

  assert.match(prompt, /explicitly requests all matching locations/)
  assert.match(prompt, /uniquely names a file or object/)
  assert.match(prompt, /all required parts of one uniquely scoped change/)
  assert.match(prompt, /proceed promptly/)
})

test('clarification edit policy is absent when submit_patch is unavailable', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file'])

  assert.doesNotMatch(prompt, /CLARIFICATION BEFORE EDITS/)
})
