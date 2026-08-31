import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hashValue } from "../headless/canonicalTrace.js";
import { V3_EXECUTABLE_CASES } from "../benchmark-v3/executable/index.js";
import {
  buildTrialPlans,
  parseRunnerResult,
  selectV3Cases,
} from "./baselineScheduler.js";
import { readCompletedTrials } from "./baselineResume.js";

test("baseline plan covers the 73 V3 cases with three stable trials", () => {
  assert.equal(selectV3Cases().length, 73);
  const plans = buildTrialPlans(
    V3_EXECUTABLE_CASES,
    "baseline-test",
    3,
    "507f1f77bcf86cd799439011",
  );
  assert.equal(plans.length, 219);
  assert.equal(new Set(plans.map((plan) => plan.trialId)).size, 219);
  assert.equal(plans[0].userId, "507f1f77bcf86cd799439011");
  assert.notEqual(plans[0].userSessionId, plans[1].userSessionId);
});

test("scheduler refuses a synthetic user identity", () => {
  assert.throws(
    () => buildTrialPlans(V3_EXECUTABLE_CASES.slice(0, 1), "baseline-test", 3),
    /real EVAL_USER_ID/,
  );
});

test("runner result parser ignores protocol/compose noise", () => {
  assert.deepEqual(
    parseRunnerResult(
      'compose warning\n__OVERLEAF_EVAL_PROTOCOL_V1__{"status":"noise"}\n{"status":"PASS","runId":"run_1"}\n',
    ),
    { status: "PASS", runId: "run_1" },
  );
});

test("resume returns the original result only for an exact run identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "overleaf-eval-resume-"));
  const caseDefinition = V3_EXECUTABLE_CASES[0];
  const runDir = join(root, "completed");
  await mkdir(runDir);
  const trialId =
    "baseline-test--v3.content-introduction-progression.v1--trial-1";
  await writeFile(
    join(runDir, "run.json"),
    JSON.stringify({
      experiment_id: "baseline-test",
      case_id: caseDefinition.case_id,
      trial_id: trialId,
      git_commit: "abc123",
      fixture_hash: caseDefinition.fixture.sha256,
      benchmark_hash: hashValue(caseDefinition),
    }),
  );
  await writeFile(
    join(runDir, "result.json"),
    JSON.stringify({
      experimentId: "baseline-test",
      caseId: caseDefinition.case_id,
      trialId,
      status: "COPILOT_FAILURE",
      runId: "run_1",
      runDir,
      wallMs: 12,
    }),
  );
  const resumed = await readCompletedTrials(root, "baseline-test", "abc123", [
    caseDefinition,
  ]);
  assert.equal(resumed.get(trialId)?.status, "COPILOT_FAILURE");
  assert.equal(resumed.get(trialId)?.resumed, true);
});
