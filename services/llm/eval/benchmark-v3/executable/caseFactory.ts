import { workspaceHash } from "../../headless/workspaceState.js";
import { BENCHMARK_V3_CANDIDATE_SEEDS } from "../candidateSeeds.js";
import { V3_SUPPLEMENTAL_SEEDS } from "../supplementalSeeds.js";
import type { V3CaseInput, V3ExecutableCase } from "./types.js";

export function makeV3Case(input: V3CaseInput): V3ExecutableCase {
  const candidate = [
    ...BENCHMARK_V3_CANDIDATE_SEEDS,
    ...V3_SUPPLEMENTAL_SEEDS,
  ].find((seed) => seed.candidate_id === input.candidateId);
  if (!candidate) {
    throw new Error(`未知的 Benchmark v3 candidate：${input.candidateId}`);
  }
  const mainFile = input.mainFile || "main.tex";
  const compileMode = input.compileMode || "optional";
  const caseFamilyId = `v3.${input.caseSlug}`;

  return {
    schema_version: 1,
    case_id: `${caseFamilyId}.v1`,
    case_family_id: caseFamilyId,
    source_candidate_id: candidate.candidate_id,
    split: "dev",
    category: input.category,
    capabilities: input.capabilities,
    difficulty: { level: input.difficulty, factors: input.factors },
    fixture: {
      fixture_id: caseFamilyId,
      fixture_lineage: candidate.candidate_id,
      main_file: mainFile,
      compiler: "pdflatex",
      files: input.files,
      sha256: workspaceHash(input.files),
    },
    project_complexity: {
      scale:
        input.scale ||
        (input.files.length === 1 ? "single-small" : "multi-small"),
      context_pressure: input.pressure || "none",
    },
    user_goal: {
      public_brief: candidate.initial_user_message,
      ...(input.interactionFacts
        ? { interaction_facts: input.interactionFacts }
        : {}),
    },
    initial_state: {
      current_file: input.currentFile || mainFile,
      compile_status: input.initialCompile || "success",
      ...(input.protectedInvariants
        ? { protected_invariants: input.protectedInvariants }
        : {}),
    },
    expected_behavior: {
      action: input.action,
      max_user_turns: input.maxUserTurns || 1,
      ...(input.dynamicUser ? { dynamic_user: true } : {}),
      ...(input.continueAfterPatch ? { continue_after_patch: true } : {}),
      ...(input.evalUserFollowups
        ? { eval_user_followups: input.evalUserFollowups }
        : {}),
    },
    forbidden_behavior: [
      "不得编造项目中不存在的事实",
      "不得修改受保护的内容",
      "需要编译时不得未经验证就声称成功",
    ],
    patch_policy: {
      accepted_semantics: "replacement-only",
      allowed_files: input.files.map((file) => file.path),
      max_patch_rounds: 3,
    },
    compile_policy: {
      mode: compileMode,
      ...(compileMode === "required-after-apply" ||
      compileMode === "repair-loop"
        ? { expected_final_status: "success" as const }
        : {}),
      max_compile_calls_per_turn: 1,
    },
    ...(input.semanticGrading
      ? { semantic_grading: input.semanticGrading }
      : {}),
    graders: input.graders,
    validation_oracle: {
      ...(input.oraclePatches ? { patches: input.oraclePatches } : {}),
      ...(input.oracleResponse ? { response: input.oracleResponse } : {}),
      ...(input.oracleResponses ? { responses: input.oracleResponses } : {}),
      grader_mutations: input.graderMutations,
    },
    harness: { minimum_support: "H1", unsupported_is: "skipped" },
    metadata: {
      tags: [...input.tags, candidate.primary_domain],
      language: "zh-CN",
      prompt_form: input.promptForm || "中文自然请求",
      provenance: "llm-generated-user-seed",
    },
  };
}
