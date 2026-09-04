"""Explicitly version measured requirements; never alter original cases/results."""
import json
import hashlib
from pathlib import Path
from prepareAudit import ROOT, OUT, dump, select, sha


def main():
    if (OUT / 'contract-v1.json').exists():
        raise FileExistsError('Contract already frozen; use replayAudit.ts, do not reselect source trials.')
    manifest=json.loads((OUT/'source-manifest.json').read_text())
    cohorts={'baseline':manifest['baseline'],'shadow':manifest['shadow']}
    fix1=[]
    for exp in ['benchmark-v3-patch-semantics-fix1-20260903-373badfe26','benchmark-v3-patch-semantics-fix1-retry-quota-20260903-373badfe26','benchmark-v3-patch-semantics-fix1-retry-title-20260903-373badfe26']:
        rows,_=select(exp);fix1.extend(rows)
    chosen={}
    for row in fix1:
        r=json.loads((ROOT/row['run_dir']/'run.json').read_text())
        key=(row['case_id'],row['trial_id'].split('--')[-1])
        if key not in chosen or r['started_at']>chosen[key][0]:chosen[key]=(r['started_at'],row)
    cohorts['fix1']=[v[1] for _,v in sorted(chosen.items())]
    cohorts['fix2']=select('benchmark-v3-latex-definition-fix-20260904-d51b70c33b')[0]
    cohorts['fix3']=[]
    for p in sorted((ROOT/'services/llm/eval/artifacts').glob('*/result.json')):
        d=json.loads(p.read_text())
        if d.get('experimentId')!='benchmark-v3-boolean-switch-fix-20260904-336a3f7748' or d['status'] not in ('PASS','COPILOT_FAILURE'):continue
        r=json.loads(p.with_name('run.json').read_text());c=json.loads(p.with_name('case.json').read_text())
        cohorts['fix3'].append({'case_id':d['caseId'],'trial_id':d['trialId'],'run_id':r['run_id'],'run_dir':str(p.parent.relative_to(ROOT)),
          'status':d['status'],'dynamic':bool(c['expected_behavior'].get('dynamic_user')),'git_commit':r['git_commit'],
          'benchmark_hash':r['benchmark_hash'],'fixture_hash':r['fixture_hash'],'config_hash':r['config_hash'],
          'files':{str(f.relative_to(p.parent)):sha(f) for f in sorted(p.parent.rglob('*')) if f.is_file() and f.suffix in ('.json','.jsonl','.log')}})
    assert [len(cohorts[x]) for x in ['baseline','shadow','fix1','fix2','fix3']]==[219,30,84,27,18]
    for name,rows in cohorts.items():
        assert len({r['git_commit'] for r in rows})==1,(name,'mixed code revision')
        assert len({r['config_hash'] for r in rows})==1,(name,'mixed config')
    manifest['cohorts']=cohorts
    # Remove duplicate source lists; judge-plan source IDs remain valid.
    dump(OUT/'source-manifest.json',manifest)
    policies={}
    for row in manifest['baseline']:
        if row['case_id'] in policies:continue
        c=json.loads((ROOT/row['run_dir']/'case.json').read_text())
        task={key:c[key] for key in ['user_goal','expected_behavior','patch_policy','compile_policy','initial_state']}
        policies[c['case_id']]={'fixtureHash':c['fixture']['sha256'],'publicBrief':c['user_goal']['public_brief'],'graders':c['graders'],
          'taskHash':hashlib.sha256(json.dumps(task,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
    for case_id,file,old,label,required in [
      ('v3.compile-appendix-label-collision.v1','appendix/table.tex','resultstable','tab:results','tab:appendix-results'),
      ('v3.compile-subfigure-counter-recovery.v1','figures/experiment-b.tex','panel','fig:panel-a',None)]:
        policy=policies[case_id]
        target=next(s for s in policy['graders'] if s['type']=='file_contains' and s.get('file')==file and any('\\newcounter' in v for v in s['values']))
        policy['counter']={'file':file,'oldCounter':old,'oldLabel':label,'replacedCheck':target}
        if required:policy['counter']['requiredLabel']=required
    policies['v3.compile-proof-environment.v1']['invalidReason']='CONTRACT_CONFLICT: fixture proofx ends in square; preservation fact conflicts with oracle diamond. No unilateral PASS/FAIL until task and visual invariant are adjudicated.'
    dump(OUT/'contract-v1.json',{'id':'v3-scoring-audit-v1-20260904','scope':'deterministic comparison contract; semantic shadow cannot override hard checks; proof excluded symmetrically',
       'changes':['Accept literal independent counter/label names instead of oracle-only internal names in two audited cases; retain scope/content/compile gates.', 'Quarantine proof contract conflict; no fixture or public prompt change.'],
       'cases':policies,
       'implementationHashes':{path:sha(ROOT/path) for path in ['services/llm/eval/scoring/scoringContract.ts','services/llm/eval/scoring/replayAudit.ts','services/llm/eval/pilot/graderRegistry.ts','services/llm/eval/headless/workspaceState.ts','services/llm/eval/headless/canonicalTrace.ts']}})
    print({k:len(v) for k,v in cohorts.items()})

if __name__=='__main__':main()
