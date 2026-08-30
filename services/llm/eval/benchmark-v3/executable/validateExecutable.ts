import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  compileFiles,
  type CompileResult,
} from "../../headless/compileRunner.js";
import { writeJsonAtomic } from "../../headless/canonicalTrace.js";
import { V3_EXECUTABLE_CASES } from "./index.js";
import {
  buildV3GradeContext,
  oracleWorkspaceHash,
  validateV3Registry,
} from "./validation.js";

const shouldCompile = process.argv.includes("--compile");
const outputPath =
  process.env.EVAL_V3_VALIDATION_REPORT ||
  "/overleaf/services/llm/eval/benchmark-v3/executable/validation-report.json";
const concurrency = Math.max(
  1,
  Math.min(8, Number(process.env.EVAL_V3_COMPILE_CONCURRENCY || 4)),
);

function compileSucceeded(result: CompileResult) {
  return result.status === "success" && result.errorCount === 0;
}

function compileUnavailable(result: CompileResult) {
  return result.status === "unavailable" || result.status.startsWith("http-");
}

async function validateCompile(caseIndex: number) {
  const caseDefinition = V3_EXECUTABLE_CASES[caseIndex];
  const oracle = buildV3GradeContext(caseDefinition);
  const initialCompile = await compileFiles(
    oracle.initialFiles,
    caseDefinition.fixture.main_file,
  );
  const finalCompile = await compileFiles(
    oracle.finalFiles,
    caseDefinition.fixture.main_file,
  );
  const initialSuccess = compileSucceeded(initialCompile);
  const expectedInitialSuccess =
    caseDefinition.initial_state.compile_status === "success";
  const initialValid =
    !compileUnavailable(initialCompile) &&
    initialSuccess === expectedInitialSuccess;
  const finalValid =
    !compileUnavailable(finalCompile) && compileSucceeded(finalCompile);

  return {
    case_id: caseDefinition.case_id,
    source_candidate_id: caseDefinition.source_candidate_id,
    fixture_hash: caseDefinition.fixture.sha256,
    oracle_workspace_hash: oracleWorkspaceHash(caseDefinition),
    mutation_count: caseDefinition.validation_oracle.grader_mutations.length,
    initial_compile: {
      declared: caseDefinition.initial_state.compile_status,
      status: initialCompile.status,
      error_count: initialCompile.errorCount,
      warning_count: initialCompile.warningCount,
      valid: initialValid,
      errors: initialCompile.errors,
      note: initialCompile.note,
    },
    final_compile: {
      declared: "success",
      status: finalCompile.status,
      error_count: finalCompile.errorCount,
      warning_count: finalCompile.warningCount,
      valid: finalValid,
      errors: finalCompile.errors,
      note: finalCompile.note,
    },
    valid: initialValid && finalValid,
  };
}

async function compileAll() {
  const results = new Array<Awaited<ReturnType<typeof validateCompile>>>(
    V3_EXECUTABLE_CASES.length,
  );
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < V3_EXECUTABLE_CASES.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await validateCompile(index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, V3_EXECUTABLE_CASES.length) },
      () => worker(),
    ),
  );
  return results;
}

async function main() {
  const staticErrors = validateV3Registry(V3_EXECUTABLE_CASES);
  const compileResults = shouldCompile ? await compileAll() : [];
  const sourceCounts = Object.fromEntries(
    ["content", "compile", "artifact", "interaction", "nonedit"].map(
      (source) => [
        source,
        V3_EXECUTABLE_CASES.filter((item) =>
          item.source_candidate_id.startsWith(`v3.${source}.`),
        ).length,
      ],
    ),
  );
  const difficultyCounts = Object.fromEntries(
    ["D1", "D2", "D3", "D4"].map((level) => [
      level,
      V3_EXECUTABLE_CASES.filter((item) => item.difficulty.level === level)
        .length,
    ]),
  );
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    lifecycle: "executable",
    language: "zh-CN",
    case_count: V3_EXECUTABLE_CASES.length,
    source_counts: sourceCounts,
    difficulty_counts: difficultyCounts,
    compile_validation: shouldCompile,
    compile_concurrency: concurrency,
    static_errors: staticErrors,
    cases: compileResults,
    valid:
      staticErrors.length === 0 &&
      shouldCompile &&
      compileResults.length === V3_EXECUTABLE_CASES.length &&
      compileResults.every((item) => item.valid),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJsonAtomic(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.valid ? 0 : 1;
}

await main();
