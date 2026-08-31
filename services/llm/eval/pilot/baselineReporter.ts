/** Aggregate canonical trial results without rerunning an Agent. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ReportStatus =
  "PASS" | "COPILOT_FAILURE" | "INFRA_FAILURE" | "INVALID" | "SKIPPED";

export interface RecordedTrial {
  experimentId: string;
  caseId: string;
  caseFamilyId?: string;
  split?: string;
  trialId: string;
  status: ReportStatus;
  runId?: string;
  runDir?: string;
  failure?: Record<string, unknown> | null;
  usage?: Record<string, unknown>;
  toolCalls?: Record<string, number>;
  patchCount?: number;
  patchRejectionCount?: number;
  userTurnCount?: number;
  responseCount?: number;
  wallMs?: number;
}

const STATUSES = new Set<ReportStatus>([
  "PASS",
  "COPILOT_FAILURE",
  "INFRA_FAILURE",
  "INVALID",
  "SKIPPED",
]);

export async function readRecordedTrials(
  artifactRoot: string,
  experimentId: string,
): Promise<RecordedTrial[]> {
  const trials: RecordedTrial[] = [];
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await readdir(artifactRoot, {
      withFileTypes: true,
    })) as unknown as Array<{
      name: string;
      isDirectory(): boolean;
    }>;
  } catch {
    return trials;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_scheduler") continue;
    try {
      const result = JSON.parse(
        await readFile(join(artifactRoot, entry.name, "result.json"), "utf8"),
      ) as Record<string, unknown>;
      if (
        result.experimentId !== experimentId ||
        !STATUSES.has(String(result.status) as ReportStatus) ||
        typeof result.trialId !== "string" ||
        typeof result.caseId !== "string"
      )
        continue;
      trials.push({
        experimentId,
        caseId: result.caseId,
        caseFamilyId:
          typeof result.caseFamilyId === "string"
            ? result.caseFamilyId
            : undefined,
        split: typeof result.split === "string" ? result.split : undefined,
        trialId: result.trialId,
        status: result.status as ReportStatus,
        runId: typeof result.runId === "string" ? result.runId : undefined,
        runDir: typeof result.runDir === "string" ? result.runDir : undefined,
        failure: result.failure as Record<string, unknown> | null | undefined,
        usage: result.usage as Record<string, unknown> | undefined,
        toolCalls: result.toolCalls as Record<string, number> | undefined,
        patchCount:
          typeof result.patchCount === "number" ? result.patchCount : undefined,
        patchRejectionCount:
          typeof result.patchRejectionCount === "number"
            ? result.patchRejectionCount
            : undefined,
        userTurnCount:
          typeof result.userTurnCount === "number"
            ? result.userTurnCount
            : undefined,
        responseCount:
          typeof result.responseCount === "number"
            ? result.responseCount
            : undefined,
        wallMs: typeof result.wallMs === "number" ? result.wallMs : undefined,
      });
    } catch {
      // Incomplete or unrelated artifact directories are not trial results.
    }
  }
  return trials.sort((a, b) => a.trialId.localeCompare(b.trialId));
}

export function makeBaselineReport(
  experimentId: string,
  trials: RecordedTrial[],
) {
  const statusCounts: Record<string, number> = {};
  const capabilityOutcomes: Record<string, number> = {};
  const infrastructureOutcomes: Record<string, number> = {};
  const byCase: Record<string, Record<string, number>> = {};
  for (const trial of trials) {
    statusCounts[trial.status] = (statusCounts[trial.status] || 0) + 1;
    const bucket =
      trial.status === "PASS" || trial.status === "COPILOT_FAILURE"
        ? capabilityOutcomes
        : infrastructureOutcomes;
    bucket[trial.status] = (bucket[trial.status] || 0) + 1;
    byCase[trial.caseId] ||= {};
    byCase[trial.caseId][trial.status] =
      (byCase[trial.caseId][trial.status] || 0) + 1;
  }
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    experiment_id: experimentId,
    trial_count: trials.length,
    status_counts: statusCounts,
    capability_outcomes: capabilityOutcomes,
    infrastructure_outcomes: infrastructureOutcomes,
    by_case: byCase,
    trials,
  };
}

export async function writeBaselineReport(
  outputPath: string,
  experimentId: string,
  trials: RecordedTrial[],
) {
  const report = makeBaselineReport(experimentId, trials);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
