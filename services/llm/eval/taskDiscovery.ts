// Shared fixture discovery for cli.ts / resumeRun.ts.
//
// HOLDOUT PROTECTION (P0-0): suite 'holdout' fixtures are the frozen
// acceptance set — iterating on them is Goodhart contamination (the agent
// gets tuned to the exam). Rules:
//   - --suite all NEVER includes holdout unless --include-holdout is passed
//   - --suite holdout selects only holdout (explicit, deliberate)
//   - an explicit --task <id-or-substring> bypasses suite filtering entirely
//     (deliberate); substring match enables batch selection (--task bvar-)
// resumeRun derives the filter from the run dir's run.json (F11 fix): resuming
// a run completes exactly the work list the original run set out to do —
// no silent expansion into suites the original run never touched.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { EvalTask } from './contextBuilder.js';

const EVAL_DIR = new URL('.', import.meta.url).pathname;
const DEFAULT_FIXTURES_DIR = join(EVAL_DIR, 'fixtures');
const CATEGORIES = ['compile', 'structure', 'semantic', 'noop'];

export interface DiscoveryFilter {
  category?: string; // 'all' | single category
  suite?: string; // 'all' | 'capability' | 'regression' | 'holdout'
  task?: string | null;
  includeHoldout?: boolean;
  // Cohort exclusion (iter16): the original-116 tasks are textbook-easy
  // (~99%, zero discrimination) and pad the regression gate. A run may
  // exclude a named cohort (see eval/cohorts.json, e.g. "original") so the
  // gate measures only the harder P0-0-era tasks. CLI: --exclude-cohort <name>.
  excludeCohort?: string;
}

// Lazily loaded cohort ID sets from eval/cohorts.json. Memoized per name.
const cohortCache = new Map<string, Set<string> | null>();
export function loadCohort(name: string): Set<string> | null {
  if (cohortCache.has(name)) return cohortCache.get(name)!;
  let result: Set<string> | null = null;
  try {
    const raw = JSON.parse(readFileSync(join(EVAL_DIR, 'cohorts.json'), 'utf8'));
    const arr = raw?.[name];
    if (Array.isArray(arr)) result = new Set(arr);
  } catch {
    result = null; // missing file / bad JSON → treat as no-op (validateFixtures is the guard)
  }
  cohortCache.set(name, result);
  return result;
}

export function discoverFixtures(
  filter: DiscoveryFilter = {},
  fixturesDir: string = DEFAULT_FIXTURES_DIR
): EvalTask[] {
  const { category = 'all', suite = 'all', task = null, includeHoldout = false, excludeCohort } = filter;
  const categories = category === 'all' ? CATEGORIES : [category];
  const excluded = excludeCohort ? loadCohort(excludeCohort) : null;
  const tasks: EvalTask[] = [];
  for (const cat of categories) {
    const dir = join(fixturesDir, cat);
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files.sort()) {
      let parsed: EvalTask;
      try {
        parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as EvalTask;
      } catch {
        continue; // broken JSON is validateFixtures' job to report, not discovery's
      }
      if (task && !parsed.id.includes(task)) continue;
      if (suite !== 'all' && parsed.suite !== suite) continue;
      if (suite === 'all' && !includeHoldout && !task && parsed.suite === 'holdout') continue;
      if (excluded && excluded.has(parsed.id)) continue;
      tasks.push(parsed);
    }
  }
  return tasks;
}
