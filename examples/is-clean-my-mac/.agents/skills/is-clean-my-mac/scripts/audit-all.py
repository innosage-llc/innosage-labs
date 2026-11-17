#!/usr/bin/env python3
"""Run all four local audit sources; stdout is only redacted aggregate JSON."""
import argparse
import hashlib
import importlib.util
import json
import os
import signal
import stat
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def run_worker(command, timeout, **kwargs):
    """Own/cancel one worker group, including inheriting descendants."""
    env = dict(os.environ, IS_CLEAN_OWNED_WORKER='1')
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            stdin=subprocess.DEVNULL, start_new_session=True, env=env)
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
        return subprocess.CompletedProcess(command, proc.returncode, stdout, stderr)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.communicate()
        raise
    finally:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def collect_file_types(timeout=30):
    try:
        run = run_worker([sys.executable, '-B', str(Path(__file__).with_name('audit-file-types.py')),
             '--timeout', str(max(.05, timeout - .5))], capture_output=True, timeout=timeout, stdin=subprocess.DEVNULL)
        data = json.loads(run.stdout)
        if not isinstance(data, dict) or data.get('source') != 'file-type-metadata':
            raise ValueError('invalid aggregate')
        return data
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return dict(source='file-type-metadata', completeness='FAILED', presence='UNKNOWN',
                    reasons=['file_type_worker_failed_or_timed_out'], categories=[], contexts=[],
                    observed_allocated_bytes=None, actual_freed_bytes=None)


def run_all(timeout=300, worktree_timeout=30, file_type_timeout=30, include_file_types=False):
    scripts = Path(__file__).resolve().parent
    sources = []
    started_all = time.monotonic()
    deadline = started_all + timeout
    # Reservations scale with the explicit total budget. Early completion releases
    # time forward; optional analyze depth cannot consume the preview reservations.
    jobs = [('mole-status', 10), ('mole-analyze', 100),
            ('codex-worktree-inventory', 30), ('mole-clean', 130), ('mole-purge', 30)]
    for index, (name, weight) in enumerate(jobs):
        started = time.monotonic()
        remaining = deadline - started
        reserve = sum(w for _, w in jobs[index + 1:]) * timeout / 300
        allocation = min(180, max(0, remaining - reserve))
        if name == 'mole-status':
            allocation = min(allocation, 10)
        if name == 'codex-worktree-inventory':
            allocation = min(allocation, worktree_timeout)
        if allocation <= 1:
            sources.append(dict(source=name, completeness='FAILED', presence='UNKNOWN',
                reason='shared_budget_exhausted', actual_freed_bytes=None))
            continue
        helper_budget = allocation - 0.5
        arguments = ([str(scripts / 'audit-codex-worktrees.py'), '--timeout', str(helper_budget), '--max-entries', '500000']
                     if name == 'codex-worktree-inventory' else
                     [str(scripts / 'audit-mole.py'), '--source', name[5:], '--timeout', str(helper_budget)])
        try:
            run = run_worker([sys.executable, '-B', *arguments], capture_output=True,
                                 timeout=allocation, stdin=subprocess.DEVNULL)
            data = json.loads(run.stdout)
            if (not isinstance(data, dict) or data.get('source') != name or
                    data.get('completeness') not in ('COMPLETE', 'PARTIAL', 'FAILED')):
                raise ValueError('invalid aggregate')
            data.setdefault('observed_at_unix', time.time())
            sources.append(data)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            sources.append(dict(source=name, completeness='FAILED', presence='UNKNOWN',
                reason='source_process_failed_or_timed_out', actual_freed_bytes=None,
                duration_seconds=round(time.monotonic() - started, 6)))
    if include_file_types and deadline - time.monotonic() > 1:
        file_types = collect_file_types(min(file_type_timeout, deadline - time.monotonic() - 1))
        for data in sources:
            if data['source'] == 'mole-analyze':
                data['file_type_inventory'] = file_types
    return dict(schema_version=1, mode='audit_only', sources=sources,
                total_budget_seconds=timeout, total_duration_seconds=round(time.monotonic() - started_all, 6),
                actual_freed_bytes=None, combined_reclaimable_bytes=None,
                source_sizes_must_not_be_added=True,
                whole_worktrees_are_candidates=False)



def verify_artifact(path):
    """Verify this newly written local artifact, not a client/UI link opening."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
                raise ValueError('artifact_not_owned_regular_file')
            digest = hashlib.sha256()
            while chunk := source.read(65536):
                digest.update(chunk)
        return dict(local_readable=True, size_bytes=info.st_size,
                    sha256=digest.hexdigest(), client_link_opened=False,
                    retention='temporary_not_guaranteed')
    except (OSError, ValueError):
        return dict(local_readable=False, client_link_opened=False,
                    retention='temporary_not_guaranteed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=300, help='Total audit wall-time budget, including reserved core sources')
    parser.add_argument('--worktree-timeout', type=float, default=30)
    parser.add_argument('--file-type-timeout', type=float, default=30)
    parser.add_argument('--include-file-types', action='store_true', help='Optional Home extension census, not the Mole-first audit')
    parser.add_argument('--precise-candidates', action='store_true', help='Compatibility flag: bounded exact-cache evidence is now collected by default; never applies cleanup')
    args = parser.parse_args()
    if not (0 < args.timeout <= 300 and 0 < args.worktree_timeout <= 60 and 0 < args.file_type_timeout <= 60):
        parser.error('bounded timeout required')
    started = time.monotonic()
    candidate_reserve = min(6, args.timeout * .1)
    data = run_all(args.timeout - candidate_reserve, args.worktree_timeout, args.file_type_timeout, args.include_file_types)
    directory = Path(tempfile.mkdtemp(prefix='is-clean-my-mac-report-', dir='/tmp'))
    remaining = min(candidate_reserve, args.timeout - (time.monotonic() - started))
    precise = dict(source='precise-cache-candidates', completeness='FAILED', candidates=[],
                   reasons=['precise_candidate_shared_budget_exhausted'])
    if remaining > .5:
        try:
            collected=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('precise-cache.py')),
                '--timeout',str(min(5, remaining - .25)),
                '--collect-to',str(directory/'private-candidates.json')],capture_output=True,timeout=remaining,stdin=subprocess.DEVNULL)
            precise=json.loads(collected.stdout)
            if not isinstance(precise,dict) or precise.get('source')!='precise-cache-candidates':raise ValueError('invalid aggregate')
        except (OSError,ValueError,subprocess.TimeoutExpired):
            precise=dict(source='precise-cache-candidates',completeness='FAILED',candidates=[],reasons=['precise_candidate_collection_failed'])
    data.update(total_budget_seconds=args.timeout, total_duration_seconds=round(time.monotonic() - started, 6))
    spec = importlib.util.spec_from_file_location('report', Path(__file__).with_name('render-report.py'))
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    spec = importlib.util.spec_from_file_location('approval_plan', Path(__file__).with_name('approval-plan.py'))
    approvals = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(approvals)
    plan = approvals.build_plan(data,precise=precise)
    # Keep the decision-facing report short; the full evidence is a separate
    # sibling artifact, not appended to the default answer again.
    detail_text = renderer.render_summary(data,plan)+'\n---\n'+renderer.render(data)
    details = directory / 'audit-details.zh.md'
    text = renderer.render_concise_summary(data,plan,details_link=details.name)
    private_review=None
    if any(row.get('source')=='precise-cache' for row in plan['rows']):
        # Human-local inspection only. Do not put these contents in stdout.
        executor=approvals.load_executor()
        items=approvals.read_private(plan,directory/'review-plan.json',executor)
        lines=['# 仅本机精确对象 — 不要上传或交给模型读取','', '方案 '+plan['plan_id'], '采集时点（Unix）：'+str(precise.get('observed_at_unix', 'UNKNOWN')),
               '', '以下缓存对象按固定路径/文件名格式识别，未读取内容。批准行将永久删除，成功后没有自动备份；可能需要重新下载且离线不可用。失败捕获不是长期备份。','',
               '采集时身份/保护已检查；活动状态 UNKNOWN，是否保留由 owner 判断。以下是复核对象，不是当前可删除许可。分配字节不是实际释放保证；执行前仍须新鲜逐行预检。','',
               '| 行 | 对象 ID | Home 相对路径 | dev/inode | 分配字节 | 逻辑字节 | 年龄天数 |','| --- | --- | --- | --- | --- | --- | --- |']
        for row in plan['rows']:
            if row.get('source')!='precise-cache':continue
            item=items[row['scope_tokens'][0]]
            path='/'.join((*executor.ROOTS[item['category']],*item['parts']))
            lines.append(f"| {row['row_id']} | {item['candidate_id']} | {path} | {item['target']['st_dev']}/{item['target']['st_ino']} | {item['allocated_bytes']} | {item['logical_bytes']} | {item['age_days']} |")
        private_review=directory/'private-objects.zh.md'
        fd=os.open(private_review,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as output:output.write('\n'.join(lines)+'\n')
    if private_review is not None:
        private_link = '\n[查看仅本机精确对象（不要上传或交给模型读取）](' + private_review.name + ')\n'
        text += private_link
        detail_text += private_link
    # New task-owned artifact only; no existing source/Skill/report is overwritten.
    report = directory / 'audit.zh.md'
    with report.open('x') as output:
        output.write(text)
    with details.open('x') as output:
        output.write(detail_text)
    aggregates = directory / 'aggregate.json'
    with aggregates.open('x') as output:
        json.dump(data, output, sort_keys=True)
    plan_path = directory / 'review-plan.json'
    with plan_path.open('x') as output:
        json.dump(plan, output, sort_keys=True)
    ledger_path = directory / 'evidence-ledger.json'
    with ledger_path.open('x') as output:
        json.dump(renderer.evidence_ledger(data,plan), output, sort_keys=True)
    summary=renderer.render_concise_summary(data,plan,details_link=str(details))
    if private_review is not None:summary+='\n[查看仅本机精确对象（不要上传或交给模型读取）]('+str(private_review)+')\n'
    artifacts = {name: verify_artifact(path) for name, path in (
        ('report', report), ('details', details), ('ledger', ledger_path), ('plan', plan_path))}
    if private_review is not None:
        artifacts['private_objects'] = verify_artifact(private_review)
    summary += '\n详情已在本机写出并检查可读；当前客户端能否打开尚未验证，临时文件可能失效。\n'
    print(json.dumps(dict(report_path=str(report), details_path=str(details), aggregate_path=str(aggregates),
        artifact_verification=artifacts,
        plan_path=str(plan_path), ledger_path=str(ledger_path), plan_id=plan['plan_id'],
        summary_markdown=summary, decision_guardrails=renderer.decision_guardrails(data)), sort_keys=True))


if __name__ == '__main__':
    main()
