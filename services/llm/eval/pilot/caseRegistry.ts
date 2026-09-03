import { workspaceHash } from '../headless/workspaceState.js'
import { V3_EXECUTABLE_CASES } from '../benchmark-v3/executable/index.js'
import { PILOT_CASES } from './seedCases.js'
import type { Capability, PilotCase } from './types.js'

const ALL_CAPABILITIES: Capability[] = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'C9',
  'C10',
  'C11',
]

export const EVALUATION_CASES: PilotCase[] = [
  ...PILOT_CASES,
  ...V3_EXECUTABLE_CASES,
]

export function validatePilotCase(caseDefinition: PilotCase): string[] {
  const errors: string[] = []
  const prefix = caseDefinition.case_id || '<missing-case-id>'
  const requiredStrings: Array<[string, unknown]> = [
    ['case_id', caseDefinition.case_id],
    ['case_family_id', caseDefinition.case_family_id],
    ['category', caseDefinition.category],
    ['fixture.fixture_id', caseDefinition.fixture?.fixture_id],
    ['fixture.fixture_lineage', caseDefinition.fixture?.fixture_lineage],
    ['fixture.main_file', caseDefinition.fixture?.main_file],
    ['user_goal.public_brief', caseDefinition.user_goal?.public_brief],
  ]
  for (const [field, value] of requiredStrings) {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${prefix}: ${field} must be a non-empty string`)
    }
  }
  if (caseDefinition.schema_version !== 1) {
    errors.push(`${prefix}: schema_version must be 1`)
  }
  if (!/^[a-z0-9][a-z0-9._-]+\.v\d+$/.test(caseDefinition.case_id)) {
    errors.push(`${prefix}: case_id does not match the v1 naming contract`)
  }
  if (!['dev', 'holdout'].includes(caseDefinition.split)) {
    errors.push(`${prefix}: split must be dev or holdout`)
  }
  if (!caseDefinition.capabilities?.length) {
    errors.push(`${prefix}: capabilities must not be empty`)
  }
  for (const capability of caseDefinition.capabilities || []) {
    if (!ALL_CAPABILITIES.includes(capability)) {
      errors.push(`${prefix}: unknown capability ${capability}`)
    }
  }
  if (!['D1', 'D2', 'D3', 'D4'].includes(caseDefinition.difficulty?.level)) {
    errors.push(`${prefix}: invalid difficulty`)
  }
  if (!caseDefinition.fixture?.files?.length) {
    errors.push(`${prefix}: fixture must contain files`)
  }
  const paths = (caseDefinition.fixture?.files || []).map((file) => file.path)
  if (new Set(paths).size !== paths.length) {
    errors.push(`${prefix}: fixture contains duplicate paths`)
  }
  if (!paths.includes(caseDefinition.fixture?.main_file)) {
    errors.push(`${prefix}: fixture main_file is missing`)
  }
  const actualHash = workspaceHash(caseDefinition.fixture?.files || [])
  if (caseDefinition.fixture?.sha256 !== actualHash) {
    errors.push(
      `${prefix}: fixture sha256 mismatch (expected ${actualHash}, got ${caseDefinition.fixture?.sha256})`,
    )
  }
  if (caseDefinition.harness?.minimum_support === 'H1') {
    if (
      caseDefinition.patch_policy?.accepted_semantics !== 'replacement-only'
    ) {
      errors.push(`${prefix}: H1 cases must be replacement-only`)
    }
    for (const patch of caseDefinition.validation_oracle?.patches || []) {
      if (!patch.file || !patch.oldText || !patch.newText) {
        errors.push(
          `${prefix}: H1 oracle patches must be non-empty replacements`,
        )
      }
    }
  }
  const allowed = new Set(caseDefinition.patch_policy?.allowed_files || [])
  for (const patch of caseDefinition.validation_oracle?.patches || []) {
    if (!allowed.has(patch.file)) {
      errors.push(`${prefix}: oracle patch file ${patch.file} is not allowed`)
    }
  }
  if (!caseDefinition.graders?.length) {
    errors.push(`${prefix}: graders must not be empty`)
  }
  const semantic = caseDefinition.semantic_grading
  if (semantic) {
    if (
      !['response_semantics', 'content_semantics'].includes(semantic.type) ||
      !semantic.criteria?.length
    ) {
      errors.push(
        `${prefix}: semantic_grading must declare a valid type and non-empty criteria`,
      )
    } else {
      const criterionIds = semantic.criteria.map((criterion) => criterion.id)
      if (
        criterionIds.some((id) => !id?.trim()) ||
        new Set(criterionIds).size !== criterionIds.length
      ) {
        errors.push(
          `${prefix}: semantic_grading criterion ids must be non-empty and unique`,
        )
      }
      if (
        semantic.criteria.some((criterion) => !criterion.description?.trim())
      ) {
        errors.push(
          `${prefix}: semantic_grading criterion descriptions must be non-empty`,
        )
      }
      if (semantic.type === 'content_semantics') {
        const fixturePaths = new Set(paths)
        if (
          !semantic.files?.length ||
          semantic.files.some((file) => !fixturePaths.has(file))
        ) {
          errors.push(
            `${prefix}: content_semantics files must exist in the fixture`,
          )
        }
      }
    }
  }
  if (
    ['no_op', 'refuse', 'answer'].includes(
      caseDefinition.expected_behavior?.action,
    ) &&
    !caseDefinition.graders?.some((grader) => grader.type === 'no_patch')
  ) {
    errors.push(`${prefix}: non-edit action requires a no_patch grader`)
  }
  if (
    caseDefinition.expected_behavior?.action === 'clarify' &&
    !caseDefinition.graders?.some(
      (grader) => grader.type === 'first_response_no_patch',
    )
  ) {
    errors.push(
      `${prefix}: clarification requires a first_response_no_patch grader`,
    )
  }
  if (
    caseDefinition.expected_behavior?.action === 'clarify' &&
    (caseDefinition.expected_behavior.max_user_turns < 2 ||
      !caseDefinition.user_goal.interaction_facts?.length)
  ) {
    errors.push(`${prefix}: clarification requires a second turn fact`)
  }
  for (const grader of caseDefinition.graders || []) {
    if (
      grader.type === 'user_turns' &&
      (grader.min > caseDefinition.expected_behavior.max_user_turns ||
        (grader.max !== undefined && grader.max < grader.min))
    ) {
      errors.push(`${prefix}: user_turns grader exceeds the interaction budget`)
    }
    if (
      grader.type === 'patch_rejections' &&
      (!caseDefinition.expected_behavior.dynamic_user ||
        caseDefinition.expected_behavior.max_user_turns < 2)
    ) {
      errors.push(
        `${prefix}: patch rejection grading requires dynamic multi-turn`,
      )
    }
  }
  for (const followup of caseDefinition.expected_behavior.eval_user_followups ||
    []) {
    if (
      !caseDefinition.expected_behavior.dynamic_user ||
      followup.user_turn < 2 ||
      followup.user_turn > caseDefinition.expected_behavior.max_user_turns ||
      followup.fact_groups.length === 0 ||
      followup.fact_groups.some((group) => group.length === 0)
    ) {
      errors.push(`${prefix}: eval_user follow-up contract is invalid`)
    }
  }
  if (
    caseDefinition.split === 'holdout' &&
    !caseDefinition.metadata.tags.includes('hidden')
  ) {
    errors.push(`${prefix}: holdout family must be tagged hidden`)
  }
  for (const invariant of caseDefinition.initial_state?.protected_invariants ||
    []) {
    const file = caseDefinition.fixture.files.find(
      (item) => item.path === invariant.file,
    )
    if (!file?.content.includes(invariant.value)) {
      errors.push(
        `${prefix}: protected invariant is absent from ${invariant.file}`,
      )
    }
  }
  return errors
}

export function validatePilotRegistry(cases = PILOT_CASES): string[] {
  const errors = cases.flatMap(validatePilotCase)
  const ids = new Set<string>()
  const familySplits = new Map<string, string>()
  for (const caseDefinition of cases) {
    if (ids.has(caseDefinition.case_id)) {
      errors.push(`duplicate case_id: ${caseDefinition.case_id}`)
    }
    ids.add(caseDefinition.case_id)
    const familyKey = `${caseDefinition.case_family_id}::${caseDefinition.fixture.fixture_lineage}`
    const existing = familySplits.get(familyKey)
    if (existing && existing !== caseDefinition.split) {
      errors.push(`family leakage across splits: ${familyKey}`)
    }
    familySplits.set(familyKey, caseDefinition.split)
  }
  for (const capability of ALL_CAPABILITIES) {
    const count = cases.filter((item) =>
      item.capabilities.includes(capability),
    ).length
    if (count < 2) errors.push(`${capability} has only ${count} seed case(s)`)
  }
  return errors
}

export function getPilotCase(caseId: string): PilotCase {
  const found = EVALUATION_CASES.find((item) => item.case_id === caseId)
  if (!found) throw new Error(`Unknown pilot case: ${caseId}`)
  return found
}
