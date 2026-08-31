import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { hashValue } from "../headless/canonicalTrace.js";
import type { PilotCase } from "./types.js";
import type { SchedulerTrialResult, TrialStatus } from "./baselineScheduler.js";

const statuses = new Set<TrialStatus>([
  "PASS",
  "COPILOT_FAILURE",
  "INFRA_FAILURE",
  "INVALID",
  "SKIPPED",
]);

/** Return only completed trials whose run manifest belongs to this exact baseline. */
export async function readCompletedTrials(
  root: string,
  experimentId: string,
  gitCommit: string,
  cases: PilotCase[],
): Promise<Map<string, SchedulerTrialResult>> {
  const output = new Map<string, SchedulerTrialResult>();
  const byCase = new Map(cases.map((item) => [item.case_id, item]));
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await readdir(root, {
      withFileTypes: true,
    })) as unknown as Array<{
      name: string;
      isDirectory(): boolean;
    }>;
  } catch {
    return output;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_scheduler") continue;
    try {
      const result = JSON.parse(
        await readFile(join(root, entry.name, "result.json"), "utf8"),
      ) as Record<string, unknown>;
      const caseDefinition = byCase.get(String(result.caseId));
      const run = JSON.parse(
        await readFile(join(root, entry.name, "run.json"), "utf8"),
      ) as Record<string, unknown>;
      if (
        result.experimentId !== experimentId ||
        typeof result.trialId !== "string" ||
        !statuses.has(String(result.status) as TrialStatus) ||
        !caseDefinition ||
        run.experiment_id !== experimentId ||
        run.case_id !== result.caseId ||
        run.trial_id !== result.trialId ||
        run.git_commit !== gitCommit ||
        run.fixture_hash !== caseDefinition.fixture.sha256 ||
        run.benchmark_hash !== hashValue(caseDefinition)
      )
        continue;
      const trialNumber = Number(
        String(result.trialId).match(/--trial-(\d+)$/)?.[1] || 0,
      );
      output.set(result.trialId, {
        experimentId,
        caseId: caseDefinition.case_id,
        caseFamilyId: caseDefinition.case_family_id,
        split: caseDefinition.split,
        trialId: result.trialId,
        trialNumber,
        status: result.status as TrialStatus,
        runId: typeof result.runId === "string" ? result.runId : undefined,
        runDir: typeof result.runDir === "string" ? result.runDir : undefined,
        failure: result.failure as Record<string, unknown> | undefined,
        exitCode: 0,
        durationMs: typeof result.wallMs === "number" ? result.wallMs : 0,
        resumed: true,
      });
    } catch {
      // Incomplete artifacts are intentionally rerun.
    }
  }
  return output;
}
