import { execFile } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { appendFile, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ArtifactReference {
  path: string
  sha256: string
  bytes: number
}

export interface StructuredFailure {
  failure_phase: string
  error_type: string
  error_source: string
  error_message: string
  retryable: boolean
  related_event_id: string | null
}

export interface CanonicalEventInput {
  event_type: string
  parent_event_id?: string | null
  turn_id?: string | null
  tool_call_id?: string | null
  status?: string
  summary?: Record<string, unknown>
  artifacts?: ArtifactReference[]
  failure?: StructuredFailure
}

export interface CanonicalEvent extends CanonicalEventInput {
  schema_version: 1
  run_id: string
  event_id: string
  parent_event_id: string | null
  timestamp: string
  turn_id: string | null
  tool_call_id: string | null
}

export interface QueuedEvent {
  eventId: string
  committed: Promise<void>
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)])
  )
}

export function hashValue(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export async function gitCommit(cwd: string): Promise<string> {
  if (process.env.EVAL_GIT_COMMIT) return process.env.EVAL_GIT_COMMIT
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })
  return stdout.trim()
}

export async function writeJsonAtomic(
  path: string,
  value: unknown
): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporaryPath, path)
}

export async function artifactReference(
  runDir: string,
  relativePath: string
): Promise<ArtifactReference> {
  const absolutePath = `${runDir}/${relativePath}`
  const [content, metadata] = await Promise.all([
    readFile(absolutePath),
    stat(absolutePath),
  ])
  return {
    path: relativePath,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: metadata.size,
  }
}

export class CanonicalTraceWriter {
  private queue: Promise<void> = Promise.resolve()
  private sequence = 0

  constructor(
    readonly runId: string,
    readonly eventsPath: string
  ) {}

  emit(input: CanonicalEventInput): QueuedEvent {
    const eventId = `evt_${randomUUID()}`
    const event: CanonicalEvent & { sequence: number } = {
      schema_version: 1,
      run_id: this.runId,
      event_id: eventId,
      parent_event_id: input.parent_event_id ?? null,
      timestamp: new Date().toISOString(),
      event_type: input.event_type,
      turn_id: input.turn_id ?? null,
      tool_call_id: input.tool_call_id ?? null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.artifacts ? { artifacts: input.artifacts } : {}),
      ...(input.failure ? { failure: input.failure } : {}),
      sequence: ++this.sequence,
    }
    const line = `${JSON.stringify(event)}\n`
    this.queue = this.queue.then(() =>
      appendFile(this.eventsPath, line, { flag: 'a' })
    )
    return { eventId, committed: this.queue }
  }

  async flush(): Promise<void> {
    await this.queue
  }
}
