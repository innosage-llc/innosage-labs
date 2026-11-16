import unittest
from test_audit import load, SCRIPTS

renderer = load('report', SCRIPTS / 'render-report.py')


class ReportTests(unittest.TestCase):
    def test_measurements_count_and_byte_coverage_survive_deterministically(self):
        data = dict(sources=[dict(source='codex-worktree-inventory', completeness='PARTIAL',
          workspace_count=3, workspace_count_completeness='METADATA_SNAPSHOT', worktree_count=7,
          worktree_count_completeness='COMPLETE', observed_worktree_count=7,
          occupied_bytes=None, observed_allocated_bytes=123456789),
          dict(source='mole-analyze', completeness='COMPLETE', occupied_bytes=500000000,
               categories=[dict(category='home', observed_bytes=500000000, measured_entries=2, completeness='COMPLETE')]),
          dict(source='mole-clean', completeness='PARTIAL', candidate_estimate_bytes=40000000,
               categories=[dict(category='developer_caches', observed_candidate_estimate_bytes=40000000, candidate_entries=4)]),
          dict(source='mole-purge', completeness='PARTIAL', candidate_estimate_bytes=60000000)])
        text = renderer.render(data)
        for token in ('3', '7', '123,456,789', '500,000,000', '40,000,000', '60,000,000', 'PARTIAL', 'COMPLETE', 'null', '重新下载', 'Mole purge', 'Mole clean'):
            self.assertIn(token, text)
        self.assertNotIn('100,000,000', text)
        self.assertIn('整个 worktree 不属于候选', text)

    def test_untrusted_labels_values_and_failures_are_not_fabricated(self):
        text = renderer.render(dict(sources=[dict(source='mole-clean', completeness='FAILED',
          reason='PRIVATE', candidate_estimate_bytes=None, categories=[dict(category='PRIVATE', candidate_entries='PRIVATE', observed_candidate_estimate_bytes=-1)])]))
        self.assertNotIn('PRIVATE', text)
        self.assertIn('FAILED', text)
        self.assertIn('UNKNOWN', text)
        self.assertNotIn('实际释放：0', text)
