/** Unified, offline report. Never promotes raw/shadow grades or unresolved calibration to a release score. */
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { resolve, dirname, join, basename, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJsonAtomic, hashValue } from '../headless/canonicalTrace.js'
import { gradePilotCase } from '../pilot/graderRegistry.js'
import { loadTrial, logicalTrialKey } from './replayAudit.js'
import { fileSha256 } from './scoringContract.js'
import { scoreCandidate } from './candidateGrader.js'
import type { SchedulerTrialResult } from '../pilot/baselineScheduler.js'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const policyDir = join(repository, 'services/llm/eval/scoring/acceptance-20260904')
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

async function inventory(dir: string, prefix = ''): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(join(dir, prefix), {withFileTypes:true})) {
    const name = join(prefix, entry.name)
    if (entry.isDirectory()) Object.assign(files, await inventory(dir, name))
    else if (entry.isFile()) files[name] = fileSha256(await readFile(join(dir, name)))
    else throw new Error(`unsupported source entry: ${name}`)
  }
  return files
}

export async function writeAcceptedReport(results: SchedulerTrialResult[], outputDir: string,
  options: {hostArtifactRoot?: string} = {}) {
  await mkdir(outputDir, {recursive:true})
  const contractPath = join(policyDir, 'contract-v2.json')
  const contract = await json(contractPath)
  const reviews = await json(join(policyDir, 'case-review.json'))
  const calibration = await json(join(policyDir, 'calibration.json'))
  for (const [path, sha] of Object.entries(contract.implementationHashes)) {
    if (fileSha256(await readFile(join(repository, path))) !== sha) throw new Error(`scoring implementation changed: ${path}`)
  }
  const seen = new Set<string>(), sources: any[] = [], rows: any[] = []
  const revisions = new Set<string>()
  for (const result of results) {
    try {
      const key = logicalTrialKey(result.caseId, result.trialId)
      if (seen.has(key)) throw new Error(`duplicate logical trial: ${key}`)
      seen.add(key)
      if (!['PASS','COPILOT_FAILURE'].includes(result.status)) {
        rows.push({case_id:result.caseId, trial_id:result.trialId, status:result.status, original_status:result.status})
        continue
      }
      if (!result.runDir || !result.runId) throw new Error('missing completed run identity')
      // Compose returns container paths; resolve against the explicitly selected host artifact root.
      const dir = options.hostArtifactRoot ? join(options.hostArtifactRoot, basename(result.runDir)) : resolve(repository, result.runDir)
      const rel = relative(repository, dir)
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('run outside repository')
      const run = await json(join(dir, 'run.json'))
      const c = await json(join(dir, 'case.json'))
      if (run.run_id !== result.runId || run.experiment_id !== result.experimentId) throw new Error('scheduler/source identity mismatch')
      const source = {case_id:result.caseId, trial_id:result.trialId, run_id:result.runId,
        run_dir:rel, status:result.status, dynamic:Boolean(c.expected_behavior.dynamic_user),
        ...Object.fromEntries(['git_commit','config_hash','benchmark_hash','fixture_hash'].map(k=>[k,run[k]])),
        files:await inventory(dir)}
      const context = await loadTrial(source)
      const old = gradePilotCase(context)
      const saved = source.files['grader.json'] ? await json(join(dir, 'grader.json')) : null
      const terminal = await json(join(dir, 'result.json'))
      if (saved && JSON.stringify(saved.checks.map((c:any)=>c.passed)) !== JSON.stringify(old.checks.map(c=>c.passed))) throw new Error('raw grader replay drift')
      if (!saved && !(result.status === 'COPILOT_FAILURE' && ['tool','model','compile'].includes(terminal.failure?.failure_category))) throw new Error('missing grading evidence')
      const score = scoreCandidate(context, contract)
      if (result.status === 'COPILOT_FAILURE' && (!saved || old.passed) && !['INVALID','INCOMPLETE'].includes(score.status)) {
        score.status = 'COPILOT_FAILURE'; score.reason = 'preserve execution failure'
      }
      const review = reviews.cases.find((c:any)=>c.case_id===result.caseId)
      sources.push(source)
      revisions.add(hashValue({git:run.git_commit,config:run.config_hash,model:run.model,context_sources:run.context_trace_sources || null}))
      rows.push({case_id:result.caseId, trial_id:result.trialId, run_id:result.runId, original_status:result.status,
        ...score, review_status:review?.status || 'REVIEW_REQUIRED', human_verdict:review?.human_verdict || 'PENDING'})
    } catch (error) {
      rows.push({case_id:result.caseId, trial_id:result.trialId, original_status:result.status, status:'INCOMPLETE',
        reason:error instanceof Error ? error.message : String(error)})
    }
  }
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1
  const summary = {
    schema_version:1, scoring_basis:'frozen_candidate_contract',
    contract_id:contract.id, contract_sha256:fileSha256(await readFile(contractPath)),
    review_sha256:fileSha256(await readFile(join(policyDir,'case-review.json'))),
    calibration_sha256:fileSha256(await readFile(join(policyDir,'calibration.json'))),
    planned_trials:results.length, diagnostic_outcomes:counts,
    // Deliberately no enable flag: promotion requires a separately reviewed/versioned contract and reporter.
    comparison_eligible:false, official_pass_rate:null, acceptance_status:'NOT_ACCEPTED',
    blockers:[...calibration.blockers,
      ...(rows.some(r=>r.status==='INCOMPLETE') ? ['missing_or_invalid_source_evidence'] : []),
      ...(rows.some(r=>r.status==='INFRA_FAILURE' || r.status==='SKIPPED') ? ['incomplete_capability_coverage'] : []),
      ...(revisions.size>1 ? ['mixed_code_config_model_or_instrumented_sources'] : []),
      ...(results.length===0 ? ['empty_cohort'] : [])],
    interpretation:'Diagnostic same-artifact scoring only. INVALID is not PASS; remaining labels are not human-calibrated capability truth. Semantic remains shadow.',
  }
  await writeJsonAtomic(join(outputDir,'source-manifest.json'), {schema_version:1,cohorts:{selected:sources}})
  await writeJsonAtomic(join(outputDir,'results.json'),rows)
  await writeJsonAtomic(join(outputDir,'summary.json'),summary)
  return summary
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('usage: acceptedReport.ts scheduler-summary.json output-directory')
  const raw = await json(resolve(input))
  console.log(JSON.stringify(await writeAcceptedReport(raw.results, resolve(output)), null, 2))
}
