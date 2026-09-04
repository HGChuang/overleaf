import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { buildProbes, evaluateProbes, oracleContext, v2 } from './acceptanceProbes.js'
import { scoreCandidate } from './candidateGrader.js'
import { summarizeBaseline, type SchedulerTrialResult } from '../pilot/baselineScheduler.js'
import { writeAcceptedReport } from './acceptedReport.js'

const rows=evaluateProbes()
test('new counter rules accept alternatives and reject malformed/unsafe edits',()=>{
  for(const p of rows.filter(r=>r.id.startsWith('department_')||r.id.startsWith('score_'))) assert.equal(p.v2,p.proposed_label,p.id)
})
test('middle survey values are protected without changing the oracle outcome',()=>{
  assert.equal(rows.find(p=>p.id==='survey_oracle')!.v2,'PASS')
  assert.equal(rows.find(p=>p.id==='survey_middle_data_changed')!.v1,'PASS')
  assert.equal(rows.find(p=>p.id==='survey_middle_data_changed')!.v2,'COPILOT_FAILURE')
})
test('nonliteral table representations remain reviewable and cannot bypass data validation',()=>{
  const p=oracleContext('v3.survey-longtable-header.v1')
  p.finalFiles.find(f=>f.path==='tables/survey.tex')!.content=p.finalFiles.find(f=>f.path==='tables/survey.tex')!.content.replace('10 & A & 19\\%','10 & A & \\textbf{19}\\%')
  assert.equal(scoreCandidate(p,v2).status,'INCOMPLETE')
  p.compile!.errorCount=1
  assert.equal(scoreCandidate(p,v2).status,'COPILOT_FAILURE')
})
test('known semantic/visual defects remain explicit acceptance failures, not silently fixed by a regex',()=>{
  const mismatches=rows.filter(p=>p.v2!==p.proposed_label).map(p=>p.id)
  assert.deepEqual(mismatches,['refusal_equivalent','refusal_keyword_false_claim','noop_equivalent','caption_false_completion','flowchart_equivalent_width','translation_equivalent'])
  assert.ok(buildProbes().length===15)
})
test('task conflicts are symmetrically quarantined, never converted to PASS',()=>{
  for(const id of ['v3.compile-proof-environment.v1','v3.content-todo-clarification.v1','v3.interaction2-theorem-symbol-clarification.v1','v3.interaction-unverified-claim-refusal.v1']) {
    assert.equal(scoreCandidate(oracleContext(id),v2).status,'INVALID',id)
  }
})
test('scheduler automatically writes the unified report and blocks uncalibrated publication',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'scoring-acceptance-'))
  try {
    const manifest=JSON.parse(await readFile(new URL('../context-audit/source-manifest.json',import.meta.url),'utf8'))
    const source=manifest.cohorts.diagnostic_smoke
    const results:SchedulerTrialResult[]=source.map((s:any)=>({experimentId:'context-delivery-20260904',caseId:s.case_id,caseFamilyId:s.case_id,
      split:'dev',trialId:s.trial_id,trialNumber:1,status:s.status,runId:s.run_id,runDir:s.run_dir,durationMs:0,
      semanticGrader:{status:'pass',passed:true}}))
    const report=await summarizeBaseline(results,join(directory,'summary.json'))
    assert.equal(report.scoring_basis,'raw_legacy_diagnostic')
    assert.equal(report.comparison_eligible,false)
    assert.equal(report.unified_scoring.official_pass_rate,null)
    assert.equal(report.unified_scoring.acceptance_status,'NOT_ACCEPTED')
    assert.deepEqual(report.unified_scoring.diagnostic_outcomes,{PASS:2})
    const scored=JSON.parse(await readFile(join(directory,'audited/results.json'),'utf8'))
    assert.equal(scored.find((r:any)=>r.case_id.includes('appendix')).original_status,'COPILOT_FAILURE')
    const mapped=await writeAcceptedReport(results.map(r=>({...r,runDir:'/overleaf/'+r.runDir})),join(directory,'mapped'),
      {hostArtifactRoot:resolve('services/llm/eval/artifacts/context-delivery-20260904')})
    assert.deepEqual(mapped.diagnostic_outcomes,{PASS:2})
    const duplicate=await writeAcceptedReport([...results,results[0]],join(directory,'duplicate'))
    assert.equal(duplicate.diagnostic_outcomes.INCOMPLETE,1)
    const missing=await writeAcceptedReport([{...results[0],runDir:'nonexistent'}],join(directory,'missing'))
    assert.equal(missing.diagnostic_outcomes.INCOMPLETE,1)
    const infrared=await writeAcceptedReport([{...results[0],status:'INFRA_FAILURE'}],join(directory,'infra'))
    assert.equal(infrared.diagnostic_outcomes.INFRA_FAILURE,1)
    assert.ok(infrared.blockers.includes('incomplete_capability_coverage'))
  } finally {await rm(directory,{recursive:true,force:true})}
})
