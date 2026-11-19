"""Saved purge parsing and explicit incomplete preview; synthetic inputs only."""
import unittest
from test_audit import adapter


class PurgePreviewTests(unittest.TestCase):
    def test_explicit_incomplete_summary_preserves_observed_candidates(self):
        text = ('[DRY RUN] ~/example/build, 3.5 MB\n'
                '==========\nDry run incomplete - no changes made\n'
                'Would free approximately: 3.5 MB | Items: 1 | Free: 9 GB\n'
                'Some artifacts were skipped or could not be processed.\n==========\n')
        out = adapter.parse('purge', text, 1, True, '1.72.0')
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertEqual(out['candidate_estimate_bytes'], 3500000)
        self.assertEqual(out['categories'][0]['category'], 'build')
        self.assertIsNone(out['actual_freed_bytes'])
        self.assertFalse(out['exact_scope_available'])
        for rc in (2, 124, 130, -9):
            interrupted = adapter.parse('purge', text, rc, True, '1.72.0')
            self.assertEqual(interrupted['completeness'], 'FAILED')
            self.assertIsNone(interrupted['candidate_estimate_bytes'])
        self.assertEqual(adapter.parse('clean', text, 1, True, '1.72.0')['completeness'], 'FAILED')

    def test_incomplete_without_measurement_is_unknown_not_zero(self):
        out = adapter.parse('purge', '==========\nDry run incomplete - no changes made\nNo artifacts were removed.\nFree space: 9 GB\nSome artifacts were skipped or could not be processed.\n==========\n', 1, True, '1.72.0')
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIsNone(out['candidate_estimate_bytes'])
        self.assertEqual(out['reason'], 'upstream_purge_preview_incomplete')
        self.assertEqual(adapter.parse('purge', 'scan root (status 1)', 1, True, '1.72.0')['completeness'], 'FAILED')

    def test_empty_with_diagnostics_is_only_an_observation(self):
        out = adapter.parse('purge', '✓ No old project artifacts to clean\n', 0, True, '1.72.0')
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertEqual(out['observed_candidate_estimate_bytes'], 0)
        self.assertIsNone(out['candidate_estimate_bytes'])
        self.assertEqual(out['reason'], 'upstream_no_candidates_with_diagnostics')
        self.assertFalse(out['scope_verified'])

    def test_incomplete_summary_spoof_and_trailing_failure_are_rejected(self):
        block = ('==========\nDry run incomplete - no changes made\n'
                 'Would free approximately: 12 GB | Items: 1 | Free: 9 GB\n'
                 'Some artifacts were skipped or could not be processed.\n==========\n')
        invalid = [
            'error reading /synthetic/Dry run incomplete - no changes made\n'
            'error reading /synthetic/Would free approximately: 12 GB\n',
            block + 'scan failed: operation not permitted\n',
            block.replace('Would free', 'error reading /synthetic/Would free'),
            block.replace('Dry run incomplete', 'error reading /synthetic/Dry run incomplete'),
            block.replace('Some artifacts were skipped or could not be processed.\n', ''),
            block.replace('| Items: 1 | Free: 9 GB', '| Items: 1'),
        ]
        for text in invalid:
            with self.subTest(text=text):
                out = adapter.parse('purge', text, 1, True, '1.72.0')
                self.assertEqual(out['completeness'], 'FAILED')
                self.assertIsNone(out['candidate_estimate_bytes'])

    def test_estimate_comes_from_terminal_block_not_earlier_path(self):
        text = ('error reading /synthetic/Would free approximately: 12 GB\n'
                '==========\nDry run incomplete - no changes made\n'
                'Would free approximately: 2 MB + 1 unmeasured | Items: 2 | Free: 9 GB\n'
                'Some artifacts were skipped or could not be processed.\n==========\n')
        out = adapter.parse('purge', text, 1, True, '1.72.0')
        self.assertEqual(out['candidate_estimate_bytes'], 2000000)
        self.assertEqual(out['completeness'], 'PARTIAL')
