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
import { compileFiles, type CompileResult } from './compileRunner.js'
import { buildTaskService, emptyUsage, shutdownEval } from './serviceFactory.js'

type Status = 'PASS' | 'COPILOT_FAILURE' | 'INFRA_FAILURE'
type JsonRecord = Record<string, unknown>

const userId = process.env.EVAL_USER_ID
if (!userId) throw new Error('EVAL_USER_ID is required')
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
        item =>
          item &&
          typeof item === 'object' &&
          (item as JsonRecord).type === 'patch'
      )
    : null
  const patch = block && typeof block === 'object' ? (block as JsonRecord).patch : null
  const hunks = patch && typeof patch === 'object' ? (patch as JsonRecord).hunks : null
  return Array.isArray(hunks) && hunks.length > 0 ? (hunks as ReplacementHunk[]) : null
}

async function saveJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function run() {
  const task = taskDefinition()
  const runId = `${task.id}-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(artifactRoot, runId)
  await mkdir(runDir, { recursive: true })
  const filesRef = { current: task.files.map(file => ({ ...file })) }
  const before = filesRef.current.map(file => ({ ...file }))
  const usage = emptyUsage()
  const toolCalls: Record<string, number> = {}
  const started = Date.now()
  const conversationId = `${task.id}-${Date.now().toString(36)}`
  let status: Status = 'INFRA_FAILURE'
  let failure: JsonRecord | null = null
  let response: JsonRecord | null = null
  let patch: ReplacementHunk[] | null = null
  let compile: CompileResult | null = null
  let transcript: unknown[] = []
  let serviceResources: Awaited<ReturnType<typeof buildTaskService>> | null = null

  try {
    serviceResources = await buildTaskService(filesRef, task.mainFile, usage)
    let instruction = userMessage
    for (let turn = 0; turn < 3; turn += 1) {
      response = (await serviceResources.service.chat(
        userId,
        buildChatPayload(task, filesRef.current, conversationId, instruction),
        {
          onEvent: event => {
            if (event.type === 'tool_end') {
              toolCalls[event.toolName] = (toolCalls[event.toolName] || 0) + 1
            }
          },
        }
      )) as unknown as JsonRecord
      const hunks = getPatch(response)
      if (!hunks) break
      patch = hunks
      try {
        const applied = applyReplacementPatch(
          new Map(filesRef.current.map(file => [file.path, file.content])),
          hunks
        )
        filesRef.current = [...applied.files.entries()].map(([path, content]) => ({
          path,
          content,
        }))
      } catch (error) {
        if (error instanceof UnsupportedPatchError) {
          throw new Error(`unsupported replacement patch: ${error.message}`)
        }
        throw error
      }
      instruction = VERIFY_MESSAGE
    }

    transcript = await serviceResources.memoryStore.load(
      serviceResources.service.buildThreadId(userId, conversationId)
    )
    await saveJson(join(runDir, 'before.json'), before)
    await saveJson(join(runDir, 'after.json'), filesRef.current)
    await saveJson(join(runDir, 'copilot-response.json'), response)
    await saveJson(join(runDir, 'patch.json'), patch)
    await saveJson(join(runDir, 'transcript.json'), transcript)
    await saveJson(join(runDir, 'tool-calls.json'), toolCalls)

    if (!patch) {
      status = 'COPILOT_FAILURE'
      failure = { reason: 'no_patch', message: 'Agent did not submit a patch' }
    } else {
      compile = await compileFiles(filesRef.current, task.mainFile)
      await saveJson(join(runDir, 'compile.json'), { ...compile, log: undefined })
      if (compile.log !== null) await writeFile(join(runDir, 'output.log'), compile.log)
      if (compile.status === 'unavailable' || compile.status.startsWith('http-')) {
        status = 'INFRA_FAILURE'
        failure = { reason: 'compile_unavailable', message: compile.note || compile.status }
      } else if (compile.status !== 'success') {
        status = 'COPILOT_FAILURE'
        failure = { reason: 'compile_failed', message: compile.note || compile.status }
      } else {
        const content =
          filesRef.current.find(file => file.path === task.mainFile)?.content || ''
        const checks = {
          containsExpected: content.includes('Hello Overleaf'),
          removedOriginal: !content.includes('Hello World'),
          compileSuccess: compile.errorCount === 0,
          compileLogSawExpected: compile.log?.includes('EVAL_BODY=Hello Overleaf') === true,
          compileLogDidNotSeeOriginal:
            compile.log?.includes('EVAL_BODY=Hello World') !== true,
        }
        await saveJson(join(runDir, 'grader.json'), checks)
        if (Object.values(checks).every(Boolean)) {
          status = 'PASS'
        } else {
          status = 'COPILOT_FAILURE'
          failure = {
            reason: 'deterministic_grader_failed',
            message: JSON.stringify(checks),
          }
        }
      }
    }
  } catch (error) {
    status = 'INFRA_FAILURE'
    failure = {
      reason: 'runner_error',
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await saveJson(join(runDir, 'result.json'), {
      caseId: task.id,
      status,
      failure,
      userMessage,
      toolCalls,
      usage,
      wallMs: Date.now() - started,
    })
    if (serviceResources) await shutdownEval()
  }

  process.stdout.write(`${JSON.stringify({ runDir, status, failure }, null, 2)}\n`)
  process.exitCode = status === 'PASS' ? 0 : 1
}

await run()
