"""Exact decision evidence uses synthetic public metadata, never host discovery."""
import json
import re
import unittest
from test_concise_report import fixture, plans, report


def precise():
    return dict(source='precise-cache-candidates', manifest_digest='a'*64,
        observed_at_unix=1700000000, completeness='PARTIAL', reasons=['candidate_display_limit'],
        scope='fixed_default_download_cache_layouts_only', candidates=[dict(
            candidate_id='b'*32, category='homebrew_bottle', scope_digest='c'*64,
            allocated_bytes=16000000, logical_bytes=15000001, age_days=12), dict(
            candidate_id='d'*32, category='pip_http_body', scope_digest='e'*64,
            allocated_bytes=4000000, logical_bytes=3900001, age_days=20)])


class CandidateDecisionTests(unittest.TestCase):
    def test_exact_rows_preserve_identity_size_kind_and_unknowns(self):
        plan=plans.build_plan(fixture(), precise=precise())
        self.assertTrue(plans.valid_plan(plan))
        row=plan['rows'][0];evidence=row['decision_evidence']
        self.assertEqual(evidence['candidate_id'],row['scope_tokens'][0])
        self.assertEqual(evidence['scope_digest'],row['scope_digest'])
        self.assertEqual(evidence['allocated_bytes'],16000000)
        self.assertEqual(evidence['logical_bytes'],15000001)
        self.assertEqual(evidence['observed_at_unix'],1700000000)
        self.assertEqual(evidence['scan_completeness'],'PARTIAL')
        self.assertEqual(evidence['activity'],'UNKNOWN_not_checked_at_collection')
        self.assertEqual(evidence['retention'],'OWNER_DECISION_REQUIRED')
        self.assertFalse(evidence['execution_authorized'])
        self.assertIn('recheck',evidence['protection'])
        self.assertTrue(all(not row.get('decision_evidence') for row in plan['rows'][2:]))
        self.assertTrue(all(not row['actionable'] for row in plan['rows'][2:]))

    def test_unknown_observation_time_not_replaced_by_plan_time(self):
        data=precise();data.pop('observed_at_unix')
        plan=plans.build_plan(fixture(),now=1800000000,precise=data)
        self.assertIsNone(plan['rows'][0]['decision_evidence']['observed_at_unix'])

    def test_exact_objects_supplement_concise_answer_not_replace_with_table(self):
        data=fixture();plan=plans.build_plan(data,precise=precise())
        text=report.render_concise_summary(data,plan)
        self.assertLess(len(text),3000)
        self.assertNotIn('| ---',text)
        self.assertEqual(len(re.findall(r'^\d\. ',text,re.M)),5)
        for phrase in ('主要占用','42.000 GB','精确方案行 1','bbbbbbbb', '16.000 MB',
                       '15.000 MB','活动 UNKNOWN','保留需求','永久删除无备份','不是删除批准',
                       '不能用 clean 结果替代','可能已包含在 clean 总计中','audit-details.zh.md'):
            self.assertIn(phrase,text)
        self.assertIn('clean 主要类别',text)
        self.assertNotIn('可执行：',text)
        self.assertNotIn('已释放',text)

    def test_ledger_retains_exact_evidence_not_mole_measurement(self):
        data=fixture();plan=plans.build_plan(data,precise=precise())
        row=report.evidence_ledger(data,plan)[0]
        self.assertEqual(row['measurement_type'],'exact_file_allocated_bytes')
        self.assertEqual(row['scope_id'],'b'*32)
        self.assertEqual(row['decision_evidence']['logical_bytes'],15000001)
        self.assertFalse(row['executable_authorization'])
        self.assertNotIn('/Users/',json.dumps(row))

    def test_aggregate_only_cannot_create_exact_rows(self):
        data=fixture();plan=plans.build_plan(data)
        self.assertFalse(any(row.get('decision_evidence') for row in plan['rows']))
        self.assertFalse(any(row['actionable'] for row in plan['rows']))
        self.assertNotIn('精确方案行',report.render_concise_summary(data,plan))

    def test_detail_retains_full_precise_bytes_and_scoped_identity(self):
        data=fixture();plan=plans.build_plan(data,precise=precise())
        text=report.render_summary(data,plan)
        self.assertNotIn('默认没有对象清单', text)
        self.assertNotIn('默认没有精确对象', '\n'.join(report.decision_guardrails(data)))
        for phrase in ('16,000,000 B', '15,000,001 B', 'b'*32, '1700000000',
                       '活动 UNKNOWN', 'private-objects.zh.md', '不能改成宽范围'):
            self.assertIn(phrase,text)

    def test_unbound_or_invalid_candidate_never_becomes_exact(self):
        for field,value in [('manifest_digest',None), ('candidates',[dict(candidate_id='invalid')])]:
            inputs=precise();inputs[field]=value
            plan=plans.build_plan(fixture(),precise=inputs)
            self.assertFalse(any(row.get('decision_evidence') for row in plan['rows']))
