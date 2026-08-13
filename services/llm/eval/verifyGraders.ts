// Grader self-test: apply each fixture's REFERENCE SOLUTION and require the
// grader to pass it. Catches broken tasks/graders (the Anthropic article's
// CORE-Bench lesson: "0% pass is most often a broken task, not an incapable
// agent") without spending a single agent token — only judge graders call the
// model, and judge fixtures are skipped here by design (a reference solution
// can't prove a subjective rubric is well-formed; judge calibration is the
// human-review path instead).
//
//   npx tsx eval/verifyGraders.ts [--task <id-or-substring>]
//   (substring match: `--task probe-f` verifies a whole batch at once)
//
// Exit 1 if any reference solution fails its grader.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { grade } from './graders/index.js';
import { emptyUsage } from './usageTap.js';
import type { EvalTask } from './contextBuilder.js';

const EVAL_DIR = new URL('.', import.meta.url).pathname;
const FIXTURES_DIR = join(EVAL_DIR, 'fixtures');
const DIALOGUE_FIXTURES_DIR = join(EVAL_DIR, 'fixtures-dialogue');
const CATEGORIES = ['compile', 'structure']; // assert/compile graders only
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const taskFilter = args.includes('--task') ? args[args.indexOf('--task') + 1] : null;

async function main() {
  const tasks: EvalTask[] = [];
  for (const category of CATEGORIES) {
    const dir = join(FIXTURES_DIR, category);
    let names: string[] = [];
    try {
      names = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      const task = JSON.parse(readFileSync(join(dir, name), 'utf8')) as EvalTask;
      if (taskFilter && !task.id.includes(taskFilter)) continue;
      tasks.push(task);
    }
  }
  // Second sweep: multi-turn dialogue fixtures. Same deterministic graders,
  // same reference-solution contract — only compile/structure categories
  // carry solutions (semantic dialogue tasks are judge-graded, skipped here
  // by the same design as single-turn judge fixtures).
  try {
    const names = readdirSync(DIALOGUE_FIXTURES_DIR).filter(f => f.endsWith('.json'));
    for (const name of names.sort()) {
      const task = JSON.parse(readFileSync(join(DIALOGUE_FIXTURES_DIR, name), 'utf8')) as EvalTask;
      if (!CATEGORIES.includes(task.category)) continue;
      if (taskFilter && !task.id.includes(taskFilter)) continue;
      tasks.push(task);
    }
  } catch {
    /* no fixtures-dialogue dir — single-turn only */
  }
  if (!tasks.length) {
    console.error('no fixtures with reference solutions found');
    process.exit(2);
  }
  console.log(`[verify-graders] ${tasks.length} fixture(s)`);

  const failures: { taskId: string; detail: string }[] = [];
  const skipped: string[] = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      if (!task.solution?.files?.length) {
        skipped.push(task.id);
        continue;
      }
      const filesRef = { current: task.solution.files.map(f => ({ ...f })) };
      try {
        const verdict = await grade(task.grader, {
          filesRef,
          mainFile: task.project.mainFile,
          originalFiles: task.project.files.map(f => ({ ...f })),
          instruction: task.instruction,
          judgeClient: null,
          judgeUsage: emptyUsage(),
          patchesApplied: 1,
        });
        if (!verdict.success) {
          failures.push({
            taskId: task.id,
            detail: `${verdict.failureReason}: ${verdict.failureDetail || ''}`,
          });
          console.log(`FAIL ${task.id} — ${verdict.failureReason}: ${verdict.failureDetail || ''}`);
        } else {
          console.log(`ok   ${task.id}`);
        }
      } catch (err: any) {
        failures.push({ taskId: task.id, detail: `grader crash: ${err?.message || err}` });
        console.log(`FAIL ${task.id} — grader crash: ${err?.message || err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n${tasks.length - failures.length - skipped.length}/${tasks.length - skipped.length} reference solutions pass their grader`);
  if (skipped.length) {
    console.log(`skipped (no solution): ${skipped.join(', ')}`);
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch(err => {
  console.error('[verify-graders] fatal:', err?.message || err);
  process.exit(2);
});
