"""Independent acknowledgement/worker-boundary tests; no host plan or cache I/O.

Successful requests are mocks. The sole real CLI subprocess exercises rejection
before process_request and uses a nonexistent synthetic plan name.
"""
import contextlib
import io
import json
from pathlib import Path
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS

plans = load('independent_precise_cli', SCRIPTS / 'approval-plan.py')
PLAN = '8' * 64
ACK = 'APPLY ' + PLAN + ' 1,2'
RESULT = dict(status='SUCCEEDED', rows=[dict(row_id=1, status='SUCCEEDED', actual_freed_bytes=None)], actual_freed_bytes=None)
PREVIEW = dict(status='READY', rows=[dict(row_id=1, status='ELIGIBLE', actual_freed_bytes=None)], actual_freed_bytes=None)


def arguments(worker=False, apply=True):
    args = ['approval-plan.py', '--plan', '/__SYNTHETIC_NONEXISTENT_PLAN__',
            '--plan-id', PLAN, '--rows', '2', '1']
    if worker:
        args.append('--worker')
    if apply:
        args.append('--apply')
    return args


class PreciseCliHandshakeTests(unittest.TestCase):
    def invoke(self, argv, text, request_result=None, worker_results=None):
        output = io.StringIO()
        with patch.object(sys, 'argv', argv), patch.object(sys, 'stdin', io.StringIO(text)), \
                patch.object(plans, 'process_request', return_value=request_result or RESULT) as request, \
                patch.object(plans, 'bounded_worker', side_effect=worker_results) as worker, \
                contextlib.redirect_stdout(output):
            plans.main()
        return json.loads(output.getvalue().splitlines()[-1]), output.getvalue(), request, worker

    def test_worker_missing_wrong_and_mismatched_ack_block_before_request(self):
        for text in ('', '\n', 'INSTALL\n', ACK + ' extra\n',
                     'APPLY ' + '9'*64 + ' 1,2\n',
                     'APPLY ' + PLAN + ' 2,1\n',
                     'APPLY ' + PLAN + ' 1\n'):
            with self.subTest(ack_kind=text[:6]):
                result, _, request, worker = self.invoke(arguments(worker=True), text)
                self.assertEqual(result['status'], 'BLOCKED')
                self.assertEqual(result['blocker'], 'explicit_scoped_consent_missing')
                self.assertIsNone(result['actual_freed_bytes'])
                request.assert_not_called()
                worker.assert_not_called()

    def test_worker_exact_sorted_ack_calls_mock_request_once(self):
        result, _, request, worker = self.invoke(arguments(worker=True), ACK + '\n')
        request.assert_called_once()
        args = request.call_args.args[0]
        self.assertTrue(args.apply)
        self.assertTrue(args.worker)
        self.assertEqual(args.rows, [2, 1])
        self.assertEqual(args.plan_id, PLAN)
        worker.assert_not_called()
        self.assertEqual(result, RESULT)

    def test_outer_missing_or_wrong_ack_never_launches_apply_worker(self):
        for text in ('', 'INSTALL\n', ACK + ' extra\n'):
            with self.subTest(ack_kind=text[:6]):
                result, output, request, worker = self.invoke(arguments(), text, worker_results=[PREVIEW])
                worker.assert_called_once()
                self.assertNotIn('--apply', worker.call_args.args[0])
                self.assertIn('CONFIRM_PENDING', output)
                self.assertEqual(result['blocker'], 'explicit_scoped_consent_missing')
                request.assert_not_called()

    def test_outer_exact_ack_is_stdin_only_for_second_fresh_worker(self):
        result, _, request, worker = self.invoke(arguments(), ACK + '\n', worker_results=[PREVIEW, RESULT])
        self.assertEqual(worker.call_count, 2)
        first, second = worker.call_args_list
        self.assertNotIn('--apply', first.args[0])
        self.assertIn('--apply', second.args[0])
        self.assertEqual(second.args[1:], (ACK, 120))
        self.assertNotIn(ACK, second.args[0])
        request.assert_not_called()
        self.assertEqual(result, RESULT)

    def test_fresh_apply_worker_blocker_is_not_overwritten_by_old_ready_result(self):
        blocked = dict(status='BLOCKED', rows=[], blocker='plan_expired_or_clock_changed', actual_freed_bytes=None)
        result, _, _, worker = self.invoke(arguments(), ACK + '\n', worker_results=[PREVIEW, blocked])
        self.assertEqual(worker.call_count, 2)
        self.assertEqual(result, blocked)

    def test_no_eligible_row_never_launches_apply_worker_or_prompts(self):
        blocked = dict(status='BLOCKED', rows=[dict(row_id=1, status='BLOCKED')], actual_freed_bytes=None)
        result, output, request, worker = self.invoke(arguments(), ACK + '\n', worker_results=[blocked])
        worker.assert_called_once()
        self.assertNotIn('CONFIRM_PENDING', output)
        self.assertEqual(result, blocked)
        request.assert_not_called()

    def test_without_apply_only_readonly_worker_runs(self):
        result, output, request, worker = self.invoke(arguments(apply=False), ACK + '\n', worker_results=[PREVIEW])
        worker.assert_called_once()
        self.assertNotIn('--apply', worker.call_args.args[0])
        self.assertNotIn('CONFIRM_PENDING', output)
        self.assertEqual(result, PREVIEW)
        request.assert_not_called()

    def test_real_worker_cli_wrong_ack_rejects_without_touching_plan_metadata(self):
        run = subprocess.run([sys.executable, '-B', str(SCRIPTS / 'approval-plan.py'),
                              *arguments(worker=True)[1:]], input='wrong\n',
                             capture_output=True, text=True, timeout=10)
        self.assertEqual(run.returncode, 0)
        self.assertEqual(run.stderr, '')
        result = json.loads(run.stdout)
        self.assertEqual(result['blocker'], 'explicit_scoped_consent_missing')
        self.assertNotIn('plan_read_or_format_failed', run.stdout)
        self.assertNotIn('__SYNTHETIC_NONEXISTENT_PLAN__', run.stdout)


class PreciseWorkerBoundaryTests(unittest.TestCase):
    def run_fake(self, payload, rc=0, stderr=b'', acknowledgement=None, timeout=False):
        made = {}
        class FakeProcess:
            pid = 987654321  # Never sent a real signal; killpg is always mocked.
            returncode = rc
            def __init__(self, command, **kwargs):
                made.update(command=command, kwargs=kwargs, process=self)
                self.waited = 0
            def communicate(self, *, input, timeout):
                made.update(input=input, timeout=timeout)
                if made.get('raise_timeout'):
                    raise subprocess.TimeoutExpired('synthetic-worker', timeout)
                made['kwargs']['stdout'].write(payload)
                made['kwargs']['stderr'].write(stderr)
                return None, None
            def wait(self):
                self.waited += 1
                self.returncode = -signal.SIGKILL
                return self.returncode
        made['raise_timeout'] = timeout
        with patch.object(plans.subprocess, 'Popen', FakeProcess), \
                patch.object(plans.os, 'killpg') as kill:
            result = plans.bounded_worker(['--plan-id', PLAN], acknowledgement, timeout=0.25)
        return result, made, kill

    def test_valid_worker_result_and_bounded_launch_contract(self):
        result, made, kill = self.run_fake(json.dumps(RESULT).encode(), acknowledgement=ACK)
        self.assertEqual(result, RESULT)
        self.assertIn('--worker', made['command'])
        self.assertNotIn(ACK, made['command'])
        self.assertEqual(made['input'], (ACK + '\n').encode())
        self.assertEqual(made['timeout'], 0.25)
        self.assertTrue(made['kwargs']['start_new_session'])
        self.assertEqual(made['kwargs']['stdin'], subprocess.PIPE)
        with patch.object(plans.resource, 'setrlimit') as limit:
            made['kwargs']['preexec_fn']()
        limit.assert_called_once_with(plans.resource.RLIMIT_FSIZE, (1048576, 1048576))
        kill.assert_not_called()

    def test_timeout_kills_only_owned_mock_group_and_reports_unknown_outcome(self):
        result, made, kill = self.run_fake(b'', timeout=True)
        self.assertEqual(result['status'], 'INTERRUPTED')
        self.assertEqual(result['blocker'], 'worker_timeout_recovery_inspection_required')
        self.assertIsNone(result['actual_freed_bytes'])
        self.assertEqual(result['rows'], [])
        kill.assert_called_once_with(made['process'].pid, signal.SIGKILL)
        self.assertEqual(made['process'].waited, 1)

    def test_nonzero_stderr_bad_format_unknown_keys_and_false_release_are_interrupted(self):
        good = json.dumps(RESULT).encode()
        unknown = dict(RESULT, raw_private_path='SYNTHETIC_PRIVATE')
        bad_release = dict(RESULT, actual_freed_bytes=0)
        cases = [(good, 7, b''), (good, 0, b'SYNTHETIC_PRIVATE diagnostic'),
                 (b'', 0, b''), (b'not json', 0, b''), (b'[]', 0, b''),
                 (json.dumps(unknown).encode(), 0, b''),
                 (json.dumps(bad_release).encode(), 0, b''),
                 (b'{"status":"UNKNOWN","rows":[]}', 0, b''),
                 (b'{"status":"SUCCEEDED","rows":null}', 0, b''),
                 (b'\xff', 0, b''), (b' ' * 1048576, 0, b'')]
        for payload, rc, stderr in cases:
            with self.subTest(exit_code=rc, size=len(payload)):
                result, _, kill = self.run_fake(payload, rc=rc, stderr=stderr)
                self.assertEqual(result['status'], 'INTERRUPTED')
                self.assertEqual(result['blocker'], 'worker_result_unknown_recovery_inspection_required')
                self.assertIsNone(result['actual_freed_bytes'])
                self.assertNotIn('SYNTHETIC_PRIVATE', json.dumps(result))
                kill.assert_not_called()


if __name__ == '__main__':
    unittest.main()
