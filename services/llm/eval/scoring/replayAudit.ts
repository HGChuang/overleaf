/** Offline, source-preserving replay. No provider, database, compile or Copilot calls. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gradePilotCase } from '../pilot/graderRegistry.js'
import { hashValue } from '../headless/canonicalTrace.js'
import { workspaceHash } from '../headless/workspaceState.js'
import { scoreWithContract, fileSha256, type ScoringContract } from './scoringContract.js'
import type { PilotGradeContext } from '../pilot/types.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const out = join(root, 'services/llm/eval/benchmark-v3/scoring-audit-20260904')
const option = (flag: string, fallback: string) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : resolve(process.argv[i + 1]) }
export function logicalTrialKey(caseId: string, trialId: string) {
  const number = trialId.match(/--trial-(\d+)(?:--|$)/)?.[1]
  if (!number) throw new Error(`unrecognized logical trial ID: ${trialId}`)
  return caseId + '/' + number
}
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'))
const write = async (p: string, d: unknown) => writeFile(p, JSON.stringify(d, null, 2) + '\n')

export async function loadTrial(row: any): Promise<PilotGradeContext> {
  const dir = join(root, row.run_dir)
  for (const [path, hash] of Object.entries(row.files)) {
    if (fileSha256(await readFile(join(dir, path))) !== hash) throw new Error(`artifact changed: ${row.run_id}/${path}`)
  }
  const [c, before, after, responses, result, run] = await Promise.all(['case.json','before.json','after.json','responses.json','result.json','run.json'].map(p => read(join(dir,p))))
  if (run.run_id !== row.run_id || result.runId !== row.run_id || result.caseId !== row.case_id || result.trialId !== row.trial_id || run.status !== row.status || result.status !== row.status || run.git_commit !== row.git_commit || run.config_hash !== row.config_hash || run.benchmark_hash !== row.benchmark_hash || run.fixture_hash !== row.fixture_hash) throw new Error('source identity mismatch')
  if (hashValue(c) !== run.benchmark_hash || workspaceHash(before) !== run.fixture_hash || workspaceHash(after) !== result.finalWorkspaceHash) throw new Error(`source provenance mismatch: ${row.run_id}`)
  const events = (await readFile(join(dir,'events.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l))
  for (const event of events) for (const artifact of event.artifacts || []) {
    if (row.files[artifact.path] !== artifact.sha256) throw new Error(`original trace artifact mismatch: ${row.run_id}/${artifact.path}`)
  }
  const compilePath = Object.keys(row.files).filter(p => /compiles\/.*final-grading\.json$/.test(p)).sort().at(-1)
  const compile = compilePath ? await read(join(dir,compilePath)) : null
  // Bind final compile to the final workspace, not an earlier successful compile.
  if (compilePath) {
    const event = events.find(e=>e.event_type === 'compile_completed' && e.artifacts?.some((a:any)=>a.path === compilePath))
    if (!event || event.summary?.input_workspace_hash !== workspaceHash(after)) throw new Error(`final compile does not match final workspace: ${row.run_id}`)
  }
  const patches = await read(join(dir,'patches.json'))
  const patchFiles = [...new Set<string>(patches.flat().map((h:any)=>h.file))]
  const userMessages = (await read(join(dir,'eval-user-input.json'))).messages
  return {caseDefinition:c, initialFiles:before, finalFiles:after, responses, userMessages,
    patchFiles, patchCount:result.patchCount, patchRejectionCount:result.patchRejectionCount,
    userTurnCount:result.userTurnCount, toolCalls:result.toolCalls, compile}
}

async function main() {
  const manifestPath = option('--manifest', join(out,'source-manifest.json'))
  const contractPath = option('--contract', join(out,'contract-v1.json'))
  const outputDir = option('--out', join(out,'replay'))
  const manifest = await read(manifestPath)
  const contract = await read(contractPath) as ScoringContract
  for (const [path, sha] of Object.entries((contract as any).implementationHashes || {})) {
    if (fileSha256(await readFile(join(root,path))) !== sha) throw new Error(`scoring implementation changed: ${path}; version the contract`)
  }
  const rows = []
  const cache = new Map<string,PilotGradeContext>()
  const cohortProvenance: Record<string,unknown> = {}
  for (const [cohort, sources] of Object.entries(manifest.cohorts || {baseline:manifest.baseline, shadow:manifest.shadow})) {
    const identities = new Set<string>()
    const revisions = new Set<string>()
    for (const source of sources as any[]) {
      const identity = logicalTrialKey(source.case_id, source.trial_id)
      if (identities.has(identity)) throw new Error(`duplicate logical trial: ${cohort}/${identity}`)
      identities.add(identity)
      const run = await read(join(root,source.run_dir,'run.json'))
      const provenance = {git:run.git_commit,config_hash:run.config_hash,model:run.model}
      revisions.add(hashValue(provenance))
      if (revisions.size > 1) throw new Error(`mixed code/config/model in cohort ${cohort}`)
      cohortProvenance[cohort] = provenance
      const context = cache.get(source.run_id) || await loadTrial(source)
      cache.set(source.run_id, context)
      const old = gradePilotCase(context)
      const saved = source.files['grader.json'] ? await read(join(root,source.run_dir,'grader.json')) : null
      const result = await read(join(root,source.run_dir,'result.json'))
      if (!saved && !(source.status === 'COPILOT_FAILURE' && ['tool','model','compile'].includes(result.failure?.failure_category))) throw new Error(`missing grader evidence: ${source.run_id}`)
      if (saved && JSON.stringify(old.checks.map(c=>c.passed)) !== JSON.stringify(saved.checks.map((c:any)=>c.passed))) throw new Error(`legacy replay drift: ${source.run_id}`)
      const scored = scoreWithContract(context,contract)
      // A terminal tool/model failure remains a failure even if final source happens to satisfy checks.
      if (source.status === 'COPILOT_FAILURE' && (!saved || old.passed) && scored.status !== 'INVALID' && scored.status !== 'INCOMPLETE') {
        scored.status = 'COPILOT_FAILURE'; scored.reason = 'preserve non-grader execution failure'
      }
      rows.push({cohort, case_id:source.case_id, trial_id:source.trial_id, run_id:source.run_id,
                 dynamic:source.dynamic, original_status:source.status, legacy_grader_verified: Boolean(saved), ...scored})
    }
  }
  const summarize = (rs: typeof rows) => {
    const counts = Object.fromEntries(['PASS','COPILOT_FAILURE','INVALID','INCOMPLETE'].map(s=>[s,rs.filter(r=>r.status===s).length]))
    const valid=rs.filter(r=>r.status==='PASS'||r.status==='COPILOT_FAILURE')
    return {planned:rs.length, counts, valid_denominator:valid.length,
            before_pass_same_denominator:valid.filter(r=>r.original_status==='PASS').length,
            after_pass:counts.PASS, pass_rate:valid.length ? counts.PASS/valid.length : null}
  }
  const summary:any={contract_id:contract.id, contract_sha256:fileSha256(await readFile(contractPath)),
    cohort_provenance:cohortProvenance,
    source_manifest_sha256:fileSha256(await readFile(manifestPath)),
    interpretation:'Offline same-artifact measurement comparison; not Agent improvement. Semantic remains shadow.',cohorts:{}, comparisons:{}}
  for(const cohort of [...new Set(rows.map(r=>r.cohort))]) summary.cohorts[cohort]=summarize(rows.filter(r=>r.cohort===cohort))
  for(const cohort of ['fix1','fix2','fix3']) {
    const changed=rows.filter(r=>r.cohort===cohort)
    if(!changed.length)continue
    const ids=new Set(changed.map(r=>r.case_id))
    summary.comparisons[cohort]={baseline:summarize(rows.filter(r=>r.cohort==='baseline'&&ids.has(r.case_id))),changed:summarize(changed)}
  }
  const fix3Ids = new Set(rows.filter(r=>r.cohort==='fix3').map(r=>r.case_id))
  summary.comparisons.fix3_vs_fix2 = {before:summarize(rows.filter(r=>r.cohort==='fix2'&&fix3Ids.has(r.case_id))),after:summarize(rows.filter(r=>r.cohort==='fix3'))}
  summary.legacy_grader_checks_verified = rows.filter(r=>r.legacy_grader_verified).length
  summary.preserved_execution_failures = rows.filter(r=>!r.legacy_grader_verified).length
  summary.by_case = Object.fromEntries([...new Set(rows.map(r=>r.case_id))].map(id=>[id,Object.fromEntries([...new Set(rows.map(r=>r.cohort))].map(cohort=>[cohort,summarize(rows.filter(r=>r.case_id===id&&r.cohort===cohort))]))]))
  await mkdir(outputDir,{recursive:true})
  await write(join(outputDir,'results.json'),rows)
  await write(join(outputDir,'summary.json'),summary)
  console.log(JSON.stringify({...summary,by_case:undefined},null,2))
}
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
