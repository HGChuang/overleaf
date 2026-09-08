"""Offline compiler worker. Only sees compiler spool, never credentials/oracles."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import signal
import subprocess
import tempfile
import time

spool = Path('/spool')
while True:
    for job in sorted(spool.glob('*/request.json')):
        result_path = job.parent / 'result.json'
        if result_path.exists():
            continue
        request = json.loads(job.read_text())
        result = {'status': 'unavailable', 'pdfSha256': None}
        try:
            with tempfile.TemporaryDirectory(prefix='l1-tex-') as work:
                for name, content in request['files'].items():
                    path = PurePosixPath(name)
                    if path.is_absolute() or '..' in path.parts or path.suffix not in ('.tex', '.bib', '.sty'):
                        raise ValueError('unsupported source path')
                    target = Path(work) / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(content, encoding='utf-8', newline='')
                env = dict(os.environ, openin_any='p', openout_any='p')
                with open(Path(work) / 'console.txt', 'wb') as console:
                    proc = subprocess.Popen(['latexmk', '-pdf', '-interaction=nonstopmode', '-halt-on-error',
                        '-file-line-error', '-no-shell-escape', 'main.tex'], cwd=work, env=env,
                        stdout=console, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        code = proc.wait(timeout=30)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait()
                        code = -1
                log = Path(work) / 'main.log'
                pdf = Path(work) / 'main.pdf'
                result.update(exitCode=code, status='success' if code == 0 and pdf.exists() else 'failure',
                    log=log.read_text(errors='replace') if log.exists() else '',
                    console=(Path(work) / 'console.txt').read_text(errors='replace'),
                    pdfSha256=hashlib.sha256(pdf.read_bytes()).hexdigest() if pdf.exists() else None,
                    timedOut=code == -1)
        except Exception as error:
            result['error'] = str(error)
        temp = result_path.with_suffix('.tmp')
        temp.write_text(json.dumps(result, ensure_ascii=False))
        temp.rename(result_path)
    time.sleep(0.1)
