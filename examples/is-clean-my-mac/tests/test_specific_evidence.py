"""Public-root collection, independent completeness and decision evidence."""
import json
import contextlib
import io
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from test_audit import adapter, load, SCRIPTS
plans=load('specific_plans',SCRIPTS/'approval-plan.py')
report=load('specific_report',SCRIPTS/'render-report.py')


def entry(path, size=4096, status='complete'):
    return dict(path=str(path), name='PRIVATE-DO-NOT-EMIT', size=size, is_dir=True, scan_status=status)


def document(entries, overview=False, status='complete'):
    return json.dumps(dict(overview=overview,total_size=sum(max(0,e['size']) for e in entries),entries=entries,scan_status=status))


class SpecificEvidenceTests(unittest.TestCase):
    def test_progressive_collection_public_roots_and_private_siblings(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve()
            for name in ('.codex/worktrees','.codex/sessions','.colima','Library/Android/sdk','private/secret'):
                (home/name).mkdir(parents=True)
            graph={home:[home/'.codex',home/'.colima',home/'Library',home/'private'],
                   home/'.codex':[home/'.codex/worktrees',home/'.codex/sessions'],
                   home/'Library':[home/'Library/Android'],home/'Library/Android':[home/'Library/Android/sdk']}
            calls=[]
            def capture(command,timeout,source):
                path=Path(command[-1]);calls.append(path)
                self.assertEqual(command[:3],['mo','analyze','--json'])
                self.assertLessEqual(timeout,30)
                return 0,document([entry(p) for p in graph.get(path,[])]),adapter.CaptureDiagnostics(False)
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture',side_effect=capture):
                detail=adapter.largest_entry_drilldowns(document([entry(home)],True),'1.72.0',time.monotonic()+120)
            self.assertNotIn(home/'.codex/sessions',calls);self.assertIn(home/'Library/Android/sdk',calls)
            self.assertNotIn(home/'private',calls);self.assertLessEqual(len(calls),7)
            self.assertIn('codex_sessions',json.dumps(detail));self.assertIn('android_sdk',json.dumps(detail))
            self.assertNotIn(str(home),json.dumps(detail));self.assertNotIn('PRIVATE',json.dumps(detail))

    def test_links_and_out_of_parent_injection_never_scanned(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve();(home/'private').mkdir();(home/'.codex').symlink_to(home/'private');(home/'.colima').mkdir()
            calls=[]
            def capture(command,*args):
                calls.append(command[-1]);return 0,document([entry(home/'.colima')]),adapter.CaptureDiagnostics(False)
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture',side_effect=capture):
                result=adapter.largest_entry_drilldowns(document([entry(home/'.codex'),entry(home/'.colima')],True),'1.72.0',time.monotonic()+10)
            self.assertEqual(calls,[str(home/'.colima')]);self.assertEqual(len(result),1)

    def test_complete_sibling_survives_unavailable_and_unknown_extension(self):
        with patch.object(Path,'home',return_value=Path('/synthetic')):
            raw=json.loads(document([entry('/synthetic/.codex/sessions'),entry('/synthetic/.colima',-1,'unavailable')],status='partial'))
            raw['entries'][1]['new_field']='PRIVATE'
            result=adapter.analyze(json.dumps(raw),False,'1.72.0')
        groups={g['category']:g for g in result['categories']}
        self.assertEqual(result['completeness'],'PARTIAL')
        self.assertEqual(groups['codex_sessions']['completeness'],'COMPLETE')
        self.assertEqual(groups['codex_sessions']['occupied_bytes'],4096)
        self.assertIsNone(groups['colima_data']['occupied_bytes'])
        self.assertEqual(groups['colima_data']['unknown_entries'],1)
        self.assertNotIn('PRIVATE',json.dumps(result))

    def test_deadline_has_no_command_and_bounded_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve()
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture') as call:
                result=adapter.largest_entry_drilldowns(document([entry(home)],True),'1.72.0',time.monotonic()-1)
            call.assert_not_called();self.assertEqual(result[0]['reason'],'command_timeout')

    def test_specific_routes_total_overlap_and_selection_stay_separate(self):
        groups=[dict(category=c,observed_bytes=n,measured_entries=1,completeness='COMPLETE') for c,n in [('home',999999),('codex_data',50000),('codex_sessions',16000),('codex_worktrees',24000),('colima_data',12000),('android_sdk',8000)]]
        data={'sources':[dict(source='mole-analyze',categories=groups,completeness='COMPLETE'),dict(source='mole-clean',completeness='PARTIAL',candidate_estimate_bytes=3000,categories=[dict(category='developer_caches',observed_candidate_estimate_bytes=2000,candidate_entries=1)])]}
        plan=plans.build_plan(data,now=1);text=report.render_summary(data,plan)
        self.assertIn('SDK Manager',text);self.assertIn('会话历史可能唯一',text)
        self.assertIn('3,000 B',text);self.assertIn('2,000 B',text)
        self.assertNotIn('999,999 B',text);self.assertNotIn('50,000 B',text)
        self.assertIn('| 3 |',text);self.assertIn('不能相加',text)
        self.assertEqual(plans.select(plan,[3],plan['plan_id'],now=2)['status'],'BLOCKED')
        self.assertTrue(all(not r['actionable'] for r in plan['rows']))

    def test_dominant_unknown_is_not_hidden_by_small_public_tool(self):
        data={'sources':[dict(source='mole-analyze',categories=[dict(category='other',observed_bytes=9000000,measured_entries=1,completeness='PARTIAL'),dict(category='codex_sessions',observed_bytes=4096,measured_entries=1,completeness='COMPLETE')])]}
        text=report.render_summary(data,plans.build_plan(data))
        self.assertIn('9,000,000 B',text)
        self.assertIn('证据 1',text)
        self.assertIn('未解释范围 Other',text)

    def test_colliding_private_tool_names_are_not_public_tool_evidence(self):
        with patch.object(Path,'home',return_value=Path('/synthetic')):
            for path in ('/private/.codex/sessions','/synthetic/private/.colima','/synthetic/private/Android/sdk'):
                self.assertEqual(adapter.category(path),'other')

    def test_budget_exhaustion_is_separate_from_complete_measurement(self):
        data={'sources':[dict(source='mole-analyze',completeness='COMPLETE',categories=[dict(category='codex_sessions',observed_bytes=4096,measured_entries=1,completeness='COMPLETE')],drilldowns=[dict(drilldown_budget_exhausted=True)])]}
        text=report.render_summary(data,plans.build_plan(data))
        self.assertIn('下钻覆盖 PARTIAL',text);self.assertIn('| COMPLETE |',text)

    def test_recognized_preview_does_not_retain_parse_failure_marker(self):
        value=adapter.parse('clean','Potential space: 12.00 MB\nDry run complete - no changes made',version='1.72.0')
        self.assertEqual(value['candidate_estimate_bytes'],12000000)
        self.assertEqual(value['presence'],'PRESENT')
        self.assertEqual(value['error_category'],value['reason'])
        self.assertNotEqual(value['error_category'],'unrecognized_output')

    def test_colima_symlink_probe_is_rejected_and_parent_total_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve();(home/'private').mkdir();(home/'.colima').symlink_to(home/'private')
            raw=document([entry(home,8192)],True)
            calls=[]
            def capture(command,*args):
                calls.append(command[-1]);return 0,document([]),adapter.CaptureDiagnostics(False)
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture',side_effect=capture):
                source=adapter.analyze(raw,False,'1.72.0')
                source['drilldowns']=adapter.largest_entry_drilldowns(raw,'1.72.0',time.monotonic()+10)
            self.assertEqual(calls,[str(home)]);self.assertEqual(source['occupied_bytes'],8192)

    def test_symlink_ancestor_blocks_android_target(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory).resolve();(home/'private/Android/sdk').mkdir(parents=True);(home/'Library').symlink_to(home/'private')
            with patch.object(Path,'home',return_value=home),patch.object(adapter,'guarded_capture') as call:
                details=adapter.largest_entry_drilldowns(document([entry(home/'Library/Android/sdk')],True),'1.72.0',time.monotonic()+10)
            call.assert_not_called();self.assertEqual(details,[])

    def test_analyze_preflight_consumes_same_total_deadline(self):
        elapsed=[0.0];limits=[]
        def capture(command,limit,*args):
            limits.append(limit);elapsed[0]+=2
            text='Mole version 1.72.0' if '--version' in command else '--json' if '--help' in command else document([])
            return 0,text,adapter.CaptureDiagnostics(False)
        with patch.object(adapter.time,'monotonic',side_effect=lambda:elapsed[0]),patch.object(adapter,'guarded_capture',side_effect=capture),patch('sys.argv',['audit-mole.py','--source','analyze','--timeout','5']),contextlib.redirect_stdout(io.StringIO()):
            adapter.main()
        self.assertEqual(limits,[5.0,3.0,1.0])
