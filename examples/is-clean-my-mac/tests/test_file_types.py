import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS, snapshot

census = load('file_types', SCRIPTS / 'audit-file-types.py')


class FileTypeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def fixture(self):
        for name in ('PRIVATE-video.mov', 'PRIVATE-photo.heic', 'PRIVATE-bundle.zip',
                     'PRIVATE-data.sqlite', 'PRIVATE-disk.qcow2', 'PRIVATE-source.py',
                     'PRIVATE-unknown.PRIVATEEXT'):
            (self.root / name).write_bytes(b'x' * 8192)

    def test_filename_classes_allocated_logical_bytes_and_no_private_output(self):
        self.fixture()
        before = snapshot(self.root)
        out = census.inventory(self.root)
        self.assertEqual(out['completeness'], 'COMPLETE')
        expected = sum(p.stat().st_blocks * 512 for p in self.root.iterdir())
        self.assertEqual(out['allocated_bytes'], expected)
        self.assertEqual(out['observed_logical_bytes'], 7 * 8192)
        self.assertEqual(out['file_count'], 7)
        self.assertEqual({r['category'] for r in out['categories']},
                         {'video','images','archives_installers','databases','virtual_disks','source_and_config','other_or_no_extension'})
        self.assertNotIn('PRIVATE', json.dumps(out))
        self.assertEqual(snapshot(self.root), before)
        self.assertIsNone(out['reclaimable_bytes'])

    def test_hardlinks_deduplicated_and_symlink_target_not_followed(self):
        self.fixture()
        before = census.inventory(self.root)
        os.link(self.root / 'PRIVATE-video.mov', self.root / 'duplicate.mov')
        (self.root / 'PRIVATE-link').symlink_to(self.root / 'PRIVATE-video.mov')
        out = census.inventory(self.root)
        self.assertEqual(out['observed_allocated_bytes'], before['observed_allocated_bytes'])
        self.assertEqual(out['observed_file_count'], 7)
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIsNone(out['allocated_bytes'])
        self.assertEqual(out['skipped_symlinks'], 1)

    def test_budget_keeps_unknown_total_and_observed_subset(self):
        self.fixture()
        out = census.inventory(self.root, max_entries=2)
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertIsNone(out['file_count'])
        self.assertEqual(out['observed_file_count'], 2)
        self.assertIn('metadata_budget_exhausted', out['reasons'])

    def test_classification_never_reads_content(self):
        self.fixture()
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('contents forbidden')), \
             patch.object(Path, 'read_text', side_effect=AssertionError('contents forbidden')):
            out = census.inventory(self.root)
        self.assertEqual(out['observed_file_count'], 7)

    def test_known_contexts_are_separate_same_denominator_not_extra_space(self):
        for directory in ('PRIVATE.app', 'PRIVATE.photoslibrary', 'node_modules', 'Caches'):
            p = self.root / directory
            p.mkdir()
            (p / 'PRIVATE.bin').write_bytes(b'x' * 8192)
        out = census.inventory(self.root)
        self.assertEqual(sum(r['allocated_bytes'] for r in out['categories']), out['allocated_bytes'])
        self.assertEqual(sum(r['allocated_bytes'] for r in out['contexts']), out['allocated_bytes'])
        self.assertEqual({r['category'] for r in out['contexts']}, {'application_bundles','photo_libraries','build_and_dependency_directories','cache_directories'})

    def test_cli_fixture_and_root_symlink_fail_closed(self):
        self.fixture()
        r = subprocess.run([sys.executable, '-B', str(SCRIPTS / 'audit-file-types.py'), '--root', str(self.root)], capture_output=True)
        self.assertEqual(json.loads(r.stdout)['observed_file_count'], 7)
        link = self.root / 'alias'
        link.symlink_to(self.root, target_is_directory=True)
        out = census.inventory(link)
        self.assertEqual(out['completeness'], 'FAILED')
        self.assertIsNone(out['observed_allocated_bytes'])
