#!/usr/bin/env python3
"""经 GitHub Contents API 推送指定文件（用于 github.com:443 不可达时）。

用法：python scripts/push-files-via-api.py <commit-message> <path...>
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request


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
BASE = 'https://api.github.com/repos/mjcui/lab-site'


def request(method, path, payload=None):
    url = BASE + path
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('Content-Type', 'application/json')
    if TOKEN:
        req.add_header('Authorization', 'Bearer ' + TOKEN)
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main():
    message = sys.argv[1]
    paths = sys.argv[2:]
    if not paths:
        print('没有要推送的文件')
        return

    print('待推送 %d 个文件' % len(paths))
    done = 0
    for path in paths:
        try:
            sha = request('GET', '/contents/%s?ref=main' % path).get('sha', '')
        except Exception:
            sha = ''

        with open(path, 'rb') as fh:
            content = base64.b64encode(fh.read()).decode('ascii')

        payload = {'message': message, 'content': content, 'branch': 'main'}
        if sha:
            payload['sha'] = sha

        result = request('PUT', '/contents/%s' % path, payload)
        if 'commit' in result:
            done += 1
            print('  OK   %s' % path, flush=True)
        else:
            print('  FAIL %s: %s' % (path, result.get('message')), flush=True)
            break
        time.sleep(1.0)

    print('\n完成 %d/%d' % (done, len(paths)))


if __name__ == '__main__':
    main()
