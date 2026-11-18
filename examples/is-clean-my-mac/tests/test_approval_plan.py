import copy
import json
import unittest
from test_audit import load, SCRIPTS

approvals = load('approvals', SCRIPTS / 'approval-plan.py')
select = approvals.select

def dispatch_fixture(plan, selected, expected_plan_id, current_scope_digests, executor, now=None):
    """Synthetic contract harness ONLY. Not called by CLI or production audit.

    An official selected-scope adapter must be delivered/reviewed separately.
    Never invoke Mole/private functions/config rewrites through this test hook.
    """
    selection = select(plan, selected, expected_plan_id, current_scope_digests,
                       capabilities=frozenset({'synthetic_fixture_only'}), now=now)
    if selection['status'] != 'READY':
        return selection
    rows = {row['row_id']:row for row in plan['rows']}
    for result in selection['rows']:
        try:
            measured = executor(rows[result['row_id']])
            before, after = measured['scope_before_bytes'], measured['scope_after_bytes']
            if type(before) is not int or type(after) is not int or min(before,after)<0:
                raise ValueError('invalid measurement')
            result.update(status='SUCCEEDED', measured_scope_change_bytes=before-after,
                          actual_freed_bytes=None, attribution='scope measurement; not filesystem free-space attribution')
        except Exception:
            result.update(status='FAILED', blocker='fixture_execution_failed_no_retry', actual_freed_bytes=None)
    selection['status'] = 'SUCCEEDED' if all(r['status']=='SUCCEEDED' for r in selection['rows']) else 'PARTIAL'
    return selection


class ApprovalTests(unittest.TestCase):
    def fixture(self):
        rows=[]
        for index,token in enumerate(('cache-A','build-B','unselected-Trash'),1):
            rows.append(dict(row_id=index,source='synthetic',category='fixture',operation='synthetic_fixture_only',
                exact_scope=True,actionable=True,blocker=None,scope_tokens=[token],scope_digest=token+'-v1'))
        plan=dict(created_at=1000,expires_after_seconds=600,rows=rows)
        plan['plan_id']=approvals.plan_digest(plan)
        return plan

    def test_owner_selection_executes_only_selected_fixture_scopes_never_unselected_trash(self):
        plan=self.fixture(); called=[]
        def execute(row):
            called.extend(row['scope_tokens'])
            return dict(scope_before_bytes=8192,scope_after_bytes=0)
        result=dispatch_fixture(plan,[1,2],plan['plan_id'],{1:'cache-A-v1',2:'build-B-v1'},execute,now=1001)
        self.assertEqual(called,['cache-A','build-B'])
        self.assertEqual(result['status'],'SUCCEEDED')
        self.assertTrue(all(r['measured_scope_change_bytes']==8192 for r in result['rows']))
        self.assertTrue(all(r['actual_freed_bytes'] is None for r in result['rows']))

    def test_changed_preview_membership_blocks_before_any_execution(self):
        plan=self.fixture();called=[]
        result=dispatch_fixture(plan,[1],plan['plan_id'],{1:'cache-A-v2'},called.append,now=1001)
        self.assertEqual(called,[])
        self.assertEqual(result['rows'][0]['blocker'],'preview_membership_or_identity_changed')

    def test_overlap_with_unselected_row_blocks_instead_of_broadening(self):
        plan=self.fixture();plan['rows'][2]['scope_tokens']=['cache-A'];plan['plan_id']=approvals.plan_digest(plan)
        result=dispatch_fixture(plan,[1],plan['plan_id'],{1:'cache-A-v1'},lambda r:None,now=1001)
        self.assertEqual(result['rows'][0]['blocker'],'overlapping_rows_require_new_disjoint_plan')

    def test_expired_wrong_unknown_and_duplicate_selection_never_execute(self):
        plan=self.fixture()
        for ids,identity,now in (([1],'old-plan',1001),([1],plan['plan_id'],2000),([9],plan['plan_id'],1001),([1,1],plan['plan_id'],1001)):
            self.assertEqual(approvals.select(plan,ids,identity,now=now)['status'],'BLOCKED')

    def test_partial_failure_reports_no_retry_and_keeps_unselected_untouched(self):
        plan=self.fixture();called=[]
        def execute(row):
            called.append(row['row_id'])
            if row['row_id']==2: raise ValueError('synthetic failure')
            return dict(scope_before_bytes=4096,scope_after_bytes=0)
        result=dispatch_fixture(plan,[1,2],plan['plan_id'],{1:'cache-A-v1',2:'build-B-v1'},execute,now=1001)
        self.assertEqual(called,[1,2]);self.assertEqual(result['status'],'PARTIAL')
        self.assertEqual(result['rows'][1]['blocker'],'fixture_execution_failed_no_retry')

    def test_real_mole_aggregates_have_no_executor_and_no_approval_bypass(self):
        plan=approvals.build_plan(dict(sources=[dict(source='mole-clean',categories=[dict(category='developer_caches',observed_candidate_estimate_bytes=7000)])]),now=1000)
        result=approvals.select(plan,[1],plan['plan_id'],now=1001)
        self.assertEqual(result['status'],'BLOCKED')
        self.assertEqual(result['rows'][0]['blocker'],'official_selected_scope_api_unavailable')
        hypothetical=self.fixture()
        result=approvals.select(hypothetical,[1],hypothetical['plan_id'],{1:'cache-A-v1'},now=1001)
        self.assertEqual(result['rows'][0]['blocker'],'verified_operation_unavailable')

    def test_integrity_change_and_whole_worktree_are_protected(self):
        plan=approvals.build_plan(dict(sources=[dict(source='codex-worktree-inventory',occupied_bytes=8192)]),now=1000)
        result=approvals.select(plan,[1],plan['plan_id'],now=1001)
        self.assertEqual(result['rows'][0]['blocker'],'whole_worktree_protected')
        plan['rows'][0]['blocker']=None
        self.assertEqual(approvals.select(plan,[1],plan['plan_id'],now=1001)['blocker'],'plan_identity_or_integrity_mismatch')

    def test_disk_free_observation_is_not_cleanup_attribution(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with patch.object(approvals.os,'statvfs',return_value=SimpleNamespace(f_bavail=123,f_frsize=4096)):
            value=approvals.disk_free_snapshot('/')
        self.assertEqual(value['available_bytes'],123*4096)
        self.assertEqual(value['method'],'statvfs f_bavail*f_frsize')

    def test_malformed_shapes_are_fixed_blockers_not_tracebacks(self):
        for value in ([],{},None,dict(rows=[[]]),dict(rows=[{'row_id':[]}])):
            self.assertEqual(approvals.select(value,[1],'unknown',now=1001)['blocker'],'plan_read_or_format_failed')
        for mutate in (lambda p:p.update(created_at=float('nan')),
                       lambda p:p['rows'][0].update(scope_tokens=[{}]),
                       lambda p:p['rows'][0].update(blocker={}),
                       lambda p:p['rows'].append(dict(p['rows'][0]))):
            plan=self.fixture();mutate(plan)
            self.assertEqual(approvals.select(plan,[1],plan['plan_id'],now=1001)['blocker'],'plan_read_or_format_failed')

    def test_cli_invalid_plan_shape_returns_fixed_json(self):
        import contextlib,io,tempfile
        from pathlib import Path
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'plan.json';path.write_text('[]')
            output=io.StringIO()
            with patch('sys.argv',['approval-plan.py','--plan',str(path),'--plan-id','x','--rows','1']),patch.object(approvals,'disk_free_snapshot',return_value=dict(available_bytes=None)),contextlib.redirect_stdout(output):
                approvals.main()
            result=json.loads(output.getvalue())
            self.assertEqual(result['status'],'BLOCKED')
            self.assertEqual(result['blocker'],'plan_read_or_format_failed')
            self.assertIsNone(result['actual_freed_bytes'])
            self.assertNotIn('Traceback',output.getvalue())

    def test_oversized_timestamp_is_format_blocker(self):
        plan=self.fixture();plan['created_at']=10**400
        self.assertEqual(approvals.select(plan,[1],plan['plan_id'],now=1001)['blocker'],'plan_read_or_format_failed')
        plan=self.fixture()
        self.assertEqual(approvals.select(plan,[1],plan['plan_id'],now=10**400)['blocker'],'plan_expired_or_clock_changed')

    def test_known_preview_count_survives_plan_binding(self):
        plan=approvals.build_plan(dict(sources=[dict(source='mole-clean',categories=[dict(category='developer_caches',candidate_entries=2)])]),now=1000)
        self.assertEqual(plan['rows'][0]['observed_count'],2)

    def test_synthetic_filesystem_scope_measurement_preserves_unselected_trash(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as temporary:
            files={token:Path(temporary)/token for token in ('cache-A','build-B','unselected-Trash')}
            for path in files.values(): path.write_bytes(b'x'*8192)
            plan=self.fixture()
            def fixture_only(row):
                path=files[row['scope_tokens'][0]]
                before=path.stat().st_blocks*512
                path.write_bytes(b'') # only test-owned synthetic target, no production executor
                return dict(scope_before_bytes=before,scope_after_bytes=path.stat().st_blocks*512)
            result=dispatch_fixture(plan,[1],plan['plan_id'],{1:'cache-A-v1'},fixture_only,now=1001)
            self.assertEqual(result['status'],'SUCCEEDED')
            self.assertEqual(files['cache-A'].stat().st_size,0)
            self.assertEqual(files['build-B'].stat().st_size,8192)
            self.assertEqual(files['unselected-Trash'].stat().st_size,8192)
            self.assertGreaterEqual(result['rows'][0]['measured_scope_change_bytes'],0)
            self.assertIsNone(result['rows'][0]['actual_freed_bytes'])
