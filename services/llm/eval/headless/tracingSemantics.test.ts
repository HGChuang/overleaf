import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyFailure,
  EvaluationFailure,
  fallbackForPhase,
} from './failureTaxonomy.js'
import { workspaceHash } from './workspaceState.js'

test('workspace hash is order independent and changes with file content', () => {
  const first = [
    { path: '/main.tex', content: 'before' },
    { path: 'refs.bib', content: 'entry' },
  ]
  const reordered = [first[1], { ...first[0], path: 'main.tex' }]
  const modified = [first[1], { path: 'main.tex', content: 'after' }]

  assert.equal(workspaceHash(first), workspaceHash(reordered))
  assert.notEqual(workspaceHash(first), workspaceHash(modified))
  assert.match(workspaceHash(first), /^[a-f0-9]{64}$/)
})

test('failure taxonomy emits stable categories and error types', () => {
  const model = classifyFailure(
    new Error('provider unavailable'),
    fallbackForPhase('model'),
    'evt_model'
  )
  const compile = classifyFailure(
    new EvaluationFailure('latex failed', {
      category: 'compile',
      phase: 'compile',
      type: 'COMPILE_LATEX_ERROR',
      source: 'latex',
      retryable: false,
    }),
    fallbackForPhase('compile'),
    'evt_compile'
  )

  assert.equal(model.failure_category, 'model')
  assert.equal(model.error_type, 'MODEL_PROVIDER_ERROR')
  assert.equal(model.related_event_id, 'evt_model')
  assert.equal(compile.failure_category, 'compile')
  assert.equal(compile.error_type, 'COMPILE_LATEX_ERROR')
  assert.equal(compile.retryable, false)
})

test('taxonomy covers all required terminal failure domains', () => {
  const explicitCategories = [
    'model',
    'tool',
    'compile',
    'grader',
    'runner',
    'infrastructure',
  ] as const

  for (const category of explicitCategories) {
    const failure = classifyFailure(
      new EvaluationFailure(`${category} failure`, {
        category,
        phase: category,
        type: `${category.toUpperCase()}_TEST_ERROR`,
        source: 'test',
        retryable: false,
      }),
      fallbackForPhase('runner'),
      null
    )
    assert.equal(failure.failure_category, category)
    assert.notEqual(failure.error_type, 'Error')
  }
})
