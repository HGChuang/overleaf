import { createHash } from 'node:crypto'
import { gradePilotCase } from '../pilot/graderRegistry.js'
import { hashValue } from '../headless/canonicalTrace.js'
import { workspaceHash } from '../headless/workspaceState.js'
import type { GraderSpec, PilotGradeContext } from '../pilot/types.js'

export interface CounterRule {
  file: string
  oldCounter: string
  oldLabel: string
  requiredLabel?: string
  replacedCheck: GraderSpec
}
export interface FrozenCase {
  fixtureHash: string
  publicBrief: string
  taskHash?: string
  graders: GraderSpec[]
  counter?: CounterRule
  invalidReason?: string
}
export interface ScoringContract {
  id: string
  cases: Record<string, FrozenCase>
}
export type AuditStatus = 'PASS' | 'COPILOT_FAILURE' | 'INVALID' | 'INCOMPLETE'

// Only literal TeX identifiers in the two audited fixtures are supported.
// Dynamic macro expansion is deliberately not inferred from a text regex.
function uncomment(text: string) {
  return text.split('\n').map(line => {
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '%') continue
      let slashes = 0
      for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashes++
      if (slashes % 2 === 0) return line.slice(0, i)
    }
    return line
  }).join('\n')
}
function identifiers(text: string, commands: string) {
  return [...uncomment(text).matchAll(new RegExp(`\\\\(?:${commands})\\s*\\{([^{}]*)\\}`, 'g'))].map(m => m[1].trim())
}
export function checkIndependentCounter(context: PilotGradeContext, rule: CounterRule) {
  const target = context.finalFiles.find(f => f.path === rule.file)
  if (!target) return { passed: false, reason: 'target missing' }
  const code = uncomment(target.content)
  const definitions = identifiers(code, 'newcounter')
  const uses = identifiers(code, 'refstepcounter|stepcounter|setcounter|addtocounter|value|arabic|alph|Alph|roman|Roman')
  const labels = identifiers(code, 'label')
  if ([...definitions, ...uses, ...labels].some(x => !/^[A-Za-z0-9:_.-]+$/.test(x)) || /\\(?:csname|def|let)\b/.test(code)) {
    return { passed: null, reason: 'nonliteral counter semantics require adjudication' }
  }
  const name = definitions[0]
  const otherFiles = context.finalFiles.filter(f => f.path !== rule.file)
  const otherDefinitions = otherFiles.flatMap(f => identifiers(f.content, 'newcounter'))
  const otherLabels = otherFiles.flatMap(f => identifiers(f.content, 'label'))
  const refs = context.finalFiles.flatMap(f => identifiers(f.content, 'ref|eqref|pageref|autoref'))
  const allLabels = context.finalFiles.flatMap(f => identifiers(f.content, 'label'))
  const passed = definitions.length === 1 && !/\\newcounter\s*\{[^}]*\}\s*\[/.test(code) && !/\\(?:counterwithin|counterwithout|@addtoreset)\b/.test(code) && name !== rule.oldCounter &&
    !otherDefinitions.includes(name) && uses.length > 0 && uses.every(x => x === name) &&
    identifiers(code, 'refstepcounter').length > 0 &&
    labels.length === 1 && labels[0] !== rule.oldLabel && !otherLabels.includes(labels[0]) &&
    (!rule.requiredLabel || labels[0] === rule.requiredLabel) &&
    refs.every(ref => allLabels.filter(label => label === ref).length === 1) &&
    // A label before the increment points to the wrong current reference value.
    code.search(/\\refstepcounter\s*\{/) < code.search(/\\label\s*\{/)
  return { passed, reason: `counter=${name}; uses=${uses.join(',')}; labels=${labels.join(',')}; independent=${passed}` }
}

export function scoreWithContract(context: PilotGradeContext, contract: ScoringContract) {
  const policy = contract.cases[context.caseDefinition.case_id]
  const finish = (status: AuditStatus, reason: string, checks: unknown[] = []) => ({status, reason, checks})
  if (!policy) return finish('INCOMPLETE', 'case not in frozen scoring contract')
  if (workspaceHash(context.initialFiles) !== policy.fixtureHash || context.caseDefinition.user_goal.public_brief !== policy.publicBrief) {
    return finish('INCOMPLETE', 'fixture or public task changed; rerun/adjudicate instead of comparing')
  }
  if (policy.taskHash && policy.taskHash !== hashValue(Object.fromEntries(['user_goal','expected_behavior','patch_policy','compile_policy','initial_state'].map(key=>[key, context.caseDefinition[key]])))) return finish('INCOMPLETE', 'declared facts, behavior or budget changed')
  if (policy.invalidReason) return finish('INVALID', policy.invalidReason)
  const specs = policy.graders.map(s => structuredClone(s))
  if (policy.counter) {
    const index = specs.findIndex(s => hashValue(s) === hashValue(policy.counter!.replacedCheck))
    if (index < 0) return finish('INCOMPLETE', 'counter override does not match frozen check')
    const spec = specs[index]
    if (spec.type !== 'file_contains') return finish('INCOMPLETE', 'invalid override type')
    const values = spec.values.filter(v => !/^\\(?:newcounter|refstepcounter|label)\{/.test(v))
    specs.splice(index, 1, ...(values.length ? [{...spec, values}] : []))
  }
  const grade = gradePilotCase({...context, caseDefinition: {...context.caseDefinition, graders: specs}})
  const checks: unknown[] = [...grade.checks]
  if (policy.counter) {
    const counter = checkIndependentCounter(context, policy.counter)
    checks.push({grader: {type: 'independent_counter', ...policy.counter}, ...counter})
    if (counter.passed === null) return finish('INCOMPLETE', counter.reason, checks)
    if (!counter.passed) return finish('COPILOT_FAILURE', counter.reason, checks)
  }
  return finish(grade.passed ? 'PASS' : 'COPILOT_FAILURE', 'frozen deterministic contract', checks)
}

/** Shadow results must be bound to the exact evidence and can never erase a hard failure. */
export function combineHardAndSemantic(hard: AuditStatus, semantic?: {
  inputSha256: string; expectedInputSha256: string; passed: boolean
}): AuditStatus {
  if (hard !== 'PASS') return hard
  if (!semantic || semantic.inputSha256 !== semantic.expectedInputSha256) return 'INCOMPLETE'
  return semantic.passed ? 'PASS' : 'COPILOT_FAILURE'
}
export const fileSha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
