#!/usr/bin/env python3
"""Mole 1.54.0/1.72.0 read-only/preview adapter. Raw output never reaches stdout."""
import argparse
import json
import os
from pathlib import Path
import re
import resource
import signal
import subprocess
import tempfile
import time

SUPPORTED = ('1.54.0', '1.72.0')
LIMIT = 4 * 1024 * 1024
ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')


def result(source, reason, completeness='FAILED', version=None):
    return dict(schema_version=1, source='mole-' + source, version=version,
                completeness=completeness, reason=reason, occupied_bytes=None,
                command='mo ' + source + (' --json' if source == 'analyze' else ' --dry-run'),
                scope_verified=False, presence='UNKNOWN', duration_seconds=None, timeout_seconds=None,
                measurement='Mole-reported bytes or rounded binary-unit preview estimate',
                error_category=reason,
                candidate_estimate_bytes=None, actual_freed_bytes=None,
                exact_scope_available=False, overlapping_sources='UNKNOWN')


def capture(command, timeout):
    # Bounded disk spool; no raw stdout/stderr forwarded to the model/tool.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        def limit_spool():
            resource.setrlimit(resource.RLIMIT_FSIZE, (LIMIT, LIMIT))
        proc = subprocess.Popen(command, stdout=output, stderr=errors, start_new_session=True,
                                preexec_fn=limit_spool)
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            raise ValueError('command_timeout')
        if output.tell() > LIMIT or errors.tell() > LIMIT:
            raise ValueError('output_budget_exceeded')
        output.seek(0)
        return proc.returncode, output.read().decode('utf-8', errors='strict'), errors.tell() > 0


def parse(source, text, rc=0, stderr=False, version='1.54.0'):
    out = result(source, 'unrecognized_output', version=version)
    if rc:
        return result(source, 'command_failed')
    if source == 'analyze':
        try:
            data = json.loads(text)
            expected = {'path', 'overview', 'entries', 'total_size', 'total_files'}
            if version == '1.72.0':
                expected |= {'scan_status', 'large_files'}
            if set(data) != expected:
                return out
            if (type(data['total_size']) is not int or data['total_size'] < 0 or
                    type(data['total_files']) is not int or data['total_files'] < 0 or
                    type(data['overview']) is not bool or not isinstance(data['entries'], list)):
                return out
            allowed = {'name', 'path', 'size', 'is_dir', 'last_access', 'cleanable', 'scan_status', 'insight'}
            for entry in data['entries']:
                if (not isinstance(entry, dict) or not set(entry) <= allowed or
                        type(entry.get('size')) is not int or entry['size'] < 0):
                    return out
            out.update(occupied_bytes=data['total_size'], file_count=data['total_files'],
                       completeness='PARTIAL', reason='upstream_schema_has_no_coverage_proof')
            if version == '1.72.0':
                statuses = [data['scan_status']] + [e.get('scan_status') for e in data['entries']]
                if any(x not in ('complete', 'partial', 'unavailable') for x in statuses):
                    return result(source, 'unrecognized_scan_status', version=version)
                if data['scan_status'] == 'unavailable':
                    out.update(occupied_bytes=None, file_count=None, completeness='FAILED', reason='scan_unavailable')
                elif not stderr and all(x == 'complete' for x in statuses):
                    out.update(completeness='COMPLETE', reason='upstream_reports_complete')
            return out
        except (ValueError, TypeError, KeyError):
            return out
    text = ANSI.sub('', text)
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
    size = float(number) * 1024 ** ('B', 'KB', 'MB', 'GB', 'TB').index(unit)
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
    parser.add_argument('--confirm-purge-roots', action='store_true',
                        help='Affirm installed Mole configured roots were verified locally, without changing them')
    parser.add_argument('--timeout', type=float, default=60)
    args = parser.parse_args()
    started = time.monotonic()
    out = result(args.source, 'preflight_not_run')
    try:
        if not 0 < args.timeout <= 300:
            raise ValueError('invalid_timeout')
        rc, version, _ = capture(['mo', '--version'], 10)
        match = re.search(r'Mole version (\d+\.\d+\.\d+)\b', version)
        if rc or not match or match[1] not in SUPPORTED:
            raise ValueError('unsupported_mole_version_no_upgrade_attempted')
        if args.source == 'purge':
            # Installed 1.54.0 loads project.sh before parsing even --help;
            # load_purge_config may persist auto-discovered roots. 1.72.0
            # has no verified no-config-write execution boundary here either.
            raise ValueError('purge_configuration_write_boundary_unverified')
        rc, help_text, _ = capture(['mo', args.source, '--help'], 10)
        flag = '--json' if args.source == 'analyze' else '--dry-run'
        if rc or flag not in help_text:
            raise ValueError('installed_help_incompatible')
        if args.source == 'purge' and not args.confirm_purge_roots:
            raise ValueError('purge_roots_not_verified')
        command = ['mo', args.source, flag]
        if args.analyze_root is not None:
            if args.source != 'analyze' or not args.analyze_root.is_absolute():
                raise ValueError('invalid_analyze_scope')
            command.append(str(args.analyze_root))
        rc, raw, stderr = capture(command, args.timeout)
        out = parse(args.source, raw, rc, stderr, version=match[1])
    except (OSError, ValueError, UnicodeError) as error:
        # Only literal codes from our own checks; never stringify raw errors.
        codes = {'invalid_timeout', 'unsupported_mole_version_no_upgrade_attempted',
                 'installed_help_incompatible', 'purge_roots_not_verified',
                 'invalid_analyze_scope', 'command_timeout', 'output_budget_exceeded',
                 'purge_configuration_write_boundary_unverified'}
        reason = error.args[0] if error.args and error.args[0] in codes else 'preflight_command_or_data_boundary_failed'
        out = result(args.source, reason)
    out.update(duration_seconds=round(time.monotonic() - started, 6), timeout_seconds=args.timeout,
               scope_verified=(args.source == 'analyze' and args.analyze_root is not None) or
                              (args.source == 'purge' and args.confirm_purge_roots),
               error_category=None if out['completeness'] == 'COMPLETE' else out['reason'])
    print(json.dumps(out, sort_keys=True))
    return 0 if out['completeness'] != 'FAILED' else 2


if __name__ == '__main__':
    raise SystemExit(main())
