import { workspaceHash } from '../headless/workspaceState.js'
import type { GraderCheck, GraderSpec, PilotGradeContext } from './types.js'

function fileContent(
  context: PilotGradeContext,
  path: string,
  initial = false,
) {
  const files = initial ? context.initialFiles : context.finalFiles
  return files.find((file) => file.path === path)?.content
}

function selectedResponses(context: PilotGradeContext, index?: number): string {
  if (index === undefined)
    return context.responses.map((item) => item.text).join('\n')
  return context.responses[index]?.text || ''
}

function gradeOne(spec: GraderSpec, context: PilotGradeContext): GraderCheck {
  let passed = false
  let message = ''
  switch (spec.type) {
    case 'workspace_changed': {
      const changed =
        workspaceHash(context.initialFiles) !==
        workspaceHash(context.finalFiles)
      passed = changed === spec.expected
      message = `workspace changed=${changed}, expected=${spec.expected}`
      break
    }
    case 'no_patch':
      passed = context.patchCount === 0
      message = `patch count=${context.patchCount}`
      break
    case 'first_response_no_patch':
      passed = context.responses[0]?.hadPatch === false
      message = `first response hadPatch=${context.responses[0]?.hadPatch}`
      break
    case 'file_contains': {
      const content = fileContent(context, spec.file)
      passed =
        content !== undefined &&
        spec.values.every((value) => content.includes(value))
      message = `${spec.file} contains ${spec.values.length} required value(s)`
      break
    }
    case 'file_not_contains': {
      const content = fileContent(context, spec.file)
      passed =
        content !== undefined &&
        spec.values.every((value) => !content.includes(value))
      message = `${spec.file} excludes ${spec.values.length} forbidden value(s)`
      break
    }
    case 'file_unchanged':
      passed =
        fileContent(context, spec.file) ===
        fileContent(context, spec.file, true)
      message = `${spec.file} unchanged=${passed}`
      break
    case 'regex_count': {
      const content = fileContent(context, spec.file) || ''
      const count = [...content.matchAll(new RegExp(spec.pattern, 'g'))].length
      passed = count === spec.count
      message = `${spec.file} regex count=${count}, expected=${spec.count}`
      break
    }
    case 'compile':
      passed =
        context.compile?.status === spec.status &&
        context.compile.errorCount !== null &&
        context.compile.errorCount <= spec.max_errors &&
        (spec.max_warnings === undefined ||
          (context.compile.warningCount !== null &&
            context.compile.warningCount <= spec.max_warnings))
      message = `compile=${context.compile?.status}, errors=${context.compile?.errorCount}, warnings=${context.compile?.warningCount}`
      break
    case 'response_contains_any': {
      const response = selectedResponses(
        context,
        spec.response_index,
      ).toLowerCase()
      passed = spec.values.some((value) =>
        response.includes(value.toLowerCase()),
      )
      message = `response contains one of ${JSON.stringify(spec.values)}`
      break
    }
    case 'response_contains_all': {
      const response = selectedResponses(
        context,
        spec.response_index,
      ).toLowerCase()
      passed = spec.values.every((value) =>
        response.includes(value.toLowerCase()),
      )
      message = `response contains all of ${JSON.stringify(spec.values)}`
      break
    }
    case 'patch_files':
      passed =
        spec.files.length === context.patchFiles.length &&
        spec.files.every((file) => context.patchFiles.includes(file))
      message = `patch files=${JSON.stringify(context.patchFiles)}`
      break
    case 'tool_called': {
      const count = context.toolCalls[spec.tool] || 0
      passed =
        count >= spec.min && (spec.max === undefined || count <= spec.max)
      message = `${spec.tool} calls=${count}`
      break
    }
  }
  return { grader: spec, passed, message }
}

export function gradePilotCase(context: PilotGradeContext) {
  const checks = context.caseDefinition.graders.map((spec) =>
    gradeOne(spec, context),
  )
  return { passed: checks.every((check) => check.passed), checks }
}
