#!/usr/bin/env python3
"""Guarded Mole 1.54.0/1.72.0 metadata/preview adapter; only aggregates reach stdout."""
import argparse
from decimal import Decimal
import json
import os
from pathlib import Path
import re
import resource
import signal
import stat
import subprocess
import tempfile
import time

SUPPORTED = ('1.54.0', '1.72.0')
LIMIT = 4 * 1024 * 1024
ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')


def category(path, name='', overview=False):
    """Classify locally; never emit user-controlled names or paths."""
    path = path if isinstance(path, str) else ''
    if overview:
        insights = {'iOS Backups': 'ios_backups', 'Old Downloads (90d+)': 'old_downloads',
            'System Logs': 'logs', 'Homebrew Cache': 'homebrew_cache',
            'Xcode DerivedData': 'xcode_derived_data', 'Xcode Simulators': 'xcode_simulators',
            'Xcode Archives': 'xcode_archives', 'Spotify Cache': 'app_caches',
            'JetBrains Cache': 'developer_caches', 'Docker Data': 'container_data',
            'pip Cache': 'developer_caches', 'uv Cache': 'developer_caches',
            'Gradle Cache': 'developer_caches', 'CocoaPods Cache': 'developer_caches'}
        if isinstance(name, str) and name in insights:
            return insights[name]
    if '/node_modules' in path or '/build' in path or '/target' in path or '/DerivedData' in path:
        return 'build_and_dependencies'
    if '/Caches' in path or '/.cache' in path:
        return 'caches'
    if '/Logs' in path:
        return 'logs'
    if overview:
        return {'Home': 'home', 'User Library': 'user_library', 'App Library': 'user_library',
                'Applications': 'applications', 'System Library': 'system_library'}.get(name, 'other')
    return 'other'


def analyze(text, stderr, version):
    out = result('analyze', 'unrecognized_output', version=version)
    try:
        data = json.loads(text)
        if (not isinstance(data, dict) or type(data.get('total_size')) is not int or
                data['total_size'] < 0 or type(data.get('overview')) is not bool or
                not isinstance(data.get('entries'), list)):
            return out
        known = {'path', 'overview', 'entries', 'total_size', 'total_files', 'scan_status', 'large_files'}
        extras = len(set(data) - known)
        groups = {}
        statuses = [data.get('scan_status')]
        for entry in data['entries']:
            if not isinstance(entry, dict) or type(entry.get('size')) is not int:
                return out
            extras += len(set(entry) - {'name', 'path', 'size', 'is_dir', 'last_access',
                                        'cleanable', 'scan_status', 'insight'})
            status = entry.get('scan_status')
            statuses.append(status)
            label = category(entry.get('path'), entry.get('name'), data['overview'])
            group = groups.setdefault(label, dict(category=label, observed_bytes=0,
                measured_entries=0, unknown_entries=0, upstream_cleanable_entries=0,
                occupied_bytes=None, candidate_estimate_bytes=None, completeness='PARTIAL'))
            if entry['size'] >= 0 and status != 'unavailable':
                group['observed_bytes'] += entry['size']
                group['measured_entries'] += 1
            else:
                group['unknown_entries'] += 1
            if entry.get('cleanable') is True:
                group['upstream_cleanable_entries'] += 1
        complete = version == '1.72.0' and all(x == 'complete' for x in statuses) and not stderr and not extras
        for group in groups.values():
            if complete and not group['unknown_entries']:
                group.update(occupied_bytes=group['observed_bytes'], completeness='COMPLETE')
        files = data.get('total_files')
        if files is not None and (type(files) is not int or files < 0):
            return out
        out.update(occupied_bytes=data['total_size'], file_count=files,
                   categories=list(groups.values()), unknown_field_count=extras,
                   unknown_status_count=sum(x not in ('complete', 'partial', 'unavailable', None) for x in statuses),
                   completeness='COMPLETE' if complete else 'PARTIAL',
                   reason='upstream_reports_complete' if complete else 'coverage_or_extension_unverified',
                   categories_may_overlap=True, overview=data['overview'])
        if data.get('scan_status') == 'unavailable':
            out.update(occupied_bytes=None, file_count=None, completeness='FAILED', reason='scan_unavailable')
        else:
            out['presence'] = 'PRESENT'
        out['error_category'] = None if out['completeness'] == 'COMPLETE' else out['reason']
        return out
    except (ValueError, TypeError, KeyError):
        return out


def result(source, reason, completeness='FAILED', version=None):
    return dict(schema_version=1, source='mole-' + source, version=version,
                completeness=completeness, reason=reason, occupied_bytes=None,
                command='mo ' + source + (' --json' if source == 'analyze' else ' --dry-run'),
                scope_verified=False, presence='UNKNOWN', duration_seconds=None, timeout_seconds=None,
                measurement='Mole-reported bytes or rounded SI decimal-unit preview estimate',
                error_category=reason,
                candidate_estimate_bytes=None, actual_freed_bytes=None,
                exact_scope_available=False, overlapping_sources='UNKNOWN')


def capture(command, timeout, env=None, cwd=None):
    # Bounded disk spool; no raw stdout/stderr forwarded to the model/tool.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        def limit_spool():
            resource.setrlimit(resource.RLIMIT_FSIZE, (LIMIT, LIMIT))
        proc = subprocess.Popen(command, stdout=output, stderr=errors, start_new_session=True,
                                preexec_fn=limit_spool, env=env, cwd=cwd, stdin=subprocess.DEVNULL)
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            raise ValueError('command_timeout')
        if output.tell() > LIMIT or errors.tell() > LIMIT:
            raise ValueError('output_budget_exceeded')
        output.seek(0)
        errors.seek(0)
        error_text = errors.read()
        if proc.returncode and b'sandbox_apply: Operation not permitted' in error_text:
            raise ValueError('runtime_sandbox_initialization_denied')
        return proc.returncode, output.read().decode('utf-8', errors='strict'), bool(error_text)


PROFILE = '''(version 1)(allow default)(deny network*)
(deny file-write* (require-all (require-not (subpath (param "SCRATCH")))
                             (require-not (literal "/dev/null"))))'''
TEMP_METADATA_BOUNDARY = '''
(deny file-read-metadata (literal "/tmp" "/private/tmp" "/var/tmp" "/private/var/tmp" "/usr/tmp"))'''
NO_ELEVATION = '''
(deny process-exec (literal "/usr/bin/sudo" "/bin/launchctl" "/usr/bin/osascript"
 "/usr/bin/killall" "/usr/sbin/diskutil" "/usr/bin/tmutil" "/usr/bin/security" "/usr/bin/defaults"))'''


def physical_file(path, require_file=False):
    """Reject symlinks/nonregular destinations before allowing a preview write."""
    for parent in path.parents:
        if parent.is_symlink() or not parent.is_dir():
            raise ValueError('preview_parent_not_physical')
    if path.is_symlink() or (path.exists() and
            (not stat.S_ISREG(path.stat().st_mode) or path.stat().st_nlink != 1 or path.stat().st_uid != os.getuid())):
        raise ValueError('preview_target_not_regular')
    if require_file and not path.is_file():
        raise ValueError('preview_not_published')


def guarded_capture(command, timeout, source=None):
    if not Path('/usr/bin/sandbox-exec').is_file():
        raise ValueError('write_boundary_unavailable')
    with tempfile.TemporaryDirectory(prefix='mole-audit-boundary-') as temporary:
        scratch = str(Path(temporary).resolve())
        profile = PROFILE
        preview = Path.home() / '.config/mole/clean-list.txt'
        if source == 'clean':
            physical_file(preview)
            # Exact preview artifact only, never the configuration directory.
            profile = '''(version 1)(allow default)(deny network*)
            (deny file-write* (require-all
              (require-not (subpath (param "SCRATCH")))
              (require-not (literal "/dev/null"))
              (require-not (literal (param "PREVIEW")))))'''
        env = {key: os.environ[key] for key in ('PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL') if key in os.environ}
        env.update(TMPDIR=scratch, MOLE_RESOLVED_TMPDIR=scratch,
                   XDG_CACHE_HOME=scratch + '/cache', MOLE_DRY_RUN='1')
        # Apple Bash 3.2 ignores TMPDIR for heredocs. Its verified fallback to
        # cwd is selected by denying stat of fixed system temp roots, not by
        # allowing writes across /tmp. All descendant host writes remain denied.
        profile += TEMP_METADATA_BOUNDARY + NO_ELEVATION
        # The sandbox and all descendants inherit this environment. HOME stays real.
        command = ['/usr/bin/sandbox-exec', '-p', profile, '-D', 'SCRATCH=' + scratch,
                   '-D', 'PREVIEW=' + str(preview), *command]
        return capture(command, timeout, env=env, cwd=scratch)


def preview_categories(text):
    """Parse the fresh official preview list locally; no paths/headings escape."""
    labels = {'User essentials': 'user_caches_and_logs', 'App caches': 'app_caches',
              'Browsers': 'browser_caches', 'Cloud & Office': 'cloud_and_office_caches',
              'Developer tools': 'developer_caches', 'Apps & utilities': 'app_utilities',
              'System': 'system_caches', 'External volume': 'external_volume'}
    groups = {}
    current = 'other'
    for line in text.splitlines():
        if line.startswith('=== ') and line.endswith(' ==='):
            current = labels.get(line[4:-4], 'other')
        elif line and not line.startswith('#') and '  # ' in line:
            item = groups.setdefault(current, dict(category=current, candidate_entries=0,
                observed_candidate_estimate_bytes=0, unmeasured_entries=0, completeness='PARTIAL'))
            item['candidate_entries'] += 1
            suffix = line.rsplit('  # ', 1)[1]
            size = re.match(r'(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\b', suffix)
            if size and len(size[1]) <= 32:
                item['observed_candidate_estimate_bytes'] += int(Decimal(size[1]) * 1000 ** ('B','KB','MB','GB','TB').index(size[2]))
            else:
                item['unmeasured_entries'] += 1
    return list(groups.values())


def purge_categories(text):
    groups = {}
    for line in text.splitlines():
        match = re.search(r'\[DRY RUN\] (.+),\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\b', line)
        if not match or len(match[2]) > 32:
            continue
        artifact = match[1].rstrip('/').rsplit('/', 1)[-1]
        label = artifact if artifact in ('node_modules', '.build', 'build', 'target',
                    'dist', '.next', '.nuxt', 'vendor', 'Pods') else 'other_build_artifacts'
        item = groups.setdefault(label, dict(category=label, candidate_entries=0,
            observed_candidate_estimate_bytes=0, completeness='PARTIAL'))
        item['candidate_entries'] += 1
        item['observed_candidate_estimate_bytes'] += int(Decimal(match[2]) * 1000 ** ('B','KB','MB','GB','TB').index(match[3]))
    return list(groups.values())


def parse(source, text, rc=0, stderr=False, version='1.54.0'):
    out = result(source, 'unrecognized_output', version=version)
    if rc:
        return result(source, 'command_failed', version=version)
    if source == 'analyze':
        return analyze(text, stderr, version)
    text = ANSI.sub('', text)
    if source == 'purge':
        out['categories'] = purge_categories(text)
    # Summary shape is fixed to installed 1.54.0. Keep all unmeasured/skipped
    # output conservative; a summary is not a verified per-candidate scope.
    if source == 'clean':
        match = re.search(r'Potential space: (At least )?(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\b', text)
    else:
        match = re.search(r'Would free approximately: (\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\b', text)
    if not match or not re.search(r'Dry run (?:complete|incomplete) - no changes made', text):
        return out
    out['has_unmeasured_or_incomplete_marker'] = bool(re.search(r'incomplete|unmeasured|At least|under-reported|timed out', text, re.I))
    groups = match.groups()
    number, unit = groups[-2:]
    if len(number) > 32:
        return out
    size = Decimal(number) * 1000 ** ('B', 'KB', 'MB', 'GB', 'TB').index(unit)
    if size > 2**63:
        return out
    out.update(candidate_estimate_bytes=int(size), completeness='PARTIAL',
               reason='preview_summary_only_scope_and_overlap_unverified')
    if stderr:
        out['reason'] = 'stderr_present_preview_may_be_incomplete'
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, choices=('analyze', 'clean', 'purge'))
    parser.add_argument('--analyze-root', type=Path, help='Optional verified synthetic/root scope')
    parser.add_argument('--timeout', type=float, default=180)
    args = parser.parse_args()
    started = time.monotonic()
    out = result(args.source, 'preflight_not_run')
    version_id = None
    try:
        if not 0 < args.timeout <= 300:
            raise ValueError('invalid_timeout')
        rc, version, _ = guarded_capture(['mo', '--version'], 10)
        if rc:
            raise ValueError('guarded_version_command_failed')
        match = re.search(r'Mole version (\d+\.\d+\.\d+)\b', version)
        if rc or not match or match[1] not in SUPPORTED:
            raise ValueError('unsupported_mole_version_no_upgrade_attempted')
        version_id = match[1]
        # Even help is guarded: upstream may source configuration before dispatch.
        rc, help_text, _ = guarded_capture(['mo', args.source, '--help'], 10)
        flag = '--json' if args.source == 'analyze' else '--dry-run'
        if rc or flag not in help_text:
            raise ValueError('installed_help_incompatible')
        command = ['mo', args.source, flag]
        if args.analyze_root is not None:
            if args.source != 'analyze' or not args.analyze_root.is_absolute():
                raise ValueError('invalid_analyze_scope')
            if args.analyze_root != args.analyze_root.resolve(strict=True):
                raise ValueError('invalid_analyze_scope')
            command.append(str(args.analyze_root))
        preview_started = time.time_ns()
        rc, raw, stderr = guarded_capture(command, args.timeout, args.source)
        out = parse(args.source, raw, rc, stderr, version=match[1])
        out['runtime_boundary'] = 'macOS_sandbox_deny_network_and_host_writes'
        out['allowed_host_writes'] = ['official_clean_preview_only'] if args.source == 'clean' else []
        if args.source == 'clean':
            preview = Path.home() / '.config/mole/clean-list.txt'
            physical_file(preview, require_file=True)
            fd = os.open(preview, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, 'rb') as stream:
                info = os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_mtime_ns < preview_started or info.st_size > LIMIT:
                    raise ValueError('preview_not_fresh_or_bounded')
                text = stream.read(LIMIT + 1)
                if len(text) > LIMIT:
                    raise ValueError('preview_not_fresh_or_bounded')
                out['categories'] = preview_categories(text.decode('utf-8'))
    except (OSError, ValueError, UnicodeError) as error:
        # Only literal codes from our own checks; never stringify raw errors.
        codes = {'invalid_timeout', 'unsupported_mole_version_no_upgrade_attempted',
                 'installed_help_incompatible', 'purge_roots_not_verified',
                 'invalid_analyze_scope', 'command_timeout', 'output_budget_exceeded',
                 'purge_configuration_write_boundary_unverified', 'write_boundary_unavailable',
                 'preview_parent_not_physical', 'preview_target_not_regular',
                 'preview_not_published', 'preview_not_fresh_or_bounded',
                 'runtime_sandbox_initialization_denied', 'guarded_version_command_failed'}
        reason = error.args[0] if error.args and error.args[0] in codes else 'preflight_command_or_data_boundary_failed'
        out = result(args.source, reason, version=version_id)
    out.update(duration_seconds=round(time.monotonic() - started, 6), timeout_seconds=args.timeout,
               scope_verified=(args.source == 'analyze' and args.analyze_root is not None and out['completeness'] != 'FAILED'),
               error_category=None if out['completeness'] == 'COMPLETE' else out['reason'])
    print(json.dumps(out, sort_keys=True))
    return 0 if out['completeness'] != 'FAILED' else 2


if __name__ == '__main__':
    raise SystemExit(main())
