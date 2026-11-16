"""Opt-in complete CLI fixture: only account-home resolver is simulated.

Production source/control flow, stdin consent, both worker processes, native
rename/unlink/ACL/lsof and receipt/free-space collection are unchanged. The
sitecustomize shim exists only in this disposable test folder; no OS account,
HOME environment, installed artifact or actual cache is changed. No Mole runs.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
import unittest
from test_audit import load,SCRIPTS

core=load('native_cli_core',SCRIPTS/'precise-cache.py')
plans=load('native_cli_plans',SCRIPTS/'approval-plan.py')


@unittest.skipUnless(platform.system()=='Darwin' and os.environ.get('IS_CLEAN_RUN_NATIVE_EXECUTION_FIXTURE')=='1','opt-in native CLI fixture only')
class NativeCliTests(unittest.TestCase):
    def fixture(self):
        temp=tempfile.TemporaryDirectory(prefix='precise-native-cli-',dir=Path(tempfile.gettempdir()).resolve())
        self.addCleanup(temp.cleanup)
        base=Path(temp.name).resolve();home=base/'fixture-home';home.mkdir(mode=0o700)
        (home/'Library/Application Support').mkdir(parents=True)
        cache=home.joinpath(*core.ROOTS['homebrew_bottle']);cache.mkdir(parents=True)
        for letter in ('a','b'):
            path=cache/(letter*64+'--PRIVATE-test.bottle.tar.gz');path.write_bytes(letter.encode()*8192)
            os.utime(path,(time.time()-8*86400,)*2)
        trash=home/'.Trash';trash.mkdir();(trash/'PRIVATE-keep').write_bytes(b'untouched')
        artifacts=base/'artifacts';artifacts.mkdir(mode=0o700)
        private,public=core.discover(home)
        self.assertEqual(len(private['objects']),2)
        raw=json.dumps(private,sort_keys=True,separators=(',',':')).encode()
        path=artifacts/'private-candidates.json';path.write_bytes(raw);path.chmod(0o600)
        public['manifest_digest']=hashlib.sha256(raw).hexdigest()
        plan=plans.build_plan(dict(sources=[]),precise=public)
        path=artifacts/'review-plan.json';path.write_text(json.dumps(plan));path.chmod(0o600)
        shim=base/'test-only-resolver';shim.mkdir(mode=0o700)
        code="import os,pwd\n_original=pwd.getpwuid\ndef _fixture(uid):\n value=list(_original(uid))\n if uid==os.getuid(): value[5]="+repr(str(home))+"\n return pwd.struct_passwd(value)\npwd.getpwuid=_fixture\n"
        (shim/'sitecustomize.py').write_text(code)
        env=dict(os.environ,PYTHONPATH=str(shim),PYTHONNOUSERSITE='1')
        by_id={value['candidate_id']:value for value in private['objects']}
        paths={row['row_id']:cache/by_id[row['scope_tokens'][0]]['parts'][-1] for row in plan['rows']}
        return home,path,plan,env,paths

    def apply(self,path,plan,env,rows):
        command=[sys.executable,'-B',str(SCRIPTS/'approval-plan.py'),'--plan',str(path),'--plan-id',plan['plan_id'],'--rows',*map(str,rows),'--apply']
        acknowledgement='APPLY '+plan['plan_id']+' '+','.join(map(str,sorted(rows)))+'\n'
        run=subprocess.run(command,input=acknowledgement,capture_output=True,text=True,env=env,timeout=45)
        self.assertEqual(run.returncode,0)
        self.assertNotIn('PRIVATE',run.stdout+run.stderr)
        self.assertFalse(run.stderr)
        return json.loads(run.stdout.splitlines()[-1])

    def test_real_cli_ack_workers_and_native_selected_file_removal(self):
        home,path,plan,env,paths=self.fixture()
        out=self.apply(path,plan,env,[1])
        self.assertEqual(out['status'],'SUCCEEDED')
        self.assertEqual(out['rows'][0]['row_id'],1)
        self.assertFalse(paths[1].exists());self.assertTrue(paths[2].exists())
        self.assertEqual((home/'.Trash/PRIVATE-keep').read_bytes(),b'untouched')
        self.assertIsNone(out['actual_freed_bytes'])
        self.assertGreater(out['removed_scope_allocated_bytes'],0)
        self.assertIsInstance(out['disk_free_before']['available_bytes'],int)
        self.assertIsInstance(out['disk_free_after']['available_bytes'],int)
        self.assertIn('statvfs',out['disk_free_after']['method'])
        repeated=self.apply(path,plan,env,[1])
        self.assertEqual(repeated['rows'][0]['status'],'BLOCKED')
        self.assertTrue(paths[2].exists())

    def test_real_cli_partial_busy_file_restored_without_touching_trash(self):
        home,path,plan,env,paths=self.fixture()
        holder=subprocess.Popen([sys.executable,'-B','-c','import sys,time;f=open(sys.argv[1],"rb");print("READY",flush=True);time.sleep(45)',str(paths[2])],stdout=subprocess.PIPE,text=True)
        self.addCleanup(lambda:holder.poll() is None and holder.kill())
        self.assertEqual(holder.stdout.readline().strip(),'READY')
        try:out=self.apply(path,plan,env,[1,2])
        finally:holder.terminate();holder.wait();holder.stdout.close()
        self.assertEqual(out['status'],'PARTIAL')
        self.assertFalse(paths[1].exists());self.assertTrue(paths[2].exists())
        self.assertEqual(out['rows'][1]['blocker'],'open_file_or_visibility_unknown')
        self.assertTrue(out['rows'][1]['restored'])
        self.assertEqual((home/'.Trash/PRIVATE-keep').read_bytes(),b'untouched')
