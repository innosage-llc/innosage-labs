#!/usr/bin/env python3
"""Opt-in real official analyzer on disposable public-layout fixtures only.

Pass an existing inspected Mole bin directory. Does not install or invoke clean,
purge, or a host overview. HOME remains real; only local path classification uses
fixture Home. The same unchanged inner write/network boundary wraps every call.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]/'.agents/skills/is-clean-my-mac/scripts'
def load(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
adapter=load('audit-mole');plans=load('approval-plan');report=load('render-report')
if len(sys.argv)!=2:
    raise SystemExit('Usage: check_specific_collection.py INSPECTED_MOLE_BIN_DIRECTORY')
bin_dir=Path(sys.argv[1]).resolve(strict=True)
with tempfile.TemporaryDirectory(prefix='mole-specific-collection-') as directory:
    home=Path(directory).resolve()
    sizes={'.codex/worktrees':32768,'.codex/sessions':16384,'.colima':24576,'Library/Android/sdk':8192,'private-not-a-target':4096}
    for relative,size in sizes.items():
        root=home/relative;root.mkdir(parents=True,exist_ok=True);(root/'private-fixture-name').write_bytes(b'x'*size)
    before={str(p.relative_to(home)):hashlib.sha256(p.read_bytes()).hexdigest() for p in home.rglob('*') if p.is_file()}
    with patch.dict(os.environ,{'PATH':str(bin_dir)+os.pathsep+os.environ['PATH']}),patch.object(Path,'home',return_value=home):
        rc,raw,diagnostics=adapter.guarded_capture(['mo','analyze','--json',str(home)],30,'analyze')
        if rc:raise SystemExit('Guarded synthetic initial collection failed: '+str(rc))
        source=adapter.parse('analyze',raw,rc,diagnostics,'1.72.0')
        # Seed only the traversal root from actual measured output. All child
        # measurements/categories below come from real official analyze calls.
        seed=json.dumps(dict(overview=True,entries=[dict(path=str(home),is_dir=True,size=json.loads(raw)['total_size'])]))
        source['drilldowns']=adapter.largest_entry_drilldowns(seed,'1.72.0',time.monotonic()+120)
    after={str(p.relative_to(home)):hashlib.sha256(p.read_bytes()).hexdigest() for p in home.rglob('*') if p.is_file()}
    assert before==after,'Synthetic source changed'
    scopes={g['category'] for d in source['drilldowns'] for g in d.get('categories',[])}
    assert {'codex_worktrees','codex_sessions','colima_data','android_sdk'}<=scopes,scopes
    data={'sources':[source]};plan=plans.build_plan(data,now=0);text=report.render_summary(data,plan)
    encoded=json.dumps(data)
    assert str(home) not in encoded and 'private-fixture-name' not in encoded
    assert all(not row['actionable'] for row in plan['rows'])
    print(json.dumps(dict(proof='official_1.72_synthetic_collection_only',fixture_logical_bytes=sum(sizes.values()),source_files_unchanged=True,aggregate=data,summary_markdown=text),ensure_ascii=False))
