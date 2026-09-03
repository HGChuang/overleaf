import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { V3_EXECUTABLE_CASES } from "../benchmark-v3/executable/index.js";
import { validatePilotCase } from "./caseRegistry.js";
import {
  buildSemanticGraderInput,
  validateSemanticGraderOutput,
} from "./semanticGrader.js";
import type { PilotGradeContext } from "./types.js";

const EXPECTED_SEMANTIC_CASES = [
  "v3.compile-lesson-list-recovery.v1",
  "v3.content-appendix-interview-translation.v1",
  "v3.content-bilingual-questionnaire-format.v1",
  "v3.content-bilingual-sync.v1",
  "v3.content-project-directory-refusal.v1",
  "v3.content-robotics-polish.v1",
  "v3.noop-theorem-numbering-already-scoped.v1",
  "v3.noop-title-already-exact.v1",
  "v3.refuse-unsupported-result-number.v1",
  "v3.result-figure-near-analysis.v1",
];

function contextFor(caseId: string): PilotGradeContext {
  const caseDefinition = V3_EXECUTABLE_CASES.find(
    (item) => item.case_id === caseId,
  );
  if (!caseDefinition) throw new Error(`missing test case ${caseId}`);
  const files = caseDefinition.fixture.files.map((file) => ({ ...file }));
  return {
    caseDefinition,
    initialFiles: files,
    finalFiles: files.map((file) => ({ ...file })),
    responses: [
      {
        userTurn: 1,
        kind: "user",
        text: "semantic grader test response",
        hadPatch: false,
      },
    ],
    patchFiles: [],
    patchCount: 0,
    patchRejectionCount: 0,
    userTurnCount: 1,
    toolCalls: {},
    compile: null,
  };
}

test("semantic grading is explicitly enabled for the audited cases only", () => {
  const actual = V3_EXECUTABLE_CASES.filter(
    (item) => item.semantic_grading,
  ).map((item) => item.case_id);
  assert.deepEqual([...actual].sort(), EXPECTED_SEMANTIC_CASES);
  for (const caseDefinition of V3_EXECUTABLE_CASES) {
    assert.deepEqual(validatePilotCase(caseDefinition), []);
  }
});

test("semantic input contains evidence but not case identity", () => {
  const input = buildSemanticGraderInput(
    contextFor("v3.content-project-directory-refusal.v1"),
  );
  assert.equal(input.protocol, "overleaf-semantic-grader/v1");
  assert.equal(input.task.semantic_type, "response_semantics");
  assert.deepEqual(input.evidence.initial_files, []);
  assert.deepEqual(input.evidence.final_files, []);
  assert.ok(input.criteria.length >= 2);
  assert.ok(!JSON.stringify(input).includes("case_id"));
  assert.ok(!JSON.stringify(input).includes("case family"));
});

test("content semantic input is limited to declared files", () => {
  const input = buildSemanticGraderInput(
    contextFor("v3.content-appendix-interview-translation.v1"),
  );
  assert.equal(input.task.semantic_type, "content_semantics");
  assert.deepEqual(
    input.evidence.initial_files.map((file) => file.path),
    ["appendix.tex", "interview.tex"],
  );
  assert.deepEqual(
    input.evidence.final_files.map((file) => file.path),
    ["appendix.tex", "interview.tex"],
  );
});

test("semantic output is validated and aggregated deterministically", () => {
  const criteria = [
    { id: "one", description: "first" },
    { id: "two", description: "second" },
  ];
  const passing = validateSemanticGraderOutput(
    {
      criteria: [
        {
          id: "one",
          passed: true,
          evidence: "first evidence",
          rationale: "first rationale",
        },
        {
          id: "two",
          passed: true,
          evidence: "second evidence",
          rationale: "second rationale",
        },
      ],
      summary: "all criteria passed",
    },
    criteria,
  );
  assert.equal(passing.status, "pass");
  assert.equal(passing.passed, true);

  const failing = validateSemanticGraderOutput(
    {
      criteria: [
        {
          id: "one",
          passed: true,
          evidence: "first evidence",
          rationale: "first rationale",
        },
        {
          id: "two",
          passed: false,
          evidence: "second evidence",
          rationale: "second rationale",
        },
      ],
      summary: "one criterion failed",
    },
    criteria,
  );
  assert.equal(failing.status, "fail");
  assert.equal(failing.passed, false);

  assert.throws(
    () =>
      validateSemanticGraderOutput(
        {
          criteria: [
            {
              id: "unknown",
              passed: true,
              evidence: "evidence",
              rationale: "rationale",
            },
          ],
          summary: "unknown criterion",
        },
        criteria,
      ),
    /unknown criterion/,
  );
});

test("semantic grader adapter files are present and executable", async () => {
  const repoRoot = new URL("../../../../", import.meta.url);
  const schema = JSON.parse(
    await readFile(
      new URL(".agent/semantic_grader/output.schema.json", repoRoot),
      "utf8",
    ),
  ) as { required?: string[] };
  assert.deepEqual(schema.required, ["criteria", "summary"]);
  await access(
    new URL(".agent/semantic_grader/run.sh", repoRoot),
    constants.X_OK,
  );
});
