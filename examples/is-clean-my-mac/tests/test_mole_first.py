"""Mole-first coverage, bounded drilldown, privacy and optional-mode regression."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS, adapter

runner=load('mole_first_runner',SCRIPTS/'audit-all.py')
plans=load('mole_first_plans',SCRIPTS/'approval-plan.py')
report=load('mole_first_report',SCRIPTS/'render-report.py')

class MoleFirstTests(unittest.TestCase):
    def test_default_runs_four_sources_without_census_or_precise_collection(self):
        calls=[]
        def run(command,**kwargs):
            script=Path(command[2]).name;calls.append(script)
            self.assertNotIn(script,('audit-file-types.py','precise-cache.py'))
            source='codex-worktree-inventory' if script=='audit-codex-worktrees.py' else 'mole-'+command[command.index('--source')+1]
            return subprocess.CompletedProcess(command,0,stdout=json.dumps(dict(source=source,completeness='PARTIAL',categories=[])).encode())
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(runner.subprocess,'run',side_effect=run),patch.object(runner.tempfile,'mkdtemp',return_value=directory),patch('sys.argv',['audit-all.py']),contextlib.redirect_stdout(io.StringIO()):runner.main()
            self.assertFalse((Path(directory)/'private-candidates.json').exists())
        self.assertEqual(len(calls),4)

    def test_official_categories_drilldown_and_unknown_workspace_inline(self):
        data={'sources':[dict(source='mole-analyze',completeness='PARTIAL',categories=[dict(category='home',observed_bytes=50000,measured_entries=1)],drilldowns=[dict(categories=[dict(category='movies',observed_bytes=30000,measured_entries=2)])]),dict(source='codex-worktree-inventory',completeness='PARTIAL',workspace_count=None,worktree_count=5,worktree_count_completeness='COMPLETE',observed_allocated_bytes=12345)]}
        plan=plans.build_plan(data);text=report.render_summary(data,plan)
        for value in ('50,000','30,000','12,345','视频目录','workspace UNKNOWN','worktree 5','不能相加'):self.assertIn(value,text)
        self.assertTrue(all(not row['actionable'] for row in plan['rows']))
        self.assertNotIn('Home 已测子集',text)
        self.assertNotIn('什么类型的文件占空间',report.render(data))

    def test_drilldown_uses_only_two_physical_allowed_entries_no_private_output(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve();(home/'Library').mkdir();(home/'PRIVATE').mkdir();(home/'alias').symlink_to(home/'Library')
            entries=[dict(path=str(p),name='PRIVATE',size=n,is_dir=True,scan_status='complete') for n,p in [(5,home),(4,home/'Library'),(3,home/'PRIVATE'),(2,home/'alias')]]
            raw=json.dumps(dict(overview=True,entries=entries))
            calls=[]
            def capture(command,timeout,source):
                calls.append(command);self.assertLessEqual(timeout,30)
                return 0,json.dumps(dict(overview=False,total_size=10,scan_status='complete',entries=[dict(path='/PRIVATE/Movies',name='PRIVATE',size=10,scan_status='complete')])),adapter.CaptureDiagnostics(False)
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture',side_effect=capture):
                result=adapter.largest_entry_drilldowns(raw,'1.72.0',time.monotonic()+90)
            self.assertEqual(len(calls),2);self.assertEqual([x[-1] for x in calls],[str(home),str(home/'Library')])
            self.assertNotIn('PRIVATE',json.dumps(result));self.assertNotIn(str(home),json.dumps(result))
            self.assertTrue(all(x['overlaps_parent'] for x in result))

    def test_drilldown_timeout_preserves_overview_and_is_not_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve()
            raw=json.dumps(dict(overview=True,entries=[dict(path=str(home),size=5,is_dir=True)]))
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture',side_effect=adapter.CaptureFailure('command_timeout',-9,adapter.CaptureDiagnostics(True,['command_timeout']))):
                result=adapter.largest_entry_drilldowns(raw,'1.72.0',time.monotonic()+5)
            self.assertEqual(result[0]['completeness'],'FAILED');self.assertIsNone(result[0]['occupied_bytes'])
            self.assertEqual(result[0]['diagnostic_categories'],['command_timeout'])

    def test_classifier_does_not_treat_arbitrary_names_as_public_labels(self):
        self.assertEqual(adapter.category('/PRIVATE/Movies/private-file'),'movies')
        self.assertEqual(adapter.category('/PRIVATE/unknown','PRIVATE'),'other')
        self.assertEqual(adapter.category('/PRIVATE/Library/Caches/item'),'caches')

    def test_unavailable_mole_category_never_becomes_zero(self):
        raw=json.dumps(dict(overview=True,total_size=0,scan_status='partial',entries=[dict(name='Home',path='/PRIVATE',size=-1,scan_status='unavailable')]))
        source=adapter.parse('analyze',raw,version='1.72.0')
        source['drilldowns']=[dict(categories=source['categories'])]
        data=dict(sources=[source]);plan=plans.build_plan(data)
        self.assertTrue(all(row['occupied_bytes'] is None and row['observed_count'] is None for row in plan['rows']))
        self.assertTrue(all(row['unknown_entries']==1 for row in plan['rows']))
        text=report.render_summary(data,plan)
        self.assertNotIn('0 B',text);self.assertIn('UNKNOWN',text)
        self.assertNotIn('| 0 B',report.render(data))

    def test_summary_only_preview_keeps_estimate_in_inline_row(self):
        data=dict(sources=[dict(source='mole-clean',completeness='PARTIAL',candidate_estimate_bytes=7140000000,categories=[])])
        plan=plans.build_plan(data);text=report.render_summary(data,plan)
        self.assertEqual(len(plan['rows']),1);self.assertFalse(plan['rows'][0]['actionable'])
        self.assertIn('7,140,000,000',text);self.assertIn('分类未知',text)
