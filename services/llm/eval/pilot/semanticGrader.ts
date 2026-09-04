import type {
  PilotGradeContext,
  SemanticGraderCriterion,
  SemanticGradingSpec,
} from "./types.js";

export const SEMANTIC_GRADER_PROTOCOL = "overleaf-semantic-grader/v1";
export const SEMANTIC_GRADER_INPUT_FILE = "semantic-grader-input.json";
export const SEMANTIC_GRADER_RESULT_FILE = "semantic-grader.json";

export interface SemanticGraderInput {
  protocol: typeof SEMANTIC_GRADER_PROTOCOL;
  task: {
    expected_action: PilotGradeContext["caseDefinition"]["expected_behavior"]["action"];
    user_goal: string;
    user_messages?: string[];
    interaction_facts: string[];
    semantic_type: SemanticGradingSpec["type"];
  };
  evidence: {
    responses: Array<{
      user_turn: number;
      kind: string;
      text: string;
      had_patch: boolean;
    }>;
    patch_count: number;
    patch_rejection_count: number;
    user_turn_count: number;
    compile: PilotGradeContext["compile"];
    initial_files: Array<{ path: string; content: string }>;
    final_files: Array<{ path: string; content: string }>;
  };
  criteria: SemanticGraderCriterion[];
}

export interface SemanticGraderCriterionResult {
  id: string;
  passed: boolean;
  evidence: string;
  rationale: string;
}

export interface SemanticGraderOutput {
  criteria: SemanticGraderCriterionResult[];
  summary: string;
}

export interface SemanticGraderResult extends SemanticGraderOutput {
  protocol: typeof SEMANTIC_GRADER_PROTOCOL;
  status: "pass" | "fail";
  passed: boolean;
}

function selectedFiles(
  files: PilotGradeContext["initialFiles"],
  spec: SemanticGradingSpec,
) {
  if (spec.type !== "content_semantics") return [];
  const selected = new Set(spec.files);
  return files.filter((file) => selected.has(file.path));
}

export function buildSemanticGraderInput(
  context: PilotGradeContext,
): SemanticGraderInput {
  const spec = context.caseDefinition.semantic_grading;
  if (!spec) throw new Error("case has no semantic_grading specification");
  if (!spec.criteria.length) {
    throw new Error("semantic_grading criteria must not be empty");
  }
  if (
    new Set(spec.criteria.map((criterion) => criterion.id)).size !==
    spec.criteria.length
  ) {
    throw new Error("semantic_grading criterion ids must be unique");
  }
  return {
    protocol: SEMANTIC_GRADER_PROTOCOL,
    task: {
      expected_action: context.caseDefinition.expected_behavior.action,
      user_goal: context.caseDefinition.user_goal.public_brief,
      ...(context.userMessages ? { user_messages: [...context.userMessages] } : {}),
      interaction_facts:
        context.caseDefinition.user_goal.interaction_facts || [],
      semantic_type: spec.type,
    },
    evidence: {
      responses: context.responses.map((response) => ({
        user_turn: response.userTurn,
        kind: response.kind,
        text: response.text,
        had_patch: response.hadPatch,
      })),
      patch_count: context.patchCount,
      patch_rejection_count: context.patchRejectionCount,
      user_turn_count: context.userTurnCount,
      compile: context.compile,
      initial_files: selectedFiles(context.initialFiles, spec),
      final_files: selectedFiles(context.finalFiles, spec),
    },
    criteria: spec.criteria,
  };
}

export function validateSemanticGraderOutput(
  value: unknown,
  expectedCriteria: Array<Pick<SemanticGraderCriterion, "id">>,
): SemanticGraderResult {
  if (!value || typeof value !== "object") {
    throw new Error("semantic grader output must be a JSON object");
  }
  const output = value as Partial<SemanticGraderOutput>;
  if (!Array.isArray(output.criteria) || !output.criteria.length) {
    throw new Error("semantic grader output requires non-empty criteria[]");
  }
  if (typeof output.summary !== "string" || !output.summary.trim()) {
    throw new Error("semantic grader output requires a non-empty summary");
  }
  const expectedIds = new Set(
    expectedCriteria.map((criterion) => criterion.id),
  );
  const actualIds = new Set<string>();
  for (const item of output.criteria) {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.passed !== "boolean" ||
      typeof item.evidence !== "string" ||
      typeof item.rationale !== "string" ||
      !item.evidence.trim() ||
      !item.rationale.trim()
    ) {
      throw new Error("semantic grader criterion output is malformed");
    }
    if (!expectedIds.has(item.id)) {
      throw new Error(`semantic grader returned unknown criterion ${item.id}`);
    }
    if (actualIds.has(item.id)) {
      throw new Error(
        `semantic grader returned duplicate criterion ${item.id}`,
      );
    }
    actualIds.add(item.id);
  }
  if (actualIds.size !== expectedIds.size) {
    const missing = [...expectedIds].filter((id) => !actualIds.has(id));
    throw new Error(`semantic grader omitted criteria: ${missing.join(", ")}`);
  }
  const passed = output.criteria.every((item) => item.passed);
  return {
    protocol: SEMANTIC_GRADER_PROTOCOL,
    status: passed ? "pass" : "fail",
    passed,
    criteria: output.criteria,
    summary: output.summary,
  };
}
