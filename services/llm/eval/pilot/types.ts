import type { EvalFile } from '../headless/evalContext.js'

export type Capability =
  'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10' | 'C11'
export type Difficulty = 'D1' | 'D2' | 'D3' | 'D4'
export type Split = 'dev' | 'holdout'
export type ExpectedAction = 'patch' | 'clarify' | 'answer' | 'no_op' | 'refuse'
export type CompileMode =
  'forbidden' | 'optional' | 'required-after-apply' | 'repair-loop'

export type GraderSpec =
  | { type: 'workspace_changed'; expected: boolean }
  | { type: 'no_patch' }
  | { type: 'first_response_no_patch' }
  | { type: 'file_contains'; file: string; values: string[] }
  | { type: 'file_not_contains'; file: string; values: string[] }
  | { type: 'file_unchanged'; file: string }
  | { type: 'file_matches'; file: string; pattern: string }
  | { type: 'regex_count'; file: string; pattern: string; count: number }
  | {
      type: 'compile'
      status: 'success'
      max_errors: number
      max_warnings?: number
    }
  | { type: 'response_contains_any'; values: string[]; response_index?: number }
  | { type: 'response_contains_all'; values: string[]; response_index?: number }
  | {
      type: 'response_fact_groups'
      groups: string[][]
      response_index?: number
    }
  | { type: 'patch_files'; files: string[] }
  | { type: 'tool_called'; tool: string; min: number; max?: number }
  | { type: 'user_turns'; min: number; max?: number }
  | { type: 'patch_rejections'; min: number; max?: number }
  | { type: 'response_matches'; pattern: string; response_index?: number }

export interface PilotCase {
  schema_version: 1
  case_id: string
  case_family_id: string
  split: Split
  category: string
  capabilities: Capability[]
  difficulty: { level: Difficulty; factors: string[] }
  fixture: {
    fixture_id: string
    fixture_lineage: string
    main_file: string
    compiler: 'pdflatex'
    files: EvalFile[]
    sha256: string
  }
  project_complexity: {
    scale: 'single-small' | 'single-long' | 'multi-small' | 'multi-long'
    context_pressure: 'none' | 'repeated-anchors' | 'many-files' | 'combined'
  }
  user_goal: {
    public_brief: string
    interaction_facts?: string[]
  }
  initial_state: {
    current_file: string
    compile_status: 'success' | 'failure'
    protected_invariants?: Array<{ file: string; value: string }>
  }
  expected_behavior: {
    action: ExpectedAction
    max_user_turns: number
    continue_after_patch?: boolean
    dynamic_user?: boolean
    eval_user_followups?: Array<{
      user_turn: number
      fact_groups: string[][]
    }>
  }
  forbidden_behavior: string[]
  patch_policy: {
    accepted_semantics: 'replacement-only' | 'h2-unsupported'
    allowed_files: string[]
    max_patch_rounds: number
  }
  compile_policy: {
    mode: CompileMode
    expected_final_status?: 'success'
    max_compile_calls_per_turn: number
  }
  graders: GraderSpec[]
  validation_oracle: {
    patches?: Array<{
      file: string
      line: number | null
      oldText: string
      newText: string
    }>
    response?: string
    responses?: string[]
  }
  harness: { minimum_support: 'H1' | 'H2'; unsupported_is: 'skipped' }
  metadata: {
    tags: string[]
    language: 'zh-CN' | 'en-US'
    prompt_form: string
    provenance: 'systematic-human' | 'llm-generated-user-seed'
  }
}

export interface PilotResponse {
  userTurn: number
  kind: 'user' | 'automatic_verification'
  text: string
  hadPatch: boolean
}

export interface PilotGradeContext {
  caseDefinition: PilotCase
  initialFiles: EvalFile[]
  finalFiles: EvalFile[]
  responses: PilotResponse[]
  patchFiles: string[]
  patchCount: number
  patchRejectionCount: number
  userTurnCount: number
  toolCalls: Record<string, number>
  compile: {
    status: string
    errorCount: number | null
    warningCount: number | null
  } | null
}

export interface GraderCheck {
  grader: GraderSpec
  passed: boolean
  message: string
}
