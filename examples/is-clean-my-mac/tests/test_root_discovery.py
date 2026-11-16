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

    def test_invalid_metadata_stops_even_with_environment(self):
        self.metadata(['relative'])
        with self.assertRaisesRegex(ValueError, '^unsupported_app_root_metadata$'):
            helper.discover_root({'CODEX_HOME': str(self.codex)}, self.home)

    def test_symlink_metadata_is_never_followed(self):
        (self.home / 'outside').write_text('{}')
        (self.codex / '.codex-global-state.json').symlink_to(self.home / 'outside')
        with self.assertRaisesRegex(ValueError, '^app_root_metadata_unavailable_or_invalid$'):
            helper.discover_root({}, self.home)

    def test_oversize_and_malformed_metadata_fail_closed(self):
        file = self.codex / '.codex-global-state.json'
        file.write_bytes(b' ' * (4 * 1024 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, '^unsupported_app_root_metadata$'):
            helper.discover_root({}, self.home)
        file.write_text('malformed secret text')
        with self.assertRaisesRegex(ValueError, '^app_root_metadata_unavailable_or_invalid$'):
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
