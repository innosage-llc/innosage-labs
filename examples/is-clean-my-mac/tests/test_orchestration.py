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
                    patch('sys.argv', ['audit-all.py']), contextlib.redirect_stdout(output):
                orchestrator.main()
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
