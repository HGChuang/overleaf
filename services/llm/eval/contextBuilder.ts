// Build the chat() payload for an eval task turn. Shape mirrors the
// production web→llm boundary (see CHAT_CONTEXT in CopilotServiceTests):
// top-level {conversation, project, context, message} — `project` carries
// fileList/outline/files (the tools read files from here), `context` carries
// currentFile + the frontend-pushed compileErrors.
//
// LOAD-BEARING: the caller passes the task's MUTABLE files array; tool
// closures rebuild their fileMap from context.project.files on every chat()
// call (projectTools.ts), so patches applied between turns are visible to the
// next turn's read_file/read_file_fragment. Never deep-copy per turn.

const MAX_COMPILE_ERRORS = 20;
const MAX_COMPILE_ERROR_MESSAGE = 300;

import type { TraceAssertion } from './graders/traceGrader.js';

export interface EvalTask {
  id: string;
  category: 'compile' | 'structure' | 'semantic' | 'noop';
  // Difficulty rubric: easy = single file <60 lines, single-point change;
  // medium = 60–150 lines / multi-spot or multi-step change / 2 files;
  // hard = ≥3 files / >150 lines / multi-round localization / open-ended
  // generation. Recorded into TrialRecord for per-difficulty success rates.
  difficulty: 'easy' | 'medium' | 'hard';
  // Anthropic eval-article split: regression = must stay ~100% (guard rail);
  // capability = the hill to climb (expected low pass rate — the improvement
  // target). A capability task that becomes reliable "graduates" to regression.
  // holdout = frozen acceptance set (P0-0): excluded from --suite all runs
  // unless explicitly requested, never --update-baseline material — iterating
  // against it would be Goodhart contamination.
  suite: 'capability' | 'regression' | 'holdout';
  project: {
    mainFile: string;
    files: { path: string; content: string }[];
  };
  instruction: string;
  grader: any;
  maxVerifyTurns?: number;
  // Trajectory assertions (traceGrader): behavioral floors/ceilings on HOW the
  // agent worked (tool-called / tool-call-limit / max-turns / no-repeat-call),
  // orthogonal to the outcome grader. Only ever FLIP a passing trial to
  // trace_assertion_failed — outcome failure keeps primary attribution.
  traceAssertions?: TraceAssertion[];
  // Reference end-state for --verify-graders (compile/structure only): a full
  // replacement file set that a competent fix COULD produce. Applying it must
  // make the grader pass — otherwise the task/grader is broken, not the agent.
  solution?: {
    files: { path: string; content: string }[];
  };
}

// Cheap outline: list_project_files returns it and instructions often
// reference sections ("把第二章和第三章对调").
function buildOutline(files: { path: string; content: string }[]) {
  const outline: { path: string; line: number; level: number; title: string }[] = [];
  const re = /\\(section|subsection|subsubsection)\{([^}]*)\}/g;
  for (const f of files) {
    if (!f.path.endsWith('.tex')) continue;
    const lines = f.content.split('\n');
    lines.forEach((text, idx) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        outline.push({
          path: f.path,
          line: idx + 1,
          level: m[1] === 'section' ? 1 : m[1] === 'subsection' ? 2 : 3,
          title: m[2],
        });
      }
    });
  }
  return outline;
}

export function buildChatPayload({
  task,
  filesRef,
  conversationId,
  instruction,
  compileErrors,
}: {
  task: EvalTask;
  filesRef: { current: { path: string; content: string }[] };
  conversationId: string;
  instruction: string;
  compileErrors?: { file: string | null; line: number | null; message: string }[];
}) {
  const files = filesRef.current;
  const errors = (compileErrors || [])
    .slice(0, MAX_COMPILE_ERRORS)
    .map(e => ({
      file: e.file ?? null,
      line: e.line == null ? null : Number(e.line),
      message: String(e.message || '').slice(0, MAX_COMPILE_ERROR_MESSAGE),
    }));
  return {
    conversation: { conversationId, source: 'panel' },
    project: {
      projectId: `eval-${task.id}`,
      rootDocId: task.project.mainFile,
      fileList: files.map(f => f.path),
      outline: buildOutline(files),
      files,
    },
    context: {
      currentFile: task.project.mainFile,
      attachedFiles: [],
      ...(errors.length ? { compileErrors: errors } : {}),
    },
    message: { role: 'user', content: instruction },
  };
}

// The exact hidden verification trigger the frontend sends after the user
// accepts a patch (copilot-context.tsx notifyPatchAccepted) — eval replays
// the production self-healing loop verbatim.
export const VERIFY_MESSAGE =
  '[自动验证] 补丁已应用。请调用 compile_project 触发重新编译：若仍有错误，请用 read_file_fragment 定位后继续修复并提交新 patch；若编译通过（errorCount 为 0），请简短确认修复成功。';

// 3 → 10 (2026-08-07), mirrors the production cap
// MAX_AUTO_VERIFY_PER_CONVERSATION in copilot-context.tsx (keep in sync) —
// hard multi-error fixes kept dying at the verify budget; the eval replays
// whatever the production loop allows.
export const MAX_VERIFY_TURNS = 10;

// Verify-replay eligibility: production fires the hidden [自动验证] message
// after an accepted patch whenever the turn engaged compilation
// (copilot-context.tsx notifyPatchAccepted), so the eval replays it for every
// category whose grader can punish broken LaTeX — structure/semantic get the
// same chance to self-repair as compile (root-cause cluster D: broken LaTeX
// with no repair opportunity was a ruler artifact, not an agent defect).
// noop never enters: its pass condition is ZERO patches — a submitted patch
// already fails, replaying verification would only burn tokens.
export function shouldEnterVerifyTurn(
  category: EvalTask['category'],
  verifyTurns: number,
  maxVerifyTurns: number
): boolean {
  return category !== 'noop' && verifyTurns < maxVerifyTurns;
}
