"""Concise decision UX, using unrelated synthetic values only."""
import re
import unittest
from test_audit import load, SCRIPTS
report = load('concise_renderer', SCRIPTS / 'render-report.py')
plans = load('concise_plan', SCRIPTS / 'approval-plan.py')


def fixture():
    groups = [dict(category=k, observed_bytes=n, measured_entries=1, completeness='COMPLETE') for k,n in (
        ('codex_worktrees', 42000000000), ('codex_sessions', 11000000000), ('colima_data', 19000000000),
        ('android_sdk', 13000000000), ('application_support', 25000000000), ('documents', 12000000000))]
    groups += [dict(category='other', observed_bytes=99000000000, measured_entries=1, completeness='PARTIAL'),
               dict(category='home', observed_bytes=90000000000, measured_entries=1, completeness='PARTIAL')]
    return dict(sources=[dict(source='mole-analyze', completeness='PARTIAL', categories=groups,
        drilldowns=[dict(scope_label='home',occupied_bytes=180000000000, categories=[], drilldown_budget_exhausted=True)]),
        dict(source='mole-clean', completeness='PARTIAL', candidate_estimate_bytes=4500000000,
            categories=[dict(category='developer_caches', observed_candidate_estimate_bytes=3400000000),
                        dict(category='browser_caches', observed_candidate_estimate_bytes=800000000)]),
        dict(source='mole-purge',completeness='FAILED',candidate_estimate_bytes=None,reason='command_failed',
             command_exit_code=130,diagnostic_categories=['project_discovery_incomplete']),
        dict(source='codex-worktree-inventory',completeness='PARTIAL',worktree_count=None,
             observed_worktree_count=9, worktree_count_completeness='PARTIAL',observed_allocated_bytes=2000000000)])


class ConciseReportTests(unittest.TestCase):
    def test_main_is_bounded_and_detail_keeps_full_evidence(self):
        data=fixture();plan=plans.build_plan(data)
        text=report.render_concise_summary(data,plan)
        detail=report.render_summary(data,plan)
        self.assertLess(len(text),2600)
        self.assertLess(len(text),len(detail)*.65)
        self.assertEqual(len(re.findall(r'^\d\. ',text,re.M)),5)
        self.assertNotIn('| ---',text)
        self.assertIn('(audit-details.zh.md)',text)
        self.assertIn('42,000,000,000 B',detail)
        self.assertNotIn('42,000,000,000 B',text)
        for value in ('42.000 GB','11.000 GB','3.400 GB','800.000 MB','SDK Manager','Colima','会话可能唯一','Git/活动/未推送','Other 99.000 GB'):
            self.assertIn(value,text)

    def test_critical_limits_inline_without_ledger_dump(self):
        data=fixture();text=report.render_concise_summary(data,plans.build_plan(data))
        for value in ('UNKNOWN','不能相加','不是分类求和','purge 独立预览：FAILED','退出码：130',
                      '项目发现不完整','不能用 clean 结果替代','精确数 UNKNOWN','已观察至少 9',
                      'Home overview 与下钻覆盖矛盾','观察时点 UNKNOWN','永久删除','Trash','未清理','不是删除批准',
                      '不等于删除 worktree','下钻达到预算','可能含唯一状态'):
            self.assertIn(value,text)
        self.assertNotIn('实际释放 0',text)

    def test_missing_evidence_never_fills_options_with_fake_findings(self):
        text=report.render_concise_summary({'sources':[]},plans.build_plan({'sources':[]}))
        self.assertNotIn('0 B',text)
        self.assertNotIn('SDK Manager',text)
        self.assertLess(len(re.findall(r'^\d\. ',text,re.M)),3)

    def test_purge_candidates_separate_from_clean_and_worktrees(self):
        data=fixture();data['sources'][2].update(completeness='PARTIAL',candidate_estimate_bytes=2100000000,command_exit_code=1)
        text=report.render_concise_summary(data,plans.build_plan(data))
        self.assertIn('purge 独立预览：PARTIAL，候选约 2.100 GB',text)
        self.assertIn('不是删源码、仓库或整个 worktree',text)
        self.assertNotIn('6.600 GB',text)
        self.assertIn('退出码：1',text)

    def test_untrusted_labels_diagnostics_and_link_syntax_do_not_leak(self):
        data=fixture();data['sources'][2]['diagnostic_categories'].append('PRIVATE')
        data['sources'][0]['categories'].append(dict(category='PRIVATE',observed_bytes=999999999999,measured_entries=1))
        text=report.render_concise_summary(data,plans.build_plan(data),details_link='audit]private(.md')
        self.assertNotIn('PRIVATE',text)
        self.assertIn('audit%5Dprivate%28.md',text)
        self.assertNotIn('](audit]private',text)

    def test_valuable_review_prefers_material_simulator_over_tiny_container(self):
        data=fixture()
        data['sources'][0]['categories'] += [dict(category='container_data',observed_bytes=8192,measured_entries=1,completeness='COMPLETE'), dict(category='xcode_simulators',observed_bytes=5100000000,measured_entries=1,completeness='COMPLETE')]
        text=report.render_concise_summary(data,plans.build_plan(data))
        option=next(line for line in text.splitlines() if line.startswith('3. '))
        self.assertIn('Xcode 模拟器 5.100 GB',option)
        self.assertNotIn('8.192 KB',option)
        self.assertIn('唯一状态',option)

    def test_chat_links_resolve_both_artifacts_beside_actual_detail_path(self):
        data=fixture()
        text=report.render_concise_summary(data,plans.build_plan(data),details_link='/synthetic/report/audit-details.zh.md')
        self.assertIn('](/synthetic/report/audit-details.zh.md)',text)
        self.assertIn('](/synthetic/report/evidence-ledger.json)',text)

    def test_paused_purge_is_not_zero_or_success(self):
        data=fixture()
        data['sources'][2]=dict(source='mole-purge',completeness='FAILED',reason='purge_lifecycle_unverified',command_stage='preflight',execution_blocked=True,subprocess_started=False,candidate_estimate_bytes=None)
        text=report.render_concise_summary(data,plans.build_plan(data))
        self.assertIn('purge 预览已暂停',text)
        self.assertIn('未启动命令',text)
        self.assertIn('候选约 UNKNOWN',text)
        self.assertIn('clean 上游预览总计约 4.500 GB',text)
        self.assertNotIn('退出码：0',text)
