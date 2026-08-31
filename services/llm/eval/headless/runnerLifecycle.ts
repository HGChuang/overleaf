import { writeJsonAtomic } from './canonicalTrace.js'

export interface JsonArtifactToPersist {
  path: string
  value: unknown
}

export type JsonArtifactWriter = (path: string, value: unknown) => Promise<void>

/**
 * Try every artifact independently. The caller can turn the aggregate error
 * into a structured runner failure while still allowing terminal tracing.
 */
export async function persistJsonArtifacts(
  artifacts: readonly JsonArtifactToPersist[],
  writer: JsonArtifactWriter = writeJsonAtomic,
): Promise<void> {
  const errors: unknown[] = []
  for (const artifact of artifacts) {
    try {
      await writer(artifact.path, artifact.value)
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) {
    throw new AggregateError(
      errors,
      `${errors.length} evaluation artifact(s) could not be persisted`,
    )
  }
}

export interface TrialStatePersistenceHooks {
  runPath: string
  resultPath: string
  buildRun(): unknown
  buildResult(): unknown
  onPersistenceFailure(error: unknown): void
  writer?: JsonArtifactWriter
}

/**
 * Persist the two status-bearing files as one best-effort operation. If one
 * write fails, mark the state as failed and retry both files so a previously
 * successful sibling cannot remain with a stale PASS status.
 */
export async function persistTrialState(
  hooks: TrialStatePersistenceHooks,
): Promise<void> {
  const writer = hooks.writer || writeJsonAtomic
  const writeBoth = async (): Promise<unknown | null> => {
    let firstError: unknown = null
    try {
      await writer(hooks.runPath, hooks.buildRun())
    } catch (error) {
      firstError ||= error
    }
    try {
      await writer(hooks.resultPath, hooks.buildResult())
    } catch (error) {
      firstError ||= error
    }
    return firstError
  }
  const firstError = await writeBoth()
  if (firstError) {
    hooks.onPersistenceFailure(firstError)
    await writeBoth()
  }
}

export interface TrialFinalizationHooks {
  persistArtifacts(): Promise<void>
  onPersistenceFailure(error: unknown): void
  emitTerminal(): Promise<void>
  onTerminalFailure(error: unknown): void
  persistResult(): Promise<void>
}

/**
 * Terminal tracing is attempted after all state persistence that can change
 * the final status. This keeps a writable run/result state consistent with
 * the single terminal event while still making the terminal attempt
 * unconditional after artifact failures.
 */
export async function finalizeTrial(
  hooks: TrialFinalizationHooks,
): Promise<void> {
  try {
    await hooks.persistArtifacts()
  } catch (error) {
    hooks.onPersistenceFailure(error)
  }
  try {
    await hooks.persistResult()
  } catch (error) {
    hooks.onPersistenceFailure(error)
  }
  try {
    await hooks.emitTerminal()
  } catch (error) {
    hooks.onTerminalFailure(error)
  }
}
