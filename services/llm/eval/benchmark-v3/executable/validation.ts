import {
  applyReplacementPatch,
  type ReplacementHunk,
} from "../../headless/replacementPatch.js";
import { workspaceHash } from "../../headless/workspaceState.js";
import { validatePilotCase } from "../../pilot/caseRegistry.js";
import { gradePilotCase } from "../../pilot/graderRegistry.js";
import type { PilotGradeContext, PilotResponse } from "../../pilot/types.js";
import { BENCHMARK_V3_CANDIDATE_SEEDS } from "../candidateSeeds.js";
import type { V3ExecutableCase, V3GraderMutation } from "./types.js";

function applyPatches(
  caseDefinition: V3ExecutableCase,
  patches: readonly ReplacementHunk[],
) {
  const initialFiles = caseDefinition.fixture.files.map((file) => ({
    ...file,
  }));
  const applied = patches.length
    ? applyReplacementPatch(
        new Map(initialFiles.map((file) => [file.path, file.content])),
        patches,
      ).files
    : new Map(initialFiles.map((file) => [file.path, file.content]));
  return {
    initialFiles,
    finalFiles: [...applied].map(([path, content]) => ({ path, content })),
  };
}

function requiredToolCalls(caseDefinition: V3ExecutableCase) {
  return Object.fromEntries(
    caseDefinition.graders
      .filter((grader) => grader.type === "tool_called")
      .map((grader) => [grader.tool, grader.min]),
  );
}

function responses(
  texts: string[],
  caseDefinition: V3ExecutableCase,
  patchCount: number,
  firstResponseHadPatch?: boolean,
): PilotResponse[] {
  return texts.map((text, index) => ({
    userTurn: index + 1,
    kind: "user" as const,
    text,
    hadPatch:
      index === 0 && firstResponseHadPatch !== undefined
        ? firstResponseHadPatch
        : caseDefinition.expected_behavior.action === "clarify"
          ? index > 0
          : patchCount > 0,
  }));
}

export function buildV3GradeContext(
  caseDefinition: V3ExecutableCase,
  mutation?: V3GraderMutation,
): PilotGradeContext {
  const patches =
    mutation?.patches || caseDefinition.validation_oracle.patches || [];
  const files = applyPatches(caseDefinition, patches);
  const responseTexts = mutation?.responses ||
    caseDefinition.validation_oracle.responses || [
      caseDefinition.validation_oracle.response || "已完成请求。",
    ];
  const patchCount = mutation?.patch_count ?? (patches.length > 0 ? 1 : 0);

  return {
    caseDefinition,
    ...files,
    responses: responses(
      responseTexts,
      caseDefinition,
      patchCount,
      mutation?.first_response_had_patch,
    ),
    patchFiles: [...new Set(patches.map((patch) => patch.file || ""))].filter(
      Boolean,
    ),
    patchCount,
    patchRejectionCount: mutation?.patch_rejection_count ?? 0,
    userTurnCount: mutation?.user_turn_count ?? responseTexts.length,
    toolCalls: requiredToolCalls(caseDefinition),
    compile: mutation?.compile || {
      status: "success",
      errorCount: 0,
      warningCount: 0,
    },
  };
}

function requireChinese(
  errors: string[],
  caseId: string,
  field: string,
  values: string[],
) {
  for (const value of values) {
    if (!/\p{Script=Han}/u.test(value)) {
      errors.push(`${caseId}: ${field} 必须包含中文：${JSON.stringify(value)}`);
    }
  }
}

export function validateV3Case(caseDefinition: V3ExecutableCase): string[] {
  const errors = validatePilotCase(caseDefinition);
  const prefix = caseDefinition.case_id;
  const candidate = BENCHMARK_V3_CANDIDATE_SEEDS.find(
    (seed) => seed.candidate_id === caseDefinition.source_candidate_id,
  );
  if (!candidate) {
    errors.push(`${prefix}: source candidate 不存在`);
  } else if (
    caseDefinition.user_goal.public_brief !== candidate.initial_user_message
  ) {
    errors.push(`${prefix}: public brief 与 eval_user candidate 不一致`);
  }
  if (caseDefinition.split !== "dev") {
    errors.push(`${prefix}: 本轮物化 case 只能进入 dev，不得预占 holdout`);
  }
  if (caseDefinition.metadata.provenance !== "llm-generated-user-seed") {
    errors.push(`${prefix}: provenance 不正确`);
  }
  if (caseDefinition.harness.minimum_support !== "H1") {
    errors.push(`${prefix}: 本轮只允许真正可执行的 H1 case`);
  }

  requireChinese(errors, prefix, "category", [caseDefinition.category]);
  requireChinese(
    errors,
    prefix,
    "difficulty factors",
    caseDefinition.difficulty.factors,
  );
  requireChinese(
    errors,
    prefix,
    "forbidden behavior",
    caseDefinition.forbidden_behavior,
  );
  requireChinese(errors, prefix, "tags", caseDefinition.metadata.tags);
  requireChinese(
    errors,
    prefix,
    "interaction facts",
    caseDefinition.user_goal.interaction_facts || [],
  );
  requireChinese(
    errors,
    prefix,
    "oracle responses",
    caseDefinition.validation_oracle.responses ||
      (caseDefinition.validation_oracle.response
        ? [caseDefinition.validation_oracle.response]
        : []),
  );

  const mutations = caseDefinition.validation_oracle.grader_mutations;
  if (mutations.length < 2) {
    errors.push(`${prefix}: 至少需要两个 grader mutation`);
  }
  if (
    new Set(mutations.map((item) => item.mutation_id)).size !== mutations.length
  ) {
    errors.push(`${prefix}: grader mutation id 重复`);
  }
  requireChinese(
    errors,
    prefix,
    "mutation description",
    mutations.map((item) => item.description),
  );

  if (
    caseDefinition.compile_policy.mode !== "optional" &&
    caseDefinition.compile_policy.mode !== "forbidden" &&
    !caseDefinition.graders.some((grader) => grader.type === "compile")
  ) {
    errors.push(`${prefix}: 需要编译的 case 缺少 compile grader`);
  }
  if (
    caseDefinition.expected_behavior.action === "patch" &&
    !caseDefinition.validation_oracle.patches?.length
  ) {
    errors.push(`${prefix}: patch case 缺少 oracle patch`);
  }
  if (
    ["answer", "no_op", "refuse"].includes(
      caseDefinition.expected_behavior.action,
    ) &&
    caseDefinition.validation_oracle.patches?.length
  ) {
    errors.push(`${prefix}: 非修改 case 不得包含 oracle patch`);
  }

  for (const invariant of caseDefinition.initial_state.protected_invariants ||
    []) {
    const hasInvariantGrader = caseDefinition.graders.some(
      (grader) =>
        grader.type === "file_contains" &&
        grader.file === invariant.file &&
        grader.values.includes(invariant.value),
    );
    if (!hasInvariantGrader) {
      errors.push(`${prefix}: 受保护内容缺少 grader：${invariant.file}`);
    }
  }

  try {
    const oracleContext = buildV3GradeContext(caseDefinition);
    const oracleGrade = gradePilotCase(oracleContext);
    if (!oracleGrade.passed) {
      errors.push(
        `${prefix}: oracle 未通过 grader：${JSON.stringify(
          oracleGrade.checks.filter((check) => !check.passed),
        )}`,
      );
    }
  } catch (error) {
    errors.push(
      `${prefix}: oracle 无法应用：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const mutation of mutations) {
    try {
      const context = buildV3GradeContext(caseDefinition, mutation);
      const grade = gradePilotCase(context);
      if (grade.passed) {
        errors.push(
          `${prefix}: grader 未拒绝 mutation ${mutation.mutation_id}`,
        );
      }
    } catch (error) {
      errors.push(
        `${prefix}: mutation ${mutation.mutation_id} 无法应用：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return errors;
}

export function validateV3Registry(cases: V3ExecutableCase[]): string[] {
  const errors = cases.flatMap(validateV3Case);
  const ids = new Set<string>();
  const candidates = new Set<string>();
  for (const caseDefinition of cases) {
    if (ids.has(caseDefinition.case_id)) {
      errors.push(`重复 case id：${caseDefinition.case_id}`);
    }
    if (candidates.has(caseDefinition.source_candidate_id)) {
      errors.push(`重复物化 candidate：${caseDefinition.source_candidate_id}`);
    }
    ids.add(caseDefinition.case_id);
    candidates.add(caseDefinition.source_candidate_id);
  }
  return errors;
}

export function oracleWorkspaceHash(caseDefinition: V3ExecutableCase) {
  return workspaceHash(buildV3GradeContext(caseDefinition).finalFiles);
}
