import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  applyReplacementPatch,
  UnsupportedPatchError,
  type ReplacementHunk,
} from './replacementPatch.js'
import {
  buildChatPayload,
  VERIFY_MESSAGE,
  type EvalTask,
} from './evalContext.js'
import type { CompileResult } from './compileRunner.js'
import {
  artifactReference,
  CanonicalTraceWriter,
  gitCommit,
  hashValue,
  writeJsonAtomic,
} from './canonicalTrace.js'
import {
  buildTaskService,
  emptyUsage,
  evalPromptMetadata,
  evalRuntimeConfig,
  shutdownEval,
} from './serviceFactory.js'
import { tracedCompile, type TraceContextAccess } from './tracedCompile.js'
import { workspaceHash } from './workspaceState.js'
import {
  classifyFailure,
  EvaluationFailure,
  fallbackForPhase,
} from './failureTaxonomy.js'
import type { StructuredFailure } from './canonicalTrace.js'

type Status = 'PASS' | 'COPILOT_FAILURE' | 'INFRA_FAILURE'
type JsonRecord = Record<string, unknown>

const userId = process.env.EVAL_USER_ID
const userMessage =
  process.env.EVAL_USER_MESSAGE ||
  '请把正文里的“Hello World”改成“Hello Overleaf”。'
const artifactRoot =
  process.env.EVAL_ARTIFACT_ROOT || '/overleaf/services/llm/eval/artifacts'

function taskDefinition(): EvalTask {
  return {
    id: 'hello-overleaf-replacement',
    mainFile: 'main.tex',
    files: [
      {
        path: 'main.tex',
        content:
          '\\documentclass{article}\n\\newcommand{\\EvalBody}{Hello World}\n\\begin{document}\n\\EvalBody\n\\typeout{EVAL_BODY=\\EvalBody}\n\\end{document}\n',
      },
    ],
  }
}

function getPatch(response: JsonRecord): ReplacementHunk[] | null {
  const message = response.message
  const blocks =
    message && typeof message === 'object'
      ? (message as JsonRecord).blocks
      : null
  const block = Array.isArray(blocks)
    ? blocks.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as JsonRecord).type === 'patch'
      )
    : null
  const patch =
    block && typeof block === 'object' ? (block as JsonRecord).patch : null
  const hunks =
    patch && typeof patch === 'object' ? (patch as JsonRecord).hunks : null
  return Array.isArray(hunks) && hunks.length > 0
    ? (hunks as ReplacementHunk[])
    : null
}

async function run() {
  const task = taskDefinition()
  const startedAt = new Date().toISOString()
  const trialId = process.env.EVAL_TRIAL_ID || `trial_${randomUUID()}`
  const experimentId = process.env.EVAL_EXPERIMENT_ID || 'headless-tracing-p0'
  const runId = `run_${randomUUID()}`
  const runDir = join(
    artifactRoot,
    `${task.id}-${startedAt.replace(/[:.]/g, '-')}-${trialId.slice(-8)}`
  )
  await mkdir(runDir, { recursive: true })

  const eventsPath = join(runDir, 'events.jsonl')
  const trace = new CanonicalTraceWriter(runId, eventsPath)
  const filesRef = { current: task.files.map((file) => ({ ...file })) }
  const before = filesRef.current.map((file) => ({ ...file }))
  const usage = emptyUsage()
  const toolCalls: Record<string, number> = {}
  const started = Date.now()
  const conversationId = `${task.id}-${Date.now().toString(36)}`
  const config = evalRuntimeConfig()
  const initialPayload = buildChatPayload(
    task,
    filesRef.current,
    conversationId,
    userMessage
  )
  const promptMetadata = evalPromptMetadata(initialPayload)
  const manifest: JsonRecord = {
    schema_version: 1,
    run_id: runId,
    experiment_id: experimentId,
    case_id: task.id,
    trial_id: trialId,
    git_commit: await gitCommit(process.cwd()).catch(() => 'unknown'),
    model: { resolution: 'pending' },
    config,
    prompt_hash: promptMetadata.promptHash,
    config_hash: hashValue(config),
    benchmark_hash: hashValue({ id: task.id, mainFile: task.mainFile }),
    fixture_hash: hashValue(task.files),
    initial_workspace_hash: workspaceHash(task.files),
    tool_names: promptMetadata.toolNames,
    started_at: startedAt,
    retry_observability: {
      configured_provider_max_retries: config.provider_max_retries,
      actual_attempts_available: false,
      reason:
        'OpenAI SDK does not expose a public per-attempt retry lifecycle callback',
    },
  }
  await writeJsonAtomic(join(runDir, 'run.json'), manifest)
  await writeJsonAtomic(join(runDir, 'before.json'), before)
  const beforeArtifact = await artifactReference(runDir, 'before.json')

  let currentTurnId: string | null = null
  let currentParentEventId: string | null = null
  let activeCompileToolCallId: string | null = null
  let compileOrdinal = 0
  const traceContext: TraceContextAccess = {
    getTurnId: () => currentTurnId,
    getParentEventId: () => currentParentEventId,
    setParentEventId: (eventId) => {
      currentParentEventId = eventId
    },
    getActiveToolCallId: () => activeCompileToolCallId,
  }

  const trialStarted = trace.emit({
    event_type: 'trial_started',
    summary: {
      experiment_id: experimentId,
      case_id: task.id,
      trial_id: trialId,
      workspace_hash: workspaceHash(filesRef.current),
    },
    artifacts: [beforeArtifact],
  })
  currentParentEventId = trialStarted.eventId
  await trialStarted.committed

  let status: Status = 'INFRA_FAILURE'
  let failure: StructuredFailure | null = null
  let response: JsonRecord | null = null
  let patch: ReplacementHunk[] | null = null
  let compile: CompileResult | null = null
  let transcript: unknown[] = []
  let patchOrdinal = 0
  let failurePhase = 'setup'
  let serviceResources: Awaited<ReturnType<typeof buildTaskService>> | null =
    null
  const toolStartEvents = new Map<string, string>()

  try {
    if (!userId) {
      throw new EvaluationFailure('EVAL_USER_ID is required', {
        category: 'runner',
        phase: 'setup',
        type: 'RUNNER_CONFIGURATION_ERROR',
        source: 'evaluation_harness',
        retryable: false,
      })
    }
    serviceResources = await buildTaskService(filesRef, task.mainFile, usage, {
      trace,
      context: traceContext,
      runDir,
      nextCompileOrdinal: () => ++compileOrdinal,
    })
    manifest.model = await serviceResources.resolveModelMetadata(userId)
    await writeJsonAtomic(join(runDir, 'run.json'), manifest)

    let instruction = userMessage
    for (let turn = 0; turn < 3; turn += 1) {
      currentTurnId = `turn_${turn + 1}`
      failurePhase = 'model'
      response = (await serviceResources.service.chat(
        userId,
        buildChatPayload(task, filesRef.current, conversationId, instruction),
        {
          onEvent: (event) => {
            if (event.type === 'tool_start') {
              const queued = trace.emit({
                event_type: 'tool_started',
                parent_event_id: currentParentEventId,
                turn_id: currentTurnId,
                tool_call_id: event.toolCallId,
                summary: { tool_name: event.toolName, args: event.args },
              })
              toolStartEvents.set(event.toolCallId, queued.eventId)
              currentParentEventId = queued.eventId
              if (event.toolName === 'compile_project') {
                activeCompileToolCallId = event.toolCallId
              }
            } else if (event.type === 'tool_end') {
              const queued = trace.emit({
                event_type: 'tool_completed',
                parent_event_id:
                  toolStartEvents.get(event.toolCallId) ?? currentParentEventId,
                turn_id: currentTurnId,
                tool_call_id: event.toolCallId,
                status: event.isError ? 'error' : 'ok',
                summary: {
                  tool_name: event.toolName,
                  result_summary: event.resultSummary,
                  ...(event.isError
                    ? {
                        failure_category: 'tool',
                        error_type: 'TOOL_EXECUTION_ERROR',
                        error_source: event.toolName,
                      }
                    : {}),
                },
              })
              currentParentEventId = queued.eventId
              toolCalls[event.toolName] = (toolCalls[event.toolName] || 0) + 1
              if (event.toolName === 'compile_project') {
                activeCompileToolCallId = null
              }
            }
          },
        }
      )) as unknown as JsonRecord
      await trace.flush()

      const hunks = getPatch(response)
      if (!hunks) break
      patch = hunks
      failurePhase = 'patch_apply'
      const patchWorkspaceHashBefore = workspaceHash(filesRef.current)
      try {
        const applied = applyReplacementPatch(
          new Map(filesRef.current.map((file) => [file.path, file.content])),
          hunks
        )
        filesRef.current = [...applied.files.entries()].map(
          ([path, content]) => ({
            path,
            content,
          })
        )
      } catch (error) {
        if (error instanceof UnsupportedPatchError) {
          throw new Error(`unsupported replacement patch: ${error.message}`)
        }
        throw error
      }
      const patchWorkspaceHashAfter = workspaceHash(filesRef.current)

      patchOrdinal += 1
      const patchPath = `patches/${String(patchOrdinal).padStart(2, '0')}-patch.json`
      const snapshotPath = `snapshots/${String(patchOrdinal).padStart(2, '0')}-after.json`
      await mkdir(join(runDir, 'patches'), { recursive: true })
      await mkdir(join(runDir, 'snapshots'), { recursive: true })
      await writeJsonAtomic(join(runDir, patchPath), hunks)
      await writeJsonAtomic(join(runDir, snapshotPath), filesRef.current)
      const patchApplied = trace.emit({
        event_type: 'patch_applied',
        parent_event_id: currentParentEventId,
        turn_id: currentTurnId,
        status: 'ok',
        summary: {
          hunk_count: hunks.length,
          files: [...new Set(hunks.map((hunk) => hunk.file).filter(Boolean))],
          workspace_hash_before: patchWorkspaceHashBefore,
          workspace_hash_after: patchWorkspaceHashAfter,
        },
        artifacts: [
          await artifactReference(runDir, patchPath),
          await artifactReference(runDir, snapshotPath),
        ],
      })
      currentParentEventId = patchApplied.eventId
      await patchApplied.committed
      if (process.env.EVAL_INJECT_RUNNER_FAILURE_AFTER_PATCH === '1') {
        failurePhase = 'runner'
        throw new EvaluationFailure('injected runner failure after patch', {
          category: 'runner',
          phase: 'runner',
          type: 'RUNNER_INJECTED_FAILURE',
          source: 'evaluation_harness',
          retryable: false,
        })
      }
      instruction = VERIFY_MESSAGE
    }

    failurePhase = 'artifact'
    transcript = await serviceResources.memoryStore.load(
      serviceResources.service.buildThreadId(userId, conversationId)
    )
    await writeJsonAtomic(join(runDir, 'after.json'), filesRef.current)
    await writeJsonAtomic(join(runDir, 'copilot-response.json'), response)
    await writeJsonAtomic(join(runDir, 'patch.json'), patch)
    await writeJsonAtomic(join(runDir, 'transcript.json'), transcript)
    await writeJsonAtomic(join(runDir, 'tool-calls.json'), toolCalls)

    if (!patch) {
      status = 'COPILOT_FAILURE'
      failure = classifyFailure(
        new EvaluationFailure('Agent did not submit a patch', {
          category: 'model',
          phase: 'model',
          type: 'MODEL_NO_PATCH',
          source: 'copilot',
          retryable: false,
        }),
        fallbackForPhase('model'),
        currentParentEventId
      )
    } else {
      failurePhase = 'compile'
      const compileOutcome = await tracedCompile({
        files: filesRef.current,
        mainFile: task.mainFile,
        purpose: 'final_grading',
        ordinal: ++compileOrdinal,
        runDir,
        trace,
        context: traceContext,
      })
      compile = compileOutcome.result
      await writeJsonAtomic(join(runDir, 'compile.json'), {
        ...compile,
        log: undefined,
      })
      if (compile.log !== null)
        await writeFile(join(runDir, 'output.log'), compile.log)

      if (
        compile.status === 'unavailable' ||
        compile.status.startsWith('http-')
      ) {
        status = 'INFRA_FAILURE'
        failure = classifyFailure(
          new EvaluationFailure(compile.note || compile.status, {
            category: 'infrastructure',
            phase: 'compile',
            type: 'COMPILE_INFRASTRUCTURE_ERROR',
            source: 'clsi',
            retryable: true,
          }),
          fallbackForPhase('compile'),
          compileOutcome.completedEventId
        )
      } else if (compile.status !== 'success') {
        status = 'COPILOT_FAILURE'
        failure = classifyFailure(
          new EvaluationFailure(compile.note || compile.status, {
            category: 'compile',
            phase: 'compile',
            type: 'COMPILE_LATEX_ERROR',
            source: 'latex',
            retryable: false,
          }),
          fallbackForPhase('compile'),
          compileOutcome.completedEventId
        )
      } else {
        failurePhase = 'grader'
        const graderStarted = trace.emit({
          event_type: 'grader_started',
          parent_event_id: currentParentEventId,
          turn_id: currentTurnId,
          summary: { grader: 'hello-overleaf-deterministic-v1' },
        })
        currentParentEventId = graderStarted.eventId
        await graderStarted.committed

        const content =
          filesRef.current.find((file) => file.path === task.mainFile)
            ?.content || ''
        const checks = {
          containsExpected: content.includes('Hello Overleaf'),
          removedOriginal: !content.includes('Hello World'),
          compileSuccess: compile.errorCount === 0,
          compileLogSawExpected:
            compile.log?.includes('EVAL_BODY=Hello Overleaf') === true,
          compileLogDidNotSeeOriginal:
            compile.log?.includes('EVAL_BODY=Hello World') !== true,
        }
        await writeJsonAtomic(join(runDir, 'grader.json'), checks)
        const graderCompleted = trace.emit({
          event_type: 'grader_completed',
          parent_event_id: graderStarted.eventId,
          turn_id: currentTurnId,
          status: Object.values(checks).every(Boolean) ? 'ok' : 'error',
          summary: {
            grader: 'hello-overleaf-deterministic-v1',
            passed: Object.values(checks).every(Boolean),
            checks,
          },
          artifacts: [await artifactReference(runDir, 'grader.json')],
        })
        currentParentEventId = graderCompleted.eventId
        await graderCompleted.committed

        if (Object.values(checks).every(Boolean)) {
          status = 'PASS'
        } else {
          status = 'COPILOT_FAILURE'
          failure = classifyFailure(
            new EvaluationFailure('deterministic grader failed', {
              category: 'grader',
              phase: 'grader',
              type: 'GRADER_ASSERTION_FAILED',
              source: 'deterministic_grader',
              retryable: false,
            }),
            fallbackForPhase('grader'),
            graderCompleted.eventId
          )
        }
      }
    }
  } catch (error) {
    status = 'INFRA_FAILURE'
    failure = classifyFailure(
      error,
      fallbackForPhase(failurePhase),
      currentParentEventId
    )
  } finally {
    if (serviceResources && transcript.length === 0) {
      try {
        transcript = await serviceResources.memoryStore.load(
          serviceResources.service.buildThreadId(userId, conversationId)
        )
        if (transcript.length > 0) {
          await writeJsonAtomic(join(runDir, 'transcript.json'), transcript)
        }
      } catch {
        // The canonical lifecycle trace remains the failure source of truth.
      }
    }

    if (serviceResources) {
      try {
        await shutdownEval()
      } catch (error) {
        if (!failure) {
          status = 'INFRA_FAILURE'
          failure = classifyFailure(
            error,
            {
              category: 'runner',
              phase: 'cleanup',
              type: 'RUNNER_CLEANUP_ERROR',
              source: 'evaluation_harness',
              retryable: true,
            },
            currentParentEventId
          )
        }
      }
    }

    const terminal = trace.emit(
      status === 'PASS'
        ? {
            event_type: 'trial_completed',
            parent_event_id: currentParentEventId,
            turn_id: currentTurnId,
            status: 'ok',
            summary: { status, usage, tool_calls: toolCalls },
          }
        : {
            event_type: 'trial_failed',
            parent_event_id: currentParentEventId,
            turn_id: currentTurnId,
            status: 'error',
            summary: { status, usage, tool_calls: toolCalls },
            failure: failure as StructuredFailure,
          }
    )
    currentParentEventId = terminal.eventId
    await terminal.committed
    await trace.flush()

    const endedAt = new Date().toISOString()
    Object.assign(manifest, { ended_at: endedAt, status, failure })
    await writeJsonAtomic(join(runDir, 'run.json'), manifest)
    await writeJsonAtomic(join(runDir, 'result.json'), {
      runId,
      experimentId,
      caseId: task.id,
      trialId,
      status,
      failure,
      userMessage,
      toolCalls,
      usage,
      wallMs: Date.now() - started,
    })
  }

  process.stdout.write(
    `${JSON.stringify({ runDir, runId, status, failure }, null, 2)}\n`
  )
  process.exitCode = status === 'PASS' ? 0 : 1
}

await run()
