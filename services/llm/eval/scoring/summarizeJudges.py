"""Post-unblinding descriptive audit; model agreement is not human accuracy."""
import json
from collections import Counter
from pathlib import Path
from prepareAudit import ROOT, OUT, dump, sha

def main():
    plan=json.loads((OUT/'judge-plan.json').read_text());manifest=json.loads((OUT/'source-manifest.json').read_text())
    rows={r['run_id']:r for c in manifest['cohorts'].values() for r in c}
    results=[]
    for t in plan['tasks']:
        grades=[]
        for i in range(1,t['repeats']+1):
            p=OUT/'judge-results'/f'{t["id"]}-{i}.json';d=json.loads(p.read_text())
            assert d['input_sha256']==t['sha256']==sha(ROOT/t['input'])
            assert d['instructions_sha256']==plan['instructions_sha256']
            grades.append({'status':d['status'],'path':str(p.relative_to(ROOT)),'sha256':sha(p)})
        row=rows[t['source_run_id']]
        original_semantic=ROOT/row['run_dir']/'semantic-grader.json'
        results.append({'id':t['id'],'kind':t['kind'],'source_run_id':row['run_id'],'case_id':row['case_id'],
          'dynamic':row['dynamic'],'original_deterministic':row['status'],
          'historical_semantic':json.loads(original_semantic.read_text())['status'] if original_semantic.exists() else None,
          'verdicts':[g['status'] for g in grades],'judgments':grades})
    shadow=manifest['cohorts']['shadow'];ids={r['case_id'] for r in shadow}
    old=sum(r['status']=='PASS' for r in manifest['cohorts']['baseline'] if r['case_id'] in ids)
    new=sum(r['status']=='PASS' for r in shadow);sem=0;disagreements=[]
    for r in shadow:
        p=ROOT/r['run_dir'];s=json.loads((p/'semantic-grader.json').read_text());sem+=s['status']=='pass'
        g=json.loads((p/'grader.json').read_text())
        if s['status']=='pass' and not g['passed']:
            disagreements.append({'run_id':r['run_id'],'case_id':r['case_id'],'failed_checks':[x['grader'] for x in g['checks'] if not x['passed']]})
    summary={'human_gold':False,'independent_judge':'gpt-5.6-luna via existing semantic_grader; configured identity only',
      'judge_calls':sum(len(r['verdicts']) for r in results),'errors':sum(v=='error' for r in results for v in r['verdicts']),
      'same_artifact':{'inputs':4,'repeats_each':3,'within_run_unanimous':sum(len(set(r['verdicts']))==1 for r in results if r['kind']=='same_artifact_repeat'),
       'historical_disagreements':sum(any(v!=r['historical_semantic'] for v in r['verdicts']) for r in results if r['kind']=='same_artifact_repeat')},
      'known_mutations':{'inputs':2,'judgments':6,'rejected':sum(v=='fail' for r in results if r['kind']=='adversarial_mutation' for v in r['verdicts']),
       'caveat':'Sensitivity on two constructed negatives, not a population false-positive rate.'},
      'composite_decomposition':{'old_same_10_cases_deterministic':old,'rerun_same_10_cases_deterministic':new,'rerun_semantic':sem,
          'rerun_delta':new-old,'same_artifact_semantic_delta':sem-new,
          'semantic_pass_with_failed_checks':len(disagreements),'with_patch_files_failure':sum(any(c['type']=='patch_files' for c in r['failed_checks']) for r in disagreements)},
      'results':results,'shadow_gate_conflicts':disagreements}
    dump(OUT/'judge-summary.json',summary)
    print(json.dumps({k:v for k,v in summary.items() if k not in ('results','shadow_gate_conflicts')},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
