import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  artifactReference,
  CanonicalTraceWriter,
  hashValue,
  writeJsonAtomic,
} from './canonicalTrace.js'

test('writes canonical events in append order before a simulated failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eval-trace-'))
  const eventsPath = join(directory, 'events.jsonl')
  const trace = new CanonicalTraceWriter('run_test', eventsPath)

  const started = trace.emit({ event_type: 'trial_started' })
  const model = trace.emit({
    event_type: 'model_started',
    parent_event_id: started.eventId,
    turn_id: 'turn_1',
  })
  await model.committed

  const lines = (await readFile(eventsPath, 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse)
  assert.deepEqual(
    lines.map((event) => event.event_type),
    ['trial_started', 'model_started']
  )
  assert.equal(lines[1].parent_event_id, lines[0].event_id)
  assert.equal(lines[1].turn_id, 'turn_1')
  assert.equal(lines[0].sequence, 1)
  assert.equal(lines[1].sequence, 2)
})

test('writes atomic JSON and content-addressed artifact metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eval-manifest-'))
  await writeJsonAtomic(join(directory, 'run.json'), { run_id: 'run_test' })
  await writeFile(join(directory, 'output.log'), 'compile output\n')

  const manifest = JSON.parse(
    await readFile(join(directory, 'run.json'), 'utf8')
  )
  const artifact = await artifactReference(directory, 'output.log')
  assert.equal(manifest.run_id, 'run_test')
  assert.equal(artifact.path, 'output.log')
  assert.equal(artifact.bytes, 15)
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  assert.equal(hashValue({ b: 2, a: 1 }), hashValue({ a: 1, b: 2 }))
})
