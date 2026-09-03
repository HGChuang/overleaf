import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUnifiedSystemPrompt } from '../../app/agent/prompts.js'

test('edit prompt requires latex definition-side repair policy', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file', 'submit_patch'])

  assert.match(prompt, /LATEX DEFINITION-SIDE REPAIR/)
  assert.match(prompt, /\\renewcommand/)
  assert.match(prompt, /\\renewenvironment/)
  assert.match(prompt, /module-specific name or counter/)
  assert.match(prompt, /Do not add a package to the preamble/)
})

test('latex definition-side repair policy is absent without submit_patch', () => {
  const prompt = buildUnifiedSystemPrompt({}, ['read_file'])

  assert.doesNotMatch(prompt, /LATEX DEFINITION-SIDE REPAIR/)
})
