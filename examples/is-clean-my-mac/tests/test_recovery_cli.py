"""Recovery worker bounds/acknowledgement only; all OS mutations mocked."""
import contextlib
import io
import json
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch
from test_audit import load,SCRIPTS

cache=load('recovery_cli_tests',SCRIPTS/'precise-cache.py')
PLAN='6'*64
TOKEN='5'*32


class RecoveryCliTests(unittest.TestCase):
    def test_timeout_and_exited_child_race_keep_recovery_identity(self):
        class Process:
            pid=56789
            returncode=None
            def communicate(self,**kwargs):raise subprocess.TimeoutExpired([],0.1)
            def wait(self):self.returncode=0
        with patch.object(cache.subprocess,'Popen',return_value=Process()) as launch,patch.object(cache.os,'killpg',side_effect=ProcessLookupError) as kill:
            out=cache.bounded_recovery(['--plan-id',PLAN,'--recovery-status'],timeout=0.1)
        self.assertEqual(out['status'],'INTERRUPTED')
        self.assertEqual(out['recovery_plan_id'],PLAN)
        self.assertIsNone(out['actual_freed_bytes'])
        self.assertTrue(launch.call_args.kwargs['start_new_session'])
        kill.assert_called_once_with(56789,signal.SIGKILL)

    def test_private_stderr_or_unknown_result_is_never_forwarded(self):
        good=b'{"status":"RESTORED","rows":[],"actual_freed_bytes":null}'
        for payload,rc,stderr in ((good,0,b'PRIVATE-unknown'),(good,7,b''),
                (b'not JSON',0,b''),(b'{"status":"RESTORED","rows":[],"actual_freed_bytes":0}',0,b''),
                (b'{"status":"UNKNOWN","rows":[]}',0,b'')):
            with self.subTest(exit_code=rc):
                class Process:
                    pid=56789
                    returncode=rc
                    def __init__(self,*args,**kwargs):
                        kwargs['stdout'].write(payload)
                        kwargs['stderr'].write(stderr)
                    def communicate(self,**kwargs):pass
                with patch.object(cache.subprocess,'Popen',Process):
                    out=cache.bounded_recovery(['--plan-id',PLAN,'--restore-held',TOKEN],'RESTORE '+PLAN+' '+TOKEN)
                self.assertEqual(out['status'],'INTERRUPTED')
                self.assertEqual(out['recovery_plan_id'],PLAN)
                self.assertNotIn('PRIVATE',json.dumps(out))

    def test_restore_owner_ack_precedes_bounded_worker(self):
        argv=['precise-cache.py','--plan-id',PLAN,'--restore-held',TOKEN]
        for ack in ('','INSTALL\n','RESTORE '+PLAN+' '+TOKEN+'\n'):
            with self.subTest(accepted=ack.startswith('RESTORE')):
                output=io.StringIO()
                with patch.object(sys,'argv',argv),patch.object(sys,'stdin',io.StringIO(ack)),patch.object(cache,'restore_held',side_effect=AssertionError('parent may not restore')) as direct,patch.object(cache,'bounded_recovery',return_value=dict(status='RESTORED',rows=[],actual_freed_bytes=None)) as worker,contextlib.redirect_stdout(output):
                    cache.main()
                direct.assert_not_called()
                if ack.startswith('RESTORE'):
                    worker.assert_called_once_with(['--plan-id',PLAN,'--restore-held',TOKEN],ack.strip(),30)
                else:
                    worker.assert_not_called()
                    self.assertEqual(json.loads(output.getvalue().splitlines()[-1])['blocker'],'explicit_restore_consent_missing')

    def test_status_uses_bounded_worker_without_restore_consent(self):
        output=io.StringIO()
        with patch.object(sys,'argv',['precise-cache.py','--plan-id',PLAN,'--recovery-status']),patch.object(cache,'recovery_status',side_effect=AssertionError('parent may not inspect directly')),patch.object(cache,'bounded_recovery',return_value=dict(status='INSPECTED',rows=[],actual_freed_bytes=None)) as worker,contextlib.redirect_stdout(output):
            cache.main()
        worker.assert_called_once_with(['--plan-id',PLAN,'--recovery-status'])

    def test_restore_worker_wrong_ack_stops_before_recovery_io(self):
        output=io.StringIO()
        with patch.object(sys,'argv',['precise-cache.py','--recovery-worker','--plan-id',PLAN,'--restore-held',TOKEN]),patch.object(sys,'stdin',io.StringIO('INSTALL\n')),patch.object(cache,'restore_held',side_effect=AssertionError('wrong ack may not inspect or restore')) as restore,contextlib.redirect_stdout(output):
            cache.main()
        restore.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['blocker'],'explicit_restore_consent_missing')
