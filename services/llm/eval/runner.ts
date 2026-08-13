// Per-trial orchestration: replay the production self-healing loop offline,
// once per trial. (Anthropic eval article: model output is stochastic — a
// task's result is a DISTRIBUTION over trials, never a single run.)
//
// Turn flow (mirrors the frontend + CopilotService):
//   turn 1 — user instruction; for compile tasks the frontend-pushed
//            compileErrors (from a REAL pre-compile of the broken snapshot)
//            ride along, exactly like the user's last failed compile in prod.
//   patch  — the eval "user" accepts: hunks are applied to the in-memory
//            files atomically (patchApplier), then the hidden verification
//            message fires (same string the frontend sends), bounded by
//            MAX_VERIFY_TURNS — the generator→verifier loop.
//   stop   — a turn without a patch (agent confirmed clean / gave up), the
//            verify budget exhausted, or chat() throwing (classified).
//
// Grading happens AFTER the loop, from the final in-memory files only —
// the agent cannot declare victory unilaterally. noop tasks invert the
// expectation: ZERO patches is the pass condition (grader decides).
//
// Returns the TrialRecord AND the full conversation transcript (read back
// from the per-task memory store) — transcripts are the primary review
// artifact ("Read the transcripts!"), persisted by the CLI.

import { buildTaskService, buildJudgeClient } from './serviceFactory.js';
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
import { gradeNodes, type NodeGradeResult, type NodeRates } from './graders/nodeGrader.js';
import { RawTraceRecorder, type RawToolEvent } from './rawTrace.js';
import { compileFiles } from './compileRunner.js';
import { emptyUsage, priceUsage, type UsageRecord } from './usageTap.js';

export interface TrialRecord {
  taskId: string;
  category: string;
  difficulty: string;
  suite: string;
  trialIndex: number;
  success: boolean;
  score: number; // partial credit 0..1 (assert N/M, judge/5, else 1|0)
  failureReason: FailureReason | null;
  failureDetail: string | null;
  turns: number;
  verifyTurns: number;
  patchesApplied: number;
  toolCalls: Record<string, number>;
  usage: { agent: UsageRecord; judge: UsageRecord };
  judgeScore: number | null;
  assertionsPassed: number | null;
  assertionsTotal: number | null;
  // Trajectory assertion tally (null when the task carries none). A failing
  // trace flips a PASSING trial to trace_assertion_failed; on an
  // already-failing trial the outcome failure keeps primary attribution.
  tracePassed: number | null;
  traceTotal: number | null;
  // Node-grader aggregate rates + per-rule finding counts (F10: numbers only —
  // the per-call verdict table with text lives in the raw-trace artifact).
  // Diagnostics only, NEVER participates in success. null on harness crashes.
  nodeGrade?: { rates: NodeRates; findingCounts: Record<string, number> } | null;
  wallMs: number;
}

export interface TrialOutcome {
  record: TrialRecord;
  transcript: any[];
  // Full-fidelity tool-call trace (rawTrace.ts) + the node-grader verdict
  // table. Persistence (traces/<taskId>.t<N>.json) is the CLI's job.
  trace: RawToolEvent[];
  nodeGrade: NodeGradeResult | null;
}

function classifyError(err: any): { failureReason: FailureReason; failureDetail: string } {
  const code = err?.code || '';
  const message = String(err?.message || err || 'unknown').slice(0, 300);
  if (code === 'COPILOT_STEP_LIMIT') return { failureReason: 'step_budget_exceeded', failureDetail: message };
  if (code === 'COPILOT_TIMEOUT' || code === 'COPILOT_ABORTED') return { failureReason: 'turn_timeout', failureDetail: message };
  return { failureReason: 'provider_error', failureDetail: `${code || err?.name || 'Error'}: ${message}` };
}

export async function runTrial(task: EvalTask, trialIndex: number): Promise<TrialOutcome> {
  const startedAt = Date.now();
  const mainFile = task.project.mainFile;
  // Deep-clone the snapshot: the agent loop + patchApplier mutate this copy.
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
  const conversationId = `eval-${task.id}-t${trialIndex}-${startedAt.toString(36)}`;

  const record: TrialRecord = {
    taskId: task.id,
    category: task.category,
    difficulty: task.difficulty || 'unspecified',
    suite: task.suite || 'unspecified',
    trialIndex,
    success: false,
    score: 0,
    failureReason: null,
    failureDetail: null,
    turns: 0,
    verifyTurns: 0,
    patchesApplied: 0,
    toolCalls: {},
    usage: { agent: agentUsage, judge: judgeUsage },
    judgeScore: null,
    assertionsPassed: null,
    assertionsTotal: null,
    tracePassed: null,
    traceTotal: null,
    wallMs: 0,
  };

  // Compile-fix tasks start from the user's REAL last compile — pre-compile
  // the broken snapshot and push the parsed errors like the frontend does.
  let compileErrors;
  if (task.category === 'compile') {
    const pre = await compileFiles(filesRef.current, mainFile);
    if (pre.errorCount && pre.errorCount > 0) {
      compileErrors = pre.errors;
    }
  }

  const maxVerifyTurns = task.maxVerifyTurns ?? MAX_VERIFY_TURNS;
  let instruction = task.instruction;
  let stopped: { failureReason: FailureReason; failureDetail: string } | null = null;

  while (true) {
    let result: any;
    try {
      result = await service.chat(
        userIdentifier,
        buildChatPayload({ task, filesRef, conversationId, instruction, compileErrors }),
        {
          onEvent: (e: any) => {
            if (e.type === 'tool_end') {
              record.toolCalls[e.toolName] = (record.toolCalls[e.toolName] || 0) + 1;
            }
          },
        }
      );
    } catch (err: any) {
      stopped = classifyError(err);
      break;
    }
    record.turns++;
    // compileErrors only rides the FIRST turn (the frontend re-reads live
    // editor state per message; eval has no live editor — the verify turns
    // get their ground truth from compile_project instead).
    compileErrors = undefined;

    const patchBlock = (result?.message?.blocks || []).find((b: any) => b?.type === 'patch');
    if (patchBlock?.patch?.hunks?.length) {
      const applied = applyPatch(filesRef, patchBlock.patch.hunks, mainFile);
      if ('failed' in applied && applied.failed) {
        stopped = {
          failureReason: 'patch_apply_failed',
          failureDetail: `hunk ${applied.failed.hunkIndex} in ${applied.failed.file}: ${applied.failed.reason}`,
        };
        break;
      }
      record.patchesApplied += applied.applied;

      if (shouldEnterVerifyTurn(task.category, record.verifyTurns, maxVerifyTurns)) {
        record.verifyTurns++;
        instruction = VERIFY_MESSAGE;
        continue;
      }
      // noop: patch applied → straight to grading (already a failure there).
      // verify budget exhausted → grade the final state.
      break;
    }
    // No patch this turn: for a verify turn this is the agent confirming
    // done; for turn 1 it means the agent never proposed an edit (the PASS
    // condition for noop tasks — the grader decides).
    break;
  }

  if (stopped) {
    record.failureReason = stopped.failureReason;
    record.failureDetail = stopped.failureDetail;
  } else if (record.patchesApplied === 0 && task.category !== 'noop') {
    // Provisional — refined to `patch_rejected` after the transcript is read.
    // A turn whose patches were ALL dry-run-rejected is mechanics (cluster B),
    // not "never submitted" (cluster A): conflating them poisons attribution
    // (F28, found on table-4way t0 in the iter4 run — 3 submits, 3 rejects,
    // recorded as "agent finished without calling submit_patch").
    record.failureReason = 'no_patch';
    record.failureDetail = 'agent finished without calling submit_patch';
  } else {
    const judgeClient = task.grader?.type === 'judge' ? await buildJudgeClient(creds) : null;
    const verdict = await grade(task.grader, {
      filesRef,
      mainFile,
      originalFiles,
      instruction: task.instruction,
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

  record.wallMs = Date.now() - startedAt;
  // The provider stream reports $0 (vendored model descriptors have a zero
  // cost table) — price the token counts ourselves from the model id ACTUALLY
  // called (EVAL_MODEL_ID override included, via resolveProviderMeta).
  const { modelId } = resolveProviderMeta(creds);
  priceUsage(record.usage.agent, modelId || '');
  priceUsage(record.usage.judge, modelId || '');

  // Read back the full conversation for transcript persistence. The memory
  // store holds user/assistant/toolResult messages (tool calls + results
  // included) — the review artifact for failure triage.
  let transcript: any[] = [];
  try {
    transcript = await memoryStore.load(service.buildThreadId(userIdentifier, conversationId));
  } catch {
    /* transcript is best-effort; the record stands */
  }

  // F28: split the provisional no_patch — rejected submissions are cluster-B
  // mechanics, not cluster-A discipline. (Pre-F22 transcripts of budget stops
  // may be empty; best-effort, the provisional label stands then.)
  if (record.failureReason === 'no_patch' && transcript.length > 0) {
    const rejections = transcript.filter(
      (m: any) =>
        m?.role === 'toolResult' &&
        m?.toolName === 'submit_patch' &&
        (m?.isError || m?.details?.dryRunRejected === true)
    );
    if (rejections.length > 0) {
      record.failureReason = 'patch_rejected';
      record.failureDetail = `agent submitted but every patch was dry-run-rejected (${rejections.length} rejection(s) — retry budget exhausted or turn ended)`;
    }
  }

  // Trace assertions (trajectory grading): behavioral floors/ceilings on HOW
  // the agent worked. Evaluated after transcript readback (no-repeat-call
  // needs tool-call arguments). A failing trace flips only a PASSING trial —
  // the outcome failure of an already-failing trial stays the primary
  // attribution; the tally is recorded either way for analysis.
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

  // Node grader (deterministic per-call diagnostics over the raw trace):
  // record carries rates + finding counts only (F10); the full verdict table
  // rides the outcome for the raw-trace artifact. Diagnostics NEVER flip
  // success — grading here is purely observational.
  const traceEvents = traceRecorder.events();
  let nodeGrade: NodeGradeResult | null = null;
  try {
    nodeGrade = gradeNodes(traceEvents, { mainFile });
    record.nodeGrade = { rates: nodeGrade.rates, findingCounts: nodeGrade.findingCounts };
  } catch {
    record.nodeGrade = null; // diagnostics are best-effort; the record stands
  }
  return { record, transcript, trace: traceEvents, nodeGrade };
}
