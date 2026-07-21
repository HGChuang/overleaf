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
// The tool does NOT mutate any project file server-side — it is a
// structured-output tool (`returnDirect: true`); the actual edit is applied
// CLIENT-SIDE by the frontend through the existing `applyFixInEditor` →
// OT/sharejs path. This keeps the read/structured-only tool posture (see the
// copilot-agent-upgrade plan: M5 skipped — no server-side project-mutating
// tools).
//
// Uses `defineTool` (wraps @langchain/core `tool()`) + Zod schemas.

import { z } from 'zod';
import { defineTool } from './baseTool.js';

// One hunk = a verbatim old→new replacement, optionally anchored to a file/line.
// `oldText` may be empty for a pure insertion (then `line` should locate it).
const PatchHunkSchema = z.object({
  file: z
    .string()
    .nullable()
    .describe('Path of the file this hunk applies to, or null for the currently open file'),
  line: z
    .number()
    .int()
    .nullable()
    .describe('1-based line nearest the hunk, used to disambiguate multiple matches; null if unknown'),
  oldText: z
    .string()
    .describe('The EXACT source text to replace, copied VERBATIM from the file (via read_file / read_file_fragment). Include enough surrounding context so the match is unique. May be empty for a pure insertion (then set `line`).'),
  newText: z
    .string()
    .describe('The corrected text to insert in place of oldText (or at `line` for an insertion)'),
});

export function buildEditTools() {
  const submitPatch = defineTool({
    name: 'submit_patch',
    description:
      'Submit a proposed text edit as a PATCH (a list of {oldText, newText} hunks) and END the turn. Call this whenever the user asks to fix, modify, correct, or rewrite EXISTING text — do NOT return the whole document. For each hunk, `oldText` MUST be copied VERBATIM from the source (read the file first with `read_file` / `read_file_fragment` so the frontend can anchor an inline preview); `newText` is the replacement. The frontend shows an inline-diff preview (struck old + gray new) with Accept / Reject — the edit is applied only after the user accepts.',
    schema: z.object({
      hunks: z
        .array(PatchHunkSchema)
        .min(1)
        .describe('One or more hunks. Group nearby edits into separate hunks rather than one giant oldText.'),
      summary: z
        .string()
        .optional()
        .describe('A short human-readable summary of the change (shown in the chat)'),
    }),
    returnDirect: true,
    handler: async ({ hunks }) =>
      JSON.stringify({ submitted: true, count: Array.isArray(hunks) ? hunks.length : 0 }),
  });

  return [submitPatch];
}
