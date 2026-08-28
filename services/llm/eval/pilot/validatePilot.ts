import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { applyReplacementPatch } from '../headless/replacementPatch.js'
import { compileFiles, type CompileResult } from '../headless/compileRunner.js'
import { writeJsonAtomic } from '../headless/canonicalTrace.js'
import { validatePilotRegistry } from './caseRegistry.js'
import { gradePilotCase } from './graderRegistry.js'
import { PILOT_CASES } from './seedCases.js'
import type { PilotGradeContext, PilotResponse } from './types.js'

const shouldCompile = process.argv.includes('--compile')
const outputPath =
  process.env.EVAL_VALIDATION_REPORT ||
  '/overleaf/services/llm/eval/artifacts/pilot-validation.json'

async function main() {
  const schemaErrors = validatePilotRegistry()
  const caseResults: Array<Record<string, unknown>> = []

  for (const caseDefinition of PILOT_CASES) {
    const initialFiles = caseDefinition.fixture.files.map((file) => ({
      ...file,
    }))
    let finalFiles = initialFiles.map((file) => ({ ...file }))
    let oracleApplyError: string | null = null
    try {
      if (caseDefinition.validation_oracle.patches?.length) {
        const applied = applyReplacementPatch(
          new Map(finalFiles.map((file) => [file.path, file.content])),
          caseDefinition.validation_oracle.patches,
        )
        finalFiles = [...applied.files].map(([path, content]) => ({
          path,
          content,
        }))
      }
    } catch (error) {
      oracleApplyError = error instanceof Error ? error.message : String(error)
    }

    let initialCompile: CompileResult | null = null
    let finalCompile: CompileResult | null = null
    if (shouldCompile) {
      initialCompile = await compileFiles(
        initialFiles,
        caseDefinition.fixture.main_file,
      )
      finalCompile = await compileFiles(
        finalFiles,
        caseDefinition.fixture.main_file,
      )
    } else {
      initialCompile = {
        status: caseDefinition.initial_state.compile_status,
        errorCount:
          caseDefinition.initial_state.compile_status === 'success' ? 0 : 1,
        errors: [],
        warningCount: 0,
        log: null,
      }
      finalCompile = {
        status:
          caseDefinition.compile_policy.expected_final_status ||
          caseDefinition.initial_state.compile_status,
        errorCount: 0,
        errors: [],
        warningCount: 0,
        log: null,
      }
    }

    const oracleTexts = caseDefinition.validation_oracle.responses || [
      caseDefinition.validation_oracle.response || 'oracle response',
    ]
    const responses: PilotResponse[] = oracleTexts.map((text, index) => ({
      userTurn: index + 1,
      kind: 'user',
      text,
      hadPatch:
        caseDefinition.expected_behavior.action === 'clarify'
          ? index > 0
          : Boolean(caseDefinition.validation_oracle.patches?.length),
    }))
    const patchFiles = [
      ...new Set(
        (caseDefinition.validation_oracle.patches || []).map(
          (patch) => patch.file,
        ),
      ),
    ]
    const toolCalls: Record<string, number> = {}
    for (const grader of caseDefinition.graders) {
      if (grader.type === 'tool_called') toolCalls[grader.tool] = grader.min
    }
    const context: PilotGradeContext = {
      caseDefinition,
      initialFiles,
      finalFiles,
      responses,
      patchFiles,
      patchCount: caseDefinition.validation_oracle.patches?.length ? 1 : 0,
      patchRejectionCount: Math.max(
        0,
        ...caseDefinition.graders
          .filter((grader) => grader.type === 'patch_rejections')
          .map((grader) =>
            grader.type === 'patch_rejections' ? grader.min : 0,
          ),
      ),
      userTurnCount: Math.max(
        responses.length,
        ...caseDefinition.graders
          .filter((grader) => grader.type === 'user_turns')
          .map((grader) => (grader.type === 'user_turns' ? grader.min : 0)),
      ),
      toolCalls,
      compile: finalCompile,
    }
    const grade = gradePilotCase(context)
    const observedInitialCompileStatus =
      initialCompile.status === 'success' && initialCompile.errorCount === 0
        ? 'success'
        : 'failure'
    const initialCompileMatches =
      observedInitialCompileStatus ===
      caseDefinition.initial_state.compile_status
    const finalCompileMatches =
      caseDefinition.compile_policy.expected_final_status === undefined ||
      (finalCompile.status ===
        caseDefinition.compile_policy.expected_final_status &&
        finalCompile.errorCount === 0)
    caseResults.push({
      case_id: caseDefinition.case_id,
      schema_valid: !schemaErrors.some((error) =>
        error.startsWith(caseDefinition.case_id),
      ),
      oracle_apply_valid: oracleApplyError === null,
      oracle_apply_error: oracleApplyError,
      initial_compile_status: initialCompile.status,
      initial_compile_error_count: initialCompile.errorCount,
      initial_compile_valid: initialCompileMatches,
      final_compile_status: finalCompile.status,
      final_compile_error_count: finalCompile.errorCount,
      final_compile_valid: finalCompileMatches,
      grader_valid: grade.passed,
      failed_graders: grade.checks.filter((check) => !check.passed),
    })
  }

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    compile_validation: shouldCompile,
    case_count: PILOT_CASES.length,
    schema_errors: schemaErrors,
    cases: caseResults,
    valid:
      schemaErrors.length === 0 &&
      caseResults.every(
        (item) =>
          item.schema_valid &&
          item.oracle_apply_valid &&
          item.initial_compile_valid &&
          item.final_compile_valid &&
          item.grader_valid,
      ),
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeJsonAtomic(outputPath, report)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.valid ? 0 : 1
}

await main()
