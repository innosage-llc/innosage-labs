import json
import contextlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS

orchestrator = load('audit_all', SCRIPTS / 'audit-all.py')


class OrchestrationTests(unittest.TestCase):
    def test_default_delivery_separates_concise_report_from_linked_evidence(self):
        data = dict(sources=[dict(source='mole-clean', completeness='PARTIAL',
            candidate_estimate_bytes=9000000, categories=[dict(category='developer_caches',
            observed_candidate_estimate_bytes=9000000)])])
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with patch.object(orchestrator, 'run_all', return_value=data), \
                    patch.object(orchestrator.tempfile, 'mkdtemp', return_value=directory), \
                    patch.object(orchestrator.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=json.dumps(dict(source='precise-cache-candidates', completeness='PARTIAL', candidates=[], reasons=[])).encode())) as candidate_run, \
                    patch('sys.argv', ['audit-all.py']), contextlib.redirect_stdout(output):
                orchestrator.main()
            self.assertEqual(candidate_run.call_count, 1)
            self.assertIn('--collect-to', candidate_run.call_args.args[0])
            self.assertLessEqual(candidate_run.call_args.kwargs['timeout'], 6)
            delivered = json.loads(output.getvalue())
            report = Path(delivered['report_path'])
            details = Path(delivered['details_path'])
            self.assertEqual(report.parent, details.parent)
            self.assertNotEqual(report, details)
            self.assertTrue(details.is_file())
            self.assertIn(details.name, report.read_text())
            self.assertIn(str(details), delivered['summary_markdown'])
            self.assertLess(len(report.read_text()), len(details.read_text()))
            self.assertNotIn('| 证据 ID |', report.read_text())
            self.assertIn('| 证据 ID |', details.read_text())
            self.assertTrue(Path(delivered['ledger_path']).is_file())
            self.assertTrue(Path(delivered['plan_path']).is_file())
            for evidence in delivered['artifact_verification'].values():
                self.assertTrue(evidence['local_readable'])
                self.assertFalse(evidence['client_link_opened'])
                self.assertEqual(len(evidence['sha256']), 64)
                self.assertEqual(evidence['retention'], 'temporary_not_guaranteed')

    def test_one_failed_source_does_not_skip_any_other_source(self):
        called = []
        def run(command, **kwargs):
            name = 'codex-worktree-inventory' if 'audit-codex-worktrees.py' in command[2] else 'mole-' + command[command.index('--source') + 1]
            called.append(name)
            if name == 'mole-clean':
                raise subprocess.TimeoutExpired(command, 1)
            return subprocess.CompletedProcess(command, 0, stdout=json.dumps(dict(source=name, completeness='PARTIAL', actual_freed_bytes=None)).encode())
        with patch.object(orchestrator, 'run_worker', side_effect=run):
            out = orchestrator.run_all(300, 30)
        self.assertEqual(called, ['mole-status', 'mole-analyze', 'codex-worktree-inventory', 'mole-clean', 'mole-purge'])
        self.assertEqual(len(out['sources']), 5)
        self.assertEqual(out['sources'][3]['completeness'], 'FAILED')
        self.assertIsNone(out['combined_reclaimable_bytes'])
        self.assertIsNone(out['actual_freed_bytes'])
        self.assertFalse(out['whole_worktrees_are_candidates'])

    def test_wrong_source_output_and_raw_stderr_never_forwarded(self):
        run = subprocess.CompletedProcess([], 1, stdout=b'PRIVATE arbitrary output', stderr=b'PRIVATE logs')
        with patch.object(orchestrator, 'run_worker', return_value=run):
            out = orchestrator.run_all(300, 30)
        self.assertEqual(len(out['sources']), 5)
        self.assertTrue(all(x['completeness'] == 'FAILED' for x in out['sources']))
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_artifact_verification_rejects_symlink_and_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'target'
            target.write_text('synthetic')
            link = Path(directory) / 'link'
            link.symlink_to(target)
            self.assertFalse(orchestrator.verify_artifact(link)['local_readable'])
            self.assertFalse(orchestrator.verify_artifact(Path(directory) / 'missing')['local_readable'])

    def test_default_candidate_budget_exhaustion_is_unknown_without_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with patch.object(orchestrator, 'run_all', return_value=dict(sources=[])), \
                    patch.object(orchestrator.time, 'monotonic', side_effect=[0, 301, 301]), \
                    patch.object(orchestrator.tempfile, 'mkdtemp', return_value=directory), \
                    patch.object(orchestrator.subprocess, 'run') as launch, \
                    patch('sys.argv', ['audit-all.py']), contextlib.redirect_stdout(output):
                orchestrator.main()
            launch.assert_not_called()
            plan = json.loads(Path(json.loads(output.getvalue())['plan_path']).read_text())
            self.assertFalse(any(row.get('actionable') for row in plan['rows']))
            self.assertIn('precise_candidate_shared_budget_exhausted', json.dumps(plan))

    def test_failed_artifact_verification_never_claims_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with patch.object(orchestrator, 'run_all', return_value=dict(sources=[])), \
                    patch.object(orchestrator.time, 'monotonic', side_effect=[0, 301, 301]), \
                    patch.object(orchestrator.tempfile, 'mkdtemp', return_value=directory), \
                    patch.object(orchestrator, 'verify_artifact', return_value=dict(local_readable=False, client_link_opened=False)), \
                    patch('sys.argv', ['audit-all.py']), contextlib.redirect_stdout(output):
                orchestrator.main()
            delivered = json.loads(output.getvalue())
            self.assertNotIn('已在本机写出并检查可读', delivered['summary_markdown'])
            self.assertIn('可读性检查失败', delivered['summary_markdown'])
            self.assertTrue(all(not item['local_readable'] for item in delivered['artifact_verification'].values()))
