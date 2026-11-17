"""Synthetic independent regression values; never saved private observations."""
import contextlib
import io
import json
import subprocess
import unittest
from unittest.mock import patch
from test_audit import adapter, load, SCRIPTS
report=load('ledger_report',SCRIPTS/'render-report.py')
plans=load('ledger_plan',SCRIPTS/'approval-plan.py')
runner=load('ledger_runner',SCRIPTS/'audit-all.py')

class LedgerTests(unittest.TestCase):
    def fixture(self):
        groups=[dict(category=k,observed_bytes=n,measured_entries=1,completeness=c) for k,n,c in [('home',100000,'PARTIAL'),('other',90000,'PARTIAL'),('codex_sessions',12000,'COMPLETE'),('codex_worktrees',30000,'COMPLETE')]]
        return dict(sources=[dict(source='mole-analyze',occupied_bytes=150000,completeness='PARTIAL',categories=groups,drilldowns=[dict(scope_label='home',occupied_bytes=240000,completeness='PARTIAL',categories=[])]),dict(source='mole-clean',candidate_estimate_bytes=7000,completeness='PARTIAL',categories=[dict(category='developer_caches',observed_candidate_estimate_bytes=5000),dict(category='browser_caches',observed_candidate_estimate_bytes=2000)]),dict(source='mole-purge',completeness='FAILED',reason='command_failed',command_exit_code=1,diagnostic_categories=['operation_not_permitted']),dict(source='codex-worktree-inventory',completeness='PARTIAL',worktree_count=None,observed_worktree_count=3,worktree_count_completeness='PARTIAL',observed_allocated_bytes=4096,reasons=['scan_budget_exhausted','PRIVATE'])])

    def test_capacity_projection_discards_private_and_purgeable_fields(self):
        raw=json.dumps(dict(disks=[dict(mount='/',external=False,total=100000,used=40000,device='PRIVATE',purgeable=8000),dict(mount='/PRIVATE',external=True,total=999999,used=1)],processes=[dict(user='PRIVATE')],network=['PRIVATE']))
        result=adapter.parse('status',raw,version='1.72.0')
        self.assertEqual(result['free_bytes'],60000);self.assertEqual(result['total_bytes'],100000)
        self.assertNotIn('PRIVATE',json.dumps(result));self.assertNotIn('purgeable',result.keys())
        for disks in ([],[dict(mount='/',external=False,total=10,used=20)],[dict(mount='/',external=False,total=10,used=1)]*2):
            result=adapter.parse('status',json.dumps(dict(disks=disks)),version='1.72.0')
            self.assertEqual(result['completeness'],'FAILED');self.assertNotIn('free_bytes',result)
        self.assertEqual(adapter.parse('status',raw,version='1.54.0')['completeness'],'FAILED')

    def test_status_route_uses_same_guards_and_only_json(self):
        calls=[]
        def capture(cmd,budget,source=None):
            calls.append((cmd,source));text='Mole version 1.72.0' if '--version' in cmd else '--json' if '--help' in cmd else json.dumps(dict(disks=[dict(mount='/',external=False,total=20,used=5)],user='PRIVATE'))
            return 0,text,adapter.CaptureDiagnostics(False)
        output=io.StringIO()
        with patch.object(adapter,'guarded_capture',side_effect=capture),patch('sys.argv',['audit-mole.py','--source','status']),contextlib.redirect_stdout(output):adapter.main()
        value=json.loads(output.getvalue());self.assertEqual(value['free_bytes'],15)
        self.assertEqual(calls[-1],(['mo','status','--json'],'status'));self.assertEqual(value['allowed_host_writes'],[])
        self.assertNotIn('PRIVATE',output.getvalue())

    def test_ledger_contract_and_recommendations_do_not_drop_sessions_or_preview(self):
        data=self.fixture();plan=plans.build_plan(data);ledger=report.evidence_ledger(data,plan)
        required={'finding','source_command','measured_size','measurement_type','scan_completeness','cleanup_coverage','recovery_cost','overlap','contradictions','recommended_next_step','scope_id','parent_scope','observation_time_unix'}
        self.assertTrue(all(required<=set(r) for r in ledger))
        self.assertTrue(all(r['observation_time_unix'] is None and not r['executable_authorization'] for r in ledger))
        text=report.render_summary(data,plan);recommendations=text.split('## 编号建议')[1].split('## 覆盖与矛盾')[0]
        for item in ('Codex 会话记录','开发工具缓存','浏览器缓存'):self.assertIn(item,recommendations)
        self.assertNotIn('其他/未分类',recommendations);self.assertIn('90,000 B',text)
        self.assertIn('100,000 B',text);self.assertIn('240,000 B',text)
        self.assertIn('已观察数量 3',text);self.assertIn('worktree 精确数 UNKNOWN',text)
        self.assertIn('Git 安全检查',text);self.assertIn('各来源耗时之和不是',text)
        self.assertNotIn('PRIVATE',text);self.assertNotIn('PARTIAL 为已测下界',text)
        self.assertEqual(plans.select(plan,[3],plan['plan_id'])['status'],'BLOCKED')

    def test_shared_deadline_reserves_previews_and_measures_wall_time(self):
        clock=[0.0];calls=[]
        def run(cmd,**kwargs):
            name='codex-worktree-inventory' if 'audit-codex-worktrees.py' in cmd[2] else 'mole-'+cmd[cmd.index('--source')+1]
            calls.append((name,kwargs['timeout']))
            clock[0]+=kwargs['timeout']
            return subprocess.CompletedProcess(cmd,0,stdout=json.dumps(dict(source=name,completeness='PARTIAL')).encode())
        with patch.object(runner.time,'monotonic',side_effect=lambda:clock[0]),patch.object(runner.subprocess,'run',side_effect=run):result=runner.run_all(300,30)
        self.assertEqual([n for n,_ in calls],['mole-status','mole-analyze','codex-worktree-inventory','mole-clean','mole-purge'])
        self.assertEqual(sum(b for _,b in calls),300);self.assertEqual(result['total_duration_seconds'],300)
        self.assertGreaterEqual(dict(calls)['mole-clean'],130);self.assertGreaterEqual(dict(calls)['mole-purge'],30)
        with patch.object(runner.subprocess,'run') as run:result=runner.run_all(.1,.1)
        run.assert_not_called();self.assertEqual(len(result['sources']),5)
        self.assertTrue(all(s['reason']=='shared_budget_exhausted' for s in result['sources']))
