#!/usr/bin/env python3
"""Run all four local audit sources; stdout is only redacted aggregate JSON."""
import argparse
import importlib.util
import json
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
    spec = importlib.util.spec_from_file_location('report', Path(__file__).with_name('render-report.py'))
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    spec = importlib.util.spec_from_file_location('approval_plan', Path(__file__).with_name('approval-plan.py'))
    approvals = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(approvals)
    plan = approvals.build_plan(data)
    text = renderer.render(data)
    # New task-owned artifact only; no existing source/Skill/report is overwritten.
    directory = Path(tempfile.mkdtemp(prefix='is-clean-my-mac-report-', dir='/tmp'))
    report = directory / 'audit.zh.md'
    with report.open('x') as output:
        output.write(text)
    aggregates = directory / 'aggregate.json'
    with aggregates.open('x') as output:
        json.dump(data, output, sort_keys=True)
    plan_path = directory / 'review-plan.json'
    with plan_path.open('x') as output:
        json.dump(plan, output, sort_keys=True)
    print(json.dumps(dict(report_path=str(report), aggregate_path=str(aggregates),
        plan_path=str(plan_path), plan_id=plan['plan_id'],
        summary_markdown=renderer.render_summary(data, plan)), sort_keys=True))


if __name__ == '__main__':
    main()
