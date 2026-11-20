#!/usr/bin/env python3
"""经 GitHub Contents API 推送本地改动（用于 github.com:443 不可达时）。

用法：python scripts/push-via-api.py <owner/repo> <branch> <commit-message>
"""
import base64
import json
import subprocess
import sys
import time
import urllib.request

repo = sys.argv[1] if len(sys.argv) > 1 else 'mjcui/lab-site'
branch = sys.argv[2] if len(sys.argv) > 2 else 'main'
message = sys.argv[3] if len(sys.argv) > 3 else 'chore: update via API'


def get_token():
    out = subprocess.run(
        ['git', 'credential', 'fill'],
        input='protocol=https\nhost=github.com\n\n',
        capture_output=True, text=True,
    ).stdout
    for line in out.splitlines():
        if line.startswith('password='):
            return line[len('password='):].strip()
    return ''


TOKEN = get_token()
BASE = f'https://api.github.com/repos/{repo}'


def request(method, path, payload=None):
    url = f'{BASE}{path}'
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('Content-Type', 'application/json')
    if TOKEN:
        req.add_header('Authorization', f'Bearer {TOKEN}')
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode('utf-8'))


# 本次提交涉及的文件（相对 HEAD~1）
files = subprocess.run(
    ['git', 'diff', '--name-only', 'HEAD~1', 'HEAD'],
    capture_output=True, text=True,
).stdout.split()

print(f'待推送 {len(files)} 个文件到 {repo}@{branch}')

for path in files:
    try:
        remote = request('GET', f'/contents/{path}?ref={branch}')
        sha = remote.get('sha', '')
    except Exception:
        sha = ''

    with open(path, 'rb') as fh:
        content = base64.b64encode(fh.read()).decode('ascii')

    payload = {
        'message': message,
        'content': content,
        'branch': branch,
    }
    if sha:
        payload['sha'] = sha

    result = request('PUT', f'/contents/{path}', payload)
    if 'commit' in result:
        print(f'  OK   {path}')
    else:
        print(f'  FAIL {path}: {result.get("message")}')
        sys.exit(1)
    time.sleep(1.5)

print('全部推送完成')
