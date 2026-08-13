// Fixture validator: mechanical quality gate for the eval dataset.
//
//   npx tsx eval/validateFixtures.ts [--no-compile] [--verbose]
//                                     [--task <id-or-substring>]
//   (substring match: `--task probe-f` validates a whole batch at once)
//
// Checks (per fixture):
//   schema    — required fields, id↔dir prefix, category↔grader.type mapping,
//               difficulty + suite tags, unique ids, mainFile ∈ files
//   solution  — compile/structure fixtures must carry a reference solution
//               (full replacement file set) for --verify-graders
//   assert    — assertion DSL validates (all kinds: count/order/literal-count/
//               word-count/sentence-count/file-exists/file-not-exists/
//               file-count/unchanged-file), regexes compile, asserted files
//               exist, AT LEAST ONE assertion fails on the initial snapshot
//               (otherwise the task is already solved and grades nothing);
//               order patterns that never match the initial file are flagged
//               as warnings (likely typos)
//   judge     — focusFile exists, passScore 1..5, rubric present; optional
//               F14 `assertions` hard gate validates under the same DSL
//   compile   — (default) pre-compile the initial snapshot via clsi:
//               compile-category fixtures MUST fail (errorCount > 0), all
//               others MUST compile clean. This is what keeps "fixture
//               hygiene" honest without burning LLM tokens.
//   dialogue  — fixtures-dialogue/*.json get the same schema+compile gate
//               (category from the file's task.category, id prefix
//               `${category}-dialogue-`) plus the dialogue block: hiddenGoal
//               ≥20 chars, persona non-empty, disclosure ∈ the seven-value
//               taxonomy, maxUserTurns ∈ 2..8.
//
// Exit code 1 if any fixture has errors; warnings never fail the run.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { compileFiles } from './compileRunner.js';
import { assertionHolds, type Assertion } from './graders/assertGrader.js';
import { validateTraceAssertionsShape } from './graders/traceGrader.js';

const EVAL_DIR = new URL('.', import.meta.url).pathname;
const FIXTURES_DIR = join(EVAL_DIR, 'fixtures');
const DIALOGUE_FIXTURES_DIR = join(EVAL_DIR, 'fixtures-dialogue');
const CATEGORIES = ['compile', 'structure', 'semantic', 'noop'] as const;
const GRADER_FOR_CATEGORY: Record<string, string> = {
  compile: 'compile',
  structure: 'assert',
  semantic: 'judge',
  noop: 'noop',
};
const DIFFICULTIES = ['easy', 'medium', 'hard'];
// fixtures-dialogue/AUTHORING.md sanctions 'extreme' for multi-turn tasks.
const DIALOGUE_EXTRA_DIFFICULTIES = ['extreme'];
const SUITES = ['capability', 'regression', 'holdout'];
const DISCLOSURES = ['progressive', 'correction', 'change-of-mind', 'pressure', 'misleading', 'multi-goal', 'vague'];
const COMPILE_CONCURRENCY = 4;

interface Issue {
  fixture: string;
  level: 'error' | 'warning';
  check: string;
  detail: string;
}

const args = process.argv.slice(2);
const NO_COMPILE = args.includes('--no-compile');
const VERBOSE = args.includes('--verbose');
const taskFilter = args.includes('--task') ? args[args.indexOf('--task') + 1] : null;

function normalizePath(p: string): string {
  return p.replace(/^\//, '');
}

const OPS = ['eq', 'gte', 'lte'];
// Kinds whose `file` must exist in the initial project snapshot.
const FILE_REQUIRED_KINDS = ['count', 'order', 'literal-count', 'word-count', 'sentence-count', 'file-exists', 'unchanged-file'];

// Shared assertion-DSL validation (assert grader + judge's F14 hard gate +
// compile's invariant guards). `allHoldLevel`: 'error' for assert fixtures
// (task tests nothing), 'warning' for judge fixtures (rubric may still test
// quality beyond the hard gate), null for compile fixtures (assertions are
// guards that hold initially BY DESIGN — the compile outcome is the test).
function validateAssertions(
  assertions: any[],
  paths: string[],
  files: { path: string; content: string }[],
  file: string,
  issues: Issue[],
  allHoldLevel: 'error' | 'warning' | null
): void {
  const err = (detail: string) => issues.push({ fixture: file, level: 'error', check: 'assert', detail });
  const warn = (detail: string) => issues.push({ fixture: file, level: 'warning', check: 'assert', detail });
  for (const [i, a] of assertions.entries()) {
    if (!a || typeof a.kind !== 'string') {
      err(`assertion ${i}: missing kind`);
      continue;
    }
    if (a.kind === 'file-not-exists') {
      if (typeof a.file !== 'string') {
        err(`assertion ${i}: file-not-exists needs file`);
        continue;
      }
      if (paths.includes(normalizePath(a.file))) {
        warn(`assertion ${i}: file-not-exists on '${a.file}' which EXISTS in the initial snapshot — vacuous (agent cannot delete files)`);
      }
      continue;
    }
    if (a.kind === 'file-count') {
      if (!OPS.includes(a.op) || typeof a.count !== 'number') {
        err(`assertion ${i}: bad op/count`);
      }
      continue;
    }
    if (!FILE_REQUIRED_KINDS.includes(a.kind)) {
      err(`assertion ${i}: unknown kind '${a.kind}'`);
      continue;
    }
    if (!paths.includes(normalizePath(a?.file || ''))) {
      err(`assertion ${i}: file '${a?.file}' not in project files`);
      continue;
    }
    try {
      if (a.kind === 'count') {
        if (!OPS.includes(a.op) || typeof a.count !== 'number') {
          err(`assertion ${i}: bad op/count`);
        }
        new RegExp(a.pattern);
      } else if (a.kind === 'literal-count') {
        if (typeof a.literal !== 'string' || a.literal.length === 0) {
          err(`assertion ${i}: literal-count needs non-empty literal`);
        }
        if (!OPS.includes(a.op) || typeof a.count !== 'number') {
          err(`assertion ${i}: bad op/count`);
        }
      } else if (a.kind === 'word-count' || a.kind === 'sentence-count') {
        if (!OPS.includes(a.op) || typeof a.count !== 'number') {
          err(`assertion ${i}: bad op/count`);
        }
      } else if (a.kind === 'order') {
        if (!Array.isArray(a.patterns) || a.patterns.length !== 2) {
          err(`assertion ${i}: order needs patterns:[a,b]`);
          continue;
        }
        new RegExp(a.patterns[0]);
        new RegExp(a.patterns[1]);
        const content = files.find((f: any) => normalizePath(f.path) === normalizePath(a.file))!.content;
        for (const p of a.patterns) {
          if (content.search(new RegExp(p)) === -1) {
            warn(`assertion ${i}: order pattern /${p}/ never matches initial file — typo or refers to agent-created content`);
          }
        }
      }
      // file-exists / unchanged-file: file presence already checked above.
    } catch (e: any) {
      err(`assertion ${i}: regex does not compile: ${e.message}`);
    }
  }
  if (allHoldLevel && assertions.every((a: any) => assertionHolds(a, files))) {
    issues.push({
      fixture: file,
      level: allHoldLevel,
      check: 'assert',
      detail: 'ALL assertions already hold on the initial snapshot — task tests nothing',
    });
  }
}

function validateSchema(task: any, category: string, file: string, issues: Issue[], extraDifficulties: string[] = []): void {
  const err = (check: string, detail: string) => issues.push({ fixture: file, level: 'error', check, detail });
  const warn = (check: string, detail: string) => issues.push({ fixture: file, level: 'warning', check, detail });

  if (typeof task.id !== 'string' || !/^[a-z0-9-]+$/.test(task.id)) {
    err('schema', `id must be kebab-case string, got ${JSON.stringify(task.id)}`);
    return; // further checks rely on id/category
  }
  if (task.category !== category) err('schema', `category '${task.category}' != directory '${category}'`);
  if (!task.id.startsWith(`${category}-`)) err('schema', `id '${task.id}' must start with '${category}-'`);
  const allowedDifficulties = [...DIFFICULTIES, ...extraDifficulties];
  if (!allowedDifficulties.includes(task.difficulty)) {
    err('schema', `difficulty must be one of ${allowedDifficulties.join('/')}, got ${JSON.stringify(task.difficulty)}`);
  }
  if (!SUITES.includes(task.suite)) {
    err('schema', `suite must be one of ${SUITES.join('/')}, got ${JSON.stringify(task.suite)}`);
  }
  if (typeof task.instruction !== 'string' || task.instruction.trim().length < 5) {
    err('schema', 'instruction missing or too short');
  }

  const files = task.project?.files;
  if (!Array.isArray(files) || files.length === 0) {
    err('schema', 'project.files must be a non-empty array');
    return;
  }
  for (const f of files) {
    if (typeof f?.path !== 'string' || typeof f?.content !== 'string') {
      err('schema', `file entry malformed: ${JSON.stringify(f?.path)}`);
      return;
    }
  }
  const paths = files.map((f: any) => normalizePath(f.path));
  if (new Set(paths).size !== paths.length) err('schema', 'duplicate file paths');
  if (!paths.includes(normalizePath(task.project?.mainFile || ''))) {
    err('schema', `mainFile '${task.project?.mainFile}' not in files`);
  }

  // Reference solution (compile/structure): full replacement file set.
  if (category === 'compile' || category === 'structure') {
    const sol = task.solution?.files;
    if (!Array.isArray(sol) || sol.length === 0) {
      err('solution', 'compile/structure fixtures must carry solution.files (reference end-state for --verify-graders)');
    } else {
      for (const f of sol) {
        if (typeof f?.path !== 'string' || typeof f?.content !== 'string') {
          err('solution', `solution file entry malformed: ${JSON.stringify(f?.path)}`);
          break;
        }
      }
      if (!sol.some((f: any) => normalizePath(f.path) === normalizePath(task.project?.mainFile || ''))) {
        err('solution', `solution.files must include mainFile '${task.project?.mainFile}'`);
      }
      // The agent can only EDIT existing files (no create/delete), so the
      // reference end-state must cover exactly the same path set.
      const solPaths = sol.map((f: any) => normalizePath(f.path)).sort();
      const projPaths = [...paths].sort();
      if (JSON.stringify(solPaths) !== JSON.stringify(projPaths)) {
        err('solution', `solution.files paths [${solPaths.join(', ')}] must equal project.files paths [${projPaths.join(', ')}]`);
      }
    }
  }
  if (category === 'noop' || category === 'semantic') {
    if (task.solution) warn('solution', `${category} fixture carries a solution — unused by --verify-graders`);
  }

  const grader = task.grader;
  const expectedType = GRADER_FOR_CATEGORY[category];
  if (grader?.type !== expectedType) {
    err('schema', `grader.type '${grader?.type}' != '${expectedType}' for category '${category}'`);
    return;
  }

  if (grader.type === 'assert') {
    const assertions = grader.assertions;
    if (!Array.isArray(assertions) || assertions.length === 0) {
      err('assert', 'assertions must be a non-empty array');
      return;
    }
    validateAssertions(assertions, paths, files, file, issues, 'error');
  }

  if (grader.type === 'compile' && grader.assertions !== undefined) {
    // Invariant guards on compile tasks ("fix the error WITHOUT creating
    // files" — F12): validated but exempt from the all-hold check, since the
    // guards hold initially BY DESIGN (the compile outcome is the test).
    if (!Array.isArray(grader.assertions) || grader.assertions.length === 0) {
      err('assert', 'compile grader assertions, if present, must be a non-empty array');
    } else {
      validateAssertions(grader.assertions, paths, files, file, issues, null);
    }
  }

  if (grader.type === 'judge') {
    if (!paths.includes(normalizePath(grader.focusFile || ''))) {
      err('judge', `focusFile '${grader.focusFile}' not in project files`);
    }
    if (typeof grader.passScore !== 'number' || grader.passScore < 1 || grader.passScore > 5) {
      err('judge', `passScore must be 1..5, got ${JSON.stringify(grader.passScore)}`);
    }
    if (typeof grader.rubric !== 'string' || grader.rubric.trim().length < 20) {
      err('judge', 'rubric missing or too short (need the 5:...;1:... ladder)');
    }
    if (grader.assertions !== undefined) {
      // F14 hard gate: deterministic metrics on judge tasks.
      if (!Array.isArray(grader.assertions) || grader.assertions.length === 0) {
        err('judge', 'judge assertions, if present, must be a non-empty array');
      } else {
        validateAssertions(grader.assertions, paths, files, file, issues, 'warning');
      }
    }
  }

  // Trajectory assertions (any grader type may carry them): structure check
  // only — no initial-snapshot check applies (traces exist only after a run).
  if (task.traceAssertions !== undefined) {
    if (!Array.isArray(task.traceAssertions) || task.traceAssertions.length === 0) {
      err('trace', 'traceAssertions, if present, must be a non-empty array');
    } else {
      for (const problem of validateTraceAssertionsShape(task.traceAssertions)) {
        err('trace', problem);
      }
    }
  }
}

// Dialogue block schema (fixtures-dialogue/*.json, see AUTHORING.md): the
// simulated user's script. Grader/solution/traceAssertions are validated by
// the shared single-turn checks — here only the dialogue-specific fields.
function validateDialogueBlock(task: any, file: string, issues: Issue[]): void {
  const err = (detail: string) => issues.push({ fixture: file, level: 'error', check: 'dialogue', detail });
  const warn = (detail: string) => issues.push({ fixture: file, level: 'warning', check: 'dialogue', detail });
  const d = task?.dialogue;
  if (!d || typeof d !== 'object') {
    err('missing dialogue block (hiddenGoal/persona/disclosure/maxUserTurns)');
    return;
  }
  if (typeof d.hiddenGoal !== 'string' || d.hiddenGoal.trim().length < 20) {
    err(`hiddenGoal must be a non-empty string of >=20 chars, got ${JSON.stringify(typeof d.hiddenGoal === 'string' ? d.hiddenGoal.slice(0, 30) : d.hiddenGoal)}`);
  } else if (d.hiddenGoal === task.instruction) {
    warn('hiddenGoal is verbatim identical to instruction — the opening message should not leak the full script');
  }
  if (typeof d.persona !== 'string' || d.persona.trim().length === 0) {
    err('persona must be a non-empty string');
  }
  if (!DISCLOSURES.includes(d.disclosure)) {
    err(`disclosure must be one of ${DISCLOSURES.join('/')}, got ${JSON.stringify(d.disclosure)}`);
  }
  if (!Number.isInteger(d.maxUserTurns) || d.maxUserTurns < 2 || d.maxUserTurns > 8) {
    err(`maxUserTurns must be an integer in 2..8, got ${JSON.stringify(d.maxUserTurns)}`);
  }
}

async function main() {
  const tasks: { category: string; file: string; task: any }[] = [];
  const dialogueTasks: { category: string; file: string; task: any }[] = [];
  const issues: Issue[] = [];
  const seenIds = new Map<string, string>();

  for (const category of CATEGORIES) {
    const dir = join(FIXTURES_DIR, category);
    let names: string[] = [];
    try {
      names = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      const file = `${category}/${name}`;
      let task: any;
      try {
        task = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      } catch (e: any) {
        issues.push({ fixture: file, level: 'error', check: 'json', detail: e.message });
        continue;
      }
      if (task?.id) {
        if (taskFilter && !String(task.id).includes(taskFilter)) continue;
        const prev = seenIds.get(task.id);
        if (prev) issues.push({ fixture: file, level: 'error', check: 'schema', detail: `duplicate id also used by ${prev}` });
        seenIds.set(task.id, file);
      }
      validateSchema(task, category, file, issues);
      tasks.push({ category, file, task });
    }
  }

  // ---- fixtures-dialogue/ (multi-turn τ-bench-style tasks) ----
  // Flat directory: category comes from the file's task.category, ids carry a
  // `${category}-dialogue-` prefix. Same schema + compile gate as single-turn,
  // plus the dialogue-block checks. (AUTHORING.md is .md — skipped by the
  // .json filter.)
  {
    let names: string[] = [];
    try {
      names = readdirSync(DIALOGUE_FIXTURES_DIR).filter(f => f.endsWith('.json'));
    } catch {
      names = [];
    }
    for (const name of names.sort()) {
      const file = `dialogue/${name}`;
      let task: any;
      try {
        task = JSON.parse(readFileSync(join(DIALOGUE_FIXTURES_DIR, name), 'utf8'));
      } catch (e: any) {
        issues.push({ fixture: file, level: 'error', check: 'json', detail: e.message });
        continue;
      }
      const category = task?.category;
      if (!CATEGORIES.includes(category)) {
        issues.push({ fixture: file, level: 'error', check: 'schema', detail: `task.category must be one of ${CATEGORIES.join('/')}, got ${JSON.stringify(category)}` });
        continue;
      }
      if (task?.id) {
        if (taskFilter && !String(task.id).includes(taskFilter)) continue;
        if (!String(task.id).startsWith(`${category}-dialogue-`)) {
          issues.push({ fixture: file, level: 'error', check: 'schema', detail: `dialogue fixture id '${task.id}' must start with '${category}-dialogue-'` });
        }
        const prev = seenIds.get(task.id);
        if (prev) issues.push({ fixture: file, level: 'error', check: 'schema', detail: `duplicate id also used by ${prev}` });
        seenIds.set(task.id, file);
      }
      validateSchema(task, category, file, issues, DIALOGUE_EXTRA_DIFFICULTIES);
      validateDialogueBlock(task, file, issues);
      dialogueTasks.push({ category, file, task });
    }
  }

  // ---- initial-snapshot compile expectations (clsi) ----
  if (!NO_COMPILE) {
    const compileIssues: Issue[] = [];
    const compileQueue = [...tasks, ...dialogueTasks];
    let idx = 0;
    async function worker() {
      while (idx < compileQueue.length) {
        const { category, file, task } = compileQueue[idx++];
        if (!task?.project?.files || !task?.grader?.type) continue;
        const expectError = category === 'compile';
        const expectClean = !expectError && task.grader.stillCompiles !== false;
        if (!expectError && !expectClean) continue;
        const res = await compileFiles(
          task.project.files.map((f: any) => ({ ...f })),
          task.project.mainFile
        );
        if (res.errorCount == null) {
          compileIssues.push({ fixture: file, level: 'warning', check: 'compile', detail: `infra: ${res.note || res.status}` });
        } else if (expectError && res.errorCount === 0) {
          compileIssues.push({ fixture: file, level: 'error', check: 'compile', detail: 'compile fixture compiles CLEAN — no errors to push on turn 1' });
        } else if (expectClean && res.errorCount > 0) {
          const first = res.errors[0];
          compileIssues.push({
            fixture: file, level: 'error', check: 'compile',
            detail: `initial snapshot has ${res.errorCount} error(s) — first: ${first?.file}:${first?.line} ${first?.message}`,
          });
        }
        if (VERBOSE) {
          console.log(`[compile] ${file}: errorCount=${res.errorCount} warnings=${res.warningCount} status=${res.status}`);
        }
      }
    }
    await Promise.all(Array.from({ length: COMPILE_CONCURRENCY }, worker));
    issues.push(...compileIssues);
  }

  // ---- report ----
  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  for (const i of issues) {
    console.log(`${i.level === 'error' ? 'ERROR  ' : 'warn   '} [${i.check}] ${i.fixture}: ${i.detail}`);
  }

  console.log('\n== Dataset stats ==');
  const byCat = new Map<string, number>();
  const byDiff = new Map<string, number>();
  const bySuite = new Map<string, number>();
  let multiFile = 0;
  const sizes: number[] = [];
  for (const { category, task } of tasks) {
    byCat.set(category, (byCat.get(category) || 0) + 1);
    byDiff.set(task.difficulty || '?', (byDiff.get(task.difficulty || '?') || 0) + 1);
    bySuite.set(task.suite || '?', (bySuite.get(task.suite || '?') || 0) + 1);
    if ((task.project?.files?.length || 0) > 1) multiFile++;
    sizes.push((task.project?.files || []).reduce((s: number, f: any) => s + (f.content?.length || 0), 0));
  }
  sizes.sort((a, b) => a - b);
  console.log(`total: ${tasks.length}`);
  console.log(`dialogue: ${dialogueTasks.length} (fixtures-dialogue/; breakdowns below cover single-turn only)`);
  console.log(`by category:   ${[...byCat.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`by difficulty: ${[...byDiff.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`by suite:      ${[...bySuite.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`multi-file:    ${multiFile}`);
  if (sizes.length) {
    console.log(`doc size (ch): min=${sizes[0]} median=${sizes[Math.floor(sizes.length / 2)]} max=${sizes[sizes.length - 1]}`);
  }
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  if (!NO_COMPILE) {
    console.log('hint: run `npx tsx eval/verifyGraders.ts` to check reference solutions against graders');
  }
  process.exit(errors.length ? 1 : 0);
}

main().catch(err => {
  console.error('[validate] fatal:', err?.message || err);
  process.exit(2);
});
