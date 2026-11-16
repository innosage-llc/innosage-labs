#!/usr/bin/env python3
"""Run all four local audit sources; stdout is only redacted aggregate JSON."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def collect_file_types(timeout=30):
    try:
        run = subprocess.run([sys.executable, '-B', str(Path(__file__).with_name('audit-file-types.py')),
             '--timeout', str(timeout)], capture_output=True, timeout=timeout + 3, stdin=subprocess.DEVNULL)
        data = json.loads(run.stdout)
        if not isinstance(data, dict) or data.get('source') != 'file-type-metadata':
            raise ValueError('invalid aggregate')
        return data
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return dict(source='file-type-metadata', completeness='FAILED', presence='UNKNOWN',
                    reasons=['file_type_worker_failed_or_timed_out'], categories=[], contexts=[],
                    observed_allocated_bytes=None, actual_freed_bytes=None)


def run_all(timeout=180, worktree_timeout=30, file_type_timeout=30):
    scripts = Path(__file__).resolve().parent
    sources = []
    commands = [('codex-worktree-inventory', [str(scripts / 'audit-codex-worktrees.py'),
                 '--timeout', str(worktree_timeout), '--max-entries', '500000'], worktree_timeout + 3)]
    commands += [('mole-' + source, [str(scripts / 'audit-mole.py'), '--source', source,
                  '--timeout', str(timeout)], timeout + 25) for source in ('analyze', 'clean', 'purge')]
    for name, arguments, budget in commands:
        started = time.monotonic()
        try:
            run = subprocess.run([sys.executable, '-B', *arguments], capture_output=True,
                                 timeout=budget, stdin=subprocess.DEVNULL)
            data = json.loads(run.stdout)
            if (not isinstance(data, dict) or data.get('source') != name or
                    data.get('completeness') not in ('COMPLETE', 'PARTIAL', 'FAILED')):
                raise ValueError('invalid aggregate')
            # Helpers own their fixed output schemas; never forward their stderr.
            sources.append(data)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            sources.append(dict(source=name, completeness='FAILED', presence='UNKNOWN',
                reason='source_process_failed_or_timed_out', actual_freed_bytes=None,
                duration_seconds=round(time.monotonic() - started, 6)))
    # Supplemental metadata measurement inside the analyze evidence, not a
    # replacement or invented fifth Mole source. It can succeed if Mole fails.
    file_types = collect_file_types(file_type_timeout)
    for data in sources:
        if data['source'] == 'mole-analyze':
            data['file_type_inventory'] = file_types
    return dict(schema_version=1, mode='audit_only', sources=sources,
                actual_freed_bytes=None, combined_reclaimable_bytes=None,
                source_sizes_must_not_be_added=True,
                whole_worktrees_are_candidates=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=180)
    parser.add_argument('--worktree-timeout', type=float, default=30)
    parser.add_argument('--file-type-timeout', type=float, default=30)
    args = parser.parse_args()
    if not (0 < args.timeout <= 300 and 0 < args.worktree_timeout <= 60 and 0 < args.file_type_timeout <= 60):
        parser.error('bounded timeout required')
    data = run_all(args.timeout, args.worktree_timeout, args.file_type_timeout)
    directory = Path(tempfile.mkdtemp(prefix='is-clean-my-mac-report-', dir='/tmp'))
    try:
        collected=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('precise-cache.py')),
            '--collect-to',str(directory/'private-candidates.json')],capture_output=True,timeout=6,stdin=subprocess.DEVNULL)
        precise=json.loads(collected.stdout)
        if not isinstance(precise,dict) or precise.get('source')!='precise-cache-candidates':raise ValueError('invalid aggregate')
    except (OSError,ValueError,subprocess.TimeoutExpired):
        precise=dict(source='precise-cache-candidates',completeness='FAILED',candidates=[],reasons=['precise_candidate_collection_failed'])
    spec = importlib.util.spec_from_file_location('report', Path(__file__).with_name('render-report.py'))
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    spec = importlib.util.spec_from_file_location('approval_plan', Path(__file__).with_name('approval-plan.py'))
    approvals = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(approvals)
    plan = approvals.build_plan(data,precise=precise)
    text = renderer.render_summary(data,plan)+'\n---\n'+renderer.render(data)
    private_review=None
    if any(row.get('source')=='precise-cache' for row in plan['rows']):
        # Human-local inspection only. Do not put these contents in stdout.
        executor=approvals.load_executor()
        items=approvals.read_private(plan,directory/'review-plan.json',executor)
        lines=['# 仅本机精确对象 — 不要上传或交给模型读取','', '方案 '+plan['plan_id'],
               '', '以下缓存对象按固定路径/文件名格式识别，未读取内容。批准行将永久删除，成功后没有自动备份；可能需要重新下载且离线不可用。失败捕获不是长期备份。','',
               '| 行 | 对象 ID | Home 相对路径 | dev/inode | 分配字节 |','| --- | --- | --- | --- | --- |']
        for row in plan['rows']:
            if row.get('source')!='precise-cache':continue
            item=items[row['scope_tokens'][0]]
            path='/'.join((*executor.ROOTS[item['category']],*item['parts']))
            lines.append(f"| {row['row_id']} | {item['candidate_id']} | {path} | {item['target']['st_dev']}/{item['target']['st_ino']} | {item['allocated_bytes']} |")
        private_review=directory/'private-objects.zh.md'
        fd=os.open(private_review,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as output:output.write('\n'.join(lines)+'\n')
    # New task-owned artifact only; no existing source/Skill/report is overwritten.
    report = directory / 'audit.zh.md'
    with report.open('x') as output:
        output.write(text)
    aggregates = directory / 'aggregate.json'
    with aggregates.open('x') as output:
        json.dump(data, output, sort_keys=True)
    plan_path = directory / 'review-plan.json'
    with plan_path.open('x') as output:
        json.dump(plan, output, sort_keys=True)
    summary=renderer.render_summary(data,plan)
    if private_review is not None:summary+='\n[查看仅本机精确对象（不要上传或交给模型读取）]('+str(private_review)+')\n'
    print(json.dumps(dict(report_path=str(report), aggregate_path=str(aggregates),
        plan_path=str(plan_path), plan_id=plan['plan_id'],
        summary_markdown=summary), sort_keys=True))


if __name__ == '__main__':
    main()
