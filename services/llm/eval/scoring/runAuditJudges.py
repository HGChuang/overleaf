"""Replay frozen synthetic grading inputs through the existing semantic_grader."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from prepareAudit import ROOT, OUT, dump, sha

def main():
    plan = json.loads((OUT / 'judge-plan.json').read_text())
    assert plan['instructions_sha256'] == sha(ROOT / '.agent/semantic_grader/instructions.md')
    def run(task, repeat):
        path = ROOT / task['input']
        assert sha(path) == task['sha256']
        target = OUT / 'judge-results' / f'{task["id"]}-{repeat}.json'
        if target.exists():
            old = json.loads(target.read_text())
            if (old.get('input_sha256') == task['sha256'] and old.get('instructions_sha256') == plan['instructions_sha256'] and old.get('configured_model') == plan['model'] and old.get('status') != 'error'):
                return target.name + ': resumed'
        started = time.time()
        record = {'input_sha256': task['sha256'], 'instructions_sha256': plan['instructions_sha256'],
                  'configured_model': plan['model'], 'task': task['id'], 'repeat': repeat,
                  'started_at_unix': started, 'status': 'error'}
        env = dict(os.environ, EVAL_SEMANTIC_GRADER_MODEL=plan['model'])
        proc = subprocess.Popen(['bash', str(ROOT / '.agent/semantic_grader/run.sh')], cwd=ROOT,
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=env, start_new_session=True)
        try:
            stdout, stderr = proc.communicate(path.read_bytes(), timeout=180)
            if proc.returncode:
                raise RuntimeError(f'grader process exited {proc.returncode}')
            result = json.loads(stdout)
            expected = {c['id'] for c in json.loads(path.read_text())['criteria']}
            criteria = result['criteria']
            assert {c['id'] for c in criteria} == expected and len(criteria) == len(expected)
            assert all(type(c['passed']) is bool and c['evidence'].strip() and c['rationale'].strip() for c in criteria)
            record.update(status='pass' if all(c['passed'] for c in criteria) else 'fail', output=result)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try: proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL); proc.communicate()
            record['error'] = 'timeout after 180s'
        except Exception as exc:
            record['error'] = str(exc)
        record['wall_seconds'] = round(time.time() - started, 3)
        dump(target, record)
        return target.name + ': ' + record['status']
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(run,t,i) for t in plan['tasks'] for i in range(1,t['repeats']+1)]
        for f in concurrent.futures.as_completed(jobs): print(f.result(),flush=True)

if __name__ == '__main__': main()
