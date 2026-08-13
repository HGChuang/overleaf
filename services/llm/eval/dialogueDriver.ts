// Dialogue driver: multi-turn (τ-bench-style) evals where the USER is an
// external agent (Claude Code subagent, model-heterogeneous from the copilot
// under test) instead of an in-harness LLM module.
//
// The driver is a long-lived process inside the develop-llm container; the
// simulated user drives it through a file queue on the bind-mounted repo:
//
//   <dir>/turn-1.json          driver → user: agent reply to the fixture's
//                              opening instruction (written at startup)
//   <dir>/request.json.tmp → request.json
//                              user → driver: {seq, message} | {seq, end:true}
//                              (write .tmp then rename — atomic on the mount)
//   <dir>/response-<seq>.json  driver → user: the agent's USER-VISIBLE reply
//                              (markdown text + patch summary + compile state
//                              after accepting patches — never thinking or
//                              tool internals, exactly what the panel shows)
//   <dir>/final.json           driver → user: terminal verdict (end signal,
//                              idle timeout, or wall watchdog)
//   <dir>/transcript.json      full conversation (review artifact)
//   <dir>/raw-trace.json       full-fidelity tool-call trace + node-grader
//                              verdicts (rawTrace.ts / nodeGrader.ts)
//
// Scoring is unchanged and stays DETERMINISTIC: the simulated user only
// steers the conversation; pass/fail comes from the outcome grader on the
// final files (+ traceAssertions). satisfied ≠ pass.
//
// Semantics mirrored from runner.ts: the eval "user" accepts every patch
// (applyPatch) and the hidden verification message fires after each accept
// (per-user-turn verify budget, like production's notifyPatchAccepted). The
// ONE inversion vs the single-turn runner: a reply WITHOUT a patch no longer
// ends the trial — it is a clarification/explanation, handed back to the
// simulated user.
//
// Usage (inside develop-llm):
//   npx tsx eval/dialogueDriver.ts --fixture eval/fixtures-dialogue/x.json \
//       --dir eval/results/dialogue-live/x --max-wall-min 30 [--trial-index N]

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { buildTaskService, buildJudgeClient, shutdownEval } from './serviceFactory.js';
import { resolveProviderMeta } from './creds.js';
import {
  buildChatPayload,
  VERIFY_MESSAGE,
  MAX_VERIFY_TURNS,
  shouldEnterVerifyTurn,
  type EvalTask,
} from './contextBuilder.js';
import { applyPatch } from './patchApplier.js';
import { grade, type FailureReason } from './graders/index.js';
import { evalTraceAssertions } from './graders/traceGrader.js';
import { gradeNodes } from './graders/nodeGrader.js';
import { RawTraceRecorder, serializeRawTrace } from './rawTrace.js';
import { compileFiles } from './compileRunner.js';
import { emptyUsage, priceUsage } from './usageTap.js';

const IDLE_TIMEOUT_MS = 12 * 60 * 1000; // no user message → finalize
const POLL_MS = 400;

interface DialogueConfig {
  hiddenGoal: string;
  persona: string;
  // The full seven-value taxonomy (fixtures-dialogue/AUTHORING.md). The
  // driver itself never branches on disclosure — the simulated user does.
  disclosure:
    | 'progressive'
    | 'correction'
    | 'change-of-mind'
    | 'pressure'
    | 'misleading'
    | 'multi-goal'
    | 'vague';
  maxUserTurns: number;
}

interface RoundOutcome {
  status: 'ok' | 'agent_error';
  agentText: string;
  patches: { file: string; hunks: number; applied: number }[];
  stopped: { failureReason: FailureReason; failureDetail: string } | null;
}

function parseArgs(argv: string[]) {
  const opts: any = { fixture: null, dir: null, maxWallMin: 30, trialIndex: 0 };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--fixture': opts.fixture = argv[++i]; break;
      case '--dir': opts.dir = argv[++i]; break;
      case '--max-wall-min': opts.maxWallMin = Number(argv[++i]) || 30; break;
      case '--trial-index': opts.trialIndex = Math.max(0, Number(argv[++i]) || 0); break;
      default:
        console.error(`unknown arg: ${argv[i]}`);
        process.exit(2);
    }
  }
  if (!opts.fixture || !opts.dir) {
    console.error('usage: dialogueDriver.ts --fixture <path> --dir <live dir> [--max-wall-min N] [--trial-index N]');
    process.exit(2);
  }
  return opts;
}

// User-visible compile state after a patch accept — the panel's compile badge.
async function compileBadge(filesRef: any, mainFile: string) {
  try {
    const r = await compileFiles(filesRef.current, mainFile);
    return {
      errorCount: r.errorCount ?? 0,
      errors: (r.errors || []).slice(0, 3).map((e: any) => ({
        file: e.file ?? null,
        line: e.line ?? null,
        message: String(e.message || '').slice(0, 200),
      })),
    };
  } catch {
    return { errorCount: null, errors: [] };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const task = JSON.parse(readFileSync(resolve(opts.fixture), 'utf8')) as EvalTask & { dialogue?: DialogueConfig };
  if (!task.dialogue?.hiddenGoal) {
    console.error(`fixture ${task.id || opts.fixture} carries no dialogue.hiddenGoal — not a dialogue task`);
    process.exit(2);
  }
  const dir = opts.dir;
  mkdirSync(dir, { recursive: true });

  const mainFile = task.project.mainFile;
  const filesRef = { current: task.project.files.map(f => ({ ...f })) };
  const originalFiles = task.project.files.map(f => ({ ...f }));
  const traceRecorder = new RawTraceRecorder();

  const { service, creds, agentUsage, userIdentifier, memoryStore } = await buildTaskService(
    task.id,
    filesRef,
    mainFile,
    traceRecorder
  );
  const judgeUsage = emptyUsage();
  const startedAt = Date.now();
  const trialIndex: number = opts.trialIndex;
  const conversationId = `eval-dialogue-${task.id}-t${trialIndex}-${startedAt.toString(36)}`;

  // Whole-trial tallies (same shape as runner's TrialRecord).
  const tally = {
    turns: 0,
    verifyTurns: 0, // hidden verification replays across ALL agentRounds
    patchesApplied: 0,
    toolCalls: {} as Record<string, number>,
    userTurns: 0,
  };
  const userMessages: string[] = []; // what the user ACTUALLY said (grading scope)
  let finished: { reason: string } | null = null;

  const onEvent = (e: any) => {
    if (e.type === 'tool_end') {
      tally.toolCalls[e.toolName] = (tally.toolCalls[e.toolName] || 0) + 1;
    }
  };

  // One user turn: run the agent until it delivers (patch accepted + verify
  // replay exhausted) or replies text-only (clarification/explanation).
  async function agentRound(initialInstruction: string, firstRoundCompileErrors?: any): Promise<RoundOutcome> {
    let instruction = initialInstruction;
    let compileErrors = firstRoundCompileErrors;
    const out: RoundOutcome = { status: 'ok', agentText: '', patches: [], stopped: null };
    let verifyTurns = 0; // per-user-turn verify budget (production: per accept)
    const maxVerifyTurns = task.maxVerifyTurns ?? MAX_VERIFY_TURNS;

    while (true) {
      let result: any;
      try {
        result = await service.chat(
          userIdentifier,
          buildChatPayload({ task, filesRef, conversationId, instruction, compileErrors }),
          { onEvent }
        );
      } catch (err: any) {
        const code = err?.code || '';
        const message = String(err?.message || err || 'unknown').slice(0, 300);
        out.status = 'agent_error';
        if (code === 'COPILOT_STEP_LIMIT') out.stopped = { failureReason: 'step_budget_exceeded', failureDetail: message };
        else if (code === 'COPILOT_TIMEOUT' || code === 'COPILOT_ABORTED') out.stopped = { failureReason: 'turn_timeout', failureDetail: message };
        else out.stopped = { failureReason: 'provider_error', failureDetail: `${code || err?.name || 'Error'}: ${message}` };
        break;
      }
      tally.turns++;
      compileErrors = undefined; // frontend-pushed errors ride the first turn only
      out.agentText = String(result?.message?.content || '');

      const patchBlock = (result?.message?.blocks || []).find((b: any) => b?.type === 'patch');
      if (patchBlock?.patch?.hunks?.length) {
        const applied = applyPatch(filesRef, patchBlock.patch.hunks, mainFile);
        if ('failed' in applied && applied.failed) {
          out.stopped = {
            failureReason: 'patch_apply_failed',
            failureDetail: `hunk ${applied.failed.hunkIndex} in ${applied.failed.file}: ${applied.failed.reason}`,
          };
          break;
        }
        tally.patchesApplied += applied.applied;
        out.patches.push({ file: mainFile, hunks: patchBlock.patch.hunks.length, applied: applied.applied });
        if (shouldEnterVerifyTurn(task.category, verifyTurns, maxVerifyTurns)) {
          verifyTurns++;
          tally.verifyTurns++; // whole-trial tally (runner's verifyTurns semantics)
          instruction = VERIFY_MESSAGE;
          continue;
        }
        break;
      }
      // No patch this turn: clarification / explanation / confirmation —
      // in multi-turn this goes BACK to the simulated user, not to grading.
      break;
    }
    return out;
  }

  function writeJsonAtomic(path: string, data: any) {
    writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n');
    renameSync(`${path}.tmp`, path);
  }

  async function finalize(reason: string, stopped?: { failureReason: FailureReason; failureDetail: string } | null) {
    if (finished) return;
    finished = { reason };

    const record: any = {
      taskId: task.id,
      category: task.category,
      difficulty: task.difficulty || 'unspecified',
      suite: task.suite || 'unspecified',
      trialIndex,
      finishReason: reason,
      success: false,
      score: 0,
      failureReason: null as FailureReason | null,
      failureDetail: null as string | null,
      turns: tally.turns,
      verifyTurns: tally.verifyTurns,
      userTurns: tally.userTurns,
      patchesApplied: tally.patchesApplied,
      toolCalls: tally.toolCalls,
      usage: { agent: agentUsage, judge: judgeUsage },
      judgeScore: null as number | null,
      assertionsPassed: null as number | null,
      assertionsTotal: null as number | null,
      tracePassed: null as number | null,
      traceTotal: null as number | null,
      nodeGrade: null as any, // rates + findingCounts only (F10); filled below
      wallMs: Date.now() - startedAt,
    };

    let transcript: any[] = [];
    try {
      transcript = await memoryStore.load(service.buildThreadId(userIdentifier, conversationId));
    } catch {
      /* best-effort */
    }

    if (reason === 'agent_error' && stopped) {
      // Same as runner: a crashed trial keeps the crash classification, the
      // grader is never consulted on a dead agent loop.
      record.failureReason = stopped.failureReason;
      record.failureDetail = stopped.failureDetail;
    } else if (record.patchesApplied === 0 && task.category !== 'noop') {
      record.failureReason = 'no_patch';
      record.failureDetail = `agent never submitted a patch across ${tally.userTurns} user turn(s)`;
      // F28 split: rejected submissions are mechanics, not discipline.
      const rejections = (transcript || []).filter(
        (m: any) => m?.role === 'toolResult' && m?.toolName === 'submit_patch' && (m?.isError || m?.details?.dryRunRejected === true)
      );
      if (rejections.length > 0) {
        record.failureReason = 'patch_rejected';
        record.failureDetail = `agent submitted but every patch was dry-run-rejected (${rejections.length} rejection(s))`;
      }
    } else {
      // Grading scope = what the user ACTUALLY asked for across the dialogue
      // (not the hidden goal — the agent answers to spoken requests only).
      const fullInstruction = userMessages.join('\n---\n');
      const judgeClient = task.grader?.type === 'judge' ? await buildJudgeClient(creds) : null;
      const verdict = await grade(task.grader, {
        filesRef,
        mainFile,
        originalFiles,
        instruction: fullInstruction,
        judgeClient,
        judgeUsage,
        patchesApplied: record.patchesApplied,
      });
      record.success = verdict.success;
      record.score = verdict.score ?? (verdict.success ? 1 : 0);
      record.failureReason = verdict.failureReason ?? null;
      record.failureDetail = verdict.failureDetail ?? null;
      record.judgeScore = verdict.judgeScore ?? null;
      record.assertionsPassed = verdict.assertionsPassed ?? null;
      record.assertionsTotal = verdict.assertionsTotal ?? null;
    }

    const traceAssertions = task.traceAssertions || [];
    if (traceAssertions.length > 0) {
      const trace = evalTraceAssertions(traceAssertions, {
        toolCalls: record.toolCalls,
        turns: record.turns,
        transcript,
      });
      record.tracePassed = trace.passed;
      record.traceTotal = trace.total;
      if (trace.firstFailure && record.success) {
        record.success = false;
        record.failureReason = 'trace_assertion_failed';
        record.failureDetail = trace.firstFailure;
      }
    }

    const { modelId } = resolveProviderMeta(creds);
    priceUsage(record.usage.agent, modelId || '');
    priceUsage(record.usage.judge, modelId || '');

    // Node grader over the raw trace — same mount as runner.ts: aggregate
    // rates + finding counts on the record (F10: numbers only), the full
    // per-call verdict table goes to raw-trace.json. Never flips success.
    const traceEvents = traceRecorder.events();
    let nodeGrade: ReturnType<typeof gradeNodes> | null = null;
    try {
      nodeGrade = gradeNodes(traceEvents, { mainFile });
      record.nodeGrade = { rates: nodeGrade.rates, findingCounts: nodeGrade.findingCounts };
    } catch {
      record.nodeGrade = null; // best-effort diagnostics
    }

    // End-race drain (F11): a request.json that landed after the loop's last
    // poll (e.g. the user's end signal racing max_user_turns) must not be left
    // behind — a stale request.json would be picked up by the NEXT driver run
    // in this dir. Consume it for the record; it no longer steers anything.
    try {
      const stalePath = join(dir, 'request.json');
      if (existsSync(stalePath)) {
        const stale = JSON.parse(readFileSync(stalePath, 'utf8'));
        renameSync(stalePath, join(dir, `consumed-${stale?.seq ?? 'x'}.json`));
        console.log(`[dialogue] drained late request.json (seq ${stale?.seq ?? 'x'}) during finalize`);
      }
    } catch {
      /* drain is best-effort */
    }

    writeJsonAtomic(join(dir, 'final.json'), record);
    try {
      writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ taskId: task.id, trialIndex, record, messages: transcript }, null, 2) + '\n');
    } catch {
      /* best-effort */
    }
    try {
      writeFileSync(
        join(dir, 'raw-trace.json'),
        JSON.stringify(serializeRawTrace({ taskId: task.id, trialIndex, events: traceEvents, nodeGrade }), null, 2) + '\n'
      );
    } catch {
      /* best-effort */
    }
    console.log(`[dialogue] ${record.success ? 'PASS' : 'FAIL'} ${task.id} t${trialIndex} (${reason}) — ${record.failureReason || 'ok'} ${record.failureDetail || ''}`);
    await shutdownEval();
    process.exit(0);
  }

  // Watchdogs: idle user and total wall both finalize, never hang a run.
  let lastActivity = Date.now();
  const maxWallMs = opts.maxWallMin * 60 * 1000;
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      finalize('idle_timeout').catch(() => process.exit(3));
    } else if (Date.now() - startedAt > maxWallMs) {
      finalize('wall_timeout').catch(() => process.exit(3));
    }
  }, 5000);
  watchdog.unref();

  // ---- opening turn ----
  let compileErrors;
  if (task.category === 'compile') {
    const pre = await compileFiles(filesRef.current, mainFile);
    if (pre.errorCount && pre.errorCount > 0) compileErrors = pre.errors;
  }
  userMessages.push(task.instruction);
  tally.userTurns++;
  const opening = await agentRound(task.instruction, compileErrors);
  writeJsonAtomic(join(dir, 'turn-1.json'), {
    seq: 0,
    status: opening.status,
    agentText: opening.agentText,
    patches: opening.patches,
    compile: opening.patches.length ? await compileBadge(filesRef, mainFile) : null,
    stopped: opening.stopped,
    cumulative: { ...tally },
  });
  console.log(`[dialogue] ${task.id}: opening turn done, waiting for user messages in ${dir}`);

  // ---- user-steered loop ----
  const requestPath = join(dir, 'request.json');
  while (!finished) {
    if (!existsSync(requestPath)) {
      await new Promise(r => setTimeout(r, POLL_MS));
      continue;
    }
    let req: any;
    try {
      req = JSON.parse(readFileSync(requestPath, 'utf8'));
    } catch {
      await new Promise(r => setTimeout(r, POLL_MS)); // partial write; retry
      continue;
    }
    renameSync(requestPath, join(dir, `consumed-${req.seq ?? 'x'}.json`));
    lastActivity = Date.now();

    if (req.end === true) {
      await finalize('user_end');
      break;
    }
    if (typeof req.message !== 'string' || !req.message.trim()) {
      writeJsonAtomic(join(dir, `response-${req.seq}.json`), { seq: req.seq, status: 'bad_request', error: 'request needs {message} or {end:true}' });
      continue;
    }

    tally.userTurns++;
    userMessages.push(req.message);
    const out = await agentRound(req.message);
    writeJsonAtomic(join(dir, `response-${req.seq}.json`), {
      seq: req.seq,
      status: out.status,
      agentText: out.agentText,
      patches: out.patches,
      compile: out.patches.length ? await compileBadge(filesRef, mainFile) : null,
      stopped: out.stopped,
      cumulative: { ...tally },
    });
    console.log(`[dialogue] ${task.id}: user turn ${tally.userTurns} done (${out.status})`);
    if (out.stopped && out.status === 'agent_error') {
      // The agent loop is dead for this trial (provider/step budget) — the
      // user can't steer any further; keep the crash classification.
      await finalize('agent_error', out.stopped);
      break;
    }
    if (tally.userTurns >= (task.dialogue.maxUserTurns || 4)) {
      await finalize('max_user_turns');
      break;
    }
  }
}

main().catch(async err => {
  console.error('[dialogue] fatal:', err?.message || err);
  await shutdownEval();
  process.exit(2);
});
