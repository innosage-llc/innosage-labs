#!/usr/bin/env python3
"""Read-only bounded inventory. stdout contains only aggregate metadata."""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time


def empty(reason, presence='UNKNOWN', completeness='FAILED'):
    return dict(schema_version=1, source='codex-worktree-inventory',
                presence=presence, completeness=completeness, reasons=[reason],
                command='audit-codex-worktrees.py (root redacted)', scope_verified=False,
                duration_seconds=None, timeout_seconds=None, error_category=reason,
                worktree_count=None, occupied_bytes=None, observed_allocated_bytes=0,
                measurement='unique inode st_blocks * 512; symlinks not followed',
                reclaimable_bytes=None, whole_worktrees_are_candidates=False,
                blockers={k: 'UNKNOWN' for k in
                          ('active', 'dirty', 'untracked', 'ignored', 'unpushed', 'detached', 'locked')})


def open_root(root):
    """Open every path component without following links, including ancestors."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptor = os.open('/', flags)
    try:
        for component in root.parts[1:]:
            next_descriptor = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def inventory(root, seconds=10, max_entries=100000):
    out = empty('scan_started')
    deadline = time.monotonic() + seconds
    reasons = set()
    seen = set()
    count = 0
    allocated = 0
    entries = 0
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    try:
        descriptor = open_root(root)
    except FileNotFoundError:
        out = empty('verified_root_absent', 'ABSENT', 'COMPLETE')
        out.update(worktree_count=0, occupied_bytes=0, scope_verified=True)
        return out
    except OSError:
        return empty('root_inaccessible_or_symlink')
    out.update(presence='PRESENT', scope_verified=True)

    def visit(fd, depth, in_repo):
        nonlocal count, allocated, entries
        if time.monotonic() >= deadline or entries >= max_entries or depth > 128:
            reasons.add('scan_budget_exhausted')
            return
        info = os.fstat(fd)
        inode = (info.st_dev, info.st_ino)
        if inode in seen:
            return
        seen.add(inode)
        allocated += info.st_blocks * 512
        entries += 1
        children = []
        # scandir(fd) anchors enumeration to the opened directory, not its path.
        with os.scandir(fd) as iterator:
            for entry in iterator:
                if len(children) + entries >= max_entries or time.monotonic() >= deadline:
                    reasons.add('scan_budget_exhausted')
                    break
                try:
                    children.append((entry.name, entry.stat(follow_symlinks=False)))
                except OSError:
                    reasons.add('entry_inaccessible_or_changed')
        marker = any(name == '.git' for name, _ in children)
        if marker and not in_repo:
            if depth in (1, 2):
                count += 1
            else:
                reasons.add('unsupported_nested_repository')
        if not marker and not in_repo:
            if depth == 2 or (depth == 1 and not any(stat.S_ISDIR(i.st_mode) for _, i in children)):
                reasons.add('unrecognized_worktree_layout')
            if depth == 0 and any(not stat.S_ISDIR(i.st_mode) for _, i in children):
                reasons.add('unrecognized_root_contents')
        for name, child_info in children:
            if time.monotonic() >= deadline or entries >= max_entries:
                reasons.add('scan_budget_exhausted')
                break
            if stat.S_ISLNK(child_info.st_mode):
                reasons.add('symlink_not_followed')
            if stat.S_ISDIR(child_info.st_mode):
                child_fd = None
                try:
                    child_fd = os.open(name, flags, dir_fd=fd)
                    current = os.fstat(child_fd)
                    if (current.st_dev, current.st_ino) != (child_info.st_dev, child_info.st_ino):
                        reasons.add('entry_changed')
                        continue
                    visit(child_fd, depth + 1, in_repo or marker)
                except OSError:
                    reasons.add('entry_inaccessible_or_changed')
                finally:
                    if child_fd is not None:
                        os.close(child_fd)
            else:
                inode = (child_info.st_dev, child_info.st_ino)
                if inode not in seen:
                    seen.add(inode)
                    allocated += child_info.st_blocks * 512
                    entries += 1
    try:
        visit(descriptor, 0, False)
    except OSError:
        reasons.add('enumeration_failed')
    finally:
        os.close(descriptor)
    complete = not reasons
    out.update(completeness='COMPLETE' if complete else 'PARTIAL',
               reasons=sorted(reasons) or ['enumerated'],
               worktree_count=count if complete else None,
               observed_worktree_count=count,
               occupied_bytes=allocated if complete else None,
               observed_allocated_bytes=allocated)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, help='Physical worktree root verified locally by user/host configuration')
    parser.add_argument('--confirm-default-root', action='store_true',
                        help='Confirm host uses CODEX_HOME/worktrees without a custom override')
    parser.add_argument('--timeout', type=float, default=10)
    parser.add_argument('--max-entries', type=int, default=100000)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    started = time.monotonic()
    if args.timeout <= 0 or args.max_entries <= 0:
        print(json.dumps(empty('invalid_budget')))
        return 2
    root = args.root
    if root is None:
        if not args.confirm_default_root:
            print(json.dumps(empty('root_configuration_not_verified')))
            return 2
        root = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'worktrees'
    if not root.is_absolute() or '..' in root.parts or root == Path('/'):
        print(json.dumps(empty('root_requires_verified_absolute_path')))
        return 2
    if args.worker:
        result = inventory(root, args.timeout, args.max_entries)
    else:
        command = [sys.executable, '-B', str(Path(__file__).resolve()), '--worker',
                   '--root', str(root), '--timeout', str(args.timeout), '--max-entries', str(args.max_entries)]
        try:
            run = subprocess.run(command, capture_output=True, timeout=args.timeout + 1, check=True)
            result = json.loads(run.stdout)
        except subprocess.TimeoutExpired:
            result = empty('worker_timeout')
        except (OSError, subprocess.CalledProcessError, ValueError):
            result = empty('worker_failed')
    result.update(timeout_seconds=args.timeout, scope_verified=result['presence'] != 'UNKNOWN',
                  duration_seconds=round(time.monotonic() - started, 6),
                  root_source='explicit_verified_override' if args.root else 'confirmed_CODEX_HOME_convention',
                  error_category=None if result['completeness'] == 'COMPLETE' else result['reasons'][0])
    print(json.dumps(result, sort_keys=True))
    return 0 if result['completeness'] == 'COMPLETE' else 2


if __name__ == '__main__':
    raise SystemExit(main())
