// Dialogue run aggregator: roll up a DIRECTORY of dialogue-driver trial dirs
// (each holding a final.json written by dialogueDriver.ts) into one summary.
//
//   npx tsx eval/aggregateDialogue.ts <resultsDir>
//
//   <resultsDir>/<run-dir>/final.json   — one per (taskId, trialIndex)
//   → <resultsDir>/summary.md           — headline tables (human)
//   → <resultsDir>/summary.json         — same numbers (machine)
//
// Metrics mirror the single-turn recorder: pass@1 (mean per-trial success),
// pass@k (≥1 pass per task), pass^k (all trials pass), plus the efficiency
// headline ($/pass, avg turns, avg USER turns, avg wall) — accuracy without
// cost is hiding the efficiency problem. finishReason histogram shows HOW
// dialogues ended (user_end / max_user_turns / idle_timeout / wall_timeout /
// agent_error). nodeGrade rollup averages the deterministic per-call rates
// and sums finding counts across trials (diagnostics, never pass/fail).
//
// Dedup: if two run dirs hold the same taskId+trialIndex (a re-run), the
// newer final.json (mtime) wins and the duplicate is noted.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { aggregateByTask } from './metrics/recorder.js';
import type { TrialRecord } from './runner.js';

interface DialogueRecord {
  taskId: string;
  category: string;
  difficulty: string;
  suite: string;
  trialIndex?: number;
  finishReason?: string;
  success: boolean;
  score?: number;
  turns: number;
  userTurns?: number;
  wallMs: number;
  usage?: { agent?: { totalTokens?: number; costTotal?: number }; judge?: { totalTokens?: number; costTotal?: number } };
  nodeGrade?: {
    rates?: {
      totalCalls?: number;
      necessaryRate?: number | null;
      redundancyRate?: number | null;
      errorRecoveryRate?: number | null;
      patchBeforeReadCount?: number;
    };
    findingCounts?: Record<string, number>;
  } | null;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

function mean(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((s, n) => s + n, 0) / nums.length;
}

function main() {
  const resultsDir = process.argv[2];
  if (!resultsDir) {
    console.error('usage: npx tsx eval/aggregateDialogue.ts <resultsDir>');
    process.exit(2);
  }
  const root = resolve(resultsDir);
  if (!existsSync(root)) {
    console.error(`results dir not found: ${root}`);
    process.exit(2);
  }

  // ---- collect final.json from subdirectories, dedup by taskId+trialIndex ----
  const byKey = new Map<string, { record: DialogueRecord; mtime: number; file: string }>();
  let duplicates = 0;
  const entries = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());
  for (const entry of entries) {
    const finalPath = join(root, entry.name, 'final.json');
    if (!existsSync(finalPath)) continue;
    let record: DialogueRecord;
    try {
      record = JSON.parse(readFileSync(finalPath, 'utf8'));
    } catch {
      continue; // unparseable final.json is not a trial
    }
    if (!record?.taskId) continue;
    const key = `${record.taskId}#${record.trialIndex ?? 0}`;
    const mtime = statSync(finalPath).mtimeMs;
    const prev = byKey.get(key);
    if (prev) {
      duplicates++;
      if (prev.mtime >= mtime) continue;
    }
    byKey.set(key, { record, mtime, file: join(entry.name, 'final.json') });
  }
  const records = [...byKey.values()].map(v => v.record);
  if (records.length === 0) {
    console.error(`no final.json found under ${root}/*/`);
    process.exit(2);
  }

  // ---- per-task aggregates (reuse the single-turn aggregator: final.json ----
  // records carry the TrialRecord fields it reads) ----
  const aggregates = aggregateByTask(records as unknown as TrialRecord[]);
  const totalTrials = records.length;
  const passedTrials = records.filter(r => r.success).length;
  const passAt1 = passedTrials / totalTrials;
  const passAtK = aggregates.filter(a => a.passAtK).length / aggregates.length;
  const passCaretK = aggregates.filter(a => a.passCaretK).length / aggregates.length;

  const costOf = (r: DialogueRecord) => (r.usage?.agent?.costTotal || 0) + (r.usage?.judge?.costTotal || 0);
  const totalCost = records.reduce((s, r) => s + costOf(r), 0);
  const costPerPass = passedTrials === 0 ? null : totalCost / passedTrials;
  const avgTurns = mean(records.map(r => r.turns || 0)) ?? 0;
  const avgUserTurns = mean(records.map(r => r.userTurns ?? 0)) ?? 0;
  const avgWallMs = mean(records.map(r => r.wallMs || 0)) ?? 0;

  // ---- suite rollup (record-level, like the single-turn efficiency table) ----
  const suites = [...new Set(records.map(r => r.suite || 'unspecified'))].sort().map(s => {
    const rs = records.filter(r => (r.suite || 'unspecified') === s);
    const taskIds = new Set(rs.map(r => r.taskId));
    const passes = rs.filter(r => r.success).length;
    const cost = rs.reduce((sum, r) => sum + costOf(r), 0);
    // pass^k per suite: share of tasks whose EVERY trial passed.
    const trialsByTask = new Map<string, DialogueRecord[]>();
    for (const r of rs) {
      const list = trialsByTask.get(r.taskId) || [];
      list.push(r);
      trialsByTask.set(r.taskId, list);
    }
    const allPass = [...trialsByTask.values()].filter(list => list.every(r => r.success)).length;
    return {
      key: s,
      tasks: taskIds.size,
      trials: rs.length,
      passAt1: passes / rs.length,
      passCaretK: allPass / taskIds.size,
      cost,
      costPerPass: passes === 0 ? null : cost / passes,
      avgTurns: mean(rs.map(r => r.turns || 0)) ?? 0,
      avgUserTurns: mean(rs.map(r => r.userTurns ?? 0)) ?? 0,
      avgWallMs: mean(rs.map(r => r.wallMs || 0)) ?? 0,
    };
  });

  // ---- finishReason histogram ----
  const finishCounts = new Map<string, number>();
  for (const r of records) {
    const reason = r.finishReason || 'unknown';
    finishCounts.set(reason, (finishCounts.get(reason) || 0) + 1);
  }

  // ---- nodeGrade rollup (diagnostics only) ----
  const withGrade = records.filter(r => r.nodeGrade?.rates);
  const rate = (pick: (r: NonNullable<DialogueRecord['nodeGrade']>['rates']) => number | null | undefined) =>
    mean(withGrade.map(r => pick(r.nodeGrade!.rates)).filter((x): x is number => typeof x === 'number'));
  const findingTotals = new Map<string, number>();
  for (const r of withGrade) {
    for (const [k, v] of Object.entries(r.nodeGrade?.findingCounts || {})) {
      findingTotals.set(k, (findingTotals.get(k) || 0) + v);
    }
  }
  const nodeRollup = {
    trials: withGrade.length,
    meanNecessaryRate: rate(rates => rates?.necessaryRate),
    meanRedundancyRate: rate(rates => rates?.redundancyRate),
    meanErrorRecoveryRate: rate(rates => rates?.errorRecoveryRate),
    totalPatchBeforeRead: withGrade.reduce((s, r) => s + (r.nodeGrade?.rates?.patchBeforeReadCount || 0), 0),
    findingCounts: Object.fromEntries([...findingTotals.entries()].sort()),
  };

  // ---- summary.md ----
  const lines: string[] = [];
  lines.push(`# Dialogue Eval — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    `**pass@1: ${pct(passAt1)}** (${passedTrials}/${totalTrials} trials) · ` +
      `**pass@k: ${pct(passAtK)}** · ` +
      `**pass^k: ${pct(passCaretK)}** · cost $${totalCost.toFixed(4)}` +
      (duplicates ? ` · ${duplicates} duplicate trial(s) deduped (newer final.json won)` : '')
  );
  lines.push(
    `**Efficiency:** ${costPerPass === null ? '—' : `$${costPerPass.toFixed(4)}`}/pass · ` +
      `avg ${avgTurns.toFixed(1)} turns · avg ${avgUserTurns.toFixed(1)} user turns · avg ${(avgWallMs / 1000).toFixed(0)}s wall per trial`
  );
  lines.push('');
  lines.push('| Suite | Tasks | Trials | pass@1 | pass^k | Cost | $/pass | Avg turns | Avg user turns | Avg wall |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of suites) {
    lines.push(
      `| ${s.key} | ${s.tasks} | ${s.trials} | ${pct(s.passAt1)} | ${pct(s.passCaretK)} | $${s.cost.toFixed(4)} | ` +
        `${s.costPerPass === null ? '—' : `$${s.costPerPass.toFixed(4)}`} | ${s.avgTurns.toFixed(1)} | ${s.avgUserTurns.toFixed(1)} | ${(s.avgWallMs / 1000).toFixed(0)}s |`
    );
  }
  lines.push('');
  lines.push('## Finish reasons');
  lines.push('');
  for (const [reason, count] of [...finishCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${reason}** × ${count}`);
  }
  lines.push('');
  if (withGrade.length > 0) {
    const fmt = (x: number | null) => (x === null ? '—' : pct(x));
    lines.push('## Node grade (diagnostics — never pass/fail)');
    lines.push('');
    lines.push(
      `over ${withGrade.length} trial(s): mean necessaryRate ${fmt(nodeRollup.meanNecessaryRate)} · ` +
        `mean redundancyRate ${fmt(nodeRollup.meanRedundancyRate)} · ` +
        `mean errorRecoveryRate ${fmt(nodeRollup.meanErrorRecoveryRate)} · ` +
        `patch-before-read total ${nodeRollup.totalPatchBeforeRead}`
    );
    lines.push('');
    if (findingTotals.size > 0) {
      lines.push('| Finding | Count |');
      lines.push('|---|---|');
      for (const [k, v] of [...findingTotals.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${k} | ${v} |`);
      }
      lines.push('');
    }
  }
  lines.push('## Per-task');
  lines.push('');
  lines.push('| Task | Suite | Stability | pass@1 | Trials | Turns | User turns | Tokens | Wall |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const a of aggregates) {
    const rs = records.filter(r => r.taskId === a.taskId);
    lines.push(
      `| ${a.taskId} | ${a.suite} | ${a.stability} | ${pct(a.passRate)} (${a.passes}/${a.trials}) | ${a.trials} | ` +
        `${a.avgTurns.toFixed(1)} | ${(mean(rs.map(r => r.userTurns ?? 0)) ?? 0).toFixed(1)} | ${a.totalTokens} | ${((mean(rs.map(r => r.wallMs || 0)) ?? 0) / 1000).toFixed(0)}s |`
    );
  }
  lines.push('');

  const summaryMd = lines.join('\n');
  writeFileSync(join(root, 'summary.md'), summaryMd);
  writeFileSync(
    join(root, 'summary.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        resultsDir: root,
        trials: totalTrials,
        duplicates,
        overall: { passAt1, passAtK, passCaretK, costTotal: totalCost, costPerPass, avgTurns, avgUserTurns, avgWallMs },
        suites,
        finishReasons: Object.fromEntries(finishCounts),
        nodeGrade: nodeRollup,
        perTask: aggregates,
      },
      null,
      2
    ) + '\n'
  );

  console.log(summaryMd);
  console.log(`\n[aggregate-dialogue] wrote ${join(root, 'summary.md')} + summary.json (${totalTrials} trial(s), ${aggregates.length} task(s))`);
}

main();
