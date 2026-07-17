// Compile-specific agent tools for the compile-diagnose flow.
//
// `buildCompileTools(context)` returns the compile-only tools as closures over
// the request `context` (the parsed compile errors + raw log). The model is
// instructed (via `buildCompilePrompt`) to enumerate errors, read source
// fragments (via the shared `read_file_fragment` tool from projectTools),
// classify each, then call `submit_diagnostics` once with one structured entry
// per error.
//
// NOTE: `read_file_fragment` is NOT defined here anymore — it is provided by
// `projectTools.buildProjectTools` and shared across the whole tool pool, so
// there is no name clash. These tools only own what is compile-specific.
//
// Uses `defineTool` (wraps @langchain/core `tool()`) + Zod schemas.

import { z } from 'zod';
import { defineTool } from './baseTool.js';

// Static LaTeX-error knowledge table. Intentionally small but covers the
// errors an Overleaf project most commonly hits. Returns structured guidance
// the model can fold into a concrete `suggestedFix`.
const ERROR_RULES = [
  {
    match: 'undefined control sequence',
    category: 'undefined_command',
    likelyCause:
      'A command (starting with \\) is used but not defined — usually a typo, or a command from a package whose \\usepackage is missing.',
    fix: 'Correct the spelling; if the command belongs to a package (e.g. \\toprule→booktabs, \\boldsymbol→amsmath, \\definecolor→xcolor), add the corresponding \\usepackage{...} in the preamble.',
  },
  {
    match: 'missing $ inserted',
    category: 'math_mode',
    likelyCause: 'A math-only symbol or command was used outside math mode.',
    fix: 'Wrap the affected content in $...$ or a math/equation environment.',
  },
  {
    match: 'there were undefined references',
    category: 'undefined_ref',
    likelyCause: 'A \\ref / \\eqref / \\pageref points to a label that was never defined with \\label.',
    fix: 'Add the missing \\label{...} on the target float/equation/section, or correct the key. (After adding, run LaTeX again.)',
  },
  {
    match: 'citation',
    category: 'undefined_citation',
    likelyCause: 'A \\cite key is not present in the bibliography.',
    fix: 'Add the entry to the .bib file, correct the cite key, or ensure \\bibliography{...} points to the right .bib and bibtex/biber is run.',
  },
  {
    match: 'not found',
    category: 'missing_file',
    likelyCause: 'A referenced file (\\input, \\include, \\includegraphics, .bib) could not be found by the compiler.',
    fix: 'Verify the path and extension; ensure the file exists in the project and the name matches case-sensitively. Omit or include the extension per the command (e.g. \\input{sections/intro} for sections/intro.tex).',
  },
  {
    match: 'runaway argument',
    category: 'runaway_argument',
    likelyCause: 'A mandatory argument was not closed, so LaTeX swallowed following text.',
    fix: 'Add the missing closing brace or bracket for the argument on the indicated line.',
  },
  {
    match: 'ended by',
    category: 'environment_mismatch',
    likelyCause: 'A \\begin{env} is closed by a different \\end{...} (or nested environments are mismatched).',
    fix: 'Make sure every \\begin{env} is matched by a \\end{env} in the correct nesting order.',
  },
  {
    match: 'double subscript',
    category: 'double_subscript',
    likelyCause: 'Two subscripts _ were applied to the same atom without grouping.',
    fix: 'Group the atom, e.g. write a_{bc} or x_{i}{}_{j} instead of x_i_j.',
  },
  {
    match: 'double superscript',
    category: 'double_superscript',
    likelyCause: 'Two superscripts ^ were applied to the same atom without grouping.',
    fix: 'Group the atom, e.g. a^{bc} instead of a^b^c.',
  },
  {
    match: 'extra }',
    category: 'extra_brace',
    likelyCause: 'There is an unbalanced closing brace }.',
    fix: 'Remove the stray } or add the matching opening {.',
  },
];

function classifyMessage(message = '') {
  const lower = message.toLowerCase();
  const rule =
    ERROR_RULES.find(r => lower.includes(r.match)) || {
      category: 'unknown',
      likelyCause:
        'No specific rule matched; infer the cause from the compile log entry and the surrounding source.',
      fix: 'Inspect the compile log lines immediately around the error and the corresponding source line.',
    };
  return { message, ...rule };
}

export function buildCompileTools(context = {}) {
  const annotations = Array.isArray(context?.compile?.annotations)
    ? context.compile.annotations
    : [];
  const logText = context?.compile?.logText || '';

  const listCompileErrors = defineTool({
    name: 'list_compile_errors',
    description:
      'Return the structured list of LaTeX compile errors parsed from the latest compile. Each item has {index, file, line, severity, message}. Call this first to enumerate EVERY error you must diagnose.',
    schema: z.object({}),
    handler: async () => {
      if (annotations.length === 0) {
        return JSON.stringify({
          errors: [],
          note:
            'No structured annotations were provided. Read the raw log below and identify error lines yourself.',
          logPreview: logText.slice(0, 4000),
        });
      }
      return JSON.stringify({
        errors: annotations.map((a, i) => ({
          index: i,
          file: a.file ?? null,
          line: a.line ?? null,
          severity: a.severity ?? 'error',
          message: a.message ?? '',
        })),
      });
    },
  });

  const classifyLatexError = defineTool({
    name: 'classify_latex_error',
    description:
      'Classify a LaTeX error message into {category, likelyCause, fix}. Use it to inform a concrete suggestedFix; do not copy the fix verbatim if the source you read suggests something more specific.',
    schema: z.object({
      message: z.string().describe('The compile error message text to classify.'),
    }),
    handler: async ({ message }) => JSON.stringify(classifyMessage(message)),
  });

  const DiagnosticSchema = z.object({
    file: z.string().nullable().describe('File path from the error, or null if unknown'),
    line: z.number().int().nullable().describe('1-based line from the error, or null'),
    title: z.string().describe('Short label for the error (e.g. "Undefined control sequence \\abc")'),
    whatHappened: z.string().describe('Plain explanation of what this error means'),
    likelyCause: z.string().describe('Best-grounded guess, informed by the source you read and the classifier'),
    suggestedFix: z
      .string()
      .describe('A short, human-readable description of the fix (this is shown to the user, not applied directly)'),
    fix: z
      .object({
        oldText: z
          .string()
          .describe('The EXACT source text to replace, copied VERBATIM from the file (via read_file_fragment). Include enough surrounding context so the match is unique.'),
        newText: z
          .string()
          .describe('The corrected text to insert in place of oldText'),
      })
      .nullable()
      .describe('A concrete one-click text replacement. Prefer non-null whenever a direct edit can fix the error; use null only if no text replacement applies.'),
  });

  const submitDiagnostics = defineTool({
    name: 'submit_diagnostics',
    description:
      'Submit the final structured diagnosis. Call this ONCE after investigating, with ONE entry per compile error (in the same order as list_compile_errors). For each entry provide a human-readable `suggestedFix` AND, whenever possible, a concrete `fix` = {oldText, newText} where oldText is copied VERBATIM from the source (so the user can apply it with one click). This ends the diagnosis.',
    schema: z.object({
      diagnostics: z.array(DiagnosticSchema).min(1),
    }),
    returnDirect: true,
    handler: async ({ diagnostics }) =>
      JSON.stringify({ submitted: true, count: diagnostics.length }),
  });

  return [listCompileErrors, classifyLatexError, submitDiagnostics];
}

export { classifyMessage };
