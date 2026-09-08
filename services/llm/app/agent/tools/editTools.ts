// Text-edit tools for the Copilot agent.
//
// `buildEditTools()` returns the `submit_patch` tool, used when the user asks
// the AI to MODIFY existing text. Instead of returning the whole corrected
// document (which the user then has to copy), the agent returns a structured
// PATCH: a list of `{oldText, newText}` hunks. `oldText` MUST be copied
// VERBATIM from the source (the model reads it via `read_file` /
// `read_file_fragment`) so the frontend can anchor an inline-diff ghost
// preview in the editor and let the user Accept / Reject each patch without
// ever leaving the editor.
//
// The tool persists a proposal but does not mutate project source. The model
// may compile the returned patchId as an isolated candidate before finishing;
// source changes only through the authenticated user acceptance endpoint.
//
// SERVER-SIDE DRY-RUN (eval iteration 1, attacks failure cluster B
// "oldText/path hallucination"): before a patch is accepted, every hunk is
// validated against the actual project files carried in the request context —
// the same content the frontend/eval applier resolves against. A hunk fails
// when its file is unknown or its non-empty oldText does not occur verbatim in
// the target file. One bad hunk rejects the whole submission:
//   - rejections 1-2 THROW, which the agent loop encodes as an isError tool
//     result WITHOUT terminating — the turn continues and the model fixes and
//     resubmits (the error text carries a divergence hint);
//   - the 3rd CONSECUTIVE rejection terminates the turn, so a reject→resubmit
//     loop can never burn the whole step budget on one broken patch.
// Rejected calls stay identifiable (isError, or details.dryRunRejected for the
// terminating rejection) so extractSubmittedPatch can skip them — a patch the
// server already knows is broken must never become the user's patch card.

import { createHash } from 'node:crypto';
import { applyHunks } from '@overleaf/copilot-contracts';
import type { ToolPoolDeps } from './provider.js';
import type { AgentTool, AgentToolResult } from '../core/types.js';

// One hunk = a verbatim old→new replacement, optionally anchored to a file/line.
// `oldText` may be empty for a pure insertion (then `line` should locate it).
const PatchHunkSchema = {
  type: 'object',
  properties: {
    file: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Path of the file this hunk applies to, or null for the currently open file',
    },
    line: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description: '1-based insertion line for empty oldText; otherwise informational. Non-empty oldText must match uniquely.',
    },
    oldText: {
      type: 'string',
      description:
        'The EXACT source text to replace, copied VERBATIM from the file (via read_file / read_file_fragment). Include enough surrounding context so the match is unique. May be empty for a pure insertion (then set `line`).',
    },
    newText: {
      type: 'string',
      description: 'The corrected text to insert in place of oldText (or at `line` for an insertion)',
    },
  },
  required: ['file', 'line', 'oldText', 'newText'],
};

// Consecutive dry-run rejections tolerated before the turn is ended. Below the
// agent's step budget, above the observed "one hallucinated hunk, one fix"
// retry depth — a model that keeps resubmitting broken oldText after two
// divergence hints is looping, not converging.
const MAX_DRY_RUN_REJECTIONS = 3;
// Cap the per-report failure list so a 20-hunk hallucination can't flood the
// tool result (which rides verbatim into the model context).
const MAX_FAILURES_PER_REPORT = 3;
// Snippet sizes for the divergence hint: shared context shown before the
// divergence point, and how much of "your continuation" vs "actual file" to
// compare after it.
const DIVERGENCE_CONTEXT_CHARS = 20;
const DIVERGENCE_CONTINUATION_CHARS = 40;

function escapeForHint(s: string): string {
  return s.replace(/\n/g, '\\n');
}

// Locate where the model's oldText diverges from the file: find the longest
// PREFIX of oldText that still occurs in the content (binary search over
// `includes`), then show the shared context plus the two continuations side by
// side. The typical cluster-B corruption is a paraphrased/normalized tail
// after a verbatim head, so the divergence point is usually the story.
function divergenceHint(oldText: string, content: string): string {
  let lo = 0;
  let hi = oldText.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (content.includes(oldText.slice(0, mid))) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo === 0) {
    return (
      `No prefix of your oldText occurs in this file. Your oldText starts: ` +
      `"${escapeForHint(oldText.slice(0, DIVERGENCE_CONTINUATION_CHARS))}". ` +
      `Re-read the file with read_file / read_file_fragment and copy oldText VERBATIM.`
    );
  }
  const prefix = oldText.slice(0, lo);
  const at = content.indexOf(prefix);
  const shared = content.slice(Math.max(0, at + lo - DIVERGENCE_CONTEXT_CHARS), at + lo);
  const yours = oldText.slice(lo, lo + DIVERGENCE_CONTINUATION_CHARS);
  const actual = content.slice(at + lo, at + lo + DIVERGENCE_CONTINUATION_CHARS);
  return (
    `Diverges after ${lo} matched char(s): ..."${escapeForHint(shared)}" | ` +
    `your continuation: "${escapeForHint(yours)}" | actual file: "${escapeForHint(actual)}". ` +
    `Re-read the file and copy oldText VERBATIM.`
  );
}

export function buildEditTools(context: any = {}, deps: ToolPoolDeps = {}) {
  const project = context.project || {};
  const files: Array<{ path: string; content: string }> = Array.isArray(project.files)
    ? project.files
    : [];
  const exactMap = new Map<string, string>();
  for (const f of files) {
    if (!f || !f.path) continue;
    exactMap.set(String(f.path).replace(/^\//, ''), f.content || '');
  }
  // Accept trivial path variants only when they identify exactly one file.
  const lowerIndex = new Map<string, string | null>();
  for (const k of exactMap.keys()) {
    const lower = k.toLowerCase();
    lowerIndex.set(lower, lowerIndex.has(lower) ? null : k);
  }
  const normalizeHunkPath = (p: string) => p.replace(/^\.\//, '').replace(/^\//, '');
  const resolveExisting = (p: string): string | null => {
    const clean = normalizeHunkPath(p);
    if (exactMap.has(clean)) return clean;
    return lowerIndex.get(clean.toLowerCase()) ?? null;
  };
  // Non-doc entities (images/PDFs/…) appear in fileList but not in files —
  // naming one is not an "unknown file" hallucination, it's a category error
  // the model can't fix by retrying, so the message must say so (R6).
  const listedPaths = new Set<string>();
  for (const p of Array.isArray(project.fileList) ? project.fileList : []) {
    if (typeof p !== 'string') continue;
    const clean = normalizeHunkPath(p);
    listedPaths.add(clean);
    listedPaths.add(clean.toLowerCase());
  }
  const defaultFileRaw = context.context?.currentFile || project.files?.find((file: any) => file.docId === project.rootDocId)?.path || null;
  const defaultFile = defaultFileRaw ? normalizeHunkPath(String(defaultFileRaw)) : null;

  let consecutiveRejections = 0;

  const submitPatch: AgentTool<any, Record<string, never>> = {
    name: 'submit_patch',
    executionMode: 'sequential',
    label: 'submit_patch',
    description:
      'Persist a proposed text edit as a PATCH and return its patchId. Call this whenever the user asks to fix, modify, correct, or rewrite EXISTING text. Copy oldText verbatim from source. The server dry-runs every hunk; correct and resubmit the complete patch after a rejection. When compilation matters, compile_project with the returned patchId before finishing. The authenticated author can later accept or reject individual hunks; submission itself does not edit source.',
    parameters: {
      type: 'object',
      properties: {
        hunks: {
          type: 'array',
          items: PatchHunkSchema,
          minItems: 1,
          description: 'One or more hunks. Group nearby edits into separate hunks rather than one giant oldText.',
        },
        summary: {
          type: 'string',
          description: 'A short human-readable summary of the change (shown in the chat)',
        },
      },
      required: ['hunks'],
    },
    async execute(_toolCallId, params, signal): Promise<AgentToolResult<Record<string, never>>> {
      signal?.throwIfAborted();
      if (!deps.webClient || !deps.userId || !project.sourceSnapshot?.id) {
        throw new Error('A versioned project snapshot and proposal backend are required to submit a patch');
      }
      if (deps.loadFile) {
        for (const path of exactMap.keys()) exactMap.set(path, await deps.loadFile(path));
      }
      const raw = (params ?? {}) as Record<string, unknown>;
      const hunks: unknown[] = Array.isArray(raw.hunks) ? raw.hunks : [];

      if (!exactMap.size) throw new Error('No editable source in this snapshot');
      if (exactMap.size > 0) {
        const failures: string[] = [];
        let totalFailures = 0;
        for (let i = 0; i < hunks.length; i++) {
          const h = (hunks[i] || {}) as Record<string, unknown>;
          const fileRaw = typeof h.file === 'string' && h.file ? h.file : null;
          const file = fileRaw ? resolveExisting(fileRaw) : null;
          const oldText = typeof h.oldText === 'string' ? h.oldText : '';

          if (fileRaw && !file) {
            totalFailures++;
            if (failures.length < MAX_FAILURES_PER_REPORT) {
              const clean = normalizeHunkPath(fileRaw);
              if (listedPaths.has(clean) || listedPaths.has(clean.toLowerCase())) {
                failures.push(
                  `hunk ${i}: "${fileRaw}" exists in the project but is not an editable text file ` +
                  `(binary asset) — it cannot be patched. Tell the user instead of retrying.`
                );
              } else {
                const available = [...exactMap.keys()].slice(0, 20).join(', ');
                failures.push(`hunk ${i}: unknown or ambiguous file "${fileRaw}" — available files: ${available}`);
              }
            }
            continue;
          }
          const target = file || (defaultFile && exactMap.has(defaultFile) ? defaultFile : null);
          const content = target != null ? exactMap.get(target) : undefined;
          if (content == null) {
            totalFailures++;
            if (failures.length < MAX_FAILURES_PER_REPORT) failures.push(`hunk ${i}: an exact editable file path is required`);
            continue;
          }
          // Empty oldText = pure insertion at the line anchor — always legal.
          if (!oldText) continue;
          if (!content.includes(oldText)) {
            totalFailures++;
            if (failures.length < MAX_FAILURES_PER_REPORT) {
              let report = `hunk ${i} in ${target}: oldText not found. ${divergenceHint(oldText, content)}`;
              // Cross-file confusion is a recurring cluster-B form — if the
              // verbatim oldText lives in ANOTHER project file, say so.
              const elsewhere = [...exactMap.entries()].find(
                ([p, c]) => p !== target && c.includes(oldText)
              );
              if (elsewhere) {
                report += ` (Note: this exact oldText DOES occur in "${elsewhere[0]}" — wrong file?)`;
              }
              failures.push(report);
            }
          }
        }

        if (!totalFailures) {
          const grouped = new Map<string, any[]>();
          for (const value of hunks) {
            const h = value as Record<string, unknown>;
            const target = typeof h.file === 'string' && h.file ? resolveExisting(h.file)! : defaultFile!;
            grouped.set(target, [...(grouped.get(target) || []), h]);
          }
          for (const [target, edits] of grouped) try { applyHunks(exactMap.get(target)!, edits); }
          catch (error) {
            totalFailures++;
            if (failures.length < MAX_FAILURES_PER_REPORT) failures.push(`hunk group in ${target}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        if (totalFailures > 0) {
          consecutiveRejections++;
          const truncated =
            totalFailures > failures.length
              ? `\n… and ${totalFailures - failures.length} more failing hunk(s).`
              : '';
          if (consecutiveRejections >= MAX_DRY_RUN_REJECTIONS) {
            // 3rd consecutive rejection: end the turn instead of letting a
            // reject loop burn the step budget. Returned (not thrown) because
            // only a tool RESULT can carry terminate — marked via
            // details.dryRunRejected so extractSubmittedPatch skips it. The
            // model gets NO further turn to explain this to the user (the
            // terminate cuts the turn), so the message here is for the record —
            // the user-facing closure text is synthesized in mapResult (R1).
            return {
              content: [
                {
                  type: 'text',
                  text:
                    `PATCH REJECTED by server-side validation (${totalFailures} failing hunk(s)):\n` +
                    failures.join('\n') +
                    truncated +
                    `\nThis is the ${MAX_DRY_RUN_REJECTIONS}rd consecutive rejection — the turn ends now with no patch delivered.`,
                },
              ],
              details: { dryRunRejected: true } as unknown as Record<string, never>,
              terminate: true,
            };
          }
          throw new Error(
            `PATCH REJECTED by server-side validation (${totalFailures} failing hunk(s)):\n` +
              failures.join('\n') +
              truncated +
              `\nThe ENTIRE patch was rejected — NO hunks took effect, including any valid ones. ` +
              `When you call submit_patch again you MUST include ALL hunks (every edit the user asked for), ` +
              `with only the failing oldText fixed — never drop hunks or narrow the scope. ` +
              `Re-read the exact source with read_file / read_file_fragment first. ` +
              `(rejection ${consecutiveRejections}/${MAX_DRY_RUN_REJECTIONS})`
          );
        }
      }

      consecutiveRejections = 0;
      let submittedPatch: unknown;
      if (deps.webClient && deps.userId && project.sourceSnapshot?.id) {
        const patchId = `patch_${createHash('sha256').update(JSON.stringify([_toolCallId, hunks])).digest('hex').slice(0, 24)}`;
        const canonicalHunks = hunks.map(value => {
          const h = value as Record<string, unknown>;
          return { ...h, file: typeof h.file === 'string' && h.file ? resolveExisting(h.file) : defaultFile };
        });
        submittedPatch = await deps.webClient.proposePatch(project.projectId, {
          userId: deps.userId, snapshotId: project.sourceSnapshot.id, patchId,
          hunks: canonicalHunks, conversationId: context.conversation?.conversationId,
        }, signal);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ submitted: true, count: hunks.length,
          ...(submittedPatch && typeof submittedPatch === 'object' ? submittedPatch : {}) }) }],
        details: submittedPatch ? { patch: submittedPatch } as unknown as Record<string, never> : {},
      };
    },
  };

  return [submitPatch];
}
