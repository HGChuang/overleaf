import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  applyReplacementPatch,
  UnsupportedPatchError,
  type ReplacementHunk,
} from '../headless/replacementPatch.js'
import { buildChatPayload, VERIFY_MESSAGE } from '../headless/evalContext.js'
import type { CompileResult } from '../headless/compileRunner.js'
import {
  artifactReference,
  CanonicalTraceWriter,
  gitCommit,
  hashValue,
  writeJsonAtomic,
  type StructuredFailure,
} from '../headless/canonicalTrace.js'
import {
  buildTaskService,
  emptyUsage,
  evalPromptMetadata,
  evalRuntimeConfig,
  shutdownEval,
} from '../headless/serviceFactory.js'
import {
  tracedCompile,
  type TraceContextAccess,
} from '../headless/tracedCompile.js'
import { workspaceHash } from '../headless/workspaceState.js'
import {
  classifyFailure,
  EvaluationFailure,
  fallbackForPhase,
} from '../headless/failureTaxonomy.js'
import { getPilotCase, validatePilotCase } from './caseRegistry.js'
import { gradePilotCase } from './graderRegistry.js'
import type { PilotGradeContext, PilotResponse } from './types.js'

type Status =
  'PASS' | 'COPILOT_FAILURE' | 'INFRA_FAILURE' | 'INVALID' | 'SKIPPED'
type JsonRecord = Record<string, unknown>

const artifactRoot =
  process.env.EVAL_ARTIFACT_ROOT ||
  '/overleaf/services/llm/eval/artifacts/pilot'

function responseText(response: JsonRecord): string {
  const message = response.message
  if (!message || typeof message !== 'object') return ''
  const content = (message as JsonRecord).content
  if (typeof content === 'string') return content
  const blocks = (message as JsonRecord).blocks
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter(
      (block) =>
        block &&
        typeof block === 'object' &&
        (block as JsonRecord).type === 'text',
    )
    .map((block) => String((block as JsonRecord).text || ''))
    .join('\n')
}

function responsePatch(response: JsonRecord): ReplacementHunk[] | null {
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
          (item as JsonRecord).type === 'patch',
      )
    : null
  const patch =
    block && typeof block === 'object' ? (block as JsonRecord).patch : null
  const hunks =
    patch && typeof patch === 'object' ? (patch as JsonRecord).hunks : null
  return Array.isArray(hunks) && hunks.length
    ? (hunks as ReplacementHunk[])
    : null
}

function parseUserMessages(): string[] {
  const raw = process.env.EVAL_USER_MESSAGES_JSON
  if (!raw)
    throw new Error(
      'EVAL_USER_MESSAGES_JSON is required; messages must come from eval_user',
    )
  const parsed = JSON.parse(raw)
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(
      'EVAL_USER_MESSAGES_JSON must be a non-empty JSON string array',
    )
  }
  return parsed
}

async function reuseCompletedResult(path: string): Promise<boolean> {
  try {
    const result = JSON.parse(await readFile(path, 'utf8')) as JsonRecord
    if (
      ![
        'PASS',
        'COPILOT_FAILURE',
        'INFRA_FAILURE',
        'INVALID',
        'SKIPPED',
      ].includes(String(result.status))
    ) {
      return false
    }
    process.stdout.write(
      `${JSON.stringify({ resumed: true, resultPath: path, ...result }, null, 2)}\n`,
    )
    process.exitCode =
      result.status === 'PASS' || result.status === 'SKIPPED' ? 0 : 1
    return true
  } catch {
    return false
  }
}

async function main() {
  if (
    process.env.EVAL_RESUME_RESULT &&
    (await reuseCompletedResult(process.env.EVAL_RESUME_RESULT))
  ) {
    return
  }

  const caseId = process.env.EVAL_CASE_ID
  if (!caseId) throw new Error('EVAL_CASE_ID is required')
  const userId = process.env.EVAL_USER_ID
  if (!userId) throw new Error('EVAL_USER_ID is required')
  const userMessages = parseUserMessages()
  const caseDefinition = getPilotCase(caseId)
  const validationErrors = validatePilotCase(caseDefinition)
  const startedAt = new Date().toISOString()
  const trialId = process.env.EVAL_TRIAL_ID || `trial_${randomUUID()}`
  const experimentId = process.env.EVAL_EXPERIMENT_ID || 'pilot-v1'
  const runId = `run_${randomUUID()}`
  const runDir = join(
    artifactRoot,
    `${caseDefinition.case_id}-${startedAt.replace(/[:.]/g, '-')}-${trialId.slice(-10)}`,
  )
  await mkdir(runDir, { recursive: true })
  const trace = new CanonicalTraceWriter(runId, join(runDir, 'events.jsonl'))
  const filesRef = {
    current: caseDefinition.fixture.files.map((file) => ({ ...file })),
  }
  const initialFiles = filesRef.current.map((file) => ({ ...file }))
  const usage = emptyUsage()
  const toolCalls: Record<string, number> = {}
  const responses: PilotResponse[] = []
  const patchFiles = new Set<string>()
  const patches: ReplacementHunk[][] = []
  const startedMs = Date.now()
  const conversationId = `${caseDefinition.case_id}-${Date.now().toString(36)}`
  const task = {
    id: caseDefinition.case_id,
    mainFile: caseDefinition.fixture.main_file,
    files: filesRef.current,
  }
  const config = evalRuntimeConfig()
  const promptMetadata = evalPromptMetadata(
    buildChatPayload(task, filesRef.current, conversationId, userMessages[0]),
  )
  const manifest: JsonRecord = {
    schema_version: 1,
    run_id: runId,
    experiment_id: experimentId,
    case_id: caseDefinition.case_id,
    case_family_id: caseDefinition.case_family_id,
    trial_id: trialId,
    split: caseDefinition.split,
    git_commit: await gitCommit(process.cwd()).catch(() => 'unknown'),
    model: { resolution: 'pending' },
    config,
    config_hash: hashValue(config),
    prompt_hash: promptMetadata.promptHash,
    benchmark_hash: hashValue(caseDefinition),
    fixture_hash: caseDefinition.fixture.sha256,
    initial_workspace_hash: workspaceHash(initialFiles),
    eval_user_session_id: process.env.EVAL_USER_SESSION_ID || 'unknown',
    started_at: startedAt,
    retry_observability: {
      configured_provider_max_retries: config.provider_max_retries,
      actual_attempts_available: false,
    },
  }
  await writeJsonAtomic(join(runDir, 'run.json'), manifest)
  await writeJsonAtomic(join(runDir, 'case.json'), caseDefinition)
  await writeJsonAtomic(join(runDir, 'before.json'), initialFiles)
  await writeJsonAtomic(join(runDir, 'eval-user-input.json'), {
    messages: userMessages,
    session_id: manifest.eval_user_session_id,
  })

  let currentTurnId: string | null = null
  let currentParentEventId: string | null = null
  let activeCompileToolCallId: string | null = null
  let compileOrdinal = 0
  let chatOrdinal = 0
  let patchOrdinal = 0
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
      case_id: caseDefinition.case_id,
      trial_id: trialId,
      split: caseDefinition.split,
      workspace_hash: workspaceHash(filesRef.current),
    },
    artifacts: [await artifactReference(runDir, 'before.json')],
  })
  currentParentEventId = trialStarted.eventId
  await trialStarted.committed

  let status: Status = validationErrors.length ? 'INVALID' : 'INFRA_FAILURE'
  let failure: StructuredFailure | null = validationErrors.length
    ? classifyFailure(
        new EvaluationFailure(validationErrors.join('; '), {
          category: 'grader',
          phase: 'schema_validation',
          type: 'BENCHMARK_SCHEMA_INVALID',
          source: 'case_registry',
          retryable: false,
        }),
        fallbackForPhase('grader'),
        currentParentEventId,
      )
    : null
  let failurePhase = 'setup'
  let serviceResources: Awaited<ReturnType<typeof buildTaskService>> | null =
    null
  let finalCompile: CompileResult | null = null
  let initialCompile: CompileResult | null = null
  const toolStartEvents = new Map<string, string>()

  try {
    if (validationErrors.length)
      throw new EvaluationFailure(validationErrors.join('; '), {
        category: 'grader',
        phase: 'schema_validation',
        type: 'BENCHMARK_SCHEMA_INVALID',
        source: 'case_registry',
        retryable: false,
      })
    if (caseDefinition.harness.minimum_support === 'H2') {
      status = 'SKIPPED'
    } else {
      serviceResources = await buildTaskService(
        filesRef,
        caseDefinition.fixture.main_file,
        usage,
        {
          trace,
          context: traceContext,
          runDir,
          nextCompileOrdinal: () => ++compileOrdinal,
        },
      )
      manifest.model = await serviceResources.resolveModelMetadata(userId)
      await writeJsonAtomic(join(runDir, 'run.json'), manifest)

      if (caseDefinition.initial_state.compile_status === 'failure') {
        failurePhase = 'compile'
        initialCompile = (
          await tracedCompile({
            files: filesRef.current,
            mainFile: caseDefinition.fixture.main_file,
            purpose: 'initial_state',
            ordinal: ++compileOrdinal,
            runDir,
            trace,
            context: traceContext,
          })
        ).result
        if (
          initialCompile.status === 'unavailable' ||
          initialCompile.status.startsWith('http-')
        ) {
          throw new EvaluationFailure(
            initialCompile.note || initialCompile.status,
            {
              category: 'infrastructure',
              phase: 'compile',
              type: 'COMPILE_INFRASTRUCTURE_ERROR',
              source: 'clsi',
              retryable: true,
            },
          )
        }
      }

      let userTurn = 0
      let shouldContinue = true
      while (
        shouldContinue &&
        userTurn < userMessages.length &&
        userTurn < caseDefinition.expected_behavior.max_user_turns
      ) {
        userTurn += 1
        let instruction = userMessages[userTurn - 1]
        let kind: PilotResponse['kind'] = 'user'
        let verificationRounds = 0
        do {
          chatOrdinal += 1
          currentTurnId = `turn_${chatOrdinal}`
          failurePhase = 'model'
          const payload = buildChatPayload(
            task,
            filesRef.current,
            conversationId,
            instruction,
          )
          if (initialCompile?.errors.length && chatOrdinal === 1) {
            ;(payload.context as JsonRecord).compileErrors =
              initialCompile.errors
          }
          const response = (await serviceResources.service.chat(
            userId,
            payload,
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
                  if (event.toolName === 'compile_project')
                    activeCompileToolCallId = event.toolCallId
                } else if (event.type === 'tool_end') {
                  const queued = trace.emit({
                    event_type: 'tool_completed',
                    parent_event_id:
                      toolStartEvents.get(event.toolCallId) ||
                      currentParentEventId,
                    turn_id: currentTurnId,
                    tool_call_id: event.toolCallId,
                    status: event.isError ? 'error' : 'ok',
                    summary: {
                      tool_name: event.toolName,
                      result_summary: event.resultSummary,
                    },
                  })
                  currentParentEventId = queued.eventId
                  toolCalls[event.toolName] =
                    (toolCalls[event.toolName] || 0) + 1
                  if (event.toolName === 'compile_project')
                    activeCompileToolCallId = null
                }
              },
            },
          )) as unknown as JsonRecord
          await trace.flush()
          const hunks = responsePatch(response)
          responses.push({
            userTurn,
            kind,
            text: responseText(response),
            hadPatch: Boolean(hunks),
          })
          await writeJsonAtomic(
            join(
              runDir,
              `response-${String(chatOrdinal).padStart(2, '0')}.json`,
            ),
            response,
          )
          if (!hunks) break

          failurePhase = 'patch_apply'
          const beforeHash = workspaceHash(filesRef.current)
          let applied
          try {
            applied = applyReplacementPatch(
              new Map(
                filesRef.current.map((file) => [file.path, file.content]),
              ),
              hunks,
            )
          } catch (error) {
            if (error instanceof UnsupportedPatchError) {
              throw new EvaluationFailure(error.message, {
                category: 'tool',
                phase: 'patch_apply',
                type: 'UNSUPPORTED_PATCH_SEMANTICS',
                source: 'headless_patch_applicator',
                retryable: false,
              })
            }
            throw error
          }
          filesRef.current = [...applied.files].map(([path, content]) => ({
            path,
            content,
          }))
          patchOrdinal += 1
          patches.push(hunks)
          for (const patch of hunks) if (patch.file) patchFiles.add(patch.file)
          const patchPath = `patches/${String(patchOrdinal).padStart(2, '0')}.json`
          const snapshotPath = `snapshots/${String(patchOrdinal).padStart(2, '0')}.json`
          await mkdir(dirname(join(runDir, patchPath)), { recursive: true })
          await mkdir(dirname(join(runDir, snapshotPath)), { recursive: true })
          await writeJsonAtomic(join(runDir, patchPath), hunks)
          await writeJsonAtomic(join(runDir, snapshotPath), filesRef.current)
          const appliedEvent = trace.emit({
            event_type: 'patch_applied',
            parent_event_id: currentParentEventId,
            turn_id: currentTurnId,
            status: 'ok',
            summary: {
              hunk_count: hunks.length,
              files: [
                ...new Set(hunks.map((hunk) => hunk.file).filter(Boolean)),
              ],
              workspace_hash_before: beforeHash,
              workspace_hash_after: workspaceHash(filesRef.current),
            },
            artifacts: [
              await artifactReference(runDir, patchPath),
              await artifactReference(runDir, snapshotPath),
            ],
          })
          currentParentEventId = appliedEvent.eventId
          await appliedEvent.committed
          verificationRounds += 1
          if (
            verificationRounds >= caseDefinition.patch_policy.max_patch_rounds
          )
            break
          instruction = VERIFY_MESSAGE
          kind = 'automatic_verification'
        } while (true)

        const patchedThisUserTurn = responses.some(
          (item) => item.userTurn === userTurn && item.hadPatch,
        )
        shouldContinue =
          userTurn < userMessages.length &&
          (!patchedThisUserTurn ||
            caseDefinition.expected_behavior.continue_after_patch === true)
      }

      if (
        caseDefinition.compile_policy.mode === 'required-after-apply' ||
        caseDefinition.compile_policy.mode === 'repair-loop'
      ) {
        failurePhase = 'compile'
        finalCompile = (
          await tracedCompile({
            files: filesRef.current,
            mainFile: caseDefinition.fixture.main_file,
            purpose: 'final_grading',
            ordinal: ++compileOrdinal,
            runDir,
            trace,
            context: traceContext,
          })
        ).result
        if (
          finalCompile.status === 'unavailable' ||
          finalCompile.status.startsWith('http-')
        ) {
          throw new EvaluationFailure(
            finalCompile.note || finalCompile.status,
            {
              category: 'infrastructure',
              phase: 'compile',
              type: 'COMPILE_INFRASTRUCTURE_ERROR',
              source: 'clsi',
              retryable: true,
            },
          )
        }
      }

      failurePhase = 'grader'
      const graderStarted = trace.emit({
        event_type: 'grader_started',
        parent_event_id: currentParentEventId,
        turn_id: currentTurnId,
        summary: { grader: 'pilot-deterministic-registry-v1' },
      })
      currentParentEventId = graderStarted.eventId
      await graderStarted.committed
      const gradeContext: PilotGradeContext = {
        caseDefinition,
        initialFiles,
        finalFiles: filesRef.current,
        responses,
        patchFiles: [...patchFiles],
        patchCount: patches.length,
        toolCalls,
        compile: finalCompile,
      }
      const grade = gradePilotCase(gradeContext)
      await writeJsonAtomic(join(runDir, 'grader.json'), grade)
      const graderCompleted = trace.emit({
        event_type: 'grader_completed',
        parent_event_id: graderStarted.eventId,
        turn_id: currentTurnId,
        status: grade.passed ? 'ok' : 'error',
        summary: {
          grader: 'pilot-deterministic-registry-v1',
          passed: grade.passed,
          check_count: grade.checks.length,
        },
        artifacts: [await artifactReference(runDir, 'grader.json')],
      })
      currentParentEventId = graderCompleted.eventId
      await graderCompleted.committed
      status = grade.passed ? 'PASS' : 'COPILOT_FAILURE'
      if (!grade.passed) {
        failure = classifyFailure(
          new EvaluationFailure('deterministic pilot grader failed', {
            category: 'grader',
            phase: 'grader',
            type: 'GRADER_ASSERTION_FAILED',
            source: 'pilot_grader_registry',
            retryable: false,
          }),
          fallbackForPhase('grader'),
          graderCompleted.eventId,
        )
      }
    }
  } catch (error) {
    if (!failure) {
      status =
        error instanceof EvaluationFailure &&
        error.classification.type === 'UNSUPPORTED_PATCH_SEMANTICS'
          ? 'COPILOT_FAILURE'
          : 'INFRA_FAILURE'
      failure = classifyFailure(
        error,
        fallbackForPhase(failurePhase),
        currentParentEventId,
      )
    }
  } finally {
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
            currentParentEventId,
          )
        }
      }
    }
    await writeJsonAtomic(join(runDir, 'after.json'), filesRef.current)
    await writeJsonAtomic(join(runDir, 'responses.json'), responses)
    await writeJsonAtomic(join(runDir, 'patches.json'), patches)
    await writeJsonAtomic(join(runDir, 'tool-calls.json'), toolCalls)
    const terminal = trace.emit(
      status === 'PASS' || status === 'SKIPPED'
        ? {
            event_type: 'trial_completed',
            parent_event_id: currentParentEventId,
            turn_id: currentTurnId,
            status: status === 'PASS' ? 'ok' : 'skipped',
            summary: { status, usage, tool_calls: toolCalls },
          }
        : {
            event_type: 'trial_failed',
            parent_event_id: currentParentEventId,
            turn_id: currentTurnId,
            status: 'error',
            summary: { status, usage, tool_calls: toolCalls },
            failure: failure as StructuredFailure,
          },
    )
    await terminal.committed
    await trace.flush()
    const result = {
      runId,
      runDir,
      experimentId,
      caseId: caseDefinition.case_id,
      caseFamilyId: caseDefinition.case_family_id,
      split: caseDefinition.split,
      trialId,
      status,
      failure,
      usage,
      toolCalls,
      patchCount: patches.length,
      responseCount: responses.length,
      initialWorkspaceHash: workspaceHash(initialFiles),
      finalWorkspaceHash: workspaceHash(filesRef.current),
      wallMs: Date.now() - startedMs,
    }
    Object.assign(manifest, {
      ended_at: new Date().toISOString(),
      status,
      failure,
      final_workspace_hash: result.finalWorkspaceHash,
    })
    await writeJsonAtomic(join(runDir, 'run.json'), manifest)
    await writeJsonAtomic(join(runDir, 'result.json'), result)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = status === 'PASS' || status === 'SKIPPED' ? 0 : 1
  }
}

await main()
