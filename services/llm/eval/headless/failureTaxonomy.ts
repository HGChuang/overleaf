import type { StructuredFailure } from './canonicalTrace.js'

export type FailureCategory =
  'model' | 'tool' | 'compile' | 'grader' | 'runner' | 'infrastructure'

export interface FailureClassification {
  category: FailureCategory
  phase: string
  type: string
  source: string
  retryable: boolean
}

export class EvaluationFailure extends Error {
  constructor(
    message: string,
    readonly classification: FailureClassification
  ) {
    super(message)
    this.name = 'EvaluationFailure'
  }
}

export function classifyFailure(
  error: unknown,
  fallback: FailureClassification,
  relatedEventId: string | null
): StructuredFailure {
  const classification =
    error instanceof EvaluationFailure ? error.classification : fallback
  return {
    failure_category: classification.category,
    failure_phase: classification.phase,
    error_type: classification.type,
    error_source: classification.source,
    error_message: error instanceof Error ? error.message : String(error),
    retryable: classification.retryable,
    related_event_id: relatedEventId,
  }
}

export function fallbackForPhase(phase: string): FailureClassification {
  switch (phase) {
    case 'model':
      return {
        category: 'model',
        phase,
        type: 'MODEL_PROVIDER_ERROR',
        source: 'provider',
        retryable: true,
      }
    case 'tool':
    case 'patch_apply':
      return {
        category: 'tool',
        phase,
        type:
          phase === 'patch_apply'
            ? 'TOOL_PATCH_APPLY_ERROR'
            : 'TOOL_EXECUTION_ERROR',
        source: phase === 'patch_apply' ? 'patch_applicator' : 'copilot_tool',
        retryable: false,
      }
    case 'compile':
      return {
        category: 'infrastructure',
        phase,
        type: 'COMPILE_INFRASTRUCTURE_ERROR',
        source: 'clsi',
        retryable: true,
      }
    case 'grader':
      return {
        category: 'grader',
        phase,
        type: 'GRADER_EXECUTION_ERROR',
        source: 'grader',
        retryable: false,
      }
    case 'setup':
      return {
        category: 'infrastructure',
        phase,
        type: 'INFRASTRUCTURE_SETUP_ERROR',
        source: 'evaluation_runtime',
        retryable: true,
      }
    default:
      return {
        category: 'runner',
        phase,
        type: 'RUNNER_EXECUTION_ERROR',
        source: 'evaluation_harness',
        retryable: false,
      }
  }
}
