#!/usr/bin/env python3
"""Bounded filename/stat census; reads no file contents and emits fixed classes only."""
import argparse
from collections import deque
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

EXTENSIONS = {
 'video': 'mp4 mov m4v mkv avi webm mpeg mpg mts m2ts',
 'images': 'jpg jpeg png heic heif gif webp tiff tif bmp raw cr2 nef arw dng avif',
 'audio': 'mp3 m4a wav aiff aif flac ogg opus aac',
 'documents': 'pdf doc docx odt rtf txt md pages ppt pptx keynote key',
 'spreadsheets': 'xls xlsx ods csv numbers',
 'archives_installers': 'zip tar gz bz2 xz zst 7z rar dmg pkg iso',
 'databases': 'db sqlite sqlite3 realm mdb',
 'virtual_disks': 'qcow qcow2 vmdk vdi vhd vhdx sparseimage',
 'source_and_config': 'py js ts tsx jsx c cc cpp h hpp rs go java swift rb php sh bash zsh json yaml yml toml xml plist lock css html',
 'compiled': 'o a so dylib class pyc wasm exe dll bin'}
BY_EXTENSION = {ext: label for label, extensions in EXTENSIONS.items() for ext in extensions.split()}


def classify(name):
    extension = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    if name.lower().endswith(('.db-wal', '.db-shm', '.sqlite-wal', '.sqlite-shm')):
        return 'databases'
    return BY_EXTENSION.get(extension, 'other_or_no_extension')


def context(name, inherited):
    # Exact public conventions only, never arbitrary directory labels in output.
    lower = name.lower()
    if lower.endswith('.app'):
        return 'application_bundles'
    if lower.endswith(('.photoslibrary', '.photolibrary')):
        return 'photo_libraries'
    if lower.endswith(('.sparsebundle', '.pvm', '.vmwarevm')):
        return 'virtual_machine_packages'
    if name in ('Caches', '.cache', 'PersistentCache'):
        return 'cache_directories'
    if name in ('node_modules', 'DerivedData', '.build', 'target', 'Pods'):
        return 'build_and_dependency_directories'
    return inherited


def empty(reason):
    return dict(source='file-type-metadata', completeness='FAILED', scope='home_directory_only',
      classification_basis='filename extension and fixed directory conventions; content not inspected',
      measurement='unique regular-file inode st_blocks*512; logical bytes separate; directory blocks excluded',
      presence='UNKNOWN', reasons=[reason], categories=[], contexts=[],
      allocated_bytes=None, observed_allocated_bytes=None, observed_logical_bytes=None,
      file_count=None, observed_file_count=None, enumerated_entries=0, skipped_symlinks=0,
      unavailable_entries=0, actual_freed_bytes=None, reclaimable_bytes=None,
      scope_excludes='system roots, other users, external volumes and symlink targets',
      percentages_denominator='observed allocated bytes only; never whole disk')


def open_root(root):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in root.parts[1:]:
            nxt = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
        return fd
    except BaseException:
        os.close(fd)
        raise


def inventory(root, seconds=30, max_entries=500000):
    out = empty('started')
    deadline = time.monotonic() + seconds
    try:
        root_fd = open_root(root)
        root_info = os.fstat(root_fd)
        os.close(root_fd)
    except OSError:
        return empty('root_unavailable_or_symlink')
    # Breadth first avoids spending the entire budget inside the first cache.
    queue = deque([((), (root_info.st_dev, root_info.st_ino), 'other_directories')])
    seen = set()
    reasons = set()
    groups, contexts = {}, {}
    allocated = logical = files = entries = links = unavailable = 0
    while queue:
        if time.monotonic() >= deadline or entries >= max_entries:
            reasons.add('metadata_budget_exhausted')
            break
        parts, expected, inherited = queue.popleft()
        fd = None
        try:
            fd = open_root(root)
            for part in parts:
                nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = nxt
            info = os.fstat(fd)
            if (info.st_dev, info.st_ino) != expected:
                reasons.add('directory_changed')
                continue
            if info.st_dev != root_info.st_dev:
                reasons.add('other_device_skipped')
                continue
            with os.scandir(fd) as iterator:
                for entry in iterator:
                    if time.monotonic() >= deadline or entries >= max_entries:
                        reasons.add('metadata_budget_exhausted')
                        break
                    entries += 1
                    try:
                        info = entry.stat(follow_symlinks=False)
                    except OSError:
                        unavailable += 1
                        reasons.add('entry_unavailable')
                        continue
                    identity = (info.st_dev, info.st_ino)
                    if stat.S_ISLNK(info.st_mode):
                        links += 1
                        reasons.add('symlink_targets_not_scanned')
                        continue
                    if info.st_dev != root_info.st_dev:
                        reasons.add('other_device_skipped')
                        continue
                    if identity in seen:
                        continue
                    seen.add(identity)
                    if stat.S_ISDIR(info.st_mode):
                        if len(parts) >= 128 or len(queue) >= 20000:
                            reasons.add('metadata_queue_or_depth_budget_exhausted')
                        else:
                            queue.append((parts + (entry.name,), identity, context(entry.name, inherited)))
                    elif stat.S_ISREG(info.st_mode):
                        block_bytes = info.st_blocks * 512
                        allocated += block_bytes
                        logical += info.st_size
                        files += 1
                        for table, key in ((groups, classify(entry.name)), (contexts, inherited)):
                            row = table.setdefault(key, dict(category=key, allocated_bytes=0, logical_bytes=0, file_count=0))
                            row['allocated_bytes'] += block_bytes
                            row['logical_bytes'] += info.st_size
                            row['file_count'] += 1
                    else:
                        reasons.add('special_file_not_measured')
        except OSError:
            unavailable += 1
            reasons.add('directory_unavailable')
        finally:
            if fd is not None:
                os.close(fd)
    complete = not reasons
    for table in (groups, contexts):
        for row in table.values():
            row['percent_of_observed_allocated'] = round(row['allocated_bytes'] * 100 / allocated, 2) if allocated else None
    out.update(presence='PRESENT', completeness='COMPLETE' if complete else 'PARTIAL',
      reasons=sorted(reasons) or ['metadata_enumerated'], categories=sorted(groups.values(), key=lambda r:-r['allocated_bytes']),
      contexts=sorted(contexts.values(), key=lambda r:-r['allocated_bytes']),
      allocated_bytes=allocated if complete else None, observed_allocated_bytes=allocated,
      observed_logical_bytes=logical, file_count=files if complete else None, observed_file_count=files,
      enumerated_entries=entries, skipped_symlinks=links, unavailable_entries=unavailable)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, help='Explicit physical fixture/scope; default is the local home directory')
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--max-entries', type=int, default=500000)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    started = time.monotonic()
    if not (0 < args.timeout <= 60 and 0 < args.max_entries <= 1000000):
        out = empty('invalid_budget')
    elif args.worker:
        root = args.root if args.root is not None else Path.home()
        if not root.is_absolute() or '..' in root.parts or root == Path('/'):
            out = empty('invalid_scope')
        else:
            out = inventory(root, args.timeout, args.max_entries)
            out['scope'] = 'explicit_scope_only' if args.root is not None else 'home_directory_only'
    else:
        command = [sys.executable, '-B', os.path.abspath(__file__), '--worker', '--timeout', str(args.timeout), '--max-entries', str(args.max_entries)]
        if args.root is not None:
            command += ['--root', str(args.root)]
        try:
            run = subprocess.run(command, capture_output=True, timeout=args.timeout + 1, stdin=subprocess.DEVNULL)
            out = json.loads(run.stdout)
            if not isinstance(out, dict) or out.get('source') != 'file-type-metadata':
                raise ValueError('invalid aggregate')
        except subprocess.TimeoutExpired:
            out = empty('worker_timeout')
        except (OSError, ValueError):
            out = empty('worker_failed')
    out.update(duration_seconds=round(time.monotonic() - started, 6), timeout_seconds=args.timeout)
    print(json.dumps(out, sort_keys=True))
    return 2 if out['completeness'] == 'FAILED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
