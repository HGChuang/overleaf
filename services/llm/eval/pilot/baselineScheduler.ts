/**
 * Baseline trial scheduler.
 *
 * This module only orchestrates already existing runPilotCase processes.  It
 * deliberately does not manufacture user turns.  A caller must provide the
 * initial message(s) from an eval_user session through EVAL_USER_MESSAGES_DIR
 * (or EVAL_USER_MESSAGES_JSON for a one-off case).  Dynamic sessions may use
 * EVAL_USER_BRIDGE_COMMAND; the bridge is an external eval_user adapter and
 * owns the user simulation.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { mkdir, readFile, readdir, writeFile, open } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { EVAL_PROTOCOL_PREFIX } from "./dynamicProtocol.js";
import { V3_EXECUTABLE_CASES } from "../benchmark-v3/executable/index.js";
import type { PilotCase } from "./types.js";
import { readCompletedTrials } from "./baselineResume.js";
import { writeJsonAtomic } from "../headless/canonicalTrace.js";
import {
  SEMANTIC_GRADER_INPUT_FILE,
  SEMANTIC_GRADER_RESULT_FILE,
  validateSemanticGraderOutput,
} from "./semanticGrader.js";
import {
  evalUserBridgeTimeoutMs,
  waitForChild,
  withTimeout,
  type ChildExit,
} from "./processLifecycle.js";

export type TrialStatus =
  "PASS" | "COPILOT_FAILURE" | "INFRA_FAILURE" | "INVALID" | "SKIPPED";

export interface TrialPlan {
  experimentId: string;
  caseDefinition: PilotCase;
  trialNumber: number;
  trialId: string;
  userSessionId: string;
  userId: string;
}

export interface SchedulerOptions {
  experimentId: string;
  trials: number;
  concurrency: number;
  artifactRoot: string;
  hostArtifactRoot: string;
  gitCommit: string;
  caseIds?: string[];
  split?: "dev" | "holdout";
  resume: boolean;
  messagesDir?: string;
  messagesJson?: string;
  bridgeCommand?: string;
  semanticGraderCommand?: string;
  semanticGraderTimeoutMs: number;
  userId: string;
  composeWrapper: string;
  repoRoot: string;
}

export interface SchedulerTrialResult {
  experimentId: string;
  caseId: string;
  caseFamilyId: string;
  split: string;
  trialId: string;
  trialNumber: number;
  status: TrialStatus;
  runId?: string;
  runDir?: string;
  failure?: Record<string, unknown>;
  exitCode?: number | null;
  durationMs: number;
  resumed?: boolean;
  schedulerFailure?: string;
  semanticGrader?: {
    status: "pass" | "fail" | "error";
    passed: boolean;
    error?: string;
  };
}

const VALID_STATUSES = new Set<TrialStatus>([
  "PASS",
  "COPILOT_FAILURE",
  "INFRA_FAILURE",
  "INVALID",
  "SKIPPED",
]);

export function buildTrialPlans(
  cases: PilotCase[],
  experimentId: string,
  trials: number,
  userId = "",
): TrialPlan[] {
  if (!experimentId.trim()) throw new Error("experimentId is required");
  if (!Number.isInteger(trials) || trials < 1)
    throw new Error("trials must be a positive integer");
  if (!userId.trim()) throw new Error("a real EVAL_USER_ID is required");
  const plans: TrialPlan[] = [];
  for (const caseDefinition of cases) {
    for (let trialNumber = 1; trialNumber <= trials; trialNumber++) {
      // Do not use a random suffix: retry/resume must address the same trial.
      const identity = `${experimentId}--${caseDefinition.case_id}--trial-${trialNumber}`;
      plans.push({
        experimentId,
        caseDefinition,
        trialNumber,
        trialId: identity,
        userSessionId: `${identity}--session`,
        userId,
      });
    }
  }
  return plans;
}

export function selectV3Cases(
  options: {
    caseIds?: string[];
    split?: "dev" | "holdout";
  } = {},
): PilotCase[] {
  const selected = V3_EXECUTABLE_CASES.filter(
    (item) =>
      (!options.split || item.split === options.split) &&
      (!options.caseIds || options.caseIds.includes(item.case_id)),
  );
  if (options.caseIds) {
    const found = new Set(selected.map((item) => item.case_id));
    const missing = options.caseIds.filter((id) => !found.has(id));
    if (missing.length)
      throw new Error(`unknown case(s): ${missing.join(", ")}`);
  }
  return selected;
}

function jsonCandidates(text: string): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  for (
    let index = text.indexOf("{");
    index >= 0;
    index = text.indexOf("{", index + 1)
  ) {
    try {
      const value = JSON.parse(text.slice(index)) as unknown;
      if (value && typeof value === "object")
        values.push(value as Record<string, unknown>);
    } catch {
      // The runner may print protocol lines and compose diagnostics first.
    }
  }
  return values;
}

export function parseRunnerResult(
  output: string,
): Record<string, unknown> | null {
  const values = jsonCandidates(output);
  return (
    values
      .reverse()
      .find((value) =>
        VALID_STATUSES.has(String(value.status) as TrialStatus),
      ) || null
  );
}

async function readMessages(options: SchedulerOptions, plan: TrialPlan) {
  const candidates = [
    `${plan.caseDefinition.case_id}--trial-${plan.trialNumber}.json`,
    `${plan.caseDefinition.case_id}.json`,
  ];
  if (options.messagesDir) {
    for (const filename of candidates) {
      try {
        const value = JSON.parse(
          await readFile(join(options.messagesDir, filename), "utf8"),
        ) as unknown;
        const record = Array.isArray(value)
          ? { messages: value }
          : (value as Record<string, unknown>);
        if (
          !Array.isArray(record.messages) ||
          record.messages.some(
            (item) => typeof item !== "string" || !item.trim(),
          )
        )
          throw new Error("messages must be a non-empty string array");
        return {
          messages: record.messages as string[],
          sessionId:
            typeof record.session_id === "string"
              ? record.session_id
              : plan.userSessionId,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  if (options.messagesJson) {
    const value = JSON.parse(options.messagesJson) as unknown;
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string" || !item.trim())
    )
      throw new Error(
        "EVAL_USER_MESSAGES_JSON must be a non-empty string array",
      );
    return { messages: value, sessionId: plan.userSessionId };
  }
  throw new Error(
    `no eval_user messages for ${plan.caseDefinition.case_id} trial ${plan.trialNumber}; ` +
      "provide EVAL_USER_MESSAGES_DIR or EVAL_USER_MESSAGES_JSON",
  );
}

function envForTrial(
  options: SchedulerOptions,
  plan: TrialPlan,
  messages: string[],
  sessionId: string,
) {
  return {
    ...process.env,
    EVAL_ARTIFACT_ROOT: options.artifactRoot,
    EVAL_CASE_ID: plan.caseDefinition.case_id,
    EVAL_EXPERIMENT_ID: options.experimentId,
    EVAL_GIT_COMMIT: options.gitCommit,
    EVAL_TRIAL_ID: plan.trialId,
    EVAL_USER_ID: plan.userId,
    EVAL_USER_SESSION_ID: sessionId,
    EVAL_USER_MESSAGES_JSON: JSON.stringify(messages),
    // The wrapper, not this scheduler, establishes the Compose network.
  };
}

function schedulerFailure(
  plan: TrialPlan,
  message: string,
  durationMs = 0,
): SchedulerTrialResult {
  return {
    experimentId: plan.experimentId,
    caseId: plan.caseDefinition.case_id,
    caseFamilyId: plan.caseDefinition.case_family_id,
    split: plan.caseDefinition.split,
    trialId: plan.trialId,
    trialNumber: plan.trialNumber,
    status: "INFRA_FAILURE",
    failure: {
      failure_category: "infrastructure",
      failure_phase: "scheduler_input",
      error_type: "EVAL_USER_SEAM_UNAVAILABLE",
      error_source: "baseline_scheduler",
      error_message: message,
      retryable: false,
    },
    durationMs,
    schedulerFailure: message,
  };
}

async function openLog(path: string) {
  await mkdir(dirname(path), { recursive: true });
  return open(path, "a");
}

function semanticGraderTimeoutMs(): number {
  const value = Number(process.env.EVAL_SEMANTIC_GRADER_TIMEOUT_MS || 180_000);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      "EVAL_SEMANTIC_GRADER_TIMEOUT_MS must be a positive number of milliseconds",
    );
  }
  return value;
}

function hostRunDirectory(runDir: string, repoRoot: string): string {
  if (runDir.startsWith("/overleaf/")) {
    return join(repoRoot, runDir.slice("/overleaf/".length));
  }
  return runDir;
}

async function runBridge(
  command: string,
  options: SchedulerOptions,
  plan: TrialPlan,
  logDir: string,
): Promise<{
  bridge: ChildProcess;
  stderr: Awaited<ReturnType<typeof open>>;
  first: { messages: string[]; sessionId?: string };
  lines: AsyncIterableIterator<string>;
}> {
  const bridge = spawn("/bin/sh", ["-lc", command], {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      EVAL_EXPERIMENT_ID: options.experimentId,
      EVAL_TRIAL_ID: plan.trialId,
      EVAL_USER_SESSION_ID: plan.userSessionId,
      EVAL_USER_ID: plan.userId,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stderr = await openLog(join(logDir, "eval-user-bridge.stderr.log"));
  bridge.stderr?.on("data", (chunk) => void stderr.write(chunk));
  const reader = createInterface({ input: bridge.stdout! });
  const iterator = reader[Symbol.asyncIterator]();
  const firstLine = await withTimeout(
    iterator.next(),
    evalUserBridgeTimeoutMs(),
    () => {
      reader.close();
      bridge.kill();
      void stderr.close();
    },
  );
  if (firstLine.done) {
    reader.close();
    bridge.kill();
    await stderr.close();
    throw new Error("eval_user bridge exited before handshake");
  }
  let handshake: Record<string, unknown>;
  try {
    handshake = JSON.parse(firstLine.value) as Record<string, unknown>;
  } catch (error) {
    reader.close();
    bridge.kill();
    await stderr.close();
    throw error;
  }
  if (
    !Array.isArray(handshake.messages) ||
    handshake.messages.some((item) => typeof item !== "string" || !item.trim())
  ) {
    reader.close();
    bridge.kill();
    await stderr.close();
    throw new Error("eval_user bridge handshake requires messages[]");
  }
  return {
    bridge,
    stderr,
    first: {
      messages: handshake.messages as string[],
      sessionId:
        typeof handshake.session_id === "string"
          ? handshake.session_id
          : undefined,
    },
    lines: iterator,
  };
}

async function runTrial(
  options: SchedulerOptions,
  plan: TrialPlan,
): Promise<SchedulerTrialResult> {
  const started = Date.now();
  let messages: { messages: string[]; sessionId: string };
  let logDir = join(
    options.hostArtifactRoot,
    "_scheduler",
    options.experimentId,
    plan.trialId,
  );
  try {
    await mkdir(logDir, { recursive: true });
    if (options.bridgeCommand) {
      const bridged = await runBridge(
        options.bridgeCommand,
        options,
        plan,
        logDir,
      );
      messages = {
        messages: bridged.first.messages,
        sessionId: bridged.first.sessionId || plan.userSessionId,
      };
      // The bridge is connected after the runner starts below.
      return await runWithBridge(
        options,
        plan,
        messages,
        bridged,
        logDir,
        started,
      );
    }
    messages = await readMessages(options, plan);
  } catch (error) {
    return schedulerFailure(
      plan,
      error instanceof Error ? error.message : String(error),
      Date.now() - started,
    );
  }
  return runProcess(options, plan, messages, logDir, started);
}

async function runSemanticGrader(
  options: SchedulerOptions,
  plan: TrialPlan,
  result: SchedulerTrialResult,
): Promise<void> {
  if (
    !options.semanticGraderCommand ||
    !plan.caseDefinition.semantic_grading ||
    !result.runDir ||
    (result.status !== "PASS" && result.status !== "COPILOT_FAILURE")
  ) {
    return;
  }
  const runDir = hostRunDirectory(result.runDir, options.repoRoot);
  const inputPath = join(runDir, SEMANTIC_GRADER_INPUT_FILE);
  const resultPath = join(runDir, SEMANTIC_GRADER_RESULT_FILE);
  let inputText: string;
  try {
    inputText = await readFile(inputPath, "utf8");
    const input = JSON.parse(inputText) as {
      criteria?: Array<{ id: string }>;
    };
    const child = spawn("/bin/sh", ["-lc", options.semanticGraderCommand], {
      cwd: options.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const outputChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.stdin?.end(inputText);
    const exit = await waitForChild(child, options.semanticGraderTimeoutMs);
    if (exit.code !== 0) {
      throw new Error(
        "semantic grader exited with code " +
          String(exit.code) +
          ": " +
          Buffer.concat(stderrChunks).toString("utf8").slice(0, 2000),
      );
    }
    const output = JSON.parse(
      Buffer.concat(outputChunks).toString("utf8"),
    ) as unknown;
    const graded = validateSemanticGraderOutput(
      output,
      (input.criteria || []).map((criterion) => ({
        id: criterion.id,
        description: "",
      })),
    );
    await writeJsonAtomic(resultPath, graded);
    result.semanticGrader = {
      status: graded.status,
      passed: graded.passed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJsonAtomic(resultPath, {
      protocol: "overleaf-semantic-grader/v1",
      status: "error",
      passed: false,
      error: message,
    });
    result.semanticGrader = {
      status: "error",
      passed: false,
      error: message,
    };
  }
}

async function runWithBridge(
  options: SchedulerOptions,
  plan: TrialPlan,
  messages: { messages: string[]; sessionId: string },
  bridged: Awaited<ReturnType<typeof runBridge>>,
  logDir: string,
  started: number,
): Promise<SchedulerTrialResult> {
  const child = spawn(
    "bash",
    [options.composeWrapper, "eval/pilot/runPilotCase.ts"],
    {
      cwd: options.repoRoot,
      env: envForTrial(options, plan, messages.messages, messages.sessionId),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const stdout = await openLog(join(logDir, "runner.stdout.log"));
  const stderr = await openLog(join(logDir, "runner.stderr.log"));
  child.stderr?.on("data", (chunk) => void stderr.write(chunk));
  const outputChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    outputChunks.push(chunk);
    void stdout.write(chunk);
  });
  const runnerReader = createInterface({ input: child.stdout! });
  void (async () => {
    for await (const line of runnerReader) {
      if (line.startsWith(EVAL_PROTOCOL_PREFIX))
        bridged.bridge.stdin?.write(`${line}\n`);
    }
  })();
  (async () => {
    try {
      for await (const line of bridged.lines) child.stdin?.write(`${line}\n`);
    } finally {
      child.stdin?.end();
    }
  })().catch(() => child.stdin?.end());
  const exit = await waitForChild(child);
  runnerReader.close();
  bridged.bridge.stdin?.end();
  bridged.bridge.kill();
  await stdout.close();
  await stderr.close();
  await bridged.stderr.close();
  return resultFromChild(
    plan,
    Buffer.concat(outputChunks).toString("utf8"),
    exit,
    started,
  );
}

async function runProcess(
  options: SchedulerOptions,
  plan: TrialPlan,
  messages: { messages: string[]; sessionId: string },
  logDir: string,
  started: number,
): Promise<SchedulerTrialResult> {
  const child = spawn(
    "bash",
    [options.composeWrapper, "eval/pilot/runPilotCase.ts"],
    {
      cwd: options.repoRoot,
      env: envForTrial(options, plan, messages.messages, messages.sessionId),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout = await openLog(join(logDir, "runner.stdout.log"));
  const stderr = await openLog(join(logDir, "runner.stderr.log"));
  child.stdout?.on("data", (chunk) => void stdout.write(chunk));
  child.stderr?.on("data", (chunk) => void stderr.write(chunk));
  const outputChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => outputChunks.push(chunk));
  const exit = await waitForChild(child);
  await stdout.close();
  await stderr.close();
  return resultFromChild(
    plan,
    Buffer.concat(outputChunks).toString("utf8"),
    exit,
    started,
  );
}

function resultFromChild(
  plan: TrialPlan,
  output: string,
  exit: ChildExit,
  started: number,
): SchedulerTrialResult {
  const result = parseRunnerResult(output);
  if (result) {
    return {
      experimentId: plan.experimentId,
      caseId: plan.caseDefinition.case_id,
      caseFamilyId: plan.caseDefinition.case_family_id,
      split: plan.caseDefinition.split,
      trialId: plan.trialId,
      trialNumber: plan.trialNumber,
      status: String(result.status) as TrialStatus,
      runId: typeof result.runId === "string" ? result.runId : undefined,
      runDir: typeof result.runDir === "string" ? result.runDir : undefined,
      failure: result.failure as Record<string, unknown> | undefined,
      exitCode: exit.code,
      durationMs: Date.now() - started,
    };
  }
  return {
    ...schedulerFailure(
      plan,
      exit.timedOut
        ? "runner timed out"
        : `runner exited without result (code=${exit.code}, signal=${exit.signal || "none"})`,
      Date.now() - started,
    ),
    exitCode: exit.code,
  };
}

async function completedTrialIds(
  root: string,
  experimentId: string,
): Promise<Set<string>> {
  const completed = new Set<string>();
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return completed;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_scheduler") continue;
    try {
      const result = JSON.parse(
        await readFile(join(root, entry.name, "result.json"), "utf8"),
      ) as Record<string, unknown>;
      if (
        result.experimentId === experimentId &&
        VALID_STATUSES.has(String(result.status) as TrialStatus) &&
        typeof result.trialId === "string"
      )
        completed.add(result.trialId);
    } catch {
      /* incomplete trial: it will be resumed */
    }
  }
  return completed;
}

export async function summarizeBaseline(
  results: SchedulerTrialResult[],
  outputPath: string,
) {
  const statusCounts: Record<string, number> = {};
  const capability: Record<string, number> = {};
  const infrastructure: Record<string, number> = {};
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
    if (result.status === "COPILOT_FAILURE" || result.status === "PASS") {
      capability[result.status] = (capability[result.status] || 0) + 1;
    } else {
      infrastructure[result.status] = (infrastructure[result.status] || 0) + 1;
    }
  }
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    experiment_id: results[0]?.experimentId || null,
    planned_trials: results.length,
    status_counts: statusCounts,
    capability_outcomes: capability,
    infrastructure_outcomes: infrastructure,
    semantic_grader: {
      pass: results.filter((item) => item.semanticGrader?.status === "pass")
        .length,
      fail: results.filter((item) => item.semanticGrader?.status === "fail")
        .length,
      error: results.filter((item) => item.semanticGrader?.status === "error")
        .length,
    },
    results,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function run(options: SchedulerOptions) {
  const cases = selectV3Cases({
    caseIds: options.caseIds,
    split: options.split,
  });
  const plans = buildTrialPlans(
    cases,
    options.experimentId,
    options.trials,
    options.userId,
  );
  const done = options.resume
    ? await readCompletedTrials(
        options.hostArtifactRoot,
        options.experimentId,
        options.gitCommit,
        cases,
      )
    : new Map<string, SchedulerTrialResult>();
  const results: SchedulerTrialResult[] = [];
  const pending = plans.filter((plan) => !done.has(plan.trialId));
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const plan = pending[cursor++];
      const result = await runTrial(options, plan);
      await runSemanticGrader(options, plan, result);
      results.push(result);
      process.stdout.write(
        `${JSON.stringify({ case_id: result.caseId, trial_id: result.trialId, status: result.status, duration_ms: result.durationMs })}\n`,
      );
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, Math.max(1, pending.length)) },
      worker,
    ),
  );
  for (const plan of plans.filter((item) => done.has(item.trialId))) {
    results.push(done.get(plan.trialId)!);
  }
  results.sort((a, b) => a.trialId.localeCompare(b.trialId));
  const reportPath = join(
    options.hostArtifactRoot,
    "_scheduler",
    options.experimentId,
    "summary.json",
  );
  const report = await summarizeBaseline(results, reportPath);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode =
    report.infrastructure_outcomes.INFRA_FAILURE ||
    report.infrastructure_outcomes.INVALID
      ? 1
      : 0;
}

function parseArgs(argv: string[]): SchedulerOptions {
  const value = (name: string, fallback?: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const experimentId = value(
    "--experiment",
    process.env.EVAL_EXPERIMENT_ID || "",
  )!;
  const repoRoot = resolve(
    process.env.EVAL_REPO_ROOT ||
      join(dirname(new URL(import.meta.url).pathname), "../../../.."),
  );
  const artifactRoot =
    process.env.EVAL_ARTIFACT_ROOT ||
    "/overleaf/services/llm/eval/artifacts/pilot";
  const hostArtifactRoot =
    process.env.EVAL_HOST_ARTIFACT_ROOT ||
    join(repoRoot, "services/llm/eval/artifacts/pilot");
  const caseArg = value("--case");
  const split = value("--split") as "dev" | "holdout" | undefined;
  const trials = Number(value("--trials", "3"));
  const concurrency = Number(
    value("--concurrency", process.env.EVAL_CONCURRENCY || "1"),
  );
  if (!process.env.EVAL_GIT_COMMIT || process.env.EVAL_GIT_COMMIT === "unknown")
    throw new Error("EVAL_GIT_COMMIT is required for baseline scheduling");
  if (!process.env.EVAL_USER_ID)
    throw new Error("a real EVAL_USER_ID is required for baseline scheduling");
  if (!experimentId)
    throw new Error("--experiment or EVAL_EXPERIMENT_ID is required");
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("--concurrency must be positive");
  return {
    experimentId,
    trials,
    concurrency,
    artifactRoot,
    hostArtifactRoot,
    gitCommit: process.env.EVAL_GIT_COMMIT || "unknown",
    caseIds: caseArg ? caseArg.split(",").filter(Boolean) : undefined,
    split,
    resume: argv.includes("--resume"),
    messagesDir: process.env.EVAL_USER_MESSAGES_DIR,
    messagesJson: process.env.EVAL_USER_MESSAGES_JSON,
    bridgeCommand: process.env.EVAL_USER_BRIDGE_COMMAND,
    semanticGraderCommand: process.env.EVAL_SEMANTIC_GRADER_COMMAND,
    semanticGraderTimeoutMs: semanticGraderTimeoutMs(),
    userId: process.env.EVAL_USER_ID || "",
    composeWrapper: resolve(
      process.env.EVAL_COMPOSE_WRAPPER ||
        join(repoRoot, "services/llm/eval/run-in-compose.sh"),
    ),
    repoRoot,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
