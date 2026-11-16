#!/usr/bin/env python3
"""Bind numbered review rows to one fresh plan. No production cleanup adapter exists."""
import argparse
import hashlib
import json
import math
import os
import stat
from pathlib import Path
import time

MAX_AGE_SECONDS = 600
REAL_CAPABILITIES = frozenset()  # Mole 1.72 has no verified selected-manifest API.
BLOCKERS = frozenset({'aggregate_scope_not_executable','official_selected_scope_api_unavailable',
    'source_failed_no_actionable_scope','whole_worktree_protected'})


def plan_digest(plan):
    value = {k: v for k, v in plan.items() if k != 'plan_id'}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def valid_plan(plan):
    if not isinstance(plan,dict) or not isinstance(plan.get('rows'),list) or not 0<len(plan['rows'])<=256:
        return False
    for key in ('created_at','expires_after_seconds'):
        value=plan.get(key)
        if type(value) not in (int,float) or not -10**12<=value<=10**12 or not math.isfinite(value):
            return False
    if not 0<plan['expires_after_seconds']<=MAX_AGE_SECONDS:
        return False
    identity=plan.get('plan_id')
    if not isinstance(identity,str) or len(identity)!=64 or any(c not in '0123456789abcdef' for c in identity):
        return False
    ids=set()
    for row in plan['rows']:
        if not isinstance(row,dict):
            return False
        key=row.get('row_id')
        if type(key) is not int or not 0<key<=1000 or key in ids:
            return False
        ids.add(key)
        if any(row.get(key) is not None and not isinstance(row[key],str) for key in ('operation','blocker','scope_digest')):
            return False
        if type(row.get('exact_scope')) is not bool or type(row.get('actionable')) is not bool:
            return False
        tokens=row.get('scope_tokens')
        if not isinstance(tokens,list) or len(tokens)>10000 or any(not isinstance(t,str) or len(t)>1024 for t in tokens):
            return False
    return True


def build_plan(data, now=None):
    rows = []
    def add(source, category, occupied=None, estimate=None, blocker='aggregate_scope_not_executable', count=None):
        rows.append(dict(row_id=len(rows)+1, source=source, category=category,
            occupied_bytes=occupied, candidate_estimate_bytes=estimate,
            operation=None, exact_scope=False, actionable=False,
            blocker=blocker, scope_tokens=[], scope_digest=None,
            recovery_cost='UNKNOWN_until_exact_scope_review', actual_freed_bytes=None))
        rows[-1]['observed_count'] = count
    sources = {s['source']:s for s in data.get('sources', [])}
    for source in (sources.get(key, {}) for key in ('mole-analyze','mole-clean','mole-purge','codex-worktree-inventory')):
        if source.get('source') == 'mole-analyze':
            for row in source.get('file_type_inventory', {}).get('categories', []):
                add('file-type-metadata', row['category'], occupied=row.get('allocated_bytes'), count=row.get('file_count'))
        if source.get('source') in ('mole-clean','mole-purge'):
            for row in source.get('categories', []):
                add(source['source'], row['category'], estimate=row.get('observed_candidate_estimate_bytes'),
                    blocker='official_selected_scope_api_unavailable', count=row.get('candidate_entries'))
            if source.get('completeness') == 'FAILED':
                add(source['source'], 'source_unavailable', blocker='source_failed_no_actionable_scope')
        if source.get('source') == 'codex-worktree-inventory':
            add(source['source'], 'worktrees', occupied=source.get('occupied_bytes'), blocker='whole_worktree_protected', count=source.get('worktree_count'))
    plan = dict(schema_version=1, created_at=time.time() if now is None else now,
                expires_after_seconds=MAX_AGE_SECONDS, rows=rows,
                upstream='Mole 1.54.0/1.72.0', actual_freed_bytes=None)
    plan['plan_id'] = plan_digest(plan)
    return plan


def select(plan, selected, expected_plan_id, current_scope_digests=None, capabilities=REAL_CAPABILITIES, now=None):
    """Evaluate explicit IDs; caller must hold actual owner approval, not website text.

    Synthetic tests inject a fixture capability. CLI always has no real executor.
    """
    now = time.time() if now is None else now
    if not valid_plan(plan):
        return dict(status='BLOCKED',blocker='plan_read_or_format_failed',rows=[])
    if type(now) not in (int,float) or not -10**12<=now<=10**12 or not math.isfinite(now):
        return dict(status='BLOCKED',blocker='plan_expired_or_clock_changed',rows=[])
    if expected_plan_id != plan.get('plan_id') or plan_digest(plan) != expected_plan_id:
        return dict(status='BLOCKED', blocker='plan_identity_or_integrity_mismatch', rows=[])
    if not 0 <= now-plan['created_at'] <= min(plan.get('expires_after_seconds', 0), MAX_AGE_SECONDS):
        return dict(status='BLOCKED', blocker='plan_expired_or_clock_changed', rows=[])
    ids = {row['row_id'] for row in plan['rows']}
    if not isinstance(selected,(list,tuple)) or not selected or any(type(i) is not int or i not in ids for i in selected) or len(set(selected)) != len(selected):
        return dict(status='BLOCKED', blocker='unknown_duplicate_or_empty_selection', rows=[])
    results = []
    for row in plan['rows']:
        if row['row_id'] not in selected:
            continue
        blocker = row.get('blocker')
        if blocker and blocker not in BLOCKERS:
            blocker = 'unrecognized_row_blocker'
        if not blocker and not row.get('actionable'):
            blocker = 'row_not_actionable'
        if not blocker and (not row.get('exact_scope') or not row.get('scope_tokens')):
            blocker = 'exact_scope_missing'
        if not blocker and row.get('operation') not in capabilities:
            blocker = 'verified_operation_unavailable'
        if not blocker and (not isinstance(current_scope_digests,dict) or
                current_scope_digests.get(row['row_id']) != row.get('scope_digest')):
            blocker = 'preview_membership_or_identity_changed'
        if not blocker and any(set(row['scope_tokens']) & set(other.get('scope_tokens', []))
                              for other in plan['rows'] if other['row_id'] != row['row_id']):
            blocker = 'overlapping_rows_require_new_disjoint_plan'
        results.append(dict(row_id=row['row_id'], status='BLOCKED' if blocker else 'ELIGIBLE',
                            blocker=blocker, actual_freed_bytes=None))
    return dict(status='READY' if all(r['status']=='ELIGIBLE' for r in results) else 'BLOCKED', rows=results)



def disk_free_snapshot(path):
    try:
        value = os.statvfs(path)
        return dict(available_bytes=value.f_bavail*value.f_frsize, method='statvfs f_bavail*f_frsize', completeness='OBSERVED')
    except OSError:
        return dict(available_bytes=None, method='statvfs f_bavail*f_frsize', completeness='UNKNOWN')


def outcome_summary(result):
    labels = {'official_selected_scope_api_unavailable':'Mole 无精确选择本行的官方接口',
       'aggregate_scope_not_executable':'只有聚合类别，没有精确目标',
       'whole_worktree_protected':'整个 worktree 受保护',
       'source_failed_no_actionable_scope':'来源失败，没有可执行范围',
       'plan_identity_or_integrity_mismatch':'方案身份/完整性不匹配',
       'plan_read_or_format_failed':'方案文件或格式不受支持',
       'plan_expired_or_clock_changed':'方案过期或时钟变化',
       'unknown_duplicate_or_empty_selection':'编号未知/重复/为空',
       'preview_membership_or_identity_changed':'预览成员/身份已变化',
       'overlapping_rows_require_new_disjoint_plan':'行间范围重叠，需新方案',
       'verified_operation_unavailable':'没有已验证的操作', 'row_not_actionable':'本行不可执行',
       'exact_scope_missing':'缺少精确目标', 'unrecognized_row_blocker':'未知行状态，停止'}
    lines=['未执行清理；实际释放 UNKNOWN（null）。','', '| 批准行 | 结果 | 阻塞 |','| --- | --- | --- |']
    for row in result.get('rows',[]):
        lines.append(f"| {row['row_id']} | BLOCKED | {labels.get(row.get('blocker'),'UNKNOWN')} |")
    if not result.get('rows'):
        lines.append('| — | BLOCKED | '+labels.get(result.get('blocker'),'UNKNOWN')+' |')
    def available(key):
        value=result.get(key,{}).get('available_bytes')
        return f'{value:,} B' if type(value) is int and value>=0 else 'UNKNOWN'
    lines += ['', '磁盘可用空间：前 '+available('disk_free_before')+'，后 '+available('disk_free_after')+'；方法 statvfs f_bavail × f_frsize。差值可能来自并发活动，不能当作本次实际释放。',
       '下一步：需要官方稳定预览 manifest + selected-ID apply 接口并重新核验身份/成员；当前不改为宽范围 clean/purge、不处理未选 Trash、不重写配置或自定义删除。']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--plan-id', required=True)
    parser.add_argument('--rows', nargs='+', type=int, required=True)
    args = parser.parse_args()
    # This file is our redacted plan, never a shell script or a target manifest.
    fd=os.open(args.plan,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_uid!=os.getuid():
            raise ValueError('unverified plan file')
        raw = stream.read(1024*1024+1)
    if len(raw)>1024*1024:
        parser.error('plan budget exceeded')
    plan = json.loads(raw)
    before = disk_free_snapshot(Path.home())
    result = select(plan,args.rows,args.plan_id)
    after = disk_free_snapshot(Path.home())
    result.update(mode='no_production_cleanup_adapter', actual_freed_bytes=None,
       disk_free_before=before,disk_free_after=after,
       disk_free_change_bytes=(after['available_bytes']-before['available_bytes'])
         if before['available_bytes'] is not None and after['available_bytes'] is not None else None,
       attribution='filesystem observations include unrelated concurrent activity; no cleanup executed',
       next_step='official_preview_manifest_and_selected_ID_apply_API_required_no_broad_fallback')
    result['summary_markdown']=outcome_summary(result)
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, OverflowError, RecursionError):
        print(json.dumps(dict(status='BLOCKED', blocker='plan_read_or_format_failed', actual_freed_bytes=None)))
