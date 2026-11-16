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
                worktree_count=None, worktree_count_completeness='FAILED', occupied_bytes=None, observed_allocated_bytes=0,
                measurement='unique inode st_blocks * 512; symlinks not followed',
                reclaimable_bytes=None, actual_freed_bytes=None, whole_worktrees_are_candidates=False,
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


def discover_root(environ=None, home=None):
    """Discover the scoped local convention independently of workspace parsing.

    CODEX_HOME is explicit local authority. Without it, recognized app root
    metadata corroborates the default convention; an existing physical worktree
    directory plus a regular app metadata file also corroborates that local root
    when optional workspace metadata cannot be parsed. Neither proves coverage
    of custom locations or other hosts. Never guess values in unknown formats.
    """
    environ = os.environ if environ is None else environ
    home = Path.home() if home is None else home
    configured = environ.get('CODEX_HOME')
    codex_home = Path(configured) if configured else home / '.codex'
    if not codex_home.is_absolute() or '..' in codex_home.parts or codex_home == Path('/'):
        raise ValueError('invalid_CODEX_HOME')
    metadata = dict(root_source='CODEX_HOME_environment' if configured else 'local_app_metadata_default',
                    discovery_scope='local_CODEX_HOME_worktrees_only',
                    other_host_or_custom_root_coverage='UNKNOWN',
                    workspace_count=None, workspace_count_source='UNKNOWN',
                    workspace_count_completeness='UNKNOWN',
                    workspace_metadata_status='unavailable',
                    discovery_metadata_completeness='PARTIAL')
    descriptor = None
    metadata_regular = False
    physical_worktrees = False
    try:
        descriptor = open_root(codex_home)
        # Existence and type corroboration do not depend on readability/schema.
        try:
            info = os.stat('.codex-global-state.json', dir_fd=descriptor, follow_symlinks=False)
            metadata_regular = stat.S_ISREG(info.st_mode)
        except OSError:
            metadata['workspace_metadata_status'] = 'missing_or_inaccessible'
        if metadata_regular:
            try:
                file_fd = os.open('.codex-global-state.json',
                                  os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
                with os.fdopen(file_fd, 'rb') as stream:
                    current = os.fstat(stream.fileno())
                    if ((current.st_dev, current.st_ino) != (info.st_dev, info.st_ino) or
                            not stat.S_ISREG(current.st_mode)):
                        metadata_regular = False
                        raise ValueError('metadata_changed')
                    if current.st_size > 4 * 1024 * 1024:
                        raise ValueError('metadata_budget_exceeded')
                    raw = stream.read(4 * 1024 * 1024 + 1)
                    if len(raw) > 4 * 1024 * 1024:
                        raise ValueError('metadata_budget_exceeded')
                    data = json.loads(raw)
                roots = data.get('electron-saved-workspace-roots') if isinstance(data, dict) else None
                if (not isinstance(roots, list) or len(roots) > 10000 or
                        any(not isinstance(r, str) or not Path(r).is_absolute() or
                            '..' in Path(r).parts for r in roots)):
                    metadata['workspace_metadata_status'] = 'unsupported_workspace_roots_format'
                else:
                    metadata.update(workspace_count=len(set(roots)),
                                    workspace_count_source='local_app_saved_workspace_roots',
                                    workspace_count_completeness='METADATA_SNAPSHOT',
                                    workspace_metadata_status='recognized',
                                    discovery_metadata_completeness='COMPLETE')
            except (OSError, ValueError, UnicodeError):
                # No exception strings/raw metadata leave the helper.
                metadata['workspace_metadata_status'] = 'unreadable_invalid_or_over_budget'
        else:
            metadata['workspace_metadata_status'] = 'missing_nonregular_or_link'
        if not configured and metadata['workspace_count_completeness'] == 'UNKNOWN':
            # A replaced/removed metadata marker cannot corroborate the fallback.
            if metadata_regular:
                try:
                    latest = os.stat('.codex-global-state.json', dir_fd=descriptor, follow_symlinks=False)
                    metadata_regular = (stat.S_ISREG(latest.st_mode) and
                                        (latest.st_dev, latest.st_ino) == (info.st_dev, info.st_ino))
                except OSError:
                    metadata_regular = False
            child = None
            try:
                child = os.open('worktrees', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                dir_fd=descriptor)
                physical_worktrees = stat.S_ISDIR(os.fstat(child).st_mode)
            except OSError:
                pass
            finally:
                if child is not None:
                    os.close(child)
    except OSError:
        metadata['workspace_metadata_status'] = 'codex_home_inaccessible_or_link'
    finally:
        if descriptor is not None:
            os.close(descriptor)
    if not configured and metadata['workspace_count_completeness'] == 'UNKNOWN':
        if not (metadata_regular and physical_worktrees):
            raise ValueError('root_configuration_not_verified')
        metadata['root_source'] = 'local_app_metadata_and_physical_worktrees_default'
    return codex_home / 'worktrees', metadata


def count_layout(descriptor, seconds, max_entries=10000):
    """Independent shallow marker pass before traversing any repository payload.

    Count coverage has its own bounded 10,000-entry metadata budget. Opening is
    descriptor-relative with inode checks; never follows links or reads .git.
    """
    deadline = time.monotonic() + min(seconds / 2, 2)
    remaining = max_entries
    count = 0
    reasons = set()
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW

    def visit(fd, depth):
        nonlocal remaining, count
        if depth in (1, 2):
            if remaining <= 0 or time.monotonic() >= deadline:
                reasons.add('count_budget_exhausted')
                return
            remaining -= 1
            try:
                marker = os.stat('.git', dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                marker = None
            except OSError:
                reasons.add('count_marker_inaccessible_or_changed')
                return
            if marker is not None:
                if stat.S_ISREG(marker.st_mode) or stat.S_ISDIR(marker.st_mode):
                    count += 1
                else:
                    reasons.add('count_invalid_or_symlink_git_marker')
                return
        children = []
        with os.scandir(fd) as iterator:
            for entry in iterator:
                if remaining <= 0 or time.monotonic() >= deadline:
                    reasons.add('count_budget_exhausted')
                    return
                remaining -= 1
                try:
                    children.append((entry.name, entry.stat(follow_symlinks=False)))
                except OSError:
                    reasons.add('count_entry_inaccessible_or_changed')
        if depth == 2:
            reasons.add('count_unrecognized_worktree_layout')
            return
        for name, info in children:
            if stat.S_ISLNK(info.st_mode):
                reasons.add('count_symlink_not_followed')
            elif stat.S_ISDIR(info.st_mode):
                child_fd = None
                try:
                    child_fd = os.open(name, flags, dir_fd=fd)
                    current = os.fstat(child_fd)
                    if (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
                        reasons.add('count_entry_changed')
                        continue
                    visit(child_fd, depth + 1)
                except OSError:
                    reasons.add('count_entry_inaccessible_or_changed')
                finally:
                    if child_fd is not None:
                        os.close(child_fd)
            else:
                reasons.add('count_unrecognized_root_contents')
    try:
        visit(descriptor, 0)
    except OSError:
        reasons.add('count_enumeration_failed')
    return count, sorted(reasons)


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
        out.update(worktree_count=0, occupied_bytes=0, scope_verified=True, worktree_count_completeness='COMPLETE')
        return out
    except OSError:
        return empty('root_inaccessible_or_symlink')
    out.update(presence='PRESENT', scope_verified=True)
    layout_count, count_reasons = count_layout(descriptor, seconds)

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
    reasons.update(count_reasons)
    complete = not reasons
    out.update(completeness='COMPLETE' if complete else 'PARTIAL',
               reasons=sorted(reasons) or ['enumerated'],
               worktree_count=layout_count if not count_reasons else None,
               worktree_count_completeness='PARTIAL' if count_reasons else 'COMPLETE',
               worktree_count_reasons=count_reasons or ['layout_enumerated'],
               observed_worktree_count=layout_count,
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
    if not (0 < args.timeout <= 60 and 0 < args.max_entries <= 1000000):
        print(json.dumps(empty('invalid_budget')))
        return 2
    if not args.worker:
        # Root discovery itself can touch an unavailable filesystem. Keep every
        # filesystem operation on configured roots/metadata inside this worker.
        command = [sys.executable, '-B', os.path.abspath(__file__), '--worker',
                   '--timeout', str(args.timeout), '--max-entries', str(args.max_entries)]
        if args.root is not None:
            command += ['--root', str(args.root)]
        if args.confirm_default_root:
            command.append('--confirm-default-root')
        try:
            run = subprocess.run(command, capture_output=True, timeout=args.timeout + 1)
            result = json.loads(run.stdout)
            if not isinstance(result, dict) or result.get('source') != 'codex-worktree-inventory':
                raise ValueError('invalid worker result')
        except subprocess.TimeoutExpired:
            result = empty('worker_timeout')
        except (OSError, ValueError):
            result = empty('worker_failed')
        result.update(timeout_seconds=args.timeout, duration_seconds=round(time.monotonic() - started, 6))
        print(json.dumps(result, sort_keys=True))
        return 0 if result['completeness'] == 'COMPLETE' else 2
    root = args.root
    discovery = dict(root_source='explicit_verified_override', workspace_count=None,
                     workspace_count_source='UNKNOWN', workspace_count_completeness='UNKNOWN',
                     discovery_scope='explicit_root_only', other_host_or_custom_root_coverage='UNKNOWN')
    if root is None:
        try:
            if args.confirm_default_root:
                root = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'worktrees'
                discovery['root_source'] = 'confirmed_CODEX_HOME_convention'
            else:
                root, discovery = discover_root()
        except ValueError as error:
            # Only our fixed category strings; never include metadata/paths.
            result = empty(str(error))
            result.update(root_source='automatic_discovery_failed', workspace_count=None)
            print(json.dumps(result, sort_keys=True))
            return 2
    if not root.is_absolute() or '..' in root.parts or root == Path('/'):
        print(json.dumps(empty('root_requires_verified_absolute_path')))
        return 2
    result = inventory(root, args.timeout, args.max_entries)
    result.update(timeout_seconds=args.timeout, scope_verified=result['presence'] != 'UNKNOWN',
                  duration_seconds=round(time.monotonic() - started, 6),
                  **discovery,
                  error_category=None if result['completeness'] == 'COMPLETE' else result['reasons'][0])
    print(json.dumps(result, sort_keys=True))
    return 0 if args.worker or result['completeness'] == 'COMPLETE' else 2


if __name__ == '__main__':
    raise SystemExit(main())
