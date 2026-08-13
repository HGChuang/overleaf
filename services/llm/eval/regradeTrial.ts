// Re-grade an existing dialogue trial's output with the CURRENT (fixed) graders.
// Reconstructs the revised file state by replaying submit_patch hunks from
// raw-trace.json, then runs grade() + evalTraceAssertions() with the live
// grader code. One-variable isolation for grader fixes (铁律①): hold the
// agent's output constant, vary only the grader — re-running the agent would
// confound agent non-determinism with the grader change.
//
//   npx tsx eval/regradeTrial.ts --fixture eval/fixtures-dialogue/x.json --dir <trial-dir>
//
// Writes <dir>/final.regrade.json and prints a one-line verdict. For judge
// graders the judge LLM is called fresh (bounded by judgeGrader's 5-min
// AbortController cap, L0-病2).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import connectDB from '../config/db.js';
import { loadEvalCreds, resolveProviderMeta } from './creds.js';
import { buildJudgeClient } from './serviceFactory.js';
import { applyPatch } from './patchApplier.js';
import { grade } from './graders/index.js';
import { evalTraceAssertions } from './graders/traceGrader.js';
import { emptyUsage, priceUsage } from './usageTap.js';

interface RawTraceEvent {
  seq: number;
  name: string;
  args: any;
  ok?: boolean;
  isError?: boolean;
  resultText?: string;
}

function parseArgs(argv: string[]) {
  const opts: { fixture: string; dir: string } = { fixture: '', dir: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') opts.fixture = argv[++i];
    else if (argv[i] === '--dir') opts.dir = argv[++i];
  }
  if (!opts.fixture || !opts.dir) {
    console.error('usage: regradeTrial.ts --fixture <path> --dir <trial-dir>');
    process.exit(2);
  }
  return opts;
}

// Reconstruct the full instruction the agent was graded against: the fixture's
// opening instruction + every sim-user message in seq order (from consumed-*.json,
// the renamed request.json files the driver leaves behind).
function reconstructInstruction(dir: string, openingInstruction: string): string {
  const userMsgs: string[] = [openingInstruction];
  const consumed = readdirSync(dir)
    .filter(f => /^consumed-.*\.json$/.test(f))
    .map(f => {
      try {
        const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return { seq: typeof j.seq === 'number' ? j.seq : -1, message: j.message, end: j.end === true };
      } catch {
        return { seq: -1, message: '', end: false };
      }
    })
    .filter(c => c.seq >= 1 && !c.end && typeof c.message === 'string' && c.message.trim())
    .sort((a, b) => a.seq - b.seq);
  for (const c of consumed) userMsgs.push(c.message);
  return userMsgs.join('\n---\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const task = JSON.parse(readFileSync(opts.fixture, 'utf8'));
  const dir = resolve(opts.dir);

  const mainFile = task.project.mainFile;
  const filesRef = { current: task.project.files.map((f: any) => ({ ...f })) };
  const originalFiles = task.project.files.map((f: any) => ({ ...f }));

  // Replay applied submit_patch hunks (skip rejected / errored).
  const rawTracePath = join(dir, 'raw-trace.json');
  if (!existsSync(rawTracePath)) {
    console.error(`[regrade] no raw-trace.json in ${dir}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(rawTracePath, 'utf8'));
  const events: RawTraceEvent[] = raw.events || [];

  let patchesReplayed = 0;
  let patchesApplied = 0;
  let replayFailed = 0;
  for (const ev of events) {
    if (ev.name !== 'submit_patch') continue;
    if (ev.isError) continue; // dryRunRejected / error → never applied
    const resultText = String(ev.resultText || '');
    if (/"submitted":\s*false/.test(resultText)) continue;
    const hunks = ev.args?.hunks;
    if (!Array.isArray(hunks) || hunks.length === 0) continue;
    const applied = applyPatch(filesRef, hunks, mainFile);
    if ('failed' in applied && applied.failed) {
      replayFailed++;
      continue;
    }
    patchesApplied += applied.applied;
    patchesReplayed++;
  }

  const instruction = reconstructInstruction(dir, task.instruction);

  // transcript.json holds the memory-store messages (needed by no-repeat-call).
  let transcript: any[] = [];
  const transcriptPath = join(dir, 'transcript.json');
  if (existsSync(transcriptPath)) {
    try {
      transcript = JSON.parse(readFileSync(transcriptPath, 'utf8')).messages || [];
    } catch {
      transcript = [];
    }
  }

  // Tallies for trace re-eval come from the old final.json.
  let toolCalls: Record<string, number> = {};
  let turns = 0;
  let oldPatchesApplied = 0;
  const finalPath = join(dir, 'final.json');
  if (existsSync(finalPath)) {
    const f = JSON.parse(readFileSync(finalPath, 'utf8'));
    toolCalls = f.toolCalls || {};
    turns = f.turns || 0;
    oldPatchesApplied = f.patchesApplied || 0;
  }

  await connectDB();
  const creds = await loadEvalCreds();
  const judgeClient = task.grader?.type === 'judge' ? await buildJudgeClient(creds) : null;
  const judgeUsage = emptyUsage();

  const verdict = await grade(task.grader, {
    filesRef,
    mainFile,
    originalFiles,
    instruction,
    judgeClient,
    judgeUsage,
    patchesApplied,
  });

  // Re-run trace assertions with current code (e.g. submit_patch max 2→3 fix).
  const traceAssertions = task.traceAssertions || [];
  let tracePassed: number | null = null;
  let traceTotal: number | null = null;
  let traceFirstFailure: string | null = null;
  if (traceAssertions.length > 0) {
    const trace = evalTraceAssertions(traceAssertions, { toolCalls, turns, transcript });
    tracePassed = trace.passed;
    traceTotal = trace.total;
    traceFirstFailure = trace.firstFailure;
    if (trace.firstFailure && verdict.success) {
      verdict.success = false;
      verdict.failureReason = 'trace_assertion_failed';
      verdict.failureDetail = trace.firstFailure;
    }
  }

  const { modelId } = resolveProviderMeta(creds);
  priceUsage(judgeUsage, modelId || '');

  const trialLabel = dir.split('/').pop() || dir;
  const regrade = {
    taskId: task.id,
    regradedAt: new Date().toISOString(),
    patchesReplayed,
    patchesAppliedReplay: patchesApplied,
    patchesAppliedOldRecord: oldPatchesApplied,
    replayMismatch: patchesApplied !== oldPatchesApplied,
    replayFailedHunks: replayFailed,
    success: verdict.success,
    score: verdict.score,
    failureReason: verdict.failureReason ?? null,
    failureDetail: verdict.failureDetail ?? null,
    judgeScore: verdict.judgeScore ?? null,
    judgeRationale: verdict.judgeRationale ?? null,
    assertionsPassed: verdict.assertionsPassed ?? null,
    assertionsTotal: verdict.assertionsTotal ?? null,
    tracePassed,
    traceTotal,
    traceFirstFailure,
    judgeUsage,
  };

  writeFileSync(join(dir, 'final.regrade.json'), JSON.stringify(regrade, null, 2) + '\n');
  const mismatchNote = regrade.replayMismatch ? ` [WARN replay patches ${patchesApplied}≠old ${oldPatchesApplied}]` : '';
  console.log(
    `[regrade] ${trialLabel} — ${verdict.success ? 'PASS' : 'FAIL'} (${verdict.failureReason || 'ok'}) ${(verdict.failureDetail || '').slice(0, 90)}${mismatchNote}`
  );
  process.exit(0);
}

main().catch(e => {
  console.error('regrade fatal:', e);
  process.exit(1);
});
