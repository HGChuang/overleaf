// Grader dispatch. Four grader types:
//   compile — final files compile clean via clsi (hard outcome gate)
//   assert  — deterministic regex count/order assertions + stillCompiles
//   judge   — LLM-as-judge with per-fixture rubric (1-5) + stillCompiles
//   noop    — PASSES only when the agent submitted NO patch (negative tasks:
//             pure Q&A / already-satisfied instructions must not trigger edits)
//
// GradeResult.score carries PARTIAL CREDIT where the grader supports it
// (assert: assertionsPassed/assertionsTotal; judge: score/5; compile/noop:
// 1 or 0). Binary success stays the pass/fail gate; score is the
// hill-climbing signal.

import { gradeCompile } from './compileGrader.js';
import { gradeAssert, evalAssertions, type Assertion } from './assertGrader.js';
import { gradeJudge } from './judgeGrader.js';
import { gradeNoop } from './noopGrader.js';
import type { UsageRecord } from '../usageTap.js';

export type FailureReason =
  | 'no_patch'
  | 'unexpected_patch'
  | 'patch_apply_failed'
  | 'compile_still_failing'
  | 'assertion_failed'
  | 'judge_score_low'
  | 'trace_assertion_failed'
  | 'turn_timeout'
  | 'provider_error'
  | 'step_budget_exceeded';

export interface GradeResult {
  success: boolean;
  failureReason?: FailureReason;
  failureDetail?: string;
  judgeScore?: number;
  judgeRationale?: string;
  score?: number; // partial credit, 0..1
  assertionsPassed?: number;
  assertionsTotal?: number;
}

export interface GradeContext {
  filesRef: { current: { path: string; content: string }[] };
  mainFile: string;
  originalFiles: { path: string; content: string }[];
  instruction: string;
  judgeClient: { model: any; apiKey: string } | null;
  judgeUsage: UsageRecord;
  patchesApplied: number;
}

export async function grade(grader: any, ctx: GradeContext): Promise<GradeResult> {
  switch (grader?.type) {
    case 'compile': {
      // F12 invariant guards ("fix the error WITHOUT creating files"): the
      // shared assertion DSL runs as a free pre-gate — a compile that only
      // passes because the agent broke the constraint is a failure.
      const guards: Assertion[] = grader.assertions || [];
      if (guards.length > 0) {
        const { passed, total, firstFailure } = evalAssertions(guards, ctx.filesRef.current, ctx.originalFiles);
        if (firstFailure) {
          return {
            success: false,
            failureReason: 'assertion_failed',
            failureDetail: firstFailure,
            assertionsPassed: passed,
            assertionsTotal: total,
            score: total === 0 ? 0 : passed / total,
          };
        }
      }
      return gradeCompile(ctx.filesRef, ctx.mainFile);
    }
    case 'assert':
      return gradeAssert(grader, ctx.filesRef, ctx.mainFile, ctx.originalFiles);
    case 'judge': {
      if (!ctx.judgeClient) {
        return { success: false, failureReason: 'judge_score_low', failureDetail: 'judge client unavailable', score: 0 };
      }
      return gradeJudge(grader, ctx.filesRef, ctx.mainFile, ctx.originalFiles, ctx.instruction, ctx.judgeClient, ctx.judgeUsage);
    }
    case 'noop':
      return gradeNoop(ctx.patchesApplied);
    default:
      return { success: false, failureReason: 'assertion_failed', failureDetail: `unknown grader type: ${grader?.type}`, score: 0 };
  }
}
