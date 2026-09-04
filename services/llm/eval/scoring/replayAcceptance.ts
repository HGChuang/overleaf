/** Candidate regrade of frozen historical artifacts. No network or new Copilot trials. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTrial, logicalTrialKey } from './replayAudit.js'
import { scoreWithContract, fileSha256 } from './scoringContract.js'
import { scoreCandidate } from './candidateGrader.js'
import { evaluateProbes } from './acceptanceProbes.js'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..')
const out=join(root,'services/llm/eval/scoring/acceptance-20260904')
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'))
const write=async(name:string,value:unknown)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n')
const manifestPath=join(root,'services/llm/eval/benchmark-v3/scoring-audit-20260904/source-manifest.json')
const manifest=await read(manifestPath)
const v1=await read(join(root,'services/llm/eval/benchmark-v3/scoring-audit-20260904/contract-v1.json'))
const v2=await read(join(out,'contract-v2.json'))
for(const contract of [v1,v2]) for(const [path,hash] of Object.entries(contract.implementationHashes)) {
  if(fileSha256(await readFile(join(root,path)))!==hash) throw new Error(`implementation drift: ${path}`)
}
const results:any[]=[]
for(const [cohort,sources] of Object.entries(manifest.cohorts)) {
  const seen=new Set<string>()
  for(const source of sources as any[]) {
    const key=logicalTrialKey(source.case_id,source.trial_id)
    if(seen.has(key))throw new Error('duplicate logical trial');seen.add(key)
    const context=await loadTrial(source)
    const before=scoreWithContract(context,v1),after=scoreCandidate(context,v2)
    const terminal=await read(join(root,source.run_dir,'result.json'))
    if(source.status==='COPILOT_FAILURE' && terminal.failure?.failure_category!=='grader') {
      for(const score of [before,after]) if(!['INVALID','INCOMPLETE'].includes(score.status)) {
        score.status='COPILOT_FAILURE';score.reason='preserve non-grader execution failure'
      }
    }
    results.push({cohort,case_id:source.case_id,run_id:source.run_id,trial_id:source.trial_id,
      before:before.status,after:after.status,reason:after.reason,
      checks:after.checks})
  }
}
const changes=results.filter(r=>r.before!==r.after)
const cohorts=Object.fromEntries(Object.keys(manifest.cohorts).map(name=>{
  const rows=results.filter(r=>r.cohort===name)
  const count=(field:string)=>Object.fromEntries(['PASS','COPILOT_FAILURE','INVALID','INCOMPLETE'].map(s=>[s,rows.filter(r=>r[field]===s).length]))
  return [name,{planned:rows.length,before:count('before'),candidate:count('after')}]
}))
await write('replay-results.json',results)
await write('replay-summary.json',{source_manifest_sha256:fileSha256(await readFile(manifestPath)),
  contract_id:v2.id,contract_sha256:fileSha256(await readFile(join(out,'contract-v2.json'))),
  comparison_eligible:false,official_pass_rate:null,cohorts,
  changes:changes.map(({checks,...r})=>r),
  interpretation:'Candidate diagnostic regrading. Quarantine changes the denominator and is not an improvement. No human gold or new Agent result.'})
const probes=evaluateProbes()
await write('probes.json',probes)
const unresolved=probes.filter(p=>p.v2!==p.proposed_label)
await write('calibration.json',{status:'NOT_ACCEPTED',human_gold_count:0,
  probe_label_authority:'agent_proposals_not_human_gold',synthetic_compile_stub:true,
  planned_probes:probes.length,
  v1_disagreements_with_proposals:probes.filter(p=>p.v1!==p.proposed_label).length,
  v2_disagreements_with_proposals:unresolved.length,
  unresolved_probes:unresolved.map(p=>p.id),
  blockers:['human_gold_not_available','unresolved_semantic_and_visual_grader_probes','case_requirements_and_user_protocol_need_adjudication'],
  promotion_rule:'Do not edit this status to enable scores. Calibrate/fix, version the contract and review reporter promotion; current reporter always blocks publication.'})
console.log(JSON.stringify({trials:results.length,cohorts,changed:changes.length,unresolved_probes:unresolved.length},null,2))
