"""Offline evidence audit. Run from any cwd; never calls Copilot or mutates source runs."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'services/llm/eval/benchmark-v3/scoring-audit-20260904/source-manifest.json'
SMOKE = ROOT / 'services/llm/eval/artifacts/context-delivery-20260904'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def text(result):
    return '\n'.join(b['text'] for b in result['content'] if b['type'] == 'text')


def audit():
    baseline = read(BASE)['baseline']
    cases, exposed, clipped, completed = {}, 0, Counter(), 0
    for row in baseline:
        directory = ROOT / row['run_dir']
        for name in ('case.json', 'events.jsonl'):
            assert sha(directory / name) == row['files'][name], (row['run_id'], name)
        case = read(directory / 'case.json')
        cases[case['case_id']] = case
        exposed += case['initial_state']['current_file'] != case['fixture']['main_file']
        for event in map(json.loads, (directory / 'events.jsonl').read_text().splitlines()):
            if event['event_type'] == 'tool_completed':
                completed += 1
                summary = event.get('summary', {})
                if summary.get('result_summary', '').endswith('…'):
                    clipped[summary['tool_name']] += 1
    files = [f for c in cases.values() for f in c['fixture']['files']]
    historical = {
        'manifest_sha256': sha(BASE), 'trials': len(baseline), 'cases': len(cases),
        'legacy_current_file_mismatch_cases': [c['case_id'] for c in cases.values()
            if c['initial_state']['current_file'] != c['fixture']['main_file']],
        'exposed_trials_not_proven_causal_failures': exposed,
        'max_file_characters': max(len(f['content']) for f in files),
        'files_over_20000_characters': sum(len(f['content']) > 20000 for f in files),
        'max_project_characters': max(sum(len(f['content']) for f in c['fixture']['files']) for c in cases.values()),
        'max_project_file_count': max(len(c['fixture']['files']) for c in cases.values()),
        'tool_completed': completed, 'clipped_sse_previews': sum(clipped.values()),
        'clipped_sse_previews_by_tool': dict(clipped),
    }
    summaries, sources = [], []
    for directory in sorted(SMOKE.iterdir()):
        run, result, case = [read(directory / p) for p in ('run.json', 'result.json', 'case.json')]
        assert run['context_trace']['complete'] and run['context_trace']['failures'] == 0
        events = list(map(json.loads, (directory / 'events.jsonl').read_text().splitlines()))
        evidence = [e for e in events if e['event_type'] == 'context_evidence_recorded']
        assert len(evidence) == run['context_trace']['records']
        for event in events:
            for ref in event.get('artifacts', []):
                assert sha(directory / ref['path']) == ref['sha256'], ref['path']
        archived_sources = []
        for name, digest in run['context_trace_sources'].items():
            current = ROOT / 'services/llm' / name
            if sha(current) != digest:
                archived = read(OUT / 'executed-sources' / (name + '.json'))
                assert hashlib.sha256(archived['content'].encode()).hexdigest() == archived['sha256'] == digest, name
                # The only post-smoke cleanup allowed here is indentation.
                assert [line.lstrip() for line in current.read_text().splitlines()] == [line.lstrip() for line in archived['content'].splitlines()], name
                archived_sources.append(name)
        records = [(int(e['artifacts'][0]['path'].split('/')[1].split('-')[0]), e,
                    read(directory / e['artifacts'][0]['path'])) for e in evidence]
        records.sort(key=lambda item: item[0])
        requests = [r for r in records if r[1]['summary']['kind'] == 'provider-request']
        inputs = {e['tool_call_id']: value for _, e, value in records if e['summary']['kind'] == 'tool-input'}
        payloads = [v for _, e, v in records if e['summary']['kind'] == 'payload']
        for p in payloads:
            assert p['context']['currentFile'] == case['initial_state']['current_file']
            assert p['project']['rootDocId'] == case['fixture']['main_file']
        initial = requests[0][2]
        assert case['initial_state']['current_file'] in initial['messages'][0]['content']
        user = json.loads(next(m['content'] for m in initial['messages'] if m['role'] == 'user'))
        assert user['CONTEXT']['currentFile'] == case['initial_state']['current_file']
        assert 'files' not in user['PROJECT']  # Bodies are available through tools.
        links = []
        later_changes = []
        for ordinal, event, value in records:
            if event['summary']['kind'] != 'tool-output':
                continue
            call_id = event['tool_call_id']
            assert call_id in inputs
            expected = text(value['result'])
            later = [r for r in requests if r[0] > ordinal]
            first = next((m for m in later[0][2]['messages'] if m.get('tool_call_id') == call_id), None) if later else None
            state = 'exact' if first and first['content'] == expected else 'changed' if first else 'absent' if later else 'no_next_model_call'
            links.append({'tool': value['tool'], 'tool_call_id': call_id, 'output': event['artifacts'][0]['path'],
                          'text_characters': len(expected), 'next_request': later[0][1]['artifacts'][0]['path'] if later else None,
                          'first_delivery': state})
            for _, e, request in later[1:]:
                message = next((m for m in request['messages'] if m.get('tool_call_id') == call_id), None)
                if not message or message['content'] != expected:
                    later_changes.append({'tool': value['tool'], 'tool_call_id': call_id,
                        'request': e['artifacts'][0]['path'], 'state': 'absent' if not message else 'changed',
                        'replacement': message['content'] if message else None})
        assert all(link['first_delivery'] == 'exact' for link in links), links
        model_started = [e for e in events if e['event_type'] == 'model_started']
        kinds = Counter(e['summary']['kind'] for e in evidence)
        assert kinds['model-context'] == kinds['provider-request'] == kinds['model-output'] == len(model_started)
        compile_events = [e for e in events if e['event_type'] == 'compile_completed']
        summaries.append({'case_id': case['case_id'], 'run_dir': str(directory.relative_to(ROOT)),
            'original_status': result['status'], 'context_trace': run['context_trace'],
            'current_file': payloads[0]['context']['currentFile'], 'model_calls': len(requests),
            'user_turns': result['userTurnCount'], 'service_requests': len(payloads),
            'compile_calls': len(compile_events), 'source_hashes_verified': True,
            'archived_executed_sources_with_indentation_only_cleanup': archived_sources,
            'request_scope': 'shared serializer body projection; not real network packet capture',
            'tool_first_delivery': links, 'later_history_changes': later_changes})
        sources.append({'case_id':case['case_id'], 'trial_id':result['trialId'], 'run_id':run['run_id'],
            'run_dir':str(directory.relative_to(ROOT)), 'status':result['status'], 'dynamic':False,
            **{k:run[k] for k in ('git_commit','config_hash','benchmark_hash','fixture_hash')},
            'files':{str(p.relative_to(directory)):sha(p) for p in sorted(directory.rglob('*')) if p.is_file()}})
    assert len(summaries) == 2
    write('source-manifest.json', {'schema_version':1, 'cohorts':{'diagnostic_smoke':sources}})
    report = {'historical':historical, 'smoke':summaries,
              'comparison_eligible':False, 'reason':'diagnostic sample; repaired input contract; no paired counterfactual'}
    write('report.json', report)
    print(json.dumps({'historical':historical, 'smoke_runs':len(summaries)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    audit()
