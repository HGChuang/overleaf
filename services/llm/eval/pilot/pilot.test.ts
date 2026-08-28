import assert from 'node:assert/strict'
import test from 'node:test'
import { applyReplacementPatch } from '../headless/replacementPatch.js'
import { validatePilotRegistry } from './caseRegistry.js'
import { gradePilotCase } from './graderRegistry.js'
import { PILOT_CASES } from './seedCases.js'
import type { Capability, PilotGradeContext } from './types.js'

test('pilot registry has 20-30 distinct seed families without split leakage', () => {
  assert.ok(PILOT_CASES.length >= 20 && PILOT_CASES.length <= 30)
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
