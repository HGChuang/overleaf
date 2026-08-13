// Noop grader: the NEGATIVE half of the balanced task set (Anthropic eval
// article: test both "should happen" and "should NOT happen" behaviors).
// Passes only when the agent submitted ZERO patches — pure Q&A ("这段公式什么
// 意思？") or already-satisfied instructions must be answered in chat, not
// turned into edits. Any patch = overtriggering = fail.

import type { GradeResult } from './index.js';

export function gradeNoop(patchesApplied: number): GradeResult {
  if (patchesApplied === 0) {
    return { success: true, score: 1 };
  }
  return {
    success: false,
    failureReason: 'unexpected_patch',
    failureDetail: `agent submitted ${patchesApplied} patch hunk(s) on a no-edit task (overtriggering)`,
    score: 0,
  };
}
