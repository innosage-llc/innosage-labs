"""Independent shallow count coverage despite expensive payload measurement."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / '.agents/skills/is-clean-my-mac/scripts/audit-codex-worktrees.py'
spec = importlib.util.spec_from_file_location('count_inventory', SCRIPT)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class CountCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def repo(self, relative):
        repo = self.root / relative
        repo.mkdir(parents=True)
        (repo / '.git').write_text('marker only')
        return repo

    def test_many_payload_files_do_not_hide_other_worktree_markers(self):
        first = self.repo('slot/first')
        payload = first / 'payload'
        payload.mkdir()
        for i in range(100):
            (payload / str(i)).write_bytes(b'x' * 4096)
        self.repo('slot/second')
        self.repo('direct')
        result = helper.inventory(self.root, max_entries=5)
        self.assertEqual(result['completeness'], 'PARTIAL')
        self.assertIsNone(result['occupied_bytes'])
        self.assertEqual(result['worktree_count'], 3)
        self.assertEqual(result['observed_worktree_count'], 3)
        self.assertEqual(result['worktree_count_completeness'], 'COMPLETE')
        self.assertIsNone(result['reclaimable_bytes'])

    def test_flat_large_repo_is_not_enumerated_by_count(self):
        first = self.repo('slot/first')
        for i in range(100):
            (first / str(i)).write_bytes(b'x')
        self.repo('slot/second')
        fd = helper.open_root(self.root)
        real_scandir = os.scandir
        first_inode = first.stat().st_ino
        def guarded_scandir(arg):
            if isinstance(arg, int) and os.fstat(arg).st_ino == first_inode:
                self.fail('Count enumerated repository payload instead of statting marker')
            return real_scandir(arg)
        try:
            with patch.object(helper.os, 'scandir', guarded_scandir):
                count, reasons = helper.count_layout(fd, 10, max_entries=10)
        finally:
            os.close(fd)
        self.assertEqual(count, 2)
        self.assertEqual(reasons, [])

    def test_symlink_git_marker_prevents_exact_count(self):
        self.repo('valid')
        repo = self.root / 'untrusted'
        repo.mkdir()
        (repo / '.git').symlink_to(self.root / 'valid/.git')
        result = helper.inventory(self.root)
        self.assertIsNone(result['worktree_count'])
        self.assertEqual(result['observed_worktree_count'], 1)
        self.assertEqual(result['worktree_count_completeness'], 'PARTIAL')
        self.assertIn('count_invalid_or_symlink_git_marker', result['worktree_count_reasons'])

    def test_unknown_layout_prevents_exact_count_but_keeps_observed(self):
        self.repo('direct')
        (self.root / 'slot/unknown').mkdir(parents=True)
        result = helper.inventory(self.root)
        self.assertIsNone(result['worktree_count'])
        self.assertEqual(result['observed_worktree_count'], 1)
        self.assertEqual(result['worktree_count_completeness'], 'PARTIAL')

    def test_count_budget_is_independently_bounded(self):
        self.repo('one')
        self.repo('two')
        fd = helper.open_root(self.root)
        try:
            count, reasons = helper.count_layout(fd, 10, max_entries=1)
        finally:
            os.close(fd)
        self.assertEqual(count, 0)
        self.assertIn('count_budget_exhausted', reasons)

    def test_count_never_follows_symlink(self):
        self.repo('one')
        (self.root / 'link').symlink_to(self.root / 'one', target_is_directory=True)
        result = helper.inventory(self.root)
        self.assertEqual(result['worktree_count_completeness'], 'PARTIAL')
        self.assertEqual(result['observed_worktree_count'], 1)
        self.assertIn('count_symlink_not_followed', result['worktree_count_reasons'])

    def test_count_rejects_changed_directory_inode(self):
        self.repo('one')
        fd = helper.open_root(self.root)
        real_open = os.open
        def changed_open(name, flags, **kwargs):
            if name == 'one':
                return real_open(self.root, flags)
            return real_open(name, flags, **kwargs)
        try:
            with patch.object(helper.os, 'open', changed_open):
                count, reasons = helper.count_layout(fd, 10)
        finally:
            os.close(fd)
        self.assertEqual(count, 0)
        self.assertIn('count_entry_changed', reasons)


if __name__ == '__main__':
    unittest.main()
