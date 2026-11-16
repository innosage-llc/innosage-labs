import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
SCRIPTS = BASE / '.agents/skills/is-clean-my-mac/scripts'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


helper = load('inventory', SCRIPTS / 'audit-codex-worktrees.py')
adapter = load('adapter', SCRIPTS / 'audit-mole.py')


def snapshot(root):
    return {str(p.relative_to(root)): (p.lstat().st_mode, p.lstat().st_size,
            p.lstat().st_mtime_ns, p.lstat().st_ctime_ns) for p in [root, *root.rglob('*')]}


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve() / 'worktrees'
        self.root.mkdir()
        self.addCleanup(self.temp.cleanup)

    def fixture(self, name='slot/repo'):
        repo = self.root / name
        repo.mkdir(parents=True)
        (repo / '.git').write_text('synthetic marker; never read')
        (repo / 'private-name-never-output').write_bytes(b'x' * 8192)
        return repo

    def test_multiple_and_independent_allocated_measurement_no_mutation(self):
        self.fixture('one/repo')
        self.fixture('two/repo')
        before = snapshot(self.root)
        out = helper.inventory(self.root)
        # Independent platform du uses allocated blocks, includes directory blocks.
        independent = subprocess.check_output(['du', '-sk', str(self.root)], text=True)
        self.assertEqual(out['occupied_bytes'], int(independent.split()[0]) * 1024)
        self.assertEqual(out['worktree_count'], 2)
        self.assertEqual(out['completeness'], 'COMPLETE')
        self.assertEqual(snapshot(self.root), before)
        self.assertNotIn(str(self.root), json.dumps(out))
        self.assertNotIn('private-name', json.dumps(out))
        self.assertTrue(all(x == 'UNKNOWN' for x in out['blockers'].values()))
        self.assertIsNone(out['reclaimable_bytes'])
        self.assertIsNone(out['actual_freed_bytes'])

    def test_direct_root_repository(self):
        self.fixture('repo')
        self.assertEqual(helper.inventory(self.root)['worktree_count'], 1)

    def test_verified_absent_root_is_zero(self):
        out = helper.inventory(self.root / 'absent')
        self.assertEqual((out['presence'], out['occupied_bytes']), ('ABSENT', 0))

    def test_permission_denied_never_zero(self):
        with patch.object(helper.os, 'open', side_effect=PermissionError):
            out = helper.inventory(self.root)
        self.assertEqual(out['presence'], 'UNKNOWN')
        self.assertIsNone(out['occupied_bytes'])

    def test_budget_never_complete_or_zero(self):
        self.fixture()
        for kwargs in ({'seconds': 0}, {'max_entries': 1}):
            out = helper.inventory(self.root, **kwargs)
            self.assertEqual(out['completeness'], 'PARTIAL')
            self.assertIsNone(out['occupied_bytes'])
            self.assertIsNone(out['worktree_count'])

    def test_symlink_and_hardlink_duplicate(self):
        repo = self.fixture()
        os.link(repo / 'private-name-never-output', repo / 'duplicate')
        out = helper.inventory(self.root)
        self.assertEqual(out['completeness'], 'COMPLETE')
        (self.root / 'alias').symlink_to(repo, target_is_directory=True)
        before = snapshot(self.root)
        out = helper.inventory(self.root)
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIsNone(out['occupied_bytes'])
        self.assertEqual(snapshot(self.root), before)
        self.assertEqual(helper.inventory(self.root / 'alias')['presence'], 'UNKNOWN')

    def test_directory_swap_does_not_follow_symlink(self):
        repo = self.fixture('repo')
        external = Path(self.temp.name).resolve() / 'outside'
        external.mkdir()
        (external / 'private-outside').write_bytes(b'x' * 32768)
        original_open = os.open
        swapped = False
        def race_open(path, flags, **kwargs):
            nonlocal swapped
            if path == 'repo' and not swapped:
                swapped = True
                repo.rename(self.root / 'moved')
                repo.symlink_to(external, target_is_directory=True)
            return original_open(path, flags, **kwargs)
        with patch.object(helper.os, 'open', side_effect=race_open):
            out = helper.inventory(self.root)
        self.assertTrue(swapped)
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIsNone(out['occupied_bytes'])
        self.assertLess(out['observed_allocated_bytes'], 32768)

    def test_unknown_top_level_leaf_is_partial(self):
        leaf = self.root / 'unknown-layout'
        leaf.mkdir()
        (leaf / 'payload').write_bytes(b'x' * 8192)
        before = snapshot(self.root)
        out = helper.inventory(self.root)
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIsNone(out['worktree_count'])
        self.assertEqual(snapshot(self.root), before)

    def test_unknown_layout(self):
        (self.root / 'slot/unknown').mkdir(parents=True)
        self.assertEqual(helper.inventory(self.root)['completeness'], 'PARTIAL')

    def test_cli_partial_preserves_worker_json(self):
        self.fixture()
        before = snapshot(self.root)
        run = subprocess.run([sys.executable, '-B', str(SCRIPTS / 'audit-codex-worktrees.py'),
                              '--root', str(self.root), '--max-entries', '1'], capture_output=True)
        out = json.loads(run.stdout)
        self.assertEqual(run.returncode, 2)
        self.assertEqual(out['presence'], 'PRESENT')
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIn('scan_budget_exhausted', out['reasons'])
        self.assertIsNone(out['occupied_bytes'])
        self.assertEqual(snapshot(self.root), before)

    def test_cli_default_custom_and_unverified(self):
        script = str(SCRIPTS / 'audit-codex-worktrees.py')
        env = dict(os.environ, CODEX_HOME=str(Path(self.temp.name).resolve()))
        self.fixture()
        for args in (['--confirm-default-root'], ['--root', str(self.root)]):
            out = subprocess.check_output([sys.executable, '-B', script, *args], env=env)
            self.assertEqual(json.loads(out)['worktree_count'], 1)
        out = subprocess.run([sys.executable, '-B', script], capture_output=True)
        self.assertEqual(json.loads(out.stdout)['presence'], 'UNKNOWN')
        self.assertEqual(out.returncode, 2)


class AdapterTests(unittest.TestCase):
    def test_analyze_redaction(self):
        text = (BASE / 'evals/fixtures/analyze-1.54.0.synthetic.json').read_text()
        out = adapter.parse('analyze', text)
        self.assertEqual(out['occupied_bytes'], 8192)
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_documented_172_coverage_and_unknown_status(self):
        text = (BASE / 'evals/fixtures/analyze-1.72.0.synthetic.json').read_text()
        out = adapter.parse('analyze', text, version='1.72.0')
        self.assertEqual(out['completeness'], 'COMPLETE')
        self.assertEqual(out['occupied_bytes'], 8192)
        data = json.loads(text)
        data['scan_status'] = 'unavailable'
        out = adapter.parse('analyze', json.dumps(data), version='1.72.0')
        self.assertIsNone(out['occupied_bytes'])
        self.assertEqual(out['completeness'], 'FAILED')
        data['scan_status'] = 'unexpected'
        self.assertEqual(adapter.parse('analyze', json.dumps(data), version='1.72.0')['completeness'], 'FAILED')

    def test_unknown_formats_fail_closed(self):
        for source in ('analyze', 'clean', 'purge'):
            self.assertEqual(adapter.parse(source, 'SECRET arbitrary format')['completeness'], 'FAILED')
            self.assertEqual(adapter.parse(source, '{}', rc=1)['completeness'], 'FAILED')

    def test_preview_summaries_remain_partial(self):
        for source in ('clean', 'purge'):
            text = (BASE / ('evals/fixtures/' + source + '-1.54.0.synthetic.txt')).read_text()
            out = adapter.parse(source, text)
            self.assertEqual(out['candidate_estimate_bytes'], 1000000)
            self.assertEqual(out['completeness'], 'PARTIAL')
            self.assertFalse(out['exact_scope_available'])
            self.assertNotIn('PRIVATE', json.dumps(out))

    def test_preview_units_match_upstream_si_formatter(self):
        for token, expected in [('999B', 999), ('123KB', 123000),
                                ('1.2MB', 1200000), ('1.25GB', 1250000000)]:
            text = 'Dry run complete - no changes made\nPotential space: ' + token
            out = adapter.parse('clean', text)
            self.assertEqual(out['candidate_estimate_bytes'], expected)
            self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertEqual(adapter.parse('clean', 'Dry run complete - no changes made\nPotential space: 1MiB')['completeness'], 'FAILED')

    def test_purge_stops_before_help_or_preview(self):
        with patch.object(adapter, 'capture', return_value=(0, 'Mole version 1.54.0', False)) as capture, \
             patch('sys.argv', ['audit-mole.py', '--source', 'purge', '--confirm-purge-roots']), \
             patch('builtins.print') as output:
            self.assertEqual(adapter.main(), 2)
        self.assertEqual(capture.call_count, 1)
        out = json.loads(output.call_args.args[0])
        self.assertEqual(out['reason'], 'purge_configuration_write_boundary_unverified')
        self.assertEqual(out['completeness'], 'FAILED')

    def test_capture_timeout_no_raw_error(self):
        with self.assertRaises(ValueError):
            adapter.capture([sys.executable, '-c', 'import time;time.sleep(2)'], .01)


if __name__ == '__main__':
    unittest.main()
