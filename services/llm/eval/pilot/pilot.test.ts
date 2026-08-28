import assert from 'node:assert/strict'
import test from 'node:test'
import { applyReplacementPatch } from '../headless/replacementPatch.js'
import { validatePilotRegistry } from './caseRegistry.js'
import { DISCRIMINATIVE_CASES } from './discriminativeSeedCases.js'
import { gradePilotCase } from './graderRegistry.js'
import { PILOT_CASES } from './seedCases.js'
import type { Capability, PilotGradeContext } from './types.js'

test('pilot registry has 43 distinct seed families without split leakage', () => {
  assert.equal(PILOT_CASES.length, 43)
  assert.equal(
    new Set(PILOT_CASES.map((item) => item.case_id)).size,
    PILOT_CASES.length,
  )
  assert.equal(
    new Set(PILOT_CASES.map((item) => item.case_family_id)).size,
    PILOT_CASES.length,
  )
  assert.deepEqual(validatePilotRegistry(), [])
})

test('every C1-C11 capability has at least two seeds', () => {
  const capabilities = Array.from(
    { length: 11 },
    (_, index) => `C${index + 1}`,
  ) as Capability[]
  for (const capability of capabilities) {
    assert.ok(
      PILOT_CASES.filter((item) => item.capabilities.includes(capability))
        .length >= 2,
      capability,
    )
  }
})

test('all H1 oracle patches apply and satisfy deterministic graders', () => {
  for (const caseDefinition of PILOT_CASES) {
    const initialFiles = caseDefinition.fixture.files.map((file) => ({
      ...file,
    }))
    const applied = caseDefinition.validation_oracle.patches?.length
      ? applyReplacementPatch(
          new Map(initialFiles.map((file) => [file.path, file.content])),
          caseDefinition.validation_oracle.patches,
        ).files
      : new Map(initialFiles.map((file) => [file.path, file.content]))
    const finalFiles = [...applied].map(([path, content]) => ({
      path,
      content,
    }))
    const responseTexts = caseDefinition.validation_oracle.responses || [
      caseDefinition.validation_oracle.response || 'oracle response',
    ]
    const toolCalls = Object.fromEntries(
      caseDefinition.graders
        .filter((grader) => grader.type === 'tool_called')
        .map((grader) => [
          grader.type === 'tool_called' ? grader.tool : '',
          grader.type === 'tool_called' ? grader.min : 0,
        ]),
    )
    const context: PilotGradeContext = {
      caseDefinition,
      initialFiles,
      finalFiles,
      responses: responseTexts.map((text, index) => ({
        userTurn: index + 1,
        kind: 'user',
        text,
        hadPatch:
          caseDefinition.expected_behavior.action === 'clarify'
            ? index > 0
            : Boolean(caseDefinition.validation_oracle.patches?.length),
      })),
      patchFiles: [
        ...new Set(
          (caseDefinition.validation_oracle.patches || []).map(
            (item) => item.file,
          ),
        ),
      ],
      patchCount: caseDefinition.validation_oracle.patches?.length ? 1 : 0,
      patchRejectionCount: Math.max(
        0,
        ...caseDefinition.graders
          .filter((grader) => grader.type === 'patch_rejections')
          .map((grader) =>
            grader.type === 'patch_rejections' ? grader.min : 0,
          ),
      ),
      userTurnCount: Math.max(
        responseTexts.length,
        ...caseDefinition.graders
          .filter((grader) => grader.type === 'user_turns')
          .map((grader) => (grader.type === 'user_turns' ? grader.min : 0)),
      ),
      toolCalls,
      compile: { status: 'success', errorCount: 0, warningCount: 0 },
    }
    const grade = gradePilotCase(context)
    assert.equal(
      grade.passed,
      true,
      `${caseDefinition.case_id}: ${JSON.stringify(grade.checks.filter((item) => !item.passed))}`,
    )
  }
})

test('H2 cases are never executable as H1', () => {
  for (const caseDefinition of PILOT_CASES.filter(
    (item) => item.harness.minimum_support === 'H2',
  )) {
    assert.equal(caseDefinition.harness.unsupported_is, 'skipped')
  }
})

test('discriminative expansion is D3/D4 and holdout is newly hidden', () => {
  assert.equal(DISCRIMINATIVE_CASES.length, 19)
  assert.ok(
    DISCRIMINATIVE_CASES.every((item) =>
      ['D3', 'D4'].includes(item.difficulty.level),
    ),
  )
  const holdout = PILOT_CASES.filter((item) => item.split === 'holdout')
  assert.equal(holdout.length, 6)
  assert.ok(holdout.every((item) => item.metadata.tags.includes('hidden')))
})

test('dynamic multi-turn coverage includes clarification, correction and rejection', () => {
  const dynamic = PILOT_CASES.filter(
    (item) => item.expected_behavior.dynamic_user,
  )
  assert.ok(dynamic.some((item) => item.expected_behavior.action === 'clarify'))
  assert.ok(dynamic.some((item) => item.metadata.tags.includes('correction')))
  assert.ok(
    dynamic.some((item) =>
      item.graders.some((grader) => grader.type === 'patch_rejections'),
    ),
  )
})

test('hidden follow-up repair starts with only the first requested file in the compile graph', () => {
  const caseDefinition = PILOT_CASES.find(
    (item) => item.case_family_id === 'hidden.combined-followup-repair',
  )
  assert.ok(caseDefinition)
  const main = caseDefinition.fixture.files.find(
    (item) => item.path === 'main.tex',
  )?.content
  assert.match(main || '', /\\input\{method\}/)
  assert.doesNotMatch(main || '', /\\input\{conclusion\}/)
})

test('figure correction grader accepts equivalent caption word order', () => {
  const caseDefinition = PILOT_CASES.find(
    (item) => item.case_family_id === 'dynamic.correction-protected-caption',
  )
  assert.ok(caseDefinition)
  const initialFiles = caseDefinition.fixture.files.map((file) => ({ ...file }))
  const applied = applyReplacementPatch(
    new Map(initialFiles.map((file) => [file.path, file.content])),
    [
      {
        file: 'main.tex',
        line: 5,
        oldText: '\\caption{Old caption}',
        newText: '\\caption{Overview of the Core architecture}',
      },
    ],
  )
  const grade = gradePilotCase({
    caseDefinition,
    initialFiles,
    finalFiles: [...applied.files].map(([path, content]) => ({
      path,
      content,
    })),
    responses: [
      { userTurn: 1, kind: 'user', text: '已修改。', hadPatch: true },
      { userTurn: 2, kind: 'user', text: '已补充。', hadPatch: true },
    ],
    patchFiles: ['main.tex'],
    patchCount: 2,
    patchRejectionCount: 0,
    userTurnCount: 2,
    toolCalls: {},
    compile: { status: 'success', errorCount: 0, warningCount: 0 },
  })
  assert.equal(
    grade.passed,
    true,
    JSON.stringify(grade.checks.filter((check) => !check.passed)),
  )
})
