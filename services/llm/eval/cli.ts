// Eval CLI: discover fixtures → run tasks × trials (bounded concurrency) →
// write results + transcripts + summary → diff against baseline → exit.
//
// Usage (inside the develop-llm container, see eval/README.md):
//   npx tsx eval/cli.ts [--category all|compile|structure|semantic|noop]
//                       [--suite all|capability|regression|holdout]
//                       [--include-holdout] [--task <id>] [--trials N]
//                       [--concurrency N] [--out eval/results/<ts>]
//                       [--update-baseline] [--strict]
//
// --suite all never includes holdout fixtures (the frozen acceptance set)
// unless --include-holdout; holdout runs can never --update-baseline.
//
// Exit code is 0 even with failing tasks (a red task set is DATA, not a
// broken harness); --strict flips to 1 when the baseline diff shows
// regressions, for future automation.

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { runTrial, type TrialRecord } from './runner.js';
import { loadBaseline, writeBaseline, writeRunOutputs } from './metrics/recorder.js';
import { serializeRawTrace, type RawToolEvent } from './rawTrace.js';
import type { NodeGradeResult } from './graders/nodeGrader.js';
import { shutdownEval } from './serviceFactory.js';
import { emptyUsage, type UsageRecord } from './usageTap.js';
import { discoverFixtures } from './taskDiscovery.js';
import type { EvalTask } from './contextBuilder.js';
import { MAX_VERIFY_TURNS } from './contextBuilder.js';
import { AGENT_STEP_LIMIT } from '../app/services/copilot.service.js';
import connectDB from '../config/db.js';
import { loadEvalCreds, resolveProviderMeta } from './creds.js';
import { CircuitBreaker } from './circuitBreaker.js';

const EVAL_DIR = new URL('.', import.meta.url).pathname;

interface CliOptions {
  category: string;
  suite: string;
  task: string | null;
  trials: number;
  concurrency: number;
  out: string;
  updateBaseline: boolean;
  strict: boolean;
  includeHoldout: boolean;
  excludeCohort?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    category: 'all',
    suite: 'all',
    task: null,
    trials: 1,
    concurrency: 2,
    out: join(EVAL_DIR, 'results', new Date().toISOString().replace(/[:.]/g, '-')),
    updateBaseline: false,
    strict: false,
    includeHoldout: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--category': opts.category = argv[++i]; break;
      case '--suite': opts.suite = argv[++i]; break;
      case '--task': opts.task = argv[++i]; break;
      case '--trials': opts.trials = Math.max(1, Number(argv[++i]) || 1); break;
      case '--concurrency': opts.concurrency = Math.max(1, Number(argv[++i]) || 2); break;
      case '--out': opts.out = argv[++i]; break;
      case '--update-baseline': opts.updateBaseline = true; break;
      case '--strict': opts.strict = true; break;
      case '--include-holdout': opts.includeHoldout = true; break;
      case '--exclude-cohort': opts.excludeCohort = argv[++i]; break;
      default:
        console.error(`unknown arg: ${argv[i]}`);
        process.exit(2);
    }
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
    tracePassed: null,
    traceTotal: null,
    wallMs: Date.now() - t0,
  };
}

// git HEAD for run.json (F5): the eval runs inside the develop-llm container
// where .git is NOT mounted — the host-side npm wrapper injects EVAL_GIT_HEAD;
// the direct-exec fallback covers host-local runs. null when unknowable.
function resolveGitHead(): string | null {
  if (process.env.EVAL_GIT_HEAD) return process.env.EVAL_GIT_HEAD;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tasks = discoverFixtures({
    category: opts.category,
    suite: opts.suite,
    task: opts.task,
    includeHoldout: opts.includeHoldout,
    excludeCohort: opts.excludeCohort,
  });
  if (tasks.length === 0) {
    console.error(`no fixtures matched (category=${opts.category}, suite=${opts.suite}, task=${opts.task || '*'})`);
    process.exit(2);
  }
  // Holdout runs are acceptance measurements, never anchor material —
  // merging them into baseline.json would contaminate the iteration ruler.
  const includesHoldout = tasks.some(t => t.suite === 'holdout');

  // F5 run manifest: resolve provider provenance and write run.json AT
  // STARTUP, so even a killed/aborted run keeps what it was measuring
  // (provider baseUrl + modelId + trials + start time + git HEAD).
  await connectDB();
  const creds = await loadEvalCreds();
  const providerMeta = resolveProviderMeta(creds);
  const runJsonPath = join(opts.out, 'run.json');
  const runManifest: Record<string, any> = {
    startedAt: new Date().toISOString(),
    provider: providerMeta,
    trials: opts.trials,
    concurrency: opts.concurrency,
    filters: { category: opts.category, suite: opts.suite, task: opts.task, includeHoldout: opts.includeHoldout, excludeCohort: opts.excludeCohort || null },
    gitHead: resolveGitHead(),
    // Resolved runtime config actually in force for this run (F31: an
    // iteration once edited a dead fallback and measured nothing — record the
    // effective values so a config no-op is visible in the manifest).
    resolvedConfig: { agentStepLimit: AGENT_STEP_LIMIT, maxVerifyTurns: MAX_VERIFY_TURNS },
    aborted: null,
  };
  try {
    // A --task re-run into an existing out dir (the regression-recheck flow
    // of rule 3) must not erase the original run's provenance: keep ALL
    // top-level fields, record the re-run itself under lastRerun.
    const prev = JSON.parse(readFileSync(runJsonPath, 'utf8'));
    if (prev?.startedAt) {
      runManifest.lastRerun = {
        at: new Date().toISOString(),
        provider: providerMeta,
        trials: runManifest.trials,
        concurrency: runManifest.concurrency,
        filters: runManifest.filters,
        gitHead: runManifest.gitHead,
        resolvedConfig: runManifest.resolvedConfig,
      };
      for (const key of ['startedAt', 'provider', 'trials', 'concurrency', 'filters', 'gitHead', 'resolvedConfig', 'aborted']) {
        if (prev[key] !== undefined) runManifest[key] = prev[key];
      }
    }
  } catch {
    /* first run into this dir */
  }
  mkdirSync(opts.out, { recursive: true });
  writeFileSync(runJsonPath, JSON.stringify(runManifest, null, 2) + '\n');

  // Work items: every (task, trial) pair. Trials of the same task are
  // independent runs — fresh memory store, fresh conversation, fresh compile.
  const work: { task: EvalTask; trialIndex: number }[] = [];
  for (const task of tasks) {
    for (let t = 0; t < opts.trials; t++) {
      work.push({ task, trialIndex: t });
    }
  }
  console.log(`[eval] ${tasks.length} task(s) × ${opts.trials} trial(s) = ${work.length} run(s), concurrency ${opts.concurrency}`);
  console.log(`[eval] results → ${opts.out}`);

  const transcriptsDir = join(opts.out, 'transcripts');
  mkdirSync(transcriptsDir, { recursive: true });
  // Raw per-tool-call traces (full args/results + node-grader verdicts) —
  // same privacy class as transcripts, same best-effort persistence style.
  const tracesDir = join(opts.out, 'traces');
  mkdirSync(tracesDir, { recursive: true });

  const records: TrialRecord[] = new Array(work.length);
  let nextIndex = 0;
  // F4: shared across workers; tripped → workers stop picking up new items
  // and the run aggregates only the completed subset (baseline stays put).
  const breaker = new CircuitBreaker();
  async function worker() {
    while (!breaker.tripped && nextIndex < work.length) {
      const i = nextIndex++;
      const { task, trialIndex } = work[i];
      const t0 = Date.now();
      let transcript: any[] = [];
      let trace: RawToolEvent[] = [];
      let nodeGrade: NodeGradeResult | null = null;
      try {
        const outcome = await runTrial(task, trialIndex);
        records[i] = outcome.record;
        transcript = outcome.transcript;
        trace = outcome.trace;
        nodeGrade = outcome.nodeGrade;
      } catch (err: any) {
        // A harness-level crash is still a recordable failure — one bad run
        // must never kill the batch.
        records[i] = crashRecord(task, trialIndex, err, t0);
      }
      const r = records[i];
      try {
        writeFileSync(
          join(transcriptsDir, `${r.taskId}.t${trialIndex}.json`),
          JSON.stringify({ taskId: r.taskId, trialIndex, record: r, messages: transcript }, null, 2) + '\n'
        );
      } catch {
        /* transcript persistence is best-effort */
      }
      try {
        writeFileSync(
          join(tracesDir, `${r.taskId}.t${trialIndex}.json`),
          JSON.stringify(serializeRawTrace({ taskId: r.taskId, trialIndex, events: trace, nodeGrade }), null, 2) + '\n'
        );
      } catch {
        /* trace persistence is best-effort */
      }
      breaker.record(r);
      console.log(
        `[eval] ${r.success ? 'PASS' : 'FAIL'} ${r.taskId} t${trialIndex} (${r.turns} turns, ${((Date.now() - t0) / 1000).toFixed(0)}s)` +
          (r.success ? '' : ` — ${r.failureReason}: ${r.failureDetail || ''}`)
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, work.length) }, worker));

  const abortInfo = breaker.tripped ? breaker.abortMessage() : null;
  const completed = records.filter(Boolean);
  if (abortInfo) {
    console.error(`[eval] ABORTED: ${abortInfo}`);
    console.error(
      `[eval] ${completed.length}/${work.length} trials completed; transcripts preserved under ${transcriptsDir}` +
        ` — resume with: npx tsx eval/resumeRun.ts --out ${opts.out} --trials ${opts.trials}`
    );
    runManifest.aborted = abortInfo;
    writeFileSync(runJsonPath, JSON.stringify(runManifest, null, 2) + '\n');
  }

  const baseline = loadBaseline();
  const { summaryMd, regressions } = writeRunOutputs(opts.out, completed, baseline, abortInfo);
  if (opts.updateBaseline) {
    if (includesHoldout) {
      console.error('[eval] run includes holdout tasks — skipping --update-baseline (holdout is never anchor material)');
    } else if (abortInfo) {
      // An aborted run is a PARTIAL measurement — anchoring it would bake
      // provider noise into the regression reference. Resume first.
      console.error('[eval] circuit breaker tripped — skipping --update-baseline (anchor only a complete run)');
    } else {
      writeBaseline(completed, opts.trials);
      console.log('[eval] baseline updated');
    }
  }

  console.log('\n' + summaryMd);

  await shutdownEval();
  const failed = completed.filter(r => !r.success).length;
  console.log(`[eval] done: ${completed.length - failed}/${completed.length} trials passed`);
  process.exit(opts.strict && regressions.length > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error('[eval] fatal:', err?.message || err);
  await shutdownEval();
  process.exit(2);
});
