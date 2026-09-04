import { scoreWithContract, type ScoringContract } from './scoringContract.js'
import type { PilotGradeContext } from '../pilot/types.js'

/** Narrow literal-table invariant. Other TeX representations require review, not guessed equivalence. */
export function scoreCandidate(context: PilotGradeContext, contract: ScoringContract & {
  numericRows?: Record<string, {file:string}>
}) {
  const grade = scoreWithContract(context, contract)
  // Additional evidence checks cannot erase an existing hard failure.
  if (grade.status !== 'PASS') return grade
  const rule = contract.numericRows?.[context.caseDefinition.case_id]
  if (!rule) return grade
  const rows = (content:string) => [...content.matchAll(/^\s*(\d+)\s*&\s*([ABC])\s*&\s*(\d+)\\%\s*(?:\\\\)?\s*$/gm)]
    .map(m=>`${m[1]}:${m[2]}:${m[3]}`).sort()
  const before = rows(context.initialFiles.find(f=>f.path===rule.file)?.content || '')
  const after = rows(context.finalFiles.find(f=>f.path===rule.file)?.content || '')
  if (before.length !== 22) return {...grade,status:'INCOMPLETE' as const,reason:'unexpected numeric-row fixture'}
  if (after.length !== before.length) return {...grade,status:'INCOMPLETE' as const,reason:'missing rows or nonliteral table representation requires adjudication'}
  const passed = JSON.stringify(before) === JSON.stringify(after)
  return {...grade,status:passed ? grade.status : 'COPILOT_FAILURE' as const,
    reason:passed ? grade.reason : 'survey row number/group/percentage changed',
    checks:[...grade.checks,{grader:{type:'literal_numeric_rows_preserved',file:rule.file},passed}]}
}
