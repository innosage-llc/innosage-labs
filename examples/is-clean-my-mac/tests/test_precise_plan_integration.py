"""Real selected-file pipeline on disposable fixture HOME only; no host scans."""
import hashlib
import json
import os
from pathlib import Path
import platform
from types import SimpleNamespace
import tempfile
import time
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS

core = load('plan_integration_core', SCRIPTS/'precise-cache.py')
plans = load('plan_integration_approvals', SCRIPTS/'approval-plan.py')


@unittest.skipUnless(platform.system()=='Darwin', 'native exact-file executor is macOS only')
class PrecisePlanIntegrationTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory(prefix='precise-plan-test-',dir=Path(tempfile.gettempdir()).resolve())
        self.addCleanup(temporary.cleanup)
        self.base=Path(temporary.name).resolve()
        self.home=self.base/'fixture-home';self.home.mkdir(mode=0o700)
        (self.home/'Library/Application Support').mkdir(parents=True)
        self.cache=self.home.joinpath(*core.ROOTS['homebrew_bottle']);self.cache.mkdir(parents=True)
        self.targets=[]
        old=time.time()-core.MIN_AGE-3600
        for index in range(2):
            path=self.cache/(('a' if index==0 else 'b')*64+'--PRIVATE-package--1.arm64.bottle.tar.gz')
            path.write_bytes(bytes([65+index])*(8192*(index+1)))
            os.utime(path,(old,old));self.targets.append(path)
        trash=self.home/'.Trash';trash.mkdir();self.trash=trash/'PRIVATE-unselected';self.trash.write_bytes(b'keep')
        self.artifacts=self.base/'artifacts';self.artifacts.mkdir(mode=0o700)
        private,summary=core.discover(self.home)
        self.private=private
        raw=json.dumps(private,sort_keys=True,separators=(',',':')).encode()
        self.private_path=self.artifacts/'private-candidates.json'
        self.private_path.write_bytes(raw);self.private_path.chmod(0o600)
        summary['manifest_digest']=hashlib.sha256(raw).hexdigest()
        self.data=dict(sources=[dict(source='mole-clean',completeness='PARTIAL',categories=[
            dict(category='developer_caches',observed_candidate_estimate_bytes=500000,candidate_entries=3)]),
            dict(source='codex-worktree-inventory',completeness='PARTIAL',occupied_bytes=None,worktree_count=4)])
        self.plan=plans.build_plan(self.data,precise=summary)
        self.plan_path=self.artifacts/'review-plan.json'
        self.publish()

    def publish(self):
        self.plan_path.write_text(json.dumps(self.plan,sort_keys=True))
        self.plan_path.chmod(0o600)

    def request(self,rows,apply=False,executor=None):
        args=SimpleNamespace(plan=self.plan_path,plan_id=self.plan['plan_id'],rows=rows,apply=apply)
        # Calling the apply API here represents explicit fixture-owner consent.
        # No CLI acknowledgement bypass or host HOME substitution is shipped.
        return plans.process_request(args,executor=executor or core,home=self.home,probe=lambda path,fd:'CLEAR')

    def target_for(self,row):
        token=self.plan['rows'][row-1]['scope_tokens'][0]
        item=next(value for value in self.private['objects'] if value['candidate_id']==token)
        return self.cache/item['parts'][-1],item

    def test_build_plan_exposes_only_bound_precise_rows_as_actionable(self):
        self.assertTrue(plans.valid_plan(self.plan))
        precise=[row for row in self.plan['rows'] if row['source']=='precise-cache']
        self.assertEqual(len(precise),2)
        self.assertTrue(all(row['exact_scope'] and row['actionable'] and row['operation']==core.OPERATION for row in precise))
        self.assertTrue(all(not row['actionable'] for row in self.plan['rows'][2:]))
        self.assertNotIn('PRIVATE',json.dumps(self.plan))
        self.assertNotIn(str(self.home),json.dumps(self.plan))

    def test_dry_run_revalidates_without_calling_executor_or_creating_state(self):
        with patch.object(core,'execute',side_effect=AssertionError('preview may not execute')):
            result=self.request([1])
        self.assertEqual(result['status'],'READY')
        self.assertEqual(result['mode'],'PREVIEW_ONLY')
        self.assertEqual(result['rows'][0]['status'],'ELIGIBLE')
        self.assertTrue(all(path.exists() for path in self.targets))
        self.assertFalse((self.home/'Library/Application Support/is-clean-my-mac-recovery').exists())

    def test_explicit_selected_apply_preserves_other_file_and_trash_and_persists_row_map(self):
        target,item=self.target_for(1);other,_=self.target_for(2)
        result=self.request([1],apply=True)
        self.assertEqual(result['status'],'SUCCEEDED')
        self.assertEqual(result['rows'][0]['row_id'],1)
        self.assertEqual(result['rows'][0]['status'],'SUCCEEDED')
        self.assertFalse(target.exists());self.assertTrue(other.exists())
        self.assertEqual(self.trash.read_bytes(),b'keep')
        state=self.home/'Library/Application Support/is-clean-my-mac-recovery'/self.plan['plan_id']
        receipt=json.loads((state/'manifest.json').read_bytes())
        self.assertEqual(receipt['row_map'],{item['candidate_id']:1})
        self.assertEqual([value['candidate_id'] for value in receipt['objects']],[item['candidate_id']])

    def test_private_manifest_hash_tamper_blocks_before_execution(self):
        self.private_path.write_bytes(self.private_path.read_bytes()+b' ')
        with patch.object(core,'execute',side_effect=AssertionError('tampered manifest may not execute')):
            result=self.request([1],apply=True)
        self.assertEqual(result['rows'][0]['status'],'BLOCKED')
        self.assertEqual(result['rows'][0]['blocker'],'private_manifest_unavailable_or_changed')
        self.assertTrue(all(path.exists() for path in self.targets))

    def test_second_row_dispatch_uses_second_token_and_receipt_owner_mapping(self):
        selected,item=self.target_for(2);unselected,_=self.target_for(1)
        result=self.request([2],apply=True)
        self.assertEqual([(row['row_id'],row['status']) for row in result['rows']],[(2,'SUCCEEDED')])
        self.assertFalse(selected.exists());self.assertTrue(unselected.exists())
        state=self.home/'Library/Application Support/is-clean-my-mac-recovery'/self.plan['plan_id']
        receipt=json.loads((state/'manifest.json').read_bytes())
        self.assertEqual(receipt['row_map'],{item['candidate_id']:2})

    def test_shared_private_manifest_is_not_used_for_execution(self):
        self.private_path.chmod(0o644)
        with patch.object(core,'execute',side_effect=AssertionError('shared manifest may not execute')):
            result=self.request([1],apply=True)
        self.assertEqual(result['rows'][0]['blocker'],'private_manifest_unavailable_or_changed')
        self.assertTrue(all(path.exists() for path in self.targets))

    def test_unknown_duplicate_empty_or_expired_approval_never_dispatches(self):
        with patch.object(core,'execute',side_effect=AssertionError('invalid approval may not execute')):
            for selected in ([999],[1,1],[]):
                self.assertEqual(self.request(selected,apply=True)['blocker'],'unknown_duplicate_or_empty_selection')
            self.plan['created_at']=time.time()-plans.MAX_AGE_SECONDS-1
            self.plan['plan_id']=plans.plan_digest(self.plan);self.publish()
            self.assertEqual(self.request([1],apply=True)['blocker'],'plan_expired_or_clock_changed')
        self.assertTrue(all(path.exists() for path in self.targets))

    def test_public_row_binding_cannot_redirect_private_candidate(self):
        self.plan['rows'][0]['scope_tokens']=list(self.plan['rows'][1]['scope_tokens'])
        self.plan['plan_id']=plans.plan_digest(self.plan);self.publish()
        result=self.request([1],apply=True)
        self.assertEqual(result['rows'][0]['status'],'BLOCKED')
        self.assertTrue(all(path.exists() for path in self.targets))

    def test_changed_plan_without_updated_identity_is_rejected(self):
        self.plan['rows'][0]['candidate_estimate_bytes']+=1;self.publish()
        result=self.request([1],apply=True)
        self.assertEqual(result['blocker'],'plan_identity_or_integrity_mismatch')
        self.assertTrue(all(path.exists() for path in self.targets))

    def test_plan_to_apply_target_drift_blocks_without_capture(self):
        target,_=self.target_for(1);target.write_bytes(b'changed-after-preview')
        result=self.request([1],apply=True)
        self.assertEqual(result['rows'][0]['status'],'BLOCKED')
        self.assertEqual(result['rows'][0]['blocker'],'candidate_identity_or_metadata_changed')
        self.assertEqual(target.read_bytes(),b'changed-after-preview')
        self.assertFalse((self.home/'Library/Application Support/is-clean-my-mac-recovery').exists())

    def test_mixed_approved_precise_and_blocked_aggregate_never_broadens(self):
        target,_=self.target_for(1);other,_=self.target_for(2)
        result=self.request([1,3],apply=True)
        self.assertEqual(result['status'],'PARTIAL')
        rows={row['row_id']:row for row in result['rows']}
        self.assertEqual(rows[1]['status'],'SUCCEEDED')
        self.assertEqual(rows[3]['status'],'BLOCKED')
        self.assertEqual(rows[3]['blocker'],'official_selected_scope_api_unavailable')
        self.assertFalse(target.exists());self.assertTrue(other.exists())
        self.assertEqual(self.trash.read_bytes(),b'keep')

    def test_removed_scope_bytes_and_free_drift_are_never_actual_release(self):
        _,item=self.target_for(1)
        observations=[dict(available_bytes=100000,method='fixture-statvfs'),dict(available_bytes=99000,method='fixture-statvfs')]
        with patch.object(plans,'disk_free_snapshot',side_effect=observations):
            result=self.request([1],apply=True)
        self.assertEqual(result['removed_scope_allocated_bytes'],item['allocated_bytes'])
        self.assertEqual(result['disk_free_change_bytes'],-1000)
        self.assertIsNone(result['actual_freed_bytes'])
        self.assertTrue(all(row['actual_freed_bytes'] is None for row in result['rows']))
        self.assertIn('不能当作',result['summary_markdown'])

    def test_repeated_apply_never_reexecutes_or_touches_unselected(self):
        self.assertEqual(self.request([1],apply=True)['status'],'SUCCEEDED')
        with patch.object(core,'execute',side_effect=AssertionError('stale target may not execute')):
            repeated=self.request([1],apply=True)
        self.assertEqual(repeated['rows'][0]['status'],'BLOCKED')
        other,_=self.target_for(2);self.assertTrue(other.exists())
        self.assertEqual(self.trash.read_bytes(),b'keep')

    def test_result_and_summary_redact_paths_and_private_names(self):
        for apply in (False,True):
            result=self.request([1],apply=apply)
            text=json.dumps(result)
            self.assertNotIn('PRIVATE',text)
            self.assertNotIn(str(self.home),text)
            self.assertNotIn('private-candidates.json',text)
            self.assertIsNone(result['actual_freed_bytes'])

    def test_audit_publication_keeps_exact_objects_only_in_private_human_artifact(self):
        import contextlib
        import io
        import subprocess
        runner=load('precise_publication_runner',SCRIPTS/'audit-all.py')
        private,summary=core.discover(self.home)
        raw=json.dumps(private,sort_keys=True,separators=(',',':')).encode()
        self.private_path.write_bytes(raw)
        summary['manifest_digest']=hashlib.sha256(raw).hexdigest()
        def collect(command,**kwargs):
            self.assertEqual(Path(command[2]).name,'precise-cache.py')
            self.assertEqual(Path(command[-1]),self.private_path)
            return subprocess.CompletedProcess(command,0,stdout=json.dumps(summary).encode())
        self.plan_path.unlink() # runner publishes a new exclusive plan in this owned fixture
        stdout=io.StringIO()
        with patch.object(runner,'run_all',return_value=self.data),patch.object(runner.subprocess,'run',side_effect=collect),patch.object(runner.tempfile,'mkdtemp',return_value=str(self.artifacts)),patch('sys.argv',['audit-all.py']),contextlib.redirect_stdout(stdout):
            runner.main()
        result=json.loads(stdout.getvalue())
        public=stdout.getvalue()+Path(result['report_path']).read_text()+Path(result['plan_path']).read_text()+Path(result['aggregate_path']).read_text()
        self.assertNotIn('PRIVATE',public)
        self.assertNotIn(str(self.home),public)
        self.assertIn('可执行',result['summary_markdown'])
        details=self.artifacts/'private-objects.zh.md'
        self.assertEqual(details.stat().st_mode & 0o777,0o600)
        self.assertIn('PRIVATE',details.read_text())
        self.assertIn('dev/inode',details.read_text())
        self.assertTrue(all(path.exists() for path in self.targets))
        self.assertEqual(self.trash.read_bytes(),b'keep')
