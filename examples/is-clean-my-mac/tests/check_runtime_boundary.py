#!/usr/bin/env python3
"""Opt-in macOS synthetic syscall/inheritance proof; never invokes Mole."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('adapter', BASE / '.agents/skills/is-clean-my-mac/scripts/audit-mole.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

with tempfile.TemporaryDirectory(prefix='mole-boundary-proof-') as temporary:
    root = Path(temporary).resolve()
    protected = root / 'protected'
    protected.mkdir()
    cache = protected / 'expired.cache'
    cache.write_bytes(b'synthetic-cache-preserve')
    home = root / 'home'
    preview = home / '.config/mole/clean-list.txt'
    preview.parent.mkdir(parents=True)
    code = '''import json,os,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]); preview=pathlib.Path(sys.argv[2]); result={}
for label,action in [('overwrite',lambda:(root/'expired.cache').write_bytes(b'changed')),('unlink',lambda:(root/'expired.cache').unlink()),('rename',lambda:(root/'expired.cache').rename(pathlib.Path.cwd()/'moved')),('create',lambda:(root/'created').write_text('changed')),('symlink_escape',lambda:(pathlib.Path.cwd()/'escape'/'created').write_text('changed')),('scratch',lambda:(pathlib.Path.cwd()/'scratch').write_text('allowed')),('preview',lambda:preview.write_text('synthetic-preview'))]:
 if label=='symlink_escape': (pathlib.Path.cwd()/'escape').symlink_to(root,target_is_directory=True)
 try: action(); result[label]='ALLOWED'
 except PermissionError: result[label]='DENIED'
child=subprocess.run(['/bin/bash','-c','echo changed > "$1/child"','sh',str(root)],capture_output=True)
result['child_denied']=child.returncode!=0
heredoc=subprocess.run(['/bin/bash','-c','cat <<EOF\\nsynthetic\\nEOF'],capture_output=True,text=True)
result['heredoc_private_fallback']=heredoc.returncode==0 and heredoc.stdout.strip()=='synthetic'
result['inherited_override_removed']='MO_ANALYZE_PATH' not in os.environ and 'BASH_ENV' not in os.environ
print(json.dumps(result))
'''
    reports = []
    for clean in (False, True):
        with patch.object(Path, 'home', return_value=home), patch.dict('os.environ', {'MO_ANALYZE_PATH': '/untrusted', 'BASH_ENV': '/untrusted'}):
            rc, text, stderr = adapter.guarded_capture([sys.executable, '-B', '-c', code, str(protected), str(preview)], 10, 'clean' if clean else None)
        if rc:
            raise SystemExit('Boundary proof did not initialize or complete; no Mole may run.')
        data = json.loads(text)
        expected = dict(overwrite='DENIED', unlink='DENIED', rename='DENIED', create='DENIED', symlink_escape='DENIED', scratch='ALLOWED', preview='ALLOWED' if clean else 'DENIED', child_denied=True, heredoc_private_fallback=True, inherited_override_removed=True)
        assert data == expected, 'Synthetic boundary assertion failed'
        assert cache.read_bytes() == b'synthetic-cache-preserve'
        assert sorted(p.name for p in protected.iterdir()) == ['expired.cache']
        reports.append(dict(mode='clean_preview_exception' if clean else 'scratch_only', **data, synthetic_cache_preserved=True))
    print(json.dumps(dict(proof='synthetic_only_no_Mole', reports=reports), sort_keys=True))
