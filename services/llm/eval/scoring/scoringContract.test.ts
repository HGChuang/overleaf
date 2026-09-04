import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { V3_EXECUTABLE_CASES } from '../benchmark-v3/executable/index.js'
import { applyReplacementPatch } from '../headless/replacementPatch.js'
import { scoreWithContract, combineHardAndSemantic, type ScoringContract } from './scoringContract.js'
import { loadTrial, logicalTrialKey } from './replayAudit.js'
import type { PilotGradeContext } from '../pilot/types.js'
const contract: ScoringContract = JSON.parse(await readFile(new URL('../benchmark-v3/scoring-audit-20260904/contract-v1.json', import.meta.url), 'utf8'))
const appendix = 'v3.compile-appendix-label-collision.v1'
const subfigure = 'v3.compile-subfigure-counter-recovery.v1'
function context(id=appendix): PilotGradeContext {
  const c = structuredClone(V3_EXECUTABLE_CASES.find(c=>c.case_id===id)!)
  const applied = applyReplacementPatch(new Map(c.fixture.files.map(f=>[f.path,f.content])), c.validation_oracle.patches!)
  return {caseDefinition:c,initialFiles:structuredClone(c.fixture.files),finalFiles:[...applied.files].map(([path,content])=>({path,content})),responses:[],patchFiles:[...new Set(c.validation_oracle.patches!.map(h=>h.file!))],patchCount:1,patchRejectionCount:0,userTurnCount:1,toolCalls:{},compile:{status:'success',errorCount:0,warningCount:0}}
}
function target(c:PilotGradeContext) {return c.finalFiles.find(f=>f.path===contract.cases[c.caseDefinition.case_id].counter!.file)!}
for (const id of [appendix,subfigure]) test(`accepts consistent arbitrary internal names: ${id}`,()=>{
  const c=context(id);const policy=contract.cases[id].counter!
  const text=target(c);const old=text.content.match(/\\newcounter\{([^}]+)\}/)![1]
  text.content=text.content.replaceAll(old,'independentXYZ')
  if(!policy.requiredLabel)text.content=text.content.replace('fig:panel-b','fig:arbitrary-b')
  assert.equal(scoreWithContract(c,contract).status,'PASS')
})
test('rejects stale references, missing definitions and commented decoys',()=>{
  for(const mutate of [
    (s:string)=>s.replace('\\refstepcounter{appendixtable}','\\refstepcounter{resultstable}'),
    (s:string)=>s.replace('\\newcounter{appendixtable}',''),
    (s:string)=>s.replace('\\newcounter{appendixtable}','% \\newcounter{appendixtable}'),
    (s:string)=>s.replace('\\newcounter{appendixtable}','\\newcounter{appendixtable}[resultstable]'),
    (s:string)=>s.replace('\\label{tab:appendix-results}','\\label{tab:wrong}'),
  ]) {const c=context();target(c).content=mutate(target(c).content);assert.equal(scoreWithContract(c,contract).status,'COPILOT_FAILURE')}
})
test('label must capture incremented counter, not prior section state',()=>{
  const c=context();target(c).content='\\newcounter{appendixtable}\n\\label{tab:appendix-results}\n\\refstepcounter{appendixtable}\nAppendix results table\n'
  assert.equal(scoreWithContract(c,contract).status,'COPILOT_FAILURE')
})
test('compile errors and protected-file changes remain hard failures',()=>{
  const c=context();c.compile!.errorCount=1;assert.equal(scoreWithContract(c,contract).status,'COPILOT_FAILURE')
  c.compile!.errorCount=0;c.finalFiles.find(f=>f.path==='body.tex')!.content+='changed'
  assert.equal(scoreWithContract(c,contract).status,'COPILOT_FAILURE')
})
test('unexpanded dynamic naming is incomplete, not guessed as capability failure',()=>{
  const c=context();target(c).content=target(c).content.replaceAll('appendixtable','\\countername')
  assert.equal(scoreWithContract(c,contract).status,'INCOMPLETE')
})
test('proof conflict is invalid and changed tasks cannot reuse the contract',()=>{
  const c=context('v3.compile-proof-environment.v1');assert.equal(scoreWithContract(c,contract).status,'INVALID')
  const good=context();good.caseDefinition.user_goal.public_brief+=' changed';assert.equal(scoreWithContract(good,contract).status,'INCOMPLETE')
  const drift=context();drift.initialFiles[0].content+=' ';assert.equal(scoreWithContract(drift,contract).status,'INCOMPLETE')
})
test('semantic success cannot override hard failure or mismatched/missing evidence',()=>{
  const semantic={inputSha256:'a',expectedInputSha256:'a',passed:true}
  assert.equal(combineHardAndSemantic('COPILOT_FAILURE',semantic),'COPILOT_FAILURE')
  assert.equal(combineHardAndSemantic('INVALID',semantic),'INVALID')
  assert.equal(combineHardAndSemantic('PASS'),'INCOMPLETE')
  assert.equal(combineHardAndSemantic('PASS',{...semantic,inputSha256:'b'}),'INCOMPLETE')
  assert.equal(combineHardAndSemantic('PASS',{...semantic,passed:false}),'COPILOT_FAILURE')
  assert.equal(combineHardAndSemantic('PASS',semantic),'PASS')
})
test('replay refuses a changed frozen artifact hash',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../benchmark-v3/scoring-audit-20260904/source-manifest.json',import.meta.url),'utf8'))
  const row=structuredClone(manifest.cohorts.baseline[0]);row.files['after.json']='0'.repeat(64)
  await assert.rejects(loadTrial(row),/artifact changed/)
})


test('historical attempt suffixes map to the same logical trial, never undefined',()=>{
  assert.equal(logicalTrialKey('case','experiment--case--trial-2--attempt-2'),logicalTrialKey('case','experiment--case--trial-2'))
  assert.throws(()=>logicalTrialKey('case','unknown'),/unrecognized/)
})
test('background facts and user budgets cannot drift under one scoring contract',()=>{
  const c=context();c.caseDefinition.expected_behavior.max_user_turns+=1
  assert.equal(scoreWithContract(c,contract).status,'INCOMPLETE')
})
