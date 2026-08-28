import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  artifactReference,
  type ArtifactReference,
  CanonicalTraceWriter,
  writeJsonAtomic,
} from './canonicalTrace.js'
import { compileFiles, type CompileResult } from './compileRunner.js'

export interface TraceContextAccess {
  getTurnId(): string | null
  getParentEventId(): string | null
  setParentEventId(eventId: string): void
  getActiveToolCallId?(): string | null
}

export async function tracedCompile({
  files,
  mainFile,
  purpose,
  ordinal,
  runDir,
  trace,
  context,
}: {
  files: { path: string; content: string }[]
  mainFile: string
  purpose: 'agent_verification' | 'final_grading'
  ordinal: number
  runDir: string
  trace: CanonicalTraceWriter
  context: TraceContextAccess
}): Promise<{ result: CompileResult; completedEventId: string }> {
  const turnId = context.getTurnId()
  const toolCallId = context.getActiveToolCallId?.() ?? null
  const started = trace.emit({
    event_type: 'compile_started',
    parent_event_id: context.getParentEventId(),
    turn_id: turnId,
    tool_call_id: toolCallId,
    summary: { purpose, compiler: 'pdflatex', main_file: mainFile },
  })
  context.setParentEventId(started.eventId)
  await started.committed

  const result = await compileFiles(files, mainFile)
  const artifactDirectory = 'compiles'
  const baseName = `${String(ordinal).padStart(2, '0')}-${purpose.replace(/_/g, '-')}`
  const jsonPath = `${artifactDirectory}/${baseName}.json`
  const logPath = `${artifactDirectory}/${baseName}.log`
  await mkdir(join(runDir, artifactDirectory), { recursive: true })
  await writeJsonAtomic(join(runDir, jsonPath), { ...result, log: undefined })
  const artifacts: ArtifactReference[] = [
    await artifactReference(runDir, jsonPath),
  ]
  if (result.log !== null) {
    await writeFile(join(runDir, logPath), result.log)
    artifacts.push(await artifactReference(runDir, logPath))
  }

  const failed =
    result.status === 'unavailable' ||
    result.status.startsWith('http-') ||
    result.status !== 'success'
  const completed = trace.emit({
    event_type: 'compile_completed',
    parent_event_id: started.eventId,
    turn_id: turnId,
    tool_call_id: toolCallId,
    status: failed ? 'error' : 'ok',
    summary: {
      purpose,
      compile_status: result.status,
      error_count: result.errorCount,
      warning_count: result.warningCount,
      note: result.note,
    },
    artifacts,
  })
  context.setParentEventId(completed.eventId)
  await completed.committed
  return { result, completedEventId: completed.eventId }
}
