import assert from 'node:assert/strict'
import test from 'node:test'
import { runCleanupSteps, shutdownEval } from './serviceFactory.js'

test('cleanup continues after one resource throws and does not rethrow', async () => {
  let secondCleanupRan = false
  const previousExitCode = process.exitCode
  process.exitCode = 0
  await runCleanupSteps([
    {
      resource: 'failing test resource',
      cleanup: () => {
        throw new Error('expected test failure')
      },
    },
    {
      resource: 'second test resource',
      cleanup: () => {
        secondCleanupRan = true
      },
    },
  ])
  assert.equal(secondCleanupRan, true)
  assert.equal(process.exitCode, 0)
  process.exitCode = previousExitCode
})

test('evaluation cleanup is safe to call repeatedly', async () => {
  await shutdownEval()
  await shutdownEval()
})
