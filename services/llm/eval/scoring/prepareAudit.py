"""Freeze read-only source trials and blinded judging inputs. No Copilot calls."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'services/llm/eval/benchmark-v3/scoring-audit-20260904'
BASE = 'benchmark-v3-baseline-repaired-20260902-f04baac'
SHADOW = 'benchmark-v3-semantic-shadow-3trial-20260903-7968d204de'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def dump(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

def select(exp):
    groups = {}
    attempts = []
    for p in sorted((ROOT / 'services/llm/eval/artifacts' / exp).glob('*/result.json')):
        d = json.loads(p.read_text())
        r = json.loads(p.with_name('run.json').read_text())
        assert d['experimentId'] == exp == r['experiment_id']
        assert d['runId'] == r['run_id'] and d['caseId'] == r['case_id'] and d['trialId'] == r['trial_id']
        attempts.append({'path': str(p.parent.relative_to(ROOT)), 'status': d['status'], 'started_at': r['started_at']})
        if d['status'] not in ('PASS', 'COPILOT_FAILURE'):
            continue
        key = (d['caseId'], d['trialId'])
        row = (r['started_at'], str(p), p.parent, d, r)
        if key not in groups or row[:2] > groups[key][:2]:
            groups[key] = row
    result = []
    for key, (_, _, p, d, r) in sorted(groups.items()):
        c = json.loads((p / 'case.json').read_text())
        files = [f for f in p.rglob('*') if f.is_file() and f.suffix in ('.json', '.jsonl', '.log')]
        result.append({'case_id': key[0], 'trial_id': key[1], 'run_id': r['run_id'],
                       'run_dir': str(p.relative_to(ROOT)), 'status': d['status'],
                       'dynamic': bool(c['expected_behavior'].get('dynamic_user')),
                       'git_commit': r['git_commit'], 'benchmark_hash': r['benchmark_hash'],
                       'fixture_hash': r['fixture_hash'], 'config_hash': r['config_hash'],
                       'files': {str(f.relative_to(p)): sha(f) for f in sorted(files)}})
    return result, attempts

def public_input(row):
    p = ROOT / row['run_dir']
    c = json.loads((p / 'case.json').read_text())
    compiles = sorted((p / 'compiles').glob('*final-grading.json'))
    compile_result = json.loads(compiles[-1].read_text()) if compiles else None
    if compile_result:
        compile_result = {k: compile_result.get(k) for k in ['status', 'errorCount', 'warningCount', 'errors']}
    return {'protocol': 'overleaf-semantic-grader/v1',
            'task': {'user_messages': json.loads((p / 'eval-user-input.json').read_text())['messages']},
            'evidence': {'responses': json.loads((p / 'responses.json').read_text()),
                         'initial_files': json.loads((p / 'before.json').read_text()),
                         'final_files': json.loads((p / 'after.json').read_text()), 'compile': compile_result},
            'criteria': [
                {'id': 'user_goal', 'description': '根据实际用户消息与文件证据，用户要求是否已完成？不要求未公开指定的内部命名或唯一措辞。'},
                {'id': 'preservation', 'description': '实际用户要求保留的内容/事实/范围是否保持，且没有无依据的破坏？'},
                {'id': 'grounding', 'description': '最终回复是否有证据支撑，没有虚假完成或编造事实？无编译证据时不得凭回复推定编译通过。'}]}

def main():
    if (OUT / 'source-manifest.json').exists():
        raise FileExistsError('Audit sources already frozen; use replayAudit.ts or a new versioned audit directory.')
    base, attempts = select(BASE)
    shadow, shadow_attempts = select(SHADOW)
    assert len(base) == 219 and sum(r['status'] == 'PASS' for r in base) == 75
    assert len(shadow) == 30
    dump(OUT / 'source-manifest.json', {'schema_version': 1,
         'selection_rule': 'Freeze latest capability attempt by started_at within each original experiment/logical trial; no further reselection during rescoring.',
         'baseline': base, 'shadow': shadow, 'attempts': attempts + shadow_attempts})
    # Two distinct case families per stratum, hash ordered before any judging.
    sample = []
    for dynamic in (False, True):
        for status in ('PASS', 'COPILOT_FAILURE'):
            candidates = [r for r in base if r['dynamic'] == dynamic and r['status'] == status]
            candidates.sort(key=lambda r: hashlib.sha256(r['trial_id'].encode()).hexdigest())
            seen = set()
            for r in candidates:
                if r['case_id'] in seen: continue
                seen.add(r['case_id']); sample.append(r)
                if len(seen) == 2: break
    risks = ['v3.compile-appendix-label-collision.v1', 'v3.compile-subfigure-counter-recovery.v1', 'v3.compile-proof-environment.v1']
    for case_id in risks:
        r = next(r for r in base if r['case_id'] == case_id and r['trial_id'].endswith('trial-1'))
        if not any(x['run_id'] == r['run_id'] for x in sample): sample.append(r)
    tasks = []
    for i, row in enumerate(sample, 1):
        name = f'blind-{i:02}'
        path = OUT / 'inputs' / (name + '.json'); dump(path, public_input(row))
        tasks.append({'id': name, 'kind': 'blind_audit', 'input': str(path.relative_to(ROOT)), 'sha256': sha(path), 'repeats': 1, 'source_run_id': row['run_id']})
    fixed = [
        ('v3.noop-title-already-exact.v1', 3),
        ('v3.content-robotics-polish.v1', 1),
        ('v3.content-bilingual-questionnaire-format.v1', 1),
        ('v3.result-figure-near-analysis.v1', 1),
    ]
    inputs = []
    for case_id, trial in fixed:
        row = next(r for r in shadow if r['case_id'] == case_id and r['trial_id'].endswith(f'trial-{trial}'))
        original = ROOT / row['run_dir'] / 'semantic-grader-input.json'
        inputs.append((json.loads(original.read_text()), row, original.read_bytes()))
    for i, (data, row, raw) in enumerate(inputs, 1):
        path = OUT / 'inputs' / f'repeat-{i:02}.json'; path.write_bytes(raw)
        tasks.append({'id': f'repeat-{i:02}', 'kind': 'same_artifact_repeat', 'input': str(path.relative_to(ROOT)), 'sha256': sha(path), 'repeats': 3, 'source_run_id': row['run_id']})
    # Obvious violations with stale success claims: test reliance on claims vs files.
    for i, field in enumerate(('formula', 'meaning'), 1):
        data = copy.deepcopy(inputs[1][0])
        target = next(f for f in data['evidence']['final_files'] if f['path'] == 'chapters/appendix.tex')
        if field == 'formula':
            assert '0.5' in target['content']; target['content'] = target['content'].replace('0.5', '0.9')
        else:
            assert 'does not claim robustness' in target['content']
            target['content'] = target['content'].replace('does not claim robustness', 'guarantees robustness')
        path = OUT / 'inputs' / f'negative-{i:02}.json'; dump(path, data)
        tasks.append({'id': f'negative-{i:02}', 'kind': 'adversarial_mutation', 'input': str(path.relative_to(ROOT)), 'sha256': sha(path), 'repeats': 3, 'expected': 'fail', 'mutation': field, 'source_run_id': inputs[1][1]['run_id']})
    dump(OUT / 'judge-plan.json', {'model': 'gpt-5.6-luna', 'instructions_sha256': sha(ROOT / '.agent/semantic_grader/instructions.md'), 'human_gold': False,
                                'sample_rule': '2 unique cases per dynamic/static × original pass/fail stratum, SHA256(trial_id) ascending; plus 3 priority risks', 'tasks': tasks})
    print(f'Frozen {len(base)} baseline + {len(shadow)} shadow trials; {len(sample)} blind samples; {sum(t["repeats"] for t in tasks)} judge calls')

if __name__ == '__main__': main()
