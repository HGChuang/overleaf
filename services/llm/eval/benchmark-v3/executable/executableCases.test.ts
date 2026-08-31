import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPilotCase } from "../../pilot/caseRegistry.js";
import { gradePilotCase } from "../../pilot/graderRegistry.js";
import type { Capability } from "../../pilot/types.js";
import { V3_EXECUTABLE_CASES } from "./index.js";
import {
  buildV3GradeContext,
  oracleWorkspaceHash,
  validateV3Registry,
} from "./validation.js";

const EXPECTED_SOURCE_COUNTS: Record<string, number> = {
  content: 16,
  compile: 17,
  artifact: 16,
  interaction: 15,
  nonedit: 9,
};

test("Benchmark v3 三批物化 73 个不重复的中文 dev family", () => {
  assert.equal(V3_EXECUTABLE_CASES.length, 73);
  assert.equal(
    new Set(V3_EXECUTABLE_CASES.map((item) => item.case_id)).size,
    V3_EXECUTABLE_CASES.length,
  );
  assert.equal(
    new Set(V3_EXECUTABLE_CASES.map((item) => item.source_candidate_id)).size,
    V3_EXECUTABLE_CASES.length,
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(EXPECTED_SOURCE_COUNTS).map((source) => [
        source,
        V3_EXECUTABLE_CASES.filter((item) =>
          item.source_candidate_id.startsWith(`v3.${source}.`),
        ).length,
      ]),
    ),
    EXPECTED_SOURCE_COUNTS,
  );
  assert.ok(V3_EXECUTABLE_CASES.every((item) => item.split === "dev"));
});

test("所有 v3 case 通过 schema、oracle、中文和 grader mutation gate", () => {
  assert.deepEqual(validateV3Registry(V3_EXECUTABLE_CASES), []);
});

test("三批物化集覆盖难度、上下文、编译、交互和非编辑决策", () => {
  const difficultyCount = (level: string) =>
    V3_EXECUTABLE_CASES.filter((item) => item.difficulty.level === level)
      .length;
  assert.ok(difficultyCount("D2") >= 8);
  assert.ok(difficultyCount("D3") >= 20);
  assert.ok(difficultyCount("D4") >= 15);
  assert.ok(
    V3_EXECUTABLE_CASES.filter((item) => item.fixture.files.length > 1)
      .length >= 45,
  );
  assert.ok(
    V3_EXECUTABLE_CASES.filter((item) =>
      ["required-after-apply", "repair-loop"].includes(
        item.compile_policy.mode,
      ),
    ).length >= 45,
  );
  assert.ok(
    V3_EXECUTABLE_CASES.filter((item) => item.expected_behavior.dynamic_user)
      .length >= 18,
  );
  assert.ok(
    V3_EXECUTABLE_CASES.filter(
      (item) => item.expected_behavior.action !== "patch",
    ).length >= 16,
  );
  for (const action of ["patch", "clarify", "answer", "no_op", "refuse"]) {
    assert.ok(
      V3_EXECUTABLE_CASES.some(
        (item) => item.expected_behavior.action === action,
      ),
      action,
    );
  }
  const actionCount = (action: string) =>
    V3_EXECUTABLE_CASES.filter(
      (item) => item.expected_behavior.action === action,
    ).length;
  assert.ok(actionCount("answer") >= 4);
  assert.ok(actionCount("no_op") >= 4);
  assert.ok(actionCount("refuse") >= 8);
});

test("C1-C11 在前两批 v3 可执行集中均有直接覆盖", () => {
  const capabilities = Array.from(
    { length: 11 },
    (_, index) => `C${index + 1}`,
  ) as Capability[];
  for (const capability of capabilities) {
    assert.ok(
      V3_EXECUTABLE_CASES.some((item) =>
        item.capabilities.includes(capability),
      ),
      capability,
    );
  }
  const capabilityCount = (capability: Capability) =>
    V3_EXECUTABLE_CASES.filter((item) => item.capabilities.includes(capability))
      .length;
  assert.ok(capabilityCount("C9") >= 10);
  assert.ok(capabilityCount("C10") >= 15);
  assert.ok(capabilityCount("C11") >= 12);
});

test("generic runner registry 可以解析全部 v3 case", () => {
  for (const caseDefinition of V3_EXECUTABLE_CASES) {
    assert.equal(getPilotCase(caseDefinition.case_id), caseDefinition);
  }
});

test("标题澄清真实两轮闭环的等价 trace 通过最终 contract", () => {
  const caseDefinition = V3_EXECUTABLE_CASES.find(
    (item) => item.case_id === "v3.interaction-title-clarification.v1",
  );
  assert.ok(caseDefinition);
  const context = buildV3GradeContext(caseDefinition);
  context.responses[0].text =
    "我查看了项目文件，第二章标题存在多个候选。请选择合适的标题，确认后我再修改。";
  context.responses[1].text =
    "已按您选择的 Theoretical Framework 修改标题，保持 section 结构，正文未改动，编译成功。";
  context.responses[0].hadPatch = false;
  context.responses[1].hadPatch = true;
  const grade = gradePilotCase(context);
  assert.equal(grade.passed, true, JSON.stringify(grade.checks));
  assert.deepEqual(
    grade.checks.filter((check) => !check.passed),
    [],
  );
});

test("标题澄清 contract 拒绝受保护正文 mutation", () => {
  const caseDefinition = V3_EXECUTABLE_CASES.find(
    (item) => item.case_id === "v3.interaction-title-clarification.v1",
  );
  assert.ok(caseDefinition);
  const mutation = caseDefinition.validation_oracle.grader_mutations.find(
    (item) => item.mutation_id === "修改受保护正文",
  );
  assert.ok(mutation);
  const grade = gradePilotCase(buildV3GradeContext(caseDefinition, mutation));
  assert.equal(grade.passed, false);
  assert.ok(
    grade.checks.some(
      (check) =>
        check.grader.type === "file_matches" && check.passed === false,
    ),
  );
});

interface CompileValidationCase {
  case_id: string;
  fixture_hash: string;
  oracle_workspace_hash: string;
  mutation_count: number;
  initial_compile: { valid: boolean };
  final_compile: { valid: boolean; error_count: number };
  valid: boolean;
}

test("真实 CLSI report 与当前 fixture 和 oracle hash 一致", () => {
  const report = JSON.parse(
    readFileSync(new URL("validation-report.json", import.meta.url), "utf8"),
  ) as {
    valid: boolean;
    compile_validation: boolean;
    case_count: number;
    cases: CompileValidationCase[];
  };
  assert.equal(report.valid, true);
  assert.equal(report.compile_validation, true);
  assert.equal(report.case_count, V3_EXECUTABLE_CASES.length);
  const reportCases = new Map(report.cases.map((item) => [item.case_id, item]));

  for (const caseDefinition of V3_EXECUTABLE_CASES) {
    const item = reportCases.get(caseDefinition.case_id);
    assert.ok(item, caseDefinition.case_id);
    assert.equal(item.valid, true, caseDefinition.case_id);
    assert.equal(item.fixture_hash, caseDefinition.fixture.sha256);
    assert.equal(
      item.oracle_workspace_hash,
      oracleWorkspaceHash(caseDefinition),
    );
    assert.equal(item.initial_compile.valid, true);
    assert.equal(item.final_compile.valid, true);
    assert.equal(item.final_compile.error_count, 0);
    assert.equal(
      item.mutation_count,
      caseDefinition.validation_oracle.grader_mutations.length,
    );
  }
});
