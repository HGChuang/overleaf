import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { V3_EXECUTABLE_CASES } from "../executable/index.js";

const auditedCases = V3_EXECUTABLE_CASES.filter(
  (item) => !item.source_candidate_id.startsWith("v3.nonedit."),
);

test("lineage audit report 冻结并覆盖原 64 个 family", () => {
  const report = JSON.parse(
    readFileSync(new URL("lineage-audit.json", import.meta.url), "utf8"),
  );
  assert.equal(report.source.case_count, 64);
  assert.deepEqual(
    report.case_lineage.map((item: { case_id: string }) => item.case_id).sort(),
    auditedCases.map((item) => item.case_id).sort(),
  );
  assert.equal(report.conclusions.exact_identity_collision_free, true);
  assert.equal(report.conclusions.linkage_consistent, true);
  assert.equal(report.conclusions.split_leakage_detected, false);
  assert.equal(report.conclusions.prompt_near_duplicates_require_review, false);
  assert.equal(
    report.conclusions.fixture_near_duplicates_require_review,
    false,
  );
});

test("grader ambiguity report 覆盖 64 个 oracle 与 128 个 mutation", () => {
  const report = JSON.parse(
    readFileSync(
      new URL("grader-ambiguity-audit.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(report.registry.case_count, 64);
  assert.deepEqual(
    report.cases.map((item: { case_id: string }) => item.case_id).sort(),
    auditedCases.map((item) => item.case_id).sort(),
  );
  assert.ok(
    report.cases.every(
      (item: { oracle_passed: boolean }) => item.oracle_passed,
    ),
  );
  assert.equal(
    report.cases.reduce(
      (sum: number, item: { mutation_count: number }) =>
        sum + item.mutation_count,
      0,
    ),
    128,
  );
  assert.equal(report.summary.mutation_rejection_rate, 1);
  assert.equal(report.summary.cases_by_risk.P0, 0);
});
