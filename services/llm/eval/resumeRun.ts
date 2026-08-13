// Resume a killed multi-trial run: the CLI writes each trial's transcript
// (with its full TrialRecord) to results/<ts>/transcripts/ IMMEDIATELY after
// the trial finishes, so a killed run loses nothing but the final
// aggregation. This tool:
//   1. reads every transcript in the run dir → recovered TrialRecords
//   2. discovers the full task × trial work list and runs only MISSING pairs
//   3. re-aggregates the combined records (summary.md/json + optional baseline)
//
//   npx tsx eval/resumeRun.ts --out eval/results/<ts> [--trials 3]
//       [--concurrency N] [--update-baseline] [--strict]
//
// Harness-robustness note (Anthropic eval article): long multi-trial runs are
// the norm; the harness must treat a mid-run kill as recoverable, not as
// money down the drain.
//
// F11 fix: discovery honors the ORIGINAL run's run.json filters
// (category/suite/task/includeHoldout) instead of re-discovering every
// fixture — resuming a --suite capability run no longer "helpfully" runs the
// other suites as missing (that bug once burned 268 unintended trials).
// Holdout protection comes from taskDiscovery: legacy run.json without
// includeHoldout resumes never expand into holdout fixtures.

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { runTrial, type TrialRecord } from './runner.js';
import { loadBaseline, writeBaseline, writeRunOutputs } from './metrics/recorder.js';
import { shutdownEval } from './serviceFactory.js';
import { emptyUsage, type UsageRecord } from './usageTap.js';
import { discoverFixtures } from './taskDiscovery.js';
import type { EvalTask } from './contextBuilder.js';
import { CircuitBreaker } from './circuitBreaker.js';

const EVAL_DIR = new URL('.', import.meta.url).pathname;

interface ResumeOptions {
  out: string;
  trials: number;
  concurrency: number;
  updateBaseline: boolean;
  strict: boolean;
}

function parseArgs(argv: string[]): ResumeOptions {
  const opts: ResumeOptions = {
    out: '',
    trials: 3,
    concurrency: 4,
    updateBaseline: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--out': opts.out = argv[++i]; break;
      case '--trials': opts.trials = Math.max(1, Number(argv[++i]) || 3); break;
      case '--concurrency': opts.concurrency = Math.max(1, Number(argv[++i]) || 4); break;
      case '--update-baseline': opts.updateBaseline = true; break;
      case '--strict': opts.strict = true; break;
      default:
        console.error(`unknown arg: ${argv[i]}`);
        process.exit(2);
    }
  }
  if (!opts.out) {
    // Default: newest results dir.
    const resultsRoot = join(EVAL_DIR, 'results');
    const dirs = readdirSync(resultsRoot).sort();
    if (!dirs.length) {
      console.error('no results dir found; pass --out');
      process.exit(2);
    }
    opts.out = join(resultsRoot, dirs[dirs.length - 1]);
  }
  return opts;
}

function crashRecord(task: EvalTask, trialIndex: number, err: any, t0: number): TrialRecord {
  return {
    taskId: task.id,
    category: task.category,
    difficulty: task.difficulty || 'unspecified',
    suite: task.suite || 'unspecified',
    trialIndex,
    success: false,
    score: 0,
    failureReason: 'provider_error',
    failureDetail: `harness: ${String(err?.message || err).slice(0, 300)}`,
    turns: 0,
    verifyTurns: 0,
    patchesApplied: 0,
    toolCalls: {},
    usage: { agent: emptyUsage(), judge: emptyUsage() as UsageRecord },
    judgeScore: null,
    assertionsPassed: null,
    assertionsTotal: null,
    wallMs: Date.now() - t0,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const transcriptsDir = join(opts.out, 'transcripts');
  mkdirSync(transcriptsDir, { recursive: true });

  // ---- recover completed trials from transcripts ----
  const done = new Map<string, TrialRecord>();
  for (const name of readdirSync(transcriptsDir).filter(f => f.endsWith('.json'))) {
    try {
      const parsed = JSON.parse(readFileSync(join(transcriptsDir, name), 'utf8'));
      if (parsed?.record?.taskId != null && parsed?.record?.trialIndex != null) {
        done.set(`${parsed.record.taskId}#${parsed.record.trialIndex}`, parsed.record as TrialRecord);
      }
    } catch {
      /* skip unreadable transcript */
    }
  }

  // ---- compute missing (task, trial) pairs — scoped to the original run's
  // filters (F11): run.json is the source of truth for what this run set out
  // to measure; absence of run.json (legacy) falls back to all-minus-holdout.
  let runFilters: { category?: string; suite?: string; task?: string | null; includeHoldout?: boolean; excludeCohort?: string | null } = {};
  try {
    runFilters = JSON.parse(readFileSync(join(opts.out, 'run.json'), 'utf8'))?.filters || {};
  } catch {
    /* legacy dir without run.json */
  }
  const tasks = discoverFixtures({
    category: runFilters.category || 'all',
    suite: runFilters.suite || 'all',
    task: runFilters.task || null,
    includeHoldout: !!runFilters.includeHoldout,
    excludeCohort: runFilters.excludeCohort || undefined,
  });
  const missing: { task: EvalTask; trialIndex: number }[] = [];
  for (const task of tasks) {
    for (let t = 0; t < opts.trials; t++) {
      if (!done.has(`${task.id}#${t}`)) missing.push({ task, trialIndex: t });
    }
  }
  console.log(`[resume] ${done.size} trial(s) recovered, ${missing.length} to run (concurrency ${opts.concurrency})`);

  // ---- run missing pairs ----
  let nextIndex = 0;
  // F4: same provider circuit breaker as the CLI — a resumed run can hit a
  // dead provider too; already-recovered transcripts stay untouched.
  const breaker = new CircuitBreaker();
  async function worker() {
    while (!breaker.tripped && nextIndex < missing.length) {
      const { task, trialIndex } = missing[nextIndex++];
      const t0 = Date.now();
      let record: TrialRecord;
      let transcript: any[] = [];
      try {
        const outcome = await runTrial(task, trialIndex);
        record = outcome.record;
        transcript = outcome.transcript;
      } catch (err: any) {
        record = crashRecord(task, trialIndex, err, t0);
      }
      done.set(`${task.id}#${trialIndex}`, record);
      try {
        writeFileSync(
          join(transcriptsDir, `${record.taskId}.t${trialIndex}.json`),
          JSON.stringify({ taskId: record.taskId, trialIndex, record, messages: transcript }, null, 2) + '\n'
        );
      } catch {
        /* best-effort */
      }
      breaker.record(record);
      console.log(
        `[resume] ${record.success ? 'PASS' : 'FAIL'} ${record.taskId} t${trialIndex} (${record.turns} turns)` +
          (record.success ? '' : ` — ${record.failureReason}: ${record.failureDetail || ''}`)
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, Math.max(1, missing.length)) }, worker));

  const abortInfo = breaker.tripped ? breaker.abortMessage() : null;
  if (abortInfo) {
    console.error(`[resume] ABORTED: ${abortInfo}`);
    console.error(`[resume] ${done.size} trial(s) on disk; re-run resumeRun.ts --out ${opts.out} to continue.`);
    try {
      const runJsonPath = join(opts.out, 'run.json');
      const manifest = JSON.parse(readFileSync(runJsonPath, 'utf8'));
      manifest.aborted = abortInfo;
      writeFileSync(runJsonPath, JSON.stringify(manifest, null, 2) + '\n');
    } catch {
      /* run.json update is best-effort */
    }
  }

  // ---- re-aggregate the combined records ----
  const records = [...done.values()];
  const baseline = loadBaseline();
  const { summaryMd, regressions } = writeRunOutputs(opts.out, records, baseline, abortInfo);
  if (opts.updateBaseline) {
    if (records.some(r => r.suite === 'holdout')) {
      console.error('[resume] run includes holdout tasks — skipping --update-baseline (holdout is never anchor material)');
    } else if (abortInfo) {
      console.error('[resume] circuit breaker tripped — skipping --update-baseline (anchor only a complete run)');
    } else {
      writeBaseline(records, opts.trials);
      console.log('[resume] baseline updated');
    }
  }
  console.log('\n' + summaryMd);

  await shutdownEval();
  const failed = records.filter(r => !r.success).length;
  console.log(`[resume] done: ${records.length - failed}/${records.length} trials passed`);
  process.exit(opts.strict && regressions.length > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error('[resume] fatal:', err?.message || err);
  await shutdownEval();
  process.exit(2);
});
