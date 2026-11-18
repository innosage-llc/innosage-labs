#!/usr/bin/env python3
"""Operate only an explicitly selected QA APK; never clears/uninstalls app data."""
import argparse
import base64
import hashlib
import json
import shlex
import subprocess
import time
import uuid
from urllib.parse import urlparse

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--port', required=True, type=int, help='Existing dedicated localhost ADB server, not 5037')
p.add_argument('--serial', required=True, help='Exact authorized emulator or phone serial')
p.add_argument('action', choices=['arm-A', 'arm-B', 'exit', 'launch', 'list', 'disarm'])
a = p.parse_args()
if not 1024 <= a.port <= 65535 or a.port == 5037 or not a.serial.strip():
    p.error('A dedicated server port and exact serial are required')
pkg = 'co.innosage.labs.airecorder'
base = ['adb', '-H', 'localhost', '-P', str(a.port), '-s', a.serial]

def adb(*args, required=True):
    r = subprocess.run(base + list(args), capture_output=True, timeout=15)
    if required and r.returncode:
        raise RuntimeError(r.stderr.decode(errors='replace'))
    return r.stdout

def app(*args):
    return adb('exec-out', shlex.join(['run-as', pkg, *args]))

def identity():
    pid = adb('shell', 'pidof', pkg).decode().strip()
    stat = adb('shell', 'cat', '/proc/' + pid + '/stat').decode()
    return {'pid': int(pid), 'start_ticks': stat[stat.rindex(')') + 2:].split()[19]}

if a.action.startswith('arm-'):
    settings = {'pauseAt': a.action[-1], 'runId': str(uuid.uuid4())}
    encoded = base64.b64encode(json.dumps(settings).encode()).decode()
    app('rm', '-f', 'files/labs95-checkpoint.json')
    app('sh', '-c', 'echo ' + encoded + ' | base64 -d > files/labs95-test.json')
    print(json.dumps(settings))
elif a.action == 'exit':
    settings = json.loads(app('cat', 'files/labs95-test.json'))
    for _ in range(100):
        raw = app('sh', '-c', 'cat files/labs95-checkpoint.json 2>/dev/null || true')
        checkpoint = json.loads(raw) if raw else {}
        if (checkpoint.get('runId') == settings.get('runId') and settings.get('runId') and
                checkpoint.get('point') == settings.get('pauseAt')):
            break
        time.sleep(0.2)
    else:
        raise RuntimeError('Exact armed boundary was not reached; app was not terminated')
    path = urlparse(checkpoint['uri']).path
    if not path.startswith('/data/') or not path.endswith('.m4a'):
        raise RuntimeError('Unexpected checkpoint path; app was not terminated')
    data = app('cat', path)
    receipt = {'point': checkpoint['point'], 'runId': settings['runId'],
               'process_before_exit': identity(), 'uri': checkpoint['uri'],
               'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    print(json.dumps(receipt), flush=True)
    adb('shell', 'am', 'force-stop', pkg)
    if adb('shell', 'pidof', pkg, required=False).strip():
        raise RuntimeError('App process still exists')
    print('PROCESS_EXIT_CONFIRMED')
elif a.action == 'launch':
    adb('shell', 'am', 'force-stop', pkg)
    adb('shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity')
    print(json.dumps(identity()))
elif a.action == 'list':
    result = {}
    for path in app('sh', '-c', 'find files/recordings -type f -name "*.m4a" 2>/dev/null || true').decode().splitlines():
        data = app('cat', path)
        result[path] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    print(json.dumps(result, indent=2))
elif a.action == 'disarm':
    app('rm', '-f', 'files/labs95-test.json', 'files/labs95-checkpoint.json')
