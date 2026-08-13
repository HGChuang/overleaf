// Run recorder: per-trial JSONL + human summary + baseline comparison.
//
//   results/<ts>/results.jsonl   — one TrialRecord per line
//   results/<ts>/transcripts/    — full conversation per trial (review artifact)
//   results/<ts>/summary.json    — machine-readable aggregates
//   results/<ts>/summary.md      — the headline tables (pass@1 / pass@k / pass^k,
//                                  per-category / difficulty / suite / stability)
//
// Metrics follow the Anthropic agent-evals article:
//   pass@1 — mean per-trial success rate (first-try reliability)
//   pass@k — share of tasks with ≥1 successful trial (capability ceiling)
//   pass^k — share of tasks where ALL k trials pass (user-facing reliability)
//   stability — stable-pass (all pass) / flaky (mixed) / stable-fail (none)
//
// baseline.json (committed at eval/baseline.json) is the regression
// reference: every run diffs against it; --update-baseline rewrites it from
// the current run so agent-side changes carry their measured effect in git.
//
// SECURITY: records contain ids/counts/usage only — never file contents,
// message text, or credentials. Transcripts contain conversation content
// (no credentials) and stay local under results/ (gitignored).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { TrialRecord } from '../runner.js';

const EVAL_DIR = new URL('..', import.meta.url).pathname;
const BASELINE_PATH = join(EVAL_DIR, 'baseline.json');

interface TaskAggregate {
  taskId: string;
  category: string;
  difficulty: string;
  suite: string;
  trials: number;
  passes: number;
  passRate: number; // == this task's contribution to pass@1
  passAtK: boolean; // ≥1 pass
  passCaretK: boolean; // all pass
  stability: 'stable-pass' | 'flaky' | 'stable-fail';
  avgScore: number;
  avgTurns: number;
  totalTokens: number;
  costTotal: number;
}

interface Baseline {
  updatedAt: string;
  trials: number;
  tasks: Record<string, { passRate: number; stability: string }>;
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function writeBaseline(records: TrialRecord[], trialsPerTask: number): void {
  // MERGE into the existing baseline: a partial run (e.g. --suite capability)
  // must only advance the tasks it actually ran — never silently drop the
  // entries for suites it didn't touch.
  const prev = loadBaseline();
  const baseline: Baseline = {
    updatedAt: new Date().toISOString(),
    trials: trialsPerTask,
    tasks: { ...(prev?.tasks || {}) },
  };
  for (const a of aggregateByTask(records)) {
    baseline.tasks[a.taskId] = { passRate: a.passRate, stability: a.stability };
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(0)}%`;
}

export function aggregateByTask(records: TrialRecord[]): TaskAggregate[] {
  const byTask = new Map<string, TrialRecord[]>();
  for (const r of records) {
    const list = byTask.get(r.taskId) || [];
    list.push(r);
    byTask.set(r.taskId, list);
  }
  const aggregates: TaskAggregate[] = [];
  for (const [taskId, rs] of byTask) {
    const passes = rs.filter(r => r.success).length;
    const passRate = passes / rs.length;
    aggregates.push({
      taskId,
      category: rs[0].category,
      difficulty: rs[0].difficulty,
      suite: rs[0].suite,
      trials: rs.length,
      passes,
      passRate,
      passAtK: passes > 0,
      passCaretK: passes === rs.length,
      stability: passes === rs.length ? 'stable-pass' : passes === 0 ? 'stable-fail' : 'flaky',
      avgScore: rs.reduce((s, r) => s + (r.score || 0), 0) / rs.length,
      avgTurns: rs.reduce((s, r) => s + r.turns, 0) / rs.length,
      totalTokens: rs.reduce((s, r) => s + r.usage.agent.totalTokens + r.usage.judge.totalTokens, 0),
      costTotal: rs.reduce((s, r) => s + r.usage.agent.costTotal + r.usage.judge.costTotal, 0),
    });
  }
  return aggregates.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function writeRunOutputs(
  outDir: string,
  records: TrialRecord[],
  baseline: Baseline | null,
  abortInfo?: string | null
): { summaryMd: string; regressions: string[]; improvements: string[] } {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');

  const aggregates = aggregateByTask(records);

  // ---- headline metrics ----
  const totalTrials = records.length;
  const passedTrials = records.filter(r => r.success).length;
  const passAt1 = totalTrials === 0 ? 0 : passedTrials / totalTrials;
  const passAtK = aggregates.length === 0 ? 0 : aggregates.filter(a => a.passAtK).length / aggregates.length;
  const passCaretK = aggregates.length === 0 ? 0 : aggregates.filter(a => a.passCaretK).length / aggregates.length;
  const meanScore = aggregates.length === 0 ? 0 : aggregates.reduce((s, a) => s + a.avgScore, 0) / aggregates.length;
  const totalCost = records.reduce((s, r) => s + r.usage.agent.costTotal + r.usage.judge.costTotal, 0);

  // ---- efficiency headline ----
  // Anthropic: an accuracy number reported without its cost is hiding the
  // efficiency problem. cost-per-pass is THE optimization metric ("passing
  // cheaper" ranks alongside "passing more"); turns/wall are the debugging
  // companions (a cost spike localizes to loops vs. provider latency).
  const avgTurnsPerTrial = totalTrials === 0 ? 0 : records.reduce((s, r) => s + r.turns, 0) / totalTrials;
  const avgWallMsPerTrial = totalTrials === 0 ? 0 : records.reduce((s, r) => s + r.wallMs, 0) / totalTrials;
  const costPerPass = passedTrials === 0 ? null : totalCost / passedTrials;

  // Per-suite efficiency rollup (record-level, unlike the task-level rollup
  // above — cost attribution needs raw trials, not task pass rates).
  const efficiency = [...new Set(records.map(r => r.suite))].sort().map(s => {
    const rs = records.filter(r => r.suite === s);
    const passes = rs.filter(r => r.success).length;
    const cost = rs.reduce((sum, r) => sum + r.usage.agent.costTotal + r.usage.judge.costTotal, 0);
    return {
      key: s,
      trials: rs.length,
      passes,
      cost,
      costPerPass: passes === 0 ? null : cost / passes,
      avgTurns: rs.reduce((sum, r) => sum + r.turns, 0) / rs.length,
      avgWallMs: rs.reduce((sum, r) => sum + r.wallMs, 0) / rs.length,
    };
  });

  // ---- rollups ----
  const rollup = (key: 'category' | 'difficulty' | 'suite' | 'stability') => {
    const keys = [...new Set(aggregates.map(a => a[key]))].sort();
    return keys.map(k => {
      const as = aggregates.filter(a => a[key] === k);
      return {
        key: k,
        tasks: as.length,
        passAt1: as.reduce((s, a) => s + a.passRate, 0) / as.length,
        passCaretK: as.filter(a => a.passCaretK).length / as.length,
        avgScore: as.reduce((s, a) => s + a.avgScore, 0) / as.length,
        cost: as.reduce((s, a) => s + a.costTotal, 0),
      };
    });
  };

  const failureCounts = new Map<string, number>();
  for (const r of records) {
    if (!r.success && r.failureReason) {
      failureCounts.set(r.failureReason, (failureCounts.get(r.failureReason) || 0) + 1);
    }
  }

  // ---- baseline diff ----
  const regressions: string[] = [];
  const improvements: string[] = [];
  if (baseline) {
    for (const a of aggregates) {
      const prev = baseline.tasks[a.taskId];
      if (!prev) continue;
      if (prev.stability === 'stable-pass' && a.stability !== 'stable-pass') regressions.push(a.taskId);
      if (prev.passRate === 0 && a.passRate > 0) improvements.push(a.taskId);
    }
  }

  // ---- summary.md ----
  const lines: string[] = [];
  lines.push(`# Copilot Eval — ${new Date().toISOString()}`);
  lines.push('');
  if (abortInfo) {
    // Circuit-breaker aborts aggregate only the COMPLETED subset — the
    // headline must say so, or the numbers read as a full run.
    lines.push(`> **RUN ABORTED (provider circuit breaker):** ${abortInfo}`);
    lines.push(`> Metrics below cover the ${totalTrials} completed trial(s) only; resume with resumeRun.ts.`);
    lines.push('');
  }
  lines.push(
    `**pass@1: ${(passAt1 * 100).toFixed(0)}%** (${passedTrials}/${totalTrials} trials) · ` +
      `**pass@k: ${pct(aggregates.filter(a => a.passAtK).length, aggregates.length)}** · ` +
      `**pass^k: ${pct(aggregates.filter(a => a.passCaretK).length, aggregates.length)}** · ` +
      `mean score ${(meanScore * 100).toFixed(0)}% · cost $${totalCost.toFixed(4)}`
  );
  lines.push(
    `**Efficiency:** $${costPerPass === null ? '—' : costPerPass.toFixed(4)}/pass · ` +
      `avg ${avgTurnsPerTrial.toFixed(1)} turns · avg ${(avgWallMsPerTrial / 1000).toFixed(0)}s wall per trial`
  );
  lines.push('');

  const table = (title: string, rows: ReturnType<typeof rollup>) => {
    lines.push(`| ${title} | Tasks | pass@1 | pass^k | Avg score | Cost |`);
    lines.push('|---|---|---|---|---|---|');
    for (const row of rows) {
      lines.push(
        `| ${row.key} | ${row.tasks} | ${(row.passAt1 * 100).toFixed(0)}% | ${(row.passCaretK * 100).toFixed(0)}% | ${(row.avgScore * 100).toFixed(0)}% | $${row.cost.toFixed(4)} |`
      );
    }
    lines.push('');
  };
  table('Suite', rollup('suite'));
  table('Category', rollup('category'));
  table('Difficulty', rollup('difficulty'));
  table('Stability', rollup('stability'));

  if (efficiency.length) {
    lines.push('## Efficiency');
    lines.push('');
    lines.push('| Suite | Trials | Passes | Cost | $/pass | Avg turns | Avg wall |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const e of efficiency) {
      lines.push(
        `| ${e.key} | ${e.trials} | ${e.passes} | $${e.cost.toFixed(4)} | ` +
          `${e.costPerPass === null ? '—' : `$${e.costPerPass.toFixed(4)}`} | ${e.avgTurns.toFixed(1)} | ${(e.avgWallMs / 1000).toFixed(0)}s |`
      );
    }
    lines.push('');
  }

  if (failureCounts.size) {
    lines.push('## Failures');
    lines.push('');
    for (const [reason, count] of [...failureCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${reason}** × ${count}`);
      const seen = new Set<string>();
      for (const r of records.filter(r => r.failureReason === reason)) {
        const line = `${r.taskId} (t${r.trialIndex}): ${r.failureDetail || ''}`;
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(`  - ${line}`);
      }
    }
    lines.push('');
  }
  if (baseline) {
    lines.push('## Baseline diff');
    lines.push('');
    lines.push(`- Newly passing (was 0%): ${improvements.length ? improvements.join(', ') : 'none'}`);
    lines.push(`- **Regressions (was stable-pass): ${regressions.length ? regressions.join(', ') : 'none'}**`);
    lines.push('');
  }
  lines.push('## Per-task');
  lines.push('');
  lines.push('| Task | Suite | Stability | pass@1 | Avg score | Turns | Tokens | Wall |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const a of aggregates) {
    const rs = records.filter(r => r.taskId === a.taskId);
    const wall = rs.reduce((s, r) => s + r.wallMs, 0) / rs.length / 1000;
    lines.push(
      `| ${a.taskId} | ${a.suite} | ${a.stability} | ${(a.passRate * 100).toFixed(0)}% (${a.passes}/${a.trials}) | ${(a.avgScore * 100).toFixed(0)}% | ${a.avgTurns.toFixed(1)} | ${a.totalTokens} | ${wall.toFixed(0)}s |`
    );
  }
  lines.push('');

  const summaryMd = lines.join('\n');
  writeFileSync(join(outDir, 'summary.md'), summaryMd);
  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        aborted: abortInfo || null,
        overall: {
          tasks: aggregates.length,
          trials: totalTrials,
          passAt1,
          passAtK,
          passCaretK,
          meanScore,
          costTotal: totalCost,
          costPerPass,
          avgTurnsPerTrial,
          avgWallMsPerTrial,
        },
        efficiency,
        suites: rollup('suite'),
        categories: rollup('category'),
        difficulties: rollup('difficulty'),
        stabilities: rollup('stability'),
        failures: Object.fromEntries(failureCounts),
        regressions,
        improvements,
        perTask: aggregates,
      },
      null,
      2
    ) + '\n'
  );

  return { summaryMd, regressions, improvements };
}
