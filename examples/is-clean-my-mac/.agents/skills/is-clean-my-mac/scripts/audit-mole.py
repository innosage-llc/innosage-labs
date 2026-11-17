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


class CaptureDiagnostics(int):
    """Keep the legacy stderr boolean contract while retaining redacted markers."""
    def __new__(cls, stderr_present, categories=()):
        value = super().__new__(cls, bool(stderr_present))
        value.categories = tuple(categories)
        return value


class CaptureFailure(ValueError):
    def __init__(self, reason, returncode=None, diagnostics=False):
        super().__init__(reason)
        self.returncode = returncode
        self.diagnostics = diagnostics


def diagnostic_markers(stdout, stderr, returncode):
    """Observed patterns only, not root-cause claims; never retain matched text."""
    text = (stdout + b'\n' + stderr).lower()
    patterns = (
        ('sandbox_initialization_denied', b'sandbox_apply: operation not permitted'),
        ('shell_temporary_file_denied', b'cannot create temp file for here document'),
        ('permission_denied', b'permission denied'),
        ('operation_not_permitted', b'operation not permitted'),
        ('read_only_filesystem', b'read-only file system'),
        ('dependency_not_found', b'command not found'),
        ('storage_exhausted', b'no space left on device'),
        ('project_discovery_incomplete', b'project discovery was incomplete'),
        ('artifacts_skipped', b'some artifacts were skipped'),
        ('upstream_preview_incomplete', b'dry run incomplete - no changes made'),
    )
    markers = [label for label, needle in patterns if needle in text]
    if returncode < 0:
        markers.append('terminated_by_signal')
    if returncode and not markers:
        markers.append('unclassified_nonzero_exit')
    return CaptureDiagnostics(bool(stderr), markers)


def public_tool_roots(home):
    """Only public default layouts; no config, project or content discovery."""
    return {home / relative: label for relative, label in (
        ('.codex', 'codex_data'), ('.codex/worktrees', 'codex_worktrees'),
        ('.codex/sessions', 'codex_sessions'), ('.codex/archived_sessions', 'codex_sessions'),
        ('.colima', 'colima_data'), ('Library/Android', 'android_data'),
        ('Library/Android/sdk', 'android_sdk'), ('.android', 'android_data'),
        ('.android/avd', 'android_emulators'), ('Library/Caches', 'caches'),
        ('Library/Developer', 'developer_data'),
        ('Library/Developer/Xcode', 'developer_data'),
        ('Library/Developer/Xcode/DerivedData', 'xcode_derived_data'))}


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
    # Recognize only fixed public tool layouts under this Home, longest first.
    roots = public_tool_roots(Path.home())
    candidate = Path(path)
    for root, label in sorted(roots.items(), key=lambda item: len(item[0].parts), reverse=True):
        if candidate == root or root in candidate.parents:
            return label
    # Fixed path components only; names are never returned or interpreted as instructions.
    parts = Path(path).parts
    fixed = {'Downloads': 'downloads', 'Documents': 'documents', 'Pictures': 'pictures',
             'Movies': 'movies', 'Music': 'music', 'Desktop': 'desktop',
             'Application Support': 'application_support',
             'Virtual Machines.localized': 'virtual_machines', 'Developer': 'developer_data'}
    for component in ('Caches', '.cache', 'Logs', 'node_modules', 'DerivedData'):
        if component in parts:
            return {'Caches':'caches', '.cache':'caches', 'Logs':'logs',
                    'node_modules':'build_and_dependencies', 'DerivedData':'xcode_derived_data'}[component]
    if not overview:
        for component in reversed(parts):
            if component in fixed:
                return fixed[component]
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
        group_complete = {}
        for entry in data['entries']:
            if not isinstance(entry, dict) or type(entry.get('size')) is not int:
                return out
            entry_extras = len(set(entry) - {'name', 'path', 'size', 'is_dir', 'last_access',
                                        'cleanable', 'scan_status', 'insight'})
            extras += entry_extras
            status = entry.get('scan_status')
            statuses.append(status)
            label = category(entry.get('path'), entry.get('name'), data['overview'])
            group_complete[label] = group_complete.get(label, True) and status == 'complete' and not entry_extras
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
        complete = (version == '1.72.0' and all(x == 'complete' for x in statuses)
                    and not stderr and not extras and not any(g['unknown_entries'] for g in groups.values()))
        for group in groups.values():
            if version == '1.72.0' and group_complete[group['category']] and not stderr and not group['unknown_entries']:
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
        if groups and all(g['measured_entries'] == 0 and g['unknown_entries'] > 0 for g in groups.values()):
            out.update(occupied_bytes=None, file_count=None)
        if data.get('scan_status') == 'unavailable':
            out.update(occupied_bytes=None, file_count=None, completeness='FAILED', reason='scan_unavailable')
        else:
            out['presence'] = 'PRESENT'
        out['error_category'] = None if out['completeness'] == 'COMPLETE' else out['reason']
        return out
    except (ValueError, TypeError, KeyError):
        return out


def largest_entry_drilldowns(raw, version, deadline):
    """Progressive official scans, at most seven extra calls (eight total) and the original deadline.

    Only evidence-discovered physical public roots are eligible. Arbitrary child
    names never become targets; no private path/name leaves this local function.
    """
    details = []
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get('overview') is not True:
            return details
        home = Path.home().resolve(strict=True)
        roots = public_tool_roots(home)
        roots.update({home: 'home', home / 'Library': 'user_library',
                      Path('/Applications'): 'applications', Path('/Library'): 'system_library'})
        pending, seen = {}, set()

        def enqueue(document, parent=None):
            entries = document.get('entries', []) if isinstance(document, dict) else []
            if not isinstance(entries, list):
                return
            for entry in entries:
                if (not isinstance(entry, dict) or entry.get('is_dir') is not True
                        or entry.get('insight') is True or type(entry.get('size')) is not int
                        or entry['size'] <= 0 or not isinstance(entry.get('path'), str)):
                    continue
                path = Path(entry['path'])
                if path not in roots or roots.get(path) in ('codex_worktrees', 'codex_sessions') or path in seen or (parent is not None and path.parent != parent):
                    continue
                try:
                    if path != path.resolve(strict=True) or not path.is_dir():
                        continue
                except OSError:
                    continue
                if path.stat().st_dev != home.stat().st_dev and home in path.parents:
                    continue
                pending[path] = entry['size']

        enqueue(data)
        # Mole 1.72 explicitly skips .colima in parent output. Probe only this
        # exact public root's metadata (not children); an explicit official scan
        # remains subject to the same physical-directory/device/time boundary.
        colima = home / '.colima'
        try:
            if home in pending and colima.resolve(strict=True) == colima and colima.is_dir() and colima.stat().st_dev == home.stat().st_dev:
                pending[colima] = 0
        except OSError:
            pass
        while pending and len(details) < 7:
            # Prefer discovered specific tools over remaining generic parents.
            path = max(pending, key=lambda p: (p not in (home, home / 'Library', Path('/Applications'), Path('/Library')), pending[p], str(p)))
            del pending[path]
            seen.add(path)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                detail = result('analyze', 'command_timeout', version=version)
            else:
                try:
                    if path.resolve(strict=True) != path or not path.is_dir():
                        raise ValueError('physical_directory_changed')
                    rc, text, diagnostics = guarded_capture(['mo', 'analyze', '--json', str(path)], min(30, remaining), 'analyze')
                    if path.resolve(strict=True) != path or not path.is_dir():
                        raise ValueError('physical_directory_changed')
                    detail = parse('analyze', text, rc, diagnostics, version)
                    detail.update(command_exit_code=rc, diagnostic_categories=list(diagnostics.categories))
                    if rc == 0 and detail['completeness'] != 'FAILED':
                        enqueue(json.loads(text), path)
                except (OSError, ValueError) as error:
                    detail = result('analyze', 'drilldown_failed_or_timed_out', version=version)
                    if isinstance(error, CaptureFailure):
                        detail.update(command_exit_code=error.returncode,
                                      diagnostic_categories=list(getattr(error.diagnostics, 'categories', ())))
            detail.update(scope_label=roots[path], overlaps_parent=True)
            details.append(detail)
            if remaining <= 0:
                break
        if pending and details:
            details[-1]['drilldown_budget_exhausted'] = True
    except (ValueError, OSError):
        pass
    return details


def result(source, reason, completeness='FAILED', version=None):
    return dict(schema_version=1, source='mole-' + source, version=version,
                completeness=completeness, reason=reason, occupied_bytes=None,
                command='mo ' + source + (' --json' if source == 'analyze' else ' --dry-run'),
                scope_verified=False, presence='UNKNOWN', duration_seconds=None, timeout_seconds=None,
                measurement='Mole-reported bytes or rounded SI decimal-unit preview estimate',
                error_category=reason,
                candidate_estimate_bytes=None, actual_freed_bytes=None,
                exact_scope_available=False, overlapping_sources='UNKNOWN',
                command_stage=None, command_exit_code=None, stderr_present=False,
                diagnostic_categories=[], diagnostic_semantics='observed_patterns_not_root_cause')


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
            output.seek(0)
            errors.seek(0)
            observed = diagnostic_markers(output.read(LIMIT), errors.read(LIMIT), proc.returncode)
            raise CaptureFailure('command_timeout', proc.returncode,
                                 CaptureDiagnostics(bool(observed), (*observed.categories, 'command_timeout')))
        if output.tell() > LIMIT or errors.tell() > LIMIT:
            raise ValueError('output_budget_exceeded')
        output.seek(0)
        errors.seek(0)
        error_text = errors.read()
        output_text = output.read()
        if proc.returncode and b'sandbox_apply: Operation not permitted' in error_text:
            raise CaptureFailure('runtime_sandbox_initialization_denied', proc.returncode,
                                 diagnostic_markers(output_text, error_text, proc.returncode))
        diagnostics = diagnostic_markers(output_text, error_text, proc.returncode)
        try:
            decoded = output_text.decode('utf-8', errors='strict')
        except UnicodeDecodeError:
            raise CaptureFailure('output_encoding_invalid', proc.returncode, diagnostics) from None
        return proc.returncode, decoded, diagnostics


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
                observed_candidate_estimate_bytes=0, unmeasured_entries=0,
                covered_entries=0, completeness='PARTIAL'))
            item['candidate_entries'] += 1
            suffix = line.rsplit('  # ', 1)[1]
            if ', counted under ' in suffix:
                item['covered_entries'] += 1
                continue
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
        # V1.72.0 project.sh emits these exact terminal messages and sets
        # no_candidates; purge.sh then returns zero without a final summary.
        # This reports only the empty upstream observation, never exact scope.
        empty_messages = {'✓ No old project artifacts to clean',
                          'No eligible project artifacts to purge', 'No artifacts found to purge'}
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if version == '1.72.0' and not stderr and lines and lines[-1] in empty_messages:
            out.update(completeness='PARTIAL', reason='upstream_no_candidates_scope_unverified',
                       error_category='upstream_no_candidates_scope_unverified',
                       observed_candidate_estimate_bytes=0, observed_candidate_entries=0,
                       presence='PRESENT')
            return out
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
    out.update(error_category=out['reason'], presence='PRESENT')
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
    stage, rc, diagnostics = 'preflight', None, False
    try:
        if not 0 < args.timeout <= 300:
            raise ValueError('invalid_timeout')
        def budget(limit):
            remaining = started + args.timeout - time.monotonic()
            if args.source == 'analyze' and remaining <= 0:
                raise ValueError('command_timeout')
            return min(limit, remaining) if args.source == 'analyze' else limit
        stage = 'version'
        rc, version, diagnostics = guarded_capture(['mo', '--version'], budget(10))
        if rc:
            raise ValueError('guarded_version_command_failed')
        match = re.search(r'Mole version (\d+\.\d+\.\d+)\b', version)
        if rc or not match or match[1] not in SUPPORTED:
            raise ValueError('unsupported_mole_version_no_upgrade_attempted')
        version_id = match[1]
        # Even help is guarded: upstream may source configuration before dispatch.
        stage, rc, diagnostics = 'help', None, False
        rc, help_text, diagnostics = guarded_capture(['mo', args.source, '--help'], budget(10))
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
        stage, rc, diagnostics = 'audit', None, False
        rc, raw, diagnostics = guarded_capture(command, budget(args.timeout), args.source)
        out = parse(args.source, raw, rc, diagnostics, version=match[1])
        if args.source == 'analyze' and args.analyze_root is None and out['completeness'] != 'FAILED':
            out['drilldowns'] = largest_entry_drilldowns(raw, version_id, started + args.timeout)
        out['runtime_boundary'] = 'macOS_sandbox_deny_network_and_host_writes'
        out['allowed_host_writes'] = ['official_clean_preview_only'] if args.source == 'clean' else []
        if args.source == 'clean':
            # Do not overwrite an upstream failure with a secondary ledger error.
            if rc:
                raise ValueError('command_failed')
            stage = 'preview_readback'
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
        if isinstance(error, CaptureFailure):
            rc, diagnostics = error.returncode, error.diagnostics
        # Only literal codes from our own checks; never stringify raw errors.
        codes = {'invalid_timeout', 'unsupported_mole_version_no_upgrade_attempted',
                 'installed_help_incompatible', 'purge_roots_not_verified',
                 'invalid_analyze_scope', 'command_timeout', 'output_budget_exceeded',
                 'purge_configuration_write_boundary_unverified', 'write_boundary_unavailable',
                 'preview_parent_not_physical', 'preview_target_not_regular',
                 'preview_not_published', 'preview_not_fresh_or_bounded',
                 'runtime_sandbox_initialization_denied', 'guarded_version_command_failed',
                 'command_failed', 'output_encoding_invalid'}
        reason = error.args[0] if error.args and error.args[0] in codes else 'preflight_command_or_data_boundary_failed'
        out = result(args.source, reason, version=version_id)
        # OS errors are classified locally; their strings and filenames stay local.
        if isinstance(error, OSError):
            import errno
            marker = {errno.ENOENT: 'executable_or_file_missing', errno.EACCES: 'permission_denied',
                      errno.EPERM: 'operation_not_permitted', errno.ENOSPC: 'storage_exhausted',
                      errno.EROFS: 'read_only_filesystem'}.get(error.errno, 'os_operation_failed')
            diagnostics = CaptureDiagnostics(bool(diagnostics), (*getattr(diagnostics, 'categories', ()), marker))
    out.update(command_stage=stage, command_exit_code=rc,
               stderr_present=bool(diagnostics),
               diagnostic_categories=list(getattr(diagnostics, 'categories', ())))
    out.update(duration_seconds=round(time.monotonic() - started, 6), timeout_seconds=args.timeout,
               scope_verified=(args.source == 'analyze' and args.analyze_root is not None and out['completeness'] != 'FAILED'),
               error_category=None if out['completeness'] == 'COMPLETE' else out['reason'])
    print(json.dumps(out, sort_keys=True))
    return 0 if out['completeness'] != 'FAILED' else 2


if __name__ == '__main__':
    raise SystemExit(main())
