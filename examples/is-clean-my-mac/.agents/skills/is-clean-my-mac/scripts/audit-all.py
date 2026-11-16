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


def run_all(timeout=180, worktree_timeout=30):
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
    return dict(schema_version=1, mode='audit_only', sources=sources,
                actual_freed_bytes=None, combined_reclaimable_bytes=None,
                source_sizes_must_not_be_added=True,
                whole_worktrees_are_candidates=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=180)
    parser.add_argument('--worktree-timeout', type=float, default=30)
    args = parser.parse_args()
    if not (0 < args.timeout <= 300 and 0 < args.worktree_timeout <= 60):
        parser.error('bounded timeout required')
    data = run_all(args.timeout, args.worktree_timeout)
    spec = importlib.util.spec_from_file_location('report', Path(__file__).with_name('render-report.py'))
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    text = renderer.render(data)
    # New task-owned artifact only; no existing source/Skill/report is overwritten.
    directory = Path(tempfile.mkdtemp(prefix='is-clean-my-mac-report-', dir='/tmp'))
    report = directory / 'audit.zh.md'
    with report.open('x') as output:
        output.write(text)
    data.update(report_path=str(report), report_markdown=text)
    print(json.dumps(data, sort_keys=True))


if __name__ == '__main__':
    main()
