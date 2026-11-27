import base64
import fcntl
import hashlib
import http.client
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BASE = Path('/opt/aifect-public-origin')
RELEASES = BASE / 'releases'
CURRENT = BASE / 'current'
SERVICE = 'aifect-public-origin.service'
PRODUCTION = 'aifect.co.kr'
ROUTES = ('/', '/music')
FILES = {'renderer.mjs', 'shell.html', 'revision', 'service.mjs', 'product-media.mjs', 'package.json', 'package-lock.json'}
TLS = ssl.create_default_context()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def active_release():
    require(CURRENT.is_symlink(), f'{CURRENT} must be a symlink')
    path = CURRENT.resolve(strict=True)
    require(path.parent == RELEASES and path.is_dir(), f'Invalid current release {path}')
    return path


def replace_current(path):
    scratch = BASE / ('.current-' + secrets.token_hex(8))
    scratch.symlink_to(path, target_is_directory=True)
    try:
        scratch.replace(CURRENT)
    finally:
        scratch.unlink(missing_ok=True)


def check_release(path, manifest):
    require(path.is_dir() and not path.is_symlink(), f'Invalid release directory {path}')
    renderer = (path / 'renderer.mjs').read_bytes()
    shell = (path / 'shell.html').read_bytes()
    revision = (path / 'revision').read_text().strip()
    require(revision == manifest['revision'] == digest(renderer + b'\0' + shell), 'Invalid renderer revision')
    for name, expected in manifest['hashes'].items():
        file = path / name
        require(file.is_file() and not file.is_symlink() and digest(file.read_bytes()) == expected, f'Invalid release file {name}')


def live_process():
    pid = int(subprocess.check_output(['systemctl', 'show', SERVICE, '-p', 'MainPID', '--value'], text=True))
    require(pid > 0, f'{SERVICE} has no running process')
    return Path(f'/proc/{pid}')


def local_render(port, secret, revision):
    for route in ROUTES:
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        try:
            body = json.dumps({'target': route, 'data': {'tracks': []}})
            conn.request('POST', f'/aifect-origin/{revision}/page', body,
                         {'Authorization': b'Bearer ' + secret, 'Content-Type': 'application/json'})
            res = conn.getresponse()
            require(res.status == 200 and res.getheader('x-aifect-rendered') == '1'
                    and res.getheader('x-aifect-origin-revision') == revision
                    and res.read(30).lower().startswith(b'<!doctype html>'),
                    f'Local rendering for {route} failed (HTTP {res.status})')
        finally:
            conn.close()


def retry(probe, seconds):
    deadline = time.monotonic() + seconds
    while True:
        try:
            return probe()
        except (OSError, RuntimeError, http.client.HTTPException):
            if time.monotonic() >= deadline:
                raise
            time.sleep(.4)


def smoke(path, revision):
    status = (live_process() / 'status').read_text()
    uid = int(re.search(r'^Uid:\s+\d+\s+(\d+)', status, re.M)[1])
    gid = int(re.search(r'^Gid:\s+\d+\s+(\d+)', status, re.M)[1])
    require(uid > 0 and gid > 0, 'Expected an unprivileged renderer service')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    key = secrets.token_urlsafe(48)
    env = {'PATH': '/usr/bin:/bin', 'PORT': str(port), 'CAFE24_ORIGIN_KEY': key}
    with subprocess.Popen(['/usr/bin/node', str(path / 'service.mjs')], cwd=path, env=env,
                          user=uid, group=gid, extra_groups=(),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as proc:
        try:
            retry(lambda: local_render(port, key.encode(), revision), 5)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()


def stage(path, manifest):
    if not path.exists():
        with tempfile.TemporaryDirectory(prefix='.staging-', dir=RELEASES) as scratch:
            candidate = Path(scratch)
            for name in FILES:
                data = base64.b64decode(manifest['files'][name], validate=True)
                (candidate / name).write_bytes(data)
                (candidate / name).chmod(0o644)
            check_release(candidate, manifest)
            with tempfile.TemporaryDirectory(prefix='aifect-renderer-npm-') as cache:
                npm = subprocess.run(
                    ['/usr/bin/npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
                     '--cache', cache, '--fetch-retries=1', '--fetch-timeout=30000'],
                    cwd=candidate, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=100)
                if npm.returncode:
                    codes = sorted(set(re.findall(rb'\bE(?:[A-Z]{3,20}|\d{3})\b', npm.stderr)))
                    detail = ' '.join(code.decode() for code in codes[:6])
                    raise RuntimeError(f'Cafe24 npm ci failed (exit {npm.returncode}) {detail}'.rstrip())
            candidate.chmod(0o755)
            smoke(candidate, manifest['revision'])
            candidate.rename(path)
    else:
        check_release(path, manifest)
        smoke(path, manifest['revision'])


def public_pages(revision):
    results = []
    for route in ROUTES:
        conn = http.client.HTTPSConnection(PRODUCTION, context=TLS, timeout=8)
        try:
            conn.request('GET', route, headers={'Cache-Control': 'no-cache'})
            response = conn.getresponse()
            result = {'path': route, 'status': response.status,
                      'webOrigin': response.getheader('x-aifect-web-origin'),
                      'revision': response.getheader('x-aifect-origin-revision')}
            results.append(result)
        finally:
            conn.close()
    require(all(row['status'] == 200 and row['webOrigin'] == 'cafe24' and row['revision'] == revision
                for row in results), 'Public renderer verification failed ' + json.dumps(results))
    return results


def check_live_shell(expected):
    conn = http.client.HTTPSConnection(PRODUCTION, context=TLS, timeout=8)
    try:
        conn.request('GET', '/aifect-shell.txt', headers={'Cache-Control': 'no-cache'})
        response = conn.getresponse()
        require(response.status == 200 and digest(response.read(256 * 1024 + 1)) == expected,
                'The live Sites shell differs from the prepared archive. Recheck the published version.')
    finally:
        conn.close()


def check_running(path, revision):
    process = live_process()
    require((process / 'cwd').resolve(strict=True) == path, 'The service has not opened the selected release')
    env = (process / 'environ').read_bytes().split(b'\0')
    key = next((part.partition(b'=')[2] for part in env if part.startswith(b'CAFE24_ORIGIN_KEY=')), b'')
    require(len(key) >= 32 and b'\r' not in key and b'\n' not in key, 'Invalid renderer origin credential')
    local_render(18421, key, revision)


def restart():
    subprocess.run(['systemctl', 'restart', SERVICE], check=True, timeout=40)


def activate(path, manifest, previous):
    revision = manifest['revision']
    check_release(path, manifest)
    check_live_shell(manifest['hashes']['shell.html'])
    if previous == path:
        retry(lambda: check_running(path, revision), 8)
        return public_pages(revision)
    require(str(previous) == manifest['previousRelease'], f'Current release changed to {previous}. Verify the deployment before retrying.')
    try:
        replace_current(path)
        restart()
        retry(lambda: check_running(path, revision), 10)
        return retry(lambda: public_pages(revision), 15)
    except (Exception, KeyboardInterrupt) as error:
        if active_release() != path:
            raise
        try:
            replace_current(previous)
            restart()
            prior_revision = (previous / 'revision').read_text().strip()
            retry(lambda: check_running(previous, prior_revision), 10)
        except Exception as rollback_error:
            raise RuntimeError(f'{error}\nCafe24 rollback to {previous} failed: {rollback_error}') from rollback_error
        raise RuntimeError(f'{error}\nCafe24 renderer restored to {previous}') from error


def main():
    manifest = json.load(sys.stdin)
    action, revision = manifest['action'], manifest['revision']
    require(re.fullmatch(r'[a-f0-9]{64}', revision), 'Invalid renderer revision')
    if action == 'verify':
        print(json.dumps({'revision': revision, 'routes': public_pages(revision)}))
        return
    commit = manifest['commit']
    require(action in ('stage', 'activate') and re.fullmatch(r'[a-f0-9]{40}', commit)
            and set(manifest['hashes']) == FILES, 'Invalid deployment manifest')
    path = RELEASES / f'{revision}-{commit}'
    os.umask(0o022)
    with open('/run/lock/aifect-public-origin-release.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = active_release()
        report = {'commit': commit, 'revision': revision, 'release': str(path), 'previousRelease': str(previous)}
        if action == 'stage':
            stage(path, manifest)
            report['status'] = 'staged'
        else:
            report['routes'] = activate(path, manifest, previous)
            report['status'] = 'verified'
        print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
