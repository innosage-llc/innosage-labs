"""Public-root collection, independent completeness and decision evidence."""
import json
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
