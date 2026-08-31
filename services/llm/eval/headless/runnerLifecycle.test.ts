import assert from 'node:assert/strict'
import test from 'node:test'
import {
  finalizeTrial,
  persistJsonArtifacts,
  persistTrialState,
} from './runnerLifecycle.js'

test('artifact persistence attempts every artifact after one write fails', async () => {
  const attempted: string[] = []
  await assert.rejects(
    persistJsonArtifacts(
      [
        { path: 'first.json', value: 1 },
        { path: 'second.json', value: 2 },
      ],
      async (path) => {
        attempted.push(path)
        if (path === 'first.json') throw new Error('disk full')
      },
    ),
    /could not be persisted/,
  )
  assert.deepEqual(attempted, ['first.json', 'second.json'])
})

test('artifact failure still attempts terminal and result persistence', async () => {
  const calls: string[] = []
  const failures: unknown[] = []
  await finalizeTrial({
    persistArtifacts: async () => {
      calls.push('artifacts')
      throw new Error('snapshot write failed')
    },
    onPersistenceFailure: (error) => failures.push(error),
    emitTerminal: async () => {
      calls.push('terminal')
    },
    onTerminalFailure: (error) => failures.push(error),
    persistResult: async () => {
      calls.push('result')
    },
  })
  assert.deepEqual(calls, ['artifacts', 'result', 'terminal'])
  assert.equal(failures.length, 1)
})

test('terminal failure does not prevent result persistence', async () => {
  const calls: string[] = []
  await finalizeTrial({
    persistArtifacts: async () => calls.push('artifacts'),
    onPersistenceFailure: () => undefined,
    emitTerminal: async () => {
      calls.push('terminal')
      throw new Error('trace unavailable')
    },
    onTerminalFailure: () => calls.push('terminal-error'),
    persistResult: async () => calls.push('result'),
  })
  assert.deepEqual(calls, ['artifacts', 'result', 'terminal', 'terminal-error'])
})

test('result write failure rewrites run.json with the final INFRA status', async () => {
  let status = 'PASS'
  const runStatuses: string[] = []
  const resultStatuses: string[] = []
  let persistenceFailure: unknown = null
  await persistTrialState({
    runPath: 'run.json',
    resultPath: 'result.json',
    buildRun: () => ({ status }),
    buildResult: () => ({ status }),
    onPersistenceFailure: (error) => {
      status = 'INFRA_FAILURE'
      persistenceFailure = error
    },
    writer: async (path, value) => {
      const state = (value as { status: string }).status
      if (path === 'run.json') runStatuses.push(state)
      else resultStatuses.push(state)
      if (path === 'result.json' && resultStatuses.length === 1) {
        throw new Error('result write failed')
      }
    },
  })
  assert.ok(persistenceFailure)
  assert.deepEqual(runStatuses, ['PASS', 'INFRA_FAILURE'])
  assert.deepEqual(resultStatuses, ['PASS', 'INFRA_FAILURE'])
})
