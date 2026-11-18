"""Synthetic subprocesses/mocks only; never invoke installed Mole or host audits."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / '.agents/skills/is-clean-my-mac/scripts/audit-mole.py'
spec = importlib.util.spec_from_file_location('diagnostic_adapter', SCRIPT)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class PurgeDiagnosticsTests(unittest.TestCase):
    def run_main(self, results, source='analyze'):
        with patch.object(adapter, 'guarded_capture', side_effect=results), \
                patch('sys.argv', ['audit-mole.py', '--source', source]), \
                patch('builtins.print') as output:
            status = adapter.main()
        return status, json.loads(output.call_args.args[0])

    def test_capture_retains_tuple_and_boolean_contract(self):
        rc, raw, diagnostics = adapter.capture([sys.executable, '-B', '-c',
            'import sys;print("synthetic");sys.stderr.write("Permission denied: PRIVATE_PATH");sys.exit(7)'], 5)
        self.assertEqual(rc, 7)
        self.assertEqual(raw, 'synthetic\n')
        self.assertTrue(diagnostics)
        self.assertEqual(diagnostics, True)
        self.assertEqual(diagnostics.categories, ('permission_denied',))
        self.assertNotIn('PRIVATE', repr(diagnostics.categories))

    def test_stdout_incomplete_marker_does_not_invent_stderr(self):
        diagnostics = adapter.diagnostic_markers(b'Dry run incomplete - no changes made', b'', 1)
        self.assertFalse(diagnostics)
        self.assertEqual(diagnostics.categories, ('upstream_preview_incomplete',))

    def test_invalid_utf8_preserves_exit_stderr_markers_and_main_stage(self):
        with self.assertRaises(adapter.CaptureFailure) as raised:
            adapter.capture([sys.executable, '-B', '-c',
                'import sys;sys.stdout.buffer.write(b"PRIVATE\\xff");'
                'sys.stderr.write("Permission denied: PRIVATE_PATH");sys.exit(7)'], 5)
        error = raised.exception
        self.assertEqual(error.args, ('output_encoding_invalid',))
        self.assertEqual(error.returncode, 7)
        self.assertTrue(error.diagnostics)
        self.assertEqual(error.diagnostics.categories, ('permission_denied',))
        status, out = self.run_main([(0, 'Mole version 1.72.0', False),
                                    (0, '--dry-run --json', False), error])
        self.assertEqual(status, 2)
        self.assertEqual(out['reason'], 'output_encoding_invalid')
        self.assertEqual(out['command_stage'], 'audit')
        self.assertEqual(out['command_exit_code'], 7)
        self.assertTrue(out['stderr_present'])
        self.assertEqual(out['diagnostic_categories'], ['permission_denied'])
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_unclassified_exit_does_not_guess_cause(self):
        diagnostics = adapter.diagnostic_markers(b'PRIVATE_PATH', b'PRIVATE_ERROR', 3)
        self.assertEqual(diagnostics.categories, ('unclassified_nonzero_exit',))

    def test_version_failure_stage_and_code_survive(self):
        status, out = self.run_main([(71, '', adapter.CaptureDiagnostics(True, ('permission_denied',)))])
        self.assertEqual(status, 2)
        self.assertEqual(out['command_stage'], 'version')
        self.assertEqual(out['command_exit_code'], 71)
        self.assertEqual(out['reason'], 'guarded_version_command_failed')
        self.assertEqual(out['diagnostic_categories'], ['permission_denied'])

    def test_help_failure_is_distinct_from_audit(self):
        status, out = self.run_main([(0, 'Mole version 1.72.0', False),
                                    (2, 'PRIVATE_PATH', True)])
        self.assertEqual(status, 2)
        self.assertEqual(out['command_stage'], 'help')
        self.assertEqual(out['command_exit_code'], 2)
        self.assertEqual(out['reason'], 'installed_help_incompatible')
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_source_failure_reports_only_fixed_diagnostics(self):
        markers = adapter.diagnostic_markers(b'PRIVATE_PATH',
            b'PRIVATE_PATH: Operation not permitted\nSome artifacts were skipped', 1)
        status, out = self.run_main([(0, 'Mole version 1.72.0', False),
                                    (0, '--dry-run --json', False), (1, 'PRIVATE_PATH', markers)])
        self.assertEqual(status, 2)
        self.assertEqual(out['command_stage'], 'audit')
        self.assertEqual(out['command_exit_code'], 1)
        self.assertEqual(out['diagnostic_categories'], ['operation_not_permitted', 'artifacts_skipped'])
        self.assertEqual(out['diagnostic_semantics'], 'observed_patterns_not_root_cause')
        self.assertIsNone(out['actual_freed_bytes'])
        self.assertIsNone(out['candidate_estimate_bytes'])
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_clean_command_failure_not_replaced_by_preview_readback(self):
        with patch.object(adapter, 'physical_file', side_effect=AssertionError('must not read ledger')):
            status, out = self.run_main([(0, 'Mole version 1.72.0', False),
                                        (0, '--dry-run --json', False), (9, '', True)], 'clean')
        self.assertEqual(status, 2)
        self.assertEqual(out['reason'], 'command_failed')
        self.assertEqual(out['command_stage'], 'audit')
        self.assertEqual(out['command_exit_code'], 9)

    def test_sandbox_initialization_failure_retains_exit_and_marker(self):
        error = adapter.CaptureFailure('runtime_sandbox_initialization_denied', 71,
            adapter.CaptureDiagnostics(True, ('sandbox_initialization_denied', 'operation_not_permitted')))
        status, out = self.run_main([error])
        self.assertEqual(status, 2)
        self.assertEqual(out['command_stage'], 'version')
        self.assertEqual(out['command_exit_code'], 71)
        self.assertIn('sandbox_initialization_denied', out['diagnostic_categories'])

    def test_timeout_stage_is_preserved(self):
        status, out = self.run_main([(0, 'Mole version 1.72.0', False),
            (0, '--dry-run --json', False), adapter.CaptureFailure('command_timeout', -9,
                adapter.CaptureDiagnostics(False, ('command_timeout',)))])
        self.assertEqual(status, 2)
        self.assertEqual(out['command_stage'], 'audit')
        self.assertEqual(out['command_exit_code'], -9)
        self.assertEqual(out['diagnostic_categories'], ['command_timeout'])

    def test_172_exact_empty_observation_is_partial_not_exact_zero(self):
        # Official V1.72.0 lib/clean/project.sh lines2681,2822,3315;
        # bin/purge.sh lines221-224 returns before its summary for no_candidates.
        messages = ['\x1b[0;32m✓\x1b[0m No old project artifacts to clean',
                    'No eligible project artifacts to purge', 'No artifacts found to purge']
        for message in messages:
            out = adapter.parse('purge', '\n' + message + '\n', version='1.72.0')
            self.assertEqual(out['completeness'], 'PARTIAL')
            self.assertEqual(out['observed_candidate_entries'], 0)
            self.assertEqual(out['observed_candidate_estimate_bytes'], 0)
            self.assertIsNone(out['candidate_estimate_bytes'])
            self.assertFalse(out['scope_verified'])
            self.assertIsNone(out['actual_freed_bytes'])

    def test_cancelled_incomplete_nonzero_and_embedded_empty_text_never_become_zero(self):
        cases = [('No items selected', 0, False, '1.72.0'),
                 ('No artifacts found in the completed project scans', 0, False, '1.72.0'),
                 ('No eligible project artifacts to purge', 1, False, '1.72.0'),
                 ('PRIVATE/No artifacts found to purge', 0, False, '1.72.0'),
                 ('No artifacts found to purge\nNo items selected', 0, False, '1.72.0'),
                 ('No artifacts found to purge', 0, False, '1.54.0')]
        for text, rc, stderr, version in cases:
            out = adapter.parse('purge', text, rc, stderr, version)
            self.assertEqual(out['completeness'], 'FAILED')
            self.assertNotIn('observed_candidate_entries', out)
            self.assertIsNone(out['candidate_estimate_bytes'])


if __name__ == '__main__':
    unittest.main()
