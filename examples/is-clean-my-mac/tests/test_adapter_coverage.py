import json
import os
import tempfile
import unittest
from pathlib import Path
from test_audit import adapter, BASE


class CoverageTests(unittest.TestCase):
    def data(self):
        return json.loads((BASE / 'evals/fixtures/analyze-1.72.0.synthetic.json').read_text())

    def test_actual_172_omitted_fields(self):
        data = self.data()
        del data['large_files']
        del data['total_files']
        out = adapter.parse('analyze', json.dumps(data), version='1.72.0')
        self.assertEqual(out['completeness'], 'COMPLETE')
        self.assertIsNone(out['file_count'])
        self.assertEqual(out['categories'][0]['observed_bytes'], 8192)

    def test_extensions_and_unknown_entries_preserve_known_bytes_without_private_values(self):
        data = self.data()
        data['PRIVATE_NEW_FIELD'] = 'PRIVATE_VALUE'
        data['entries'].append(dict(name='PRIVATE', path='/PRIVATE/Library/Caches/item',
                                   size=-1, scan_status='unavailable'))
        out = adapter.parse('analyze', json.dumps(data), version='1.72.0')
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertEqual(out['occupied_bytes'], 8192)
        self.assertEqual(out['unknown_field_count'], 1)
        self.assertIsNone(out['categories'][1]['occupied_bytes'])
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_overview_public_insights_are_useful_and_not_reclaimable(self):
        data = self.data()
        data['overview'] = True
        data['entries'][0].update(name='Xcode DerivedData', path='/PRIVATE/Library/Developer/Xcode/DerivedData', cleanable=True)
        out = adapter.parse('analyze', json.dumps(data), version='1.72.0')
        self.assertEqual(out['categories'][0]['category'], 'xcode_derived_data')
        self.assertIsNone(out['candidate_estimate_bytes'])

    def test_preview_aggregates_known_and_unknown_categories_without_paths(self):
        text = '''=== Developer tools ===
/PRIVATE/cache  # 1.2MB, 2 items
/PRIVATE/unmeasured  # size unknown
=== PRIVATE heading ===
/PRIVATE/app  # 3KB
'''
        out = adapter.preview_categories(text)
        self.assertEqual(out[0]['observed_candidate_estimate_bytes'], 1200000)
        self.assertEqual(out[0]['candidate_entries'], 2)
        self.assertEqual(out[0]['unmeasured_entries'], 1)
        self.assertEqual(out[1]['category'], 'other')
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_preview_hardlink_and_symlink_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            target = root / 'preview'
            target.write_text('preserve')
            os.link(target, root / 'alias')
            with self.assertRaises(ValueError):
                adapter.physical_file(target)
            (root / 'alias').unlink()
            (root / 'alias').symlink_to(target)
            with self.assertRaises(ValueError):
                adapter.physical_file(root / 'alias')
            self.assertEqual(target.read_text(), 'preserve')

    def test_covered_preview_rows_never_add_bytes_twice(self):
        out = adapter.preview_categories('=== Developer tools ===\n/PRIVATE/cache  # 1MB\n/PRIVATE/cache/child  # 1MB, counted under /PRIVATE/cache\n')
        self.assertEqual(out[0]['observed_candidate_estimate_bytes'], 1000000)
        self.assertEqual(out[0]['covered_entries'], 1)
        self.assertEqual(out[0]['candidate_entries'], 2)
        self.assertNotIn('PRIVATE', json.dumps(out))

    def test_negative_entry_with_complete_status_prevents_complete_source(self):
        data = self.data()
        data['entries'][0]['size'] = -1
        out = adapter.parse('analyze', json.dumps(data), version='1.72.0')
        self.assertEqual(out['completeness'], 'PARTIAL')
        self.assertEqual(out['categories'][0]['unknown_entries'], 1)

    def test_purge_public_artifact_categories_and_estimates(self):
        out = adapter.parse('purge', 'Dry run complete - no changes made\n[DRY RUN] /PRIVATE/repo/node_modules, 1MB\nWould free approximately: 1MB')
        self.assertEqual(out['categories'][0]['category'], 'node_modules')
        self.assertEqual(out['categories'][0]['observed_candidate_estimate_bytes'], 1000000)
        self.assertNotIn('PRIVATE', json.dumps(out))
