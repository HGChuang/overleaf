import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { compileFiles } from "../../headless/compileRunner.js";
import { writeJsonAtomic } from "../../headless/canonicalTrace.js";
import { buildConformanceReport } from "./conformance.js";
import {
  H3_FILE_OPERATION_CASES,
  h3OracleFiles,
  validateH3FileOperationCases,
} from "./fileOperationCases.js";

const outputPath =
  process.env.EVAL_V3_CONFORMANCE_REPORT ||
  "/overleaf/services/llm/eval/benchmark-v3/conformance/conformance-report.json";
const shouldCompile = process.argv.includes("--compile");

async function main() {
  const definitionErrors = validateH3FileOperationCases();
  const cases = [];
  for (const item of H3_FILE_OPERATION_CASES) {
    const finalFiles = h3OracleFiles(item);
    const initialCompile = shouldCompile
      ? await compileFiles(item.fixture.files, item.fixture.main_file)
      : null;
    const finalCompile = shouldCompile
      ? await compileFiles(finalFiles, item.expected.final_main_file)
      : null;
    cases.push({
      case_id: item.case_id,
      source_candidate_id: item.source_candidate_id,
      lifecycle: item.lifecycle,
      fixture_hash: item.fixture.sha256,
      final_workspace_hash: item.expected.final_workspace_sha256,
      operation_count: item.expected.operations.length,
      companion_patch_count: item.expected.companion_patches.length,
      initial_compile: initialCompile && {
        status: initialCompile.status,
        error_count: initialCompile.errorCount,
        valid:
          initialCompile.status === "success" &&
          initialCompile.errorCount === 0,
      },
      final_compile: finalCompile && {
        status: finalCompile.status,
        error_count: finalCompile.errorCount,
        valid:
          finalCompile.status === "success" && finalCompile.errorCount === 0,
      },
    });
  }
  const report = {
    ...buildConformanceReport(),
    generated_at: new Date().toISOString(),
    compile_validation: shouldCompile,
    definition_errors: definitionErrors,
    file_operation_cases: cases,
    valid:
      definitionErrors.length === 0 &&
      shouldCompile &&
      cases.every(
        (item) => item.initial_compile?.valid && item.final_compile?.valid,
      ),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJsonAtomic(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.valid ? 0 : 1;
}

await main();
