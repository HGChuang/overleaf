// Quality-check tools for the unified Copilot agent. `run_checks` wraps the
// deterministic scanner loop (the SAME scanners `ChecksService.runChecks` uses
// — `getScanner` from `checks/registry.js`) as a tool the model can call, so
// "run my checks" becomes model-driven intent instead of a hardcoded path. The
// model calls it, gets structured issues back, then summarizes them.
//
// The scanner loop lives in the pure (langchain-free) `runChecksOver` helper
// below so it can be unit-tested without an LLM and reused by the
// `runChecksFallback` in copilot.service.js.

import { z } from 'zod';
import settings from '@overleaf/settings';
import { defineTool } from './baseTool.js';
import { getScanner, listScanners } from '../../checks/registry.js';

const MAX_ISSUES = Number(settings.COPILOT_CHECKS_MAX_ISSUES || 100);

// Pure: run the deterministic scanners over a project snapshot. Returns
// {summary:{total,byType}, issues}. Tolerates unknown check types (skip).
export function runChecksOver(project = {}, types, maxIssues = MAX_ISSUES) {
  const checkTypes =
    Array.isArray(types) && types.length > 0 ? types : listScanners();
  const issues = [];
  for (const type of checkTypes) {
    const scanner = getScanner(type);
    if (!scanner) continue;
    const found = scanner.scan(project);
    issues.push(...(Array.isArray(found) ? found : []));
    if (issues.length >= maxIssues) break;
  }
  const capped = issues.slice(0, maxIssues);
  const byType = capped.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1;
    return acc;
  }, {});
  return { summary: { total: capped.length, byType }, issues: capped };
}

export function buildChecksTools(context = {}) {
  const project = context.project || {};

  const runChecks = defineTool({
    name: 'run_checks',
    description:
      'Run deterministic project quality checks (citations, references, figures_tables, terminology) and return the structured issue list. Each issue has {id, type, severity, title, description, location}. Call this when the user asks to "check" / "lint" the project or find problems, then summarize the findings. Returns {summary:{total,byType}, issues}.',
    schema: z.object({
      types: z
        .array(z.string())
        .optional()
        .describe('Check types to run; defaults to all available scanners'),
    }),
    handler: async ({ types } = {}) =>
      JSON.stringify(runChecksOver(project, types)),
  });

  return [runChecks];
}

