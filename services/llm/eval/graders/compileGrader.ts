// Compile grader: the hard outcome gate for compile-fix tasks (and the
// stillCompiles backstop for every other category). Compiles the FINAL
// in-memory files via clsi — never the agent's self-report, never the
// agent's own compile_project result.

import { compileFiles } from '../compileRunner.js';
import type { GradeResult } from './index.js';

export async function gradeCompile(
  filesRef: { current: { path: string; content: string }[] },
  mainFile: string
): Promise<GradeResult> {
  const result = await compileFiles(filesRef.current, mainFile);
  if (result.errorCount == null) {
    // Infra failure (clsi down / no log): cannot grade — count as failing but
    // flag the reason so it is distinguishable from a real compile failure.
    return {
      success: false,
      failureReason: 'compile_still_failing',
      failureDetail: `compile infra: ${result.note || result.status}`,
      score: 0,
    };
  }
  if (result.errorCount === 0) {
    return { success: true, score: 1 };
  }
  const first = result.errors
    .slice(0, 3)
    .map(e => `${e.file || '?'}:${e.line ?? '?'} ${e.message}`)
    .join(' | ');
  return {
    success: false,
    failureReason: 'compile_still_failing',
    failureDetail: `${result.errorCount} error(s): ${first}`,
    score: 0,
  };
}
