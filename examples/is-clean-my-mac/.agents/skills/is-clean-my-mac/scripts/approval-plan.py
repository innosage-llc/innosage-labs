#!/usr/bin/env python3
"""Bind fresh numbered rows to the narrow exact-file cache adapter."""
import argparse
import hashlib
import json
import math
import importlib.util
import os
import stat
import subprocess
import signal
import resource
import tempfile
import sys
from pathlib import Path
import time

MAX_AGE_SECONDS = 600
REAL_CAPABILITIES = frozenset({'discard_download_cache_file_v1'})
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


def build_plan(data, now=None, precise=None):
    rows = []
    precise=precise if isinstance(precise,dict) else {}
    private_digest=precise.get('manifest_digest')
    if isinstance(private_digest,str) and len(private_digest)==64 and all(c in '0123456789abcdef' for c in private_digest):
        candidates=precise.get('candidates',[])
        for item in (candidates[:8] if isinstance(candidates,list) else []):
            if (not isinstance(item,dict) or item.get('category') not in ('homebrew_bottle','pip_http_body')
                or not isinstance(item.get('candidate_id'),str) or len(item['candidate_id'])!=32
                or any(c not in '0123456789abcdef' for c in item['candidate_id'])
                or not isinstance(item.get('scope_digest'),str) or len(item['scope_digest'])!=64
                or any(c not in '0123456789abcdef' for c in item['scope_digest'])
                or any(type(item.get(key)) is not int or not 0<=item[key]<=2**65 for key in ('allocated_bytes','logical_bytes','age_days'))):continue
            rows.append(dict(row_id=len(rows)+1,source='precise-cache',category='precise_'+item['category'],
                occupied_bytes=item.get('allocated_bytes'),candidate_estimate_bytes=item.get('allocated_bytes'),
                operation='discard_download_cache_file_v1',exact_scope=True,actionable=True,blocker=None,
                scope_tokens=[item['candidate_id']],scope_digest=item['scope_digest'],observed_count=1,
                age_days=item.get('age_days'),recovery_cost='permanent_removal_redownload_may_be_unavailable',actual_freed_bytes=None))
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
    if precise:
        plan['precise_manifest_digest']=private_digest
        plan['precise_collection']={key:precise[key] for key in ('completeness','reasons','scope') if key in precise}
    plan['plan_id'] = plan_digest(plan)
    return plan


def select(plan, selected, expected_plan_id, current_scope_digests=None, capabilities=REAL_CAPABILITIES, now=None):
    """Evaluate explicit IDs; caller must hold actual owner approval, not website text.

    Only registered exact-file capabilities can pass; Mole aggregates stay blocked.
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
    labels.update(mole_protection_configuration_present='存在 Mole 保护配置，转人工；未读取或更改配置',
       precise_runtime_unavailable='本机精确执行运行时不可用，未执行',
       private_manifest_unavailable_or_changed='私有对象清单缺失/改变，未执行',
       precise_scope_drift_or_protection='精确对象变化或触发保护',
       candidate_identity_or_metadata_changed='候选身份/元数据变化',ancestor_identity_changed='祖先目录身份变化',
       captured_identity_or_metadata_changed='捕获后对象变化，停止删除',cache_metadata_changed='pip 配对元数据变化',
       open_file_or_visibility_unknown='对象正在使用或可见性未知，未删除',repository_protected='仓库/worktree 受保护',
       unsafe_directory='目录所有权/共享权限不安全',extended_permission_unknown='扩展权限不受支持',
       execution_preflight_or_replay_failed='执行前复核失败或本方案已使用',precise_operation_failed='精确操作失败，未自动重试',
       cross_device_recovery_unavailable='无法在同一卷安全捕获/恢复',explicit_scoped_consent_missing='未收到真实批准后的精确确认')
    statuses={'BLOCKED':'未执行/跳过','ELIGIBLE':'通过预检，尚未执行','SUCCEEDED':'指定对象已删除',
       'RECOVERY_REQUIRED':'保留恢复副本，需恢复处理','REMOVED_RECEIPT_FAILED':'对象已删除，记录异常需核验'}
    changed=any(row.get('status') in ('SUCCEEDED','REMOVED_RECEIPT_FAILED') for row in result.get('rows',[]))
    lines=[('已处理明确批准的独立缓存对象；' if changed else '本次尚未删除对象；')+'实际可归因释放 UNKNOWN（null）。','', '| 批准行 | 结果 | 详情 |','| --- | --- | --- |']
    for row in result.get('rows',[]):
        detail=labels.get(row.get('blocker'),'按原方案永久删除；后续可能重新下载' if row.get('status')=='SUCCEEDED' else '无扩大范围操作')
        lines.append(f"| {row['row_id']} | {statuses.get(row.get('status'),'UNKNOWN')} | {detail} |")
    if not result.get('rows'):
        lines.append('| — | BLOCKED | '+labels.get(result.get('blocker'),'UNKNOWN')+' |')
    def available(key):
        value=result.get(key,{}).get('available_bytes')
        return f'{value:,} B' if type(value) is int and value>=0 else 'UNKNOWN'
    if 'disk_free_before' in result:
        change=result.get('disk_free_change_bytes')
        delta=f'{change:+,} B' if type(change) is int else 'UNKNOWN'
        lines += ['', '磁盘可用空间：前 '+available('disk_free_before')+'，后 '+available('disk_free_after')+'；观察差值 '+delta+'；方法 statvfs f_bavail × f_frsize。差值可能来自并发活动/APFS共享/延迟，不能当作本次可归因释放。']
    if type(result.get('removed_scope_allocated_bytes')) is int:
        lines += ['已移除对象原有分配字节：'+str(result['removed_scope_allocated_bytes'])+' B；与卷实际新增可用空间分开。']
    lines += ['下一步：已跳过项不自动重试；有恢复保留时先检查同一 recovery_plan_id，恢复也不覆盖新文件。广泛 Mole 行仍受接口限制；不改用宽范围 clean/purge、不处理未选 Trash。']
    return '\n'.join(lines)


def load_executor():
    spec=importlib.util.spec_from_file_location('precise_executor',Path(__file__).with_name('precise-cache.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def read_private(plan,path,executor):
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        if info.st_uid!=os.getuid() or info.st_mode&0o077 or not executor.private_acl(fd):raise ValueError('private directory unsafe')
        filefd=os.open('private-candidates.json',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        with os.fdopen(filefd,'rb') as stream:
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1 or info.st_mode&0o077 or info.st_size>1048576:raise ValueError('private manifest unsafe')
            raw=stream.read(1048577)
        if len(raw)>1048576 or hashlib.sha256(raw).hexdigest()!=plan.get('precise_manifest_digest'):raise ValueError('private manifest changed')
        private=json.loads(raw)
        items=private.get('objects') if isinstance(private,dict) else None
        if not isinstance(items,list) or len(items)>8 or any(not executor.valid_item(item) for item in items):raise ValueError('private manifest shape')
        if len({x['candidate_id'] for x in items})!=len(items) or len({(x['target']['st_dev'],x['target']['st_ino']) for x in items})!=len(items):raise ValueError('overlapping private objects')
        return {item['candidate_id']:item for item in items}
    finally:os.close(fd)


def process_request(args,executor=None,home=None,probe=None):
    executor=load_executor() if executor is None else executor
    fd=os.open(args.plan,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_uid!=os.getuid() or info.st_size>1048576:raise ValueError('plan file unsafe')
        raw=stream.read(1048577)
    if len(raw)>1048576:raise ValueError('plan budget')
    plan=json.loads(raw)
    base=select(plan,args.rows,args.plan_id)
    if not valid_plan(plan) or base.get('blocker'):
        return dict(base,actual_freed_bytes=None,summary_markdown=outcome_summary(base))
    requested=[r for r in plan['rows'] if r['row_id'] in args.rows]
    current={};items={};binding_errors={}
    if any(r.get('operation') in REAL_CAPABILITIES for r in requested):
        try:
            items=read_private(plan,args.plan,executor)
            for row in requested:
                if row.get('operation') not in REAL_CAPABILITIES:continue
                try:
                    if row.get('source')!='precise-cache' or len(row.get('scope_tokens',[]))!=1:raise ValueError('invalid binding')
                    item=items[row['scope_tokens'][0]]
                    if (row.get('category')!='precise_'+item['category'] or row.get('scope_digest')!=item['scope_digest']
                        or row.get('candidate_estimate_bytes')!=item['allocated_bytes']
                        or row.get('recovery_cost')!='permanent_removal_redownload_may_be_unavailable'):raise ValueError('invalid binding')
                    current[row['row_id']]=executor.revalidate(item,home)
                except executor.Stop as error:
                    code=str(error)
                    safe={'candidate_identity_or_metadata_changed','ancestor_identity_changed','cache_metadata_changed','repository_protected',
                          'unsafe_directory','extended_permission_unknown','mole_protection_configuration_present','precise_runtime_unavailable'}
                    binding_errors[row['row_id']]=code if code in safe else 'precise_scope_drift_or_protection'
                except (OSError,KeyError,ValueError,TypeError):binding_errors[row['row_id']]='precise_scope_drift_or_protection'
        except (OSError,ValueError,TypeError,KeyError):
            binding_errors={r['row_id']:'private_manifest_unavailable_or_changed' for r in requested if r.get('operation') in REAL_CAPABILITIES}
    result=select(plan,args.rows,args.plan_id,current)
    for row in result['rows']:
        if row['row_id'] in binding_errors:row.update(status='BLOCKED',blocker=binding_errors[row['row_id']])
    eligible=[r for r in result['rows'] if r['status']=='ELIGIBLE']
    if not args.apply or not eligible:
        result.update(mode='PREVIEW_ONLY',actual_freed_bytes=None,summary_markdown=outcome_summary(result))
        return result
    chosen=[r for r in requested if r['row_id'] in {r['row_id'] for r in eligible}]
    selected=[items[r['scope_tokens'][0]] for r in chosen]
    where=(executor.home_directory() if home is None else home)/'Library/Caches'
    before=disk_free_snapshot(where)
    options=dict(home=home,row_map={r['scope_tokens'][0]:r['row_id'] for r in chosen})
    if probe is not None:options['probe']=probe
    execution=executor.execute(args.plan_id,selected,**options)
    by_token={r['candidate_id']:r for r in execution.get('rows',[])}
    for row in eligible:
        token=next(r['scope_tokens'][0] for r in chosen if r['row_id']==row['row_id'])
        value=by_token.get(token,dict(status='BLOCKED',blocker=execution.get('blocker','precise_execution_failed'),actual_freed_bytes=None))
        row.update({k:v for k,v in value.items() if k!='candidate_id'})
    after=disk_free_snapshot(where)
    result.update(mode='PRECISE_SELECTED_CACHE_FILES',status='SUCCEEDED' if all(r['status']=='SUCCEEDED' for r in result['rows']) else 'PARTIAL',
        actual_freed_bytes=None,removed_scope_allocated_bytes=execution.get('removed_scope_allocated_bytes'),
        disk_free_before=before,disk_free_after=after,
        disk_free_change_bytes=after['available_bytes']-before['available_bytes'] if before['available_bytes'] is not None and after['available_bytes'] is not None else None,
        recovery_plan_id=args.plan_id,
        attribution='removed object allocation is not attributable physical release; filesystem drift includes concurrent activity')
    result['summary_markdown']=outcome_summary(result)
    return result


def bounded_worker(arguments,acknowledgement=None,timeout=15):
    command=[sys.executable,'-B',os.path.abspath(__file__),'--worker',*arguments]
    plan_id=arguments[arguments.index('--plan-id')+1]
    with tempfile.TemporaryFile() as output,tempfile.TemporaryFile() as errors:
        def bounded():resource.setrlimit(resource.RLIMIT_FSIZE,(1048576,1048576))
        process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=output,stderr=errors,start_new_session=True,preexec_fn=bounded)
        try:
            process.communicate(input=(acknowledgement+'\n').encode() if acknowledgement else b'',timeout=timeout)
            if process.returncode or errors.tell() or output.tell()>=1048576:raise ValueError('worker failed or output budget')
            output.seek(0);result=json.loads(output.read())
            allowed={'status','blocker','rows','actual_freed_bytes','mode','summary_markdown','removed_scope_allocated_bytes',
                     'disk_free_before','disk_free_after','disk_free_change_bytes','recovery_plan_id','attribution'}
            if (not isinstance(result,dict) or not set(result)<=allowed or result.get('actual_freed_bytes') is not None
                or result.get('status') not in ('READY','BLOCKED','SUCCEEDED','PARTIAL','INTERRUPTED')
                or not isinstance(result.get('rows'),list)):raise ValueError('worker format')
            return result
        except subprocess.TimeoutExpired:
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            process.wait()
            return dict(status='INTERRUPTED',blocker='worker_timeout_recovery_inspection_required',rows=[],actual_freed_bytes=None,recovery_plan_id=plan_id)
        except (ValueError,UnicodeError):
            return dict(status='INTERRUPTED',blocker='worker_result_unknown_recovery_inspection_required',rows=[],actual_freed_bytes=None,recovery_plan_id=plan_id)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan',type=Path,required=True)
    parser.add_argument('--plan-id',required=True)
    parser.add_argument('--rows',nargs='+',type=int,required=True)
    parser.add_argument('--apply',action='store_true',help='Requires exact stdin acknowledgement after actual scoped owner approval')
    parser.add_argument('--worker',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.worker:
        if args.apply:
            expected='APPLY '+args.plan_id+' '+','.join(map(str,sorted(args.rows)))
            if sys.stdin.readline(1024).rstrip('\n')!=expected:
                print(json.dumps(dict(status='BLOCKED',blocker='explicit_scoped_consent_missing',rows=[],actual_freed_bytes=None)));return
        print(json.dumps(process_request(args),sort_keys=True));return
    arguments=['--plan',str(args.plan),'--plan-id',args.plan_id,'--rows',*map(str,args.rows)]
    result=bounded_worker(arguments)
    if args.apply and any(row.get('status')=='ELIGIBLE' for row in result.get('rows',[])):
        print('CONFIRM_PENDING plan='+args.plan_id+' rows='+','.join(map(str,sorted(args.rows)))+' permanent removal; no broader operation',flush=True)
        expected='APPLY '+args.plan_id+' '+','.join(map(str,sorted(args.rows)))
        answer=sys.stdin.readline(1024).rstrip('\n')
        if answer!=expected:result=dict(status='BLOCKED',blocker='explicit_scoped_consent_missing',rows=[],actual_freed_bytes=None)
        else:result=bounded_worker([*arguments,'--apply'],answer,120)
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,KeyError,TypeError,OverflowError,RecursionError,AttributeError):
        uncertain='--apply' in sys.argv
        plan_id=sys.argv[sys.argv.index('--plan-id')+1] if '--plan-id' in sys.argv and sys.argv.index('--plan-id')+1<len(sys.argv) else None
        print(json.dumps(dict(status='INTERRUPTED' if uncertain else 'BLOCKED',
            blocker='apply_outcome_unknown_recovery_inspection_required' if uncertain else 'plan_read_or_format_failed',
            recovery_plan_id=plan_id,rows=[],actual_freed_bytes=None)))
