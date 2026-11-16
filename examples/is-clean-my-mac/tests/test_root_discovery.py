"""Synthetic root discovery; no real host metadata or user files accessed."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / '.agents/skills/is-clean-my-mac/scripts/audit-codex-worktrees.py'
spec = importlib.util.spec_from_file_location('root_inventory', SCRIPT)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.codex = self.home / '.codex'
        self.codex.mkdir()

    def metadata(self, roots=None):
        data = {'electron-saved-workspace-roots': roots if roots is not None else ['/synthetic/a', '/synthetic/a', '/synthetic/b'],
                'unrelated-private-key': 'never output this content'}
        (self.codex / '.codex-global-state.json').write_text(json.dumps(data))

    def test_app_metadata_discovers_default_and_deduplicates_saved_workspaces(self):
        self.metadata()
        root, meta = helper.discover_root({}, self.home)
        self.assertEqual(root, self.codex / 'worktrees')
        self.assertEqual(meta['workspace_count'], 2)
        self.assertEqual(meta['other_host_or_custom_root_coverage'], 'UNKNOWN')
        self.assertNotIn('never output', json.dumps(meta))
        self.assertNotIn('/synthetic', json.dumps(meta))

    def test_unproven_default_is_unknown_not_zero(self):
        with self.assertRaisesRegex(ValueError, '^root_configuration_not_verified$'):
            helper.discover_root({}, self.home)

    def test_explicit_environment_supports_cli_without_app_metadata(self):
        root, meta = helper.discover_root({'CODEX_HOME': str(self.codex)}, self.home)
        self.assertEqual(root, self.codex / 'worktrees')
        self.assertIsNone(meta['workspace_count'])
        self.assertEqual(meta['root_source'], 'CODEX_HOME_environment')

    def test_invalid_optional_metadata_preserves_environment_root(self):
        self.metadata(['relative'])
        root, meta = helper.discover_root({'CODEX_HOME': str(self.codex)}, self.home)
        self.assertEqual(root, self.codex / 'worktrees')
        self.assertIsNone(meta['workspace_count'])
        self.assertEqual(meta['workspace_metadata_status'], 'unsupported_workspace_roots_format')

    def test_symlink_metadata_is_never_followed_or_used_to_corroborate(self):
        (self.home / 'outside').write_text('{}')
        (self.codex / 'worktrees').mkdir()
        (self.codex / '.codex-global-state.json').symlink_to(self.home / 'outside')
        with self.assertRaisesRegex(ValueError, '^root_configuration_not_verified$'):
            helper.discover_root({}, self.home)
        root, meta = helper.discover_root({'CODEX_HOME': str(self.codex)}, self.home)
        self.assertIsNone(meta['workspace_count'])
        self.assertEqual(meta['workspace_metadata_status'], 'missing_nonregular_or_link')

    def test_oversize_and_malformed_metadata_need_physical_default_root(self):
        file = self.codex / '.codex-global-state.json'
        for raw in (b' ' * (4 * 1024 * 1024 + 1), b'malformed secret text'):
            with self.subTest(size=len(raw)):
                file.write_bytes(raw)
                with self.assertRaisesRegex(ValueError, '^root_configuration_not_verified$'):
                    helper.discover_root({}, self.home)
        (self.codex / 'worktrees').mkdir()
        root, meta = helper.discover_root({}, self.home)
        self.assertEqual(root, self.codex / 'worktrees')
        self.assertIsNone(meta['workspace_count'])
        self.assertEqual(meta['discovery_metadata_completeness'], 'PARTIAL')
        self.assertNotIn('secret', json.dumps(meta))

    def test_unreadable_regular_metadata_with_physical_root_preserves_inventory(self):
        self.metadata()
        (self.codex / 'worktrees').mkdir()
        real_open = helper.os.open
        def deny_metadata(path, *args, **kwargs):
            if path == '.codex-global-state.json':
                raise PermissionError('private diagnostic must stay local')
            return real_open(path, *args, **kwargs)
        with patch.object(helper.os, 'open', deny_metadata):
            root, meta = helper.discover_root({}, self.home)
        self.assertEqual(root, self.codex / 'worktrees')
        self.assertIsNone(meta['workspace_count'])
        self.assertEqual(meta['workspace_metadata_status'], 'unreadable_invalid_or_over_budget')
        self.assertNotIn('private', json.dumps(meta))

    def test_unknown_workspace_formats_keep_actual_worktree_measurements(self):
        repo = self.codex / 'worktrees/slot/synthetic'
        repo.mkdir(parents=True)
        (repo / '.git').write_text('marker')
        (repo / 'payload').write_bytes(b'x' * 8192)
        file = self.codex / '.codex-global-state.json'
        env = dict(os.environ, HOME=str(self.home))
        env.pop('CODEX_HOME', None)
        for data in ({}, {'electron-saved-workspace-roots': None},
                     {'electron-saved-workspace-roots': {'local': ['/private/synthetic']}}, []):
            with self.subTest(metadata_type=type(data).__name__):
                file.write_text(json.dumps(data))
                run = subprocess.run([sys.executable, '-B', str(SCRIPT)], capture_output=True, text=True, env=env)
                self.assertEqual(run.returncode, 0, run.stdout)
                result = json.loads(run.stdout)
                self.assertEqual(result['worktree_count'], 1)
                self.assertEqual(result['worktree_count_completeness'], 'COMPLETE')
                self.assertGreaterEqual(result['occupied_bytes'], 8192)
                self.assertEqual(result['presence'], 'PRESENT')
                self.assertIsNone(result['workspace_count'])
                self.assertEqual(result['workspace_count_completeness'], 'UNKNOWN')
                self.assertEqual(result['discovery_metadata_completeness'], 'PARTIAL')
                self.assertEqual(result['other_host_or_custom_root_coverage'], 'UNKNOWN')
                self.assertNotIn(str(self.home), run.stdout)
                self.assertNotIn('/private/synthetic', run.stdout)

    def test_metadata_swapped_to_link_cannot_corroborate_fallback(self):
        self.metadata()
        (self.codex / 'worktrees').mkdir()
        marker = self.codex / '.codex-global-state.json'
        outside = self.home / 'outside'
        outside.write_text('{}')
        real_open = helper.os.open
        def swap_metadata(path, *args, **kwargs):
            if path == '.codex-global-state.json':
                marker.unlink()
                marker.symlink_to(outside)
            return real_open(path, *args, **kwargs)
        with patch.object(helper.os, 'open', swap_metadata):
            with self.assertRaisesRegex(ValueError, '^root_configuration_not_verified$'):
                helper.discover_root({}, self.home)

    def test_physical_root_without_app_metadata_is_not_authority(self):
        (self.codex / 'worktrees').mkdir()
        with self.assertRaisesRegex(ValueError, '^root_configuration_not_verified$'):
            helper.discover_root({}, self.home)

    def test_symlink_worktree_root_cannot_corroborate_unknown_metadata(self):
        self.metadata(['relative'])
        (self.home / 'outside').mkdir()
        (self.codex / 'worktrees').symlink_to(self.home / 'outside', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, '^root_configuration_not_verified$'):
            helper.discover_root({}, self.home)

    def test_default_cli_inventory_is_automatic_redacted_and_read_only(self):
        self.metadata()
        repo = self.codex / 'worktrees/slot/synthetic'
        repo.mkdir(parents=True)
        (repo / '.git').write_text('marker')
        (repo / 'payload').write_bytes(b'x' * 8192)
        env = dict(os.environ, HOME=str(self.home))
        env.pop('CODEX_HOME', None)
        run = subprocess.run([sys.executable, '-B', str(SCRIPT)], capture_output=True, text=True, env=env)
        self.assertEqual(run.returncode, 0, run.stdout)
        data = json.loads(run.stdout)
        self.assertEqual(data['worktree_count'], 1)
        self.assertGreaterEqual(data['occupied_bytes'], 8192)
        self.assertEqual(data['workspace_count'], 2)
        self.assertEqual(data['completeness'], 'COMPLETE')
        self.assertIsNone(data['reclaimable_bytes'])
        self.assertTrue(all(v == 'UNKNOWN' for v in data['blockers'].values()))
        self.assertNotIn(str(self.home), run.stdout)
        self.assertEqual((repo / 'payload').stat().st_size, 8192)

    def test_environment_absent_root_is_scoped_absent(self):
        env = dict(os.environ, CODEX_HOME=str(self.codex))
        run = subprocess.run([sys.executable, '-B', str(SCRIPT)], capture_output=True, text=True, env=env)
        data = json.loads(run.stdout)
        self.assertEqual(data['presence'], 'ABSENT')
        self.assertEqual(data['worktree_count'], 0)
        self.assertEqual(data['other_host_or_custom_root_coverage'], 'UNKNOWN')


if __name__ == '__main__':
    unittest.main()

class DiscoveryTimeoutTests(unittest.TestCase):
    def test_discovery_is_inside_the_hard_worker_timeout(self):
        # A stalled root must time out before any outer-process discovery.
        with patch.object(helper, 'discover_root', side_effect=AssertionError('outer discovery forbidden')), \
             patch.object(helper.subprocess, 'run', side_effect=subprocess.TimeoutExpired('synthetic-worker', .01)), \
             patch('sys.argv', ['audit-codex-worktrees.py', '--timeout', '.01']), \
             patch('builtins.print') as output:
            self.assertEqual(helper.main(), 2)
        result = json.loads(output.call_args.args[0])
        self.assertEqual(result['reasons'], ['worker_timeout'])
        self.assertEqual(result['presence'], 'UNKNOWN')
        self.assertIsNone(result['occupied_bytes'])
