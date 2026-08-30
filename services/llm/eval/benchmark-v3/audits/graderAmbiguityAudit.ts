/**
 * Static grader ambiguity audit for the materialized Benchmark v3 registry.
 *
 * This deliberately does not change a case or its grader.  It evaluates the
 * oracle and every declared negative mutation, then reports where the current
 * grader is either under-constrained (a wrong result could still pass) or
 * over-constrained (a semantically valid implementation could be rejected).
 *
 * Run from services/llm:
 *   NODE_OPTIONS=--import=tsx node eval/benchmark-v3/audits/graderAmbiguityAudit.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { V3_EXECUTABLE_CASES } from "../executable/index.js";
import {
  buildV3GradeContext,
  validateV3Case,
} from "../executable/validation.js";
import { gradePilotCase } from "../../pilot/graderRegistry.js";
import type { GraderSpec, PilotGradeContext } from "../../pilot/types.js";

type Severity = "none" | "P2" | "P1" | "P0";
type FindingKind =
  | "under_constrained"
  | "over_constrained"
  | "contradiction"
  | "mutation_gap"
  | "unsupported_semantics";

interface Finding {
  severity: Exclude<Severity, "none">;
  kind: FindingKind;
  code: string;
  reason: string;
  evidence: string[];
  recommendation: string;
}

interface MutationAudit {
  mutation_id: string;
  description: string;
  passed: boolean;
  failedGraders: string[];
  unaffectedGraders: string[];
}

interface CaseAudit {
  case_id: string;
  case_family_id: string;
  source_candidate_id: string;
  category: string;
  difficulty: string;
  action: string;
  compile_mode: string;
  files: string[];
  grader_types: string[];
  oracle_passed: boolean;
  mutation_count: number;
  mutation_rejection_count: number;
  mutations: MutationAudit[];
  grader_mutation_coverage: Record<string, number>;
  findings: Finding[];
}

interface AuditReport {
  schema_version: 1;
  generated_at: string;
  registry: {
    case_count: number;
    expected_case_count: number;
    all_dev: boolean;
  };
  methodology: {
    oracle_and_mutations: string;
    severity: Record<string, string>;
    limitations: string[];
  };
  summary: {
    cases_by_risk: Record<Severity, number>;
    finding_counts: Record<string, number>;
    grader_type_counts: Record<string, number>;
    mutation_rejection_rate: number;
    cases_with_no_rejected_mutation: number;
  };
  cases: CaseAudit[];
}

function graderLabel(grader: GraderSpec): string {
  switch (grader.type) {
    case "file_contains":
    case "file_not_contains":
    case "file_unchanged":
    case "file_matches":
    case "regex_count":
      return `${grader.type}:${grader.file}`;
    case "compile":
      return `${grader.type}:${grader.status}`;
    case "tool_called":
      return `${grader.type}:${grader.tool}`;
    case "patch_files":
      return `${grader.type}:${grader.files.join(",")}`;
    case "response_contains_any":
    case "response_contains_all":
      return `${grader.type}:${grader.response_index ?? "all"}`;
    case "response_matches":
      return `${grader.type}:${grader.response_index ?? "all"}`;
    default:
      return grader.type;
  }
}

function hasType(graders: readonly GraderSpec[], type: GraderSpec["type"]) {
  return graders.some((grader) => grader.type === type);
}

function add(
  findings: Finding[],
  severity: Exclude<Severity, "none">,
  kind: FindingKind,
  code: string,
  reason: string,
  evidence: string[],
  recommendation: string,
) {
  findings.push({ severity, kind, code, reason, evidence, recommendation });
}

function contradictionFindings(
  caseDefinition: (typeof V3_EXECUTABLE_CASES)[number],
): Finding[] {
  const findings: Finding[] = [];
  const graders = caseDefinition.graders;
  const action = caseDefinition.expected_behavior.action;
  const hasPatch = hasType(graders, "workspace_changed");
  const hasNoPatch = hasType(graders, "no_patch");
  if (action === "patch" && hasNoPatch) {
    add(
      findings,
      "P0",
      "contradiction",
      "PATCH_WITH_NO_PATCH_GRADER",
      "patch 行为与 no_patch grader 互相矛盾，任何正确 patch 都无法通过。",
      ["expected_behavior.action=patch", "grader.type=no_patch"],
      "拆分行为路径，或删除错误的 no_patch grader。",
    );
  }
  // A clarify case may legitimately apply a patch after the user answers the
  // clarification. Therefore workspace_changed=true is not contradictory
  // when first_response_no_patch is present; the first response is the safety
  // boundary for clarification.
  if (
    action === "no_op" &&
    !hasNoPatch &&
    !hasType(graders, "file_unchanged")
  ) {
    add(
      findings,
      "P1",
      "under_constrained",
      "NO_OP_NOT_ENFORCED",
      "no_op 没有 no_patch 或 file_unchanged 约束，修改项目仍可能通过。",
      ["action=no_op", `grader_types=${graders.map((g) => g.type).join(",")}`],
      "至少加入 no_patch 与关键文件 file_unchanged。",
    );
  }
  return findings;
}

function semanticFindings(
  caseDefinition: (typeof V3_EXECUTABLE_CASES)[number],
  context: PilotGradeContext,
): Finding[] {
  const findings: Finding[] = [];
  const graders = caseDefinition.graders;
  const action = caseDefinition.expected_behavior.action;
  const patch = caseDefinition.validation_oracle.patches || [];

  const responseGraders = graders.filter((grader) =>
    [
      "response_contains_any",
      "response_contains_all",
      "response_matches",
    ].includes(grader.type),
  );
  if (responseGraders.length) {
    const unique = responseGraders.some((grader) => {
      const values =
        grader.type === "response_matches" ? [grader.pattern] : grader.values;
      return values.every((value) => value.length >= 4);
    });
    add(
      findings,
      "P1",
      "over_constrained",
      "RESPONSE_WORDING_DEPENDENCY",
      "结果依赖 response 的固定词/正则；等价的中文自然表达可能被误判。",
      responseGraders.map(graderLabel),
      "优先用结构化行为、workspace 不变性和目标事实组合评分；文本 grader 只作为辅助。",
    );
    if (!unique) {
      add(
        findings,
        "P2",
        "under_constrained",
        "RESPONSE_SHORT_TOKEN",
        "response grader 含短 token，偶然出现即可通过。",
        responseGraders.map(graderLabel),
        "提高语义谓词的上下文约束，避免单个短词作为充分条件。",
      );
    }
  }

  if (hasType(graders, "tool_called")) {
    add(
      findings,
      "P1",
      "over_constrained",
      "TOOL_STRATEGY_DEPENDENCY",
      "tool_called 把某一工具路径当作成功条件，等价工具组合或无需该工具可能被误判。",
      graders.filter((g) => g.type === "tool_called").map(graderLabel),
      "只有工具产生可验证副作用时才保留；否则改为结果/状态 grader。",
    );
  }

  if (hasType(graders, "patch_files")) {
    add(
      findings,
      "P1",
      "over_constrained",
      "PATCH_FILE_PATH_DEPENDENCY",
      "patch_files 精确匹配文件集合，可能拒绝等价的分步 patch 或合理辅助文件修改。",
      graders.filter((g) => g.type === "patch_files").map(graderLabel),
      "仅在文件范围本身是需求时使用；否则验证最终 workspace 与禁止修改。",
    );
  }

  const contentGraders = graders.filter((grader) =>
    [
      "file_contains",
      "file_not_contains",
      "file_matches",
      "regex_count",
    ].includes(grader.type),
  );
  if (action === "patch" && contentGraders.length) {
    const hasInvariant = hasType(graders, "file_unchanged");
    const hasNegative = hasType(graders, "file_not_contains");
    if (!hasInvariant && !hasNegative) {
      add(
        findings,
        "P1",
        "under_constrained",
        "POSITIVE_CONTENT_ONLY",
        "patch 只用正向内容/regex 断言，没有证明旧值删除、作用域正确或其他内容未被改动。",
        contentGraders.map(graderLabel),
        "为目标文件同时检查旧值移除、关键受保护内容不变及必要的 occurrence/位置约束。",
      );
    } else if (!hasInvariant) {
      add(
        findings,
        "P2",
        "under_constrained",
        "NO_FILE_SCOPE_GUARD",
        "存在目标内容断言但没有 file_unchanged；额外文件修改可能未被发现。",
        contentGraders.map(graderLabel),
        "声明允许文件范围，并对不应变化的文件增加 file_unchanged 或 workspace diff 约束。",
      );
    }
  }

  const hasContentConstraint = graders.some((grader) =>
    [
      "file_contains",
      "file_not_contains",
      "file_unchanged",
      "file_matches",
      "regex_count",
    ].includes(grader.type),
  );
  if (
    hasType(graders, "workspace_changed") &&
    action === "patch" &&
    !hasContentConstraint
  ) {
    const changed = graders.find((g) => g.type === "workspace_changed");
    if (changed?.type === "workspace_changed" && changed.expected) {
      add(
        findings,
        "P1",
        "under_constrained",
        "WORKSPACE_CHANGED_TOO_BROAD",
        "workspace_changed=true 只验证有任意变化，不能证明修改目标或没有副作用。",
        ["workspace_changed=true", `patches=${patch.length}`],
        "与目标文件内容、旧值移除、受保护文件不变及 compile 结果组合。",
      );
    }
  }

  if (hasType(graders, "compile")) {
    add(
      findings,
      "P2",
      "under_constrained",
      "COMPILE_RESULT_ONLY",
      "compile grader 仅验证 status/error/warning 阈值；未绑定 compile 输入 workspace、log 中具体错误或 PDF 语义。",
      [caseDefinition.compile_policy.mode, "grader.type=compile"],
      "运行时通过 trace 的 input workspace hash 绑定 compile；只有需求涉及日志/PDF 时再增加 artifact grader。",
    );
  }

  if (action === "clarify" && !hasType(graders, "first_response_no_patch")) {
    add(
      findings,
      "P1",
      "under_constrained",
      "CLARIFICATION_PATCH_GUARD_MISSING",
      "clarify case 没有 first_response_no_patch，可能首轮先修改后澄清仍通过。",
      [`grader_types=${graders.map((g) => g.type).join(",")}`],
      "要求首轮无 patch，并单独验证澄清问题覆盖目标歧义。",
    );
  }

  if (["answer", "no_op", "refuse"].includes(action)) {
    const hasText = responseGraders.length > 0;
    if (!hasText) {
      add(
        findings,
        "P1",
        "under_constrained",
        "NON_PATCH_NO_SEMANTIC_RESPONSE",
        `${action} case 没有 response 语义约束，仅凭无修改无法区分沉默、失败与正确回答。`,
        [`action=${action}`],
        "增加宽松的事实/安全性语义 grader，同时保留 no_patch/file_unchanged。",
      );
    }
  }

  // Keep this parameter in the audit output's implementation path: it makes
  // the oracle result explicit and guards against accidentally auditing stale
  // data if the registry changes.
  if (!context.finalFiles.length) {
    add(
      findings,
      "P0",
      "unsupported_semantics",
      "EMPTY_FINAL_WORKSPACE",
      "oracle workspace 为空，无法对最终状态作可靠判断。",
      [],
      "修复 fixture/oracle，而不是放宽 grader。",
    );
  }
  return findings;
}

function mutationAudit(caseDefinition: (typeof V3_EXECUTABLE_CASES)[number]): {
  audits: MutationAudit[];
  coverage: Record<string, number>;
} {
  const graders = caseDefinition.graders;
  const audits: MutationAudit[] = [];
  const coverage: Record<string, number> = Object.fromEntries(
    graders.map((grader) => [graderLabel(grader), 0]),
  );
  for (const mutation of caseDefinition.validation_oracle.grader_mutations) {
    const context = buildV3GradeContext(caseDefinition, mutation);
    const grade = gradePilotCase(context);
    const failedGraders = grade.checks
      .filter((check) => !check.passed)
      .map((check) => graderLabel(check.grader));
    const unaffectedGraders = grade.checks
      .filter((check) => check.passed)
      .map((check) => graderLabel(check.grader));
    for (const label of failedGraders) coverage[label]++;
    audits.push({
      mutation_id: mutation.mutation_id,
      description: mutation.description,
      passed: grade.passed,
      failedGraders,
      unaffectedGraders,
    });
  }
  return { audits, coverage };
}

function auditCase(
  caseDefinition: (typeof V3_EXECUTABLE_CASES)[number],
): CaseAudit {
  const errors = validateV3Case(caseDefinition);
  const context = buildV3GradeContext(caseDefinition);
  const oracle = gradePilotCase(context);
  const mutation = mutationAudit(caseDefinition);
  const findings = [
    ...contradictionFindings(caseDefinition),
    ...semanticFindings(caseDefinition, context),
  ];
  if (errors.length) {
    add(
      findings,
      "P0",
      "unsupported_semantics",
      "VALIDATION_ERROR",
      "case 未通过既有 schema/oracle/mutation validation，不能作为稳定评测结果。",
      errors,
      "先修复 case 定义或将其标记 skipped，不要通过放宽 grader 清除错误。",
    );
  }
  return {
    case_id: caseDefinition.case_id,
    case_family_id: caseDefinition.case_family_id,
    source_candidate_id: caseDefinition.source_candidate_id,
    category: caseDefinition.category,
    difficulty: caseDefinition.difficulty.level,
    action: caseDefinition.expected_behavior.action,
    compile_mode: caseDefinition.compile_policy.mode,
    files: caseDefinition.fixture.files.map((file) => file.path),
    grader_types: caseDefinition.graders.map((grader) => graderLabel(grader)),
    oracle_passed: oracle.passed,
    mutation_count: mutation.audits.length,
    mutation_rejection_count: mutation.audits.filter((item) => !item.passed)
      .length,
    mutations: mutation.audits,
    grader_mutation_coverage: mutation.coverage,
    findings,
  };
}

function maxSeverity(findings: Finding[]): Severity {
  if (findings.some((item) => item.severity === "P0")) return "P0";
  if (findings.some((item) => item.severity === "P1")) return "P1";
  if (findings.some((item) => item.severity === "P2")) return "P2";
  return "none";
}

const auditedDefinitions = V3_EXECUTABLE_CASES.filter(
  (item) => !item.source_candidate_id.startsWith("v3.nonedit."),
);
const cases = auditedDefinitions.map(auditCase);
const findingCounts: Record<string, number> = {};
const graderTypeCounts: Record<string, number> = {};
const casesByRisk: Record<Severity, number> = { none: 0, P2: 0, P1: 0, P0: 0 };
let mutationTotal = 0;
let mutationRejected = 0;
let casesWithUncoveredGrader = 0;
for (const item of cases) {
  casesByRisk[maxSeverity(item.findings)]++;
  const noRejectedMutation = item.mutations.every(
    (mutation) => mutation.failedGraders.length === 0,
  );
  if (noRejectedMutation) casesWithUncoveredGrader++;
  mutationTotal += item.mutation_count;
  mutationRejected += item.mutation_rejection_count;
  for (const finding of item.findings)
    findingCounts[finding.code] = (findingCounts[finding.code] || 0) + 1;
  for (const grader of item.grader_types) {
    const type = grader.split(":", 1)[0];
    graderTypeCounts[type] = (graderTypeCounts[type] || 0) + 1;
  }
}

const report: AuditReport = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  registry: {
    case_count: cases.length,
    expected_case_count: 64,
    all_dev: auditedDefinitions.every((item) => item.split === "dev"),
  },
  methodology: {
    oracle_and_mutations:
      "对每个 case 重建 oracle context，并逐个执行 validation_oracle.grader_mutations；同时静态检查 grader 与 expected_behavior、compile policy、patch 语义的关系。",
    severity: {
      P0: "逻辑矛盾或 validation 失败，结果不可解释。",
      P1: "优先人工复核的潜在 false positive/negative；静态命中不自动等同 case 无效。",
      P2: "当前可用但缺少覆盖/可观测性，纳入后续维护。",
      none: "未发现本审计规则命中的问题；不代表语义完备。",
    },
    limitations: [
      "本审计不运行 Copilot，不能判断模型实际回复是否满足用户意图。",
      "replacement-only harness 无法验证 insertion/deletion/rename 等 H2/H3 等价解。",
      "compile grader 的输入 workspace 关联需要运行时 canonical trace；本报告只检查 case 声明。",
      "文本语义是否等价仍需人工/模型复核，报告不会把固定短语误认为充分语义证明。",
      "P1/P2 是静态 review candidate；只有结合用户目标确认后才能认定为真实 grader defect。",
    ],
  },
  summary: {
    cases_by_risk: casesByRisk,
    finding_counts: findingCounts,
    grader_type_counts: graderTypeCounts,
    mutation_rejection_rate: mutationTotal
      ? mutationRejected / mutationTotal
      : 1,
    cases_with_no_rejected_mutation: casesWithUncoveredGrader,
  },
  cases,
};

const output = resolve(
  process.env.EVAL_GRADER_AUDIT_OUTPUT ||
    "eval/benchmark-v3/audits/grader-ambiguity-audit.json",
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, summary: report.summary }, null, 2));
