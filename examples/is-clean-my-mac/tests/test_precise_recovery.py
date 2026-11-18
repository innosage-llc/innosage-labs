"""Independent native filesystem/crash tests: disposable physical TMPDIR homes only.

No host HOME/cache is discovered or passed to the executor. Native lsof tests
are opt-in so sandbox visibility failures cannot silently count as a pass.
"""
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
import unittest
from test_audit import load, SCRIPTS

cache = load('independent_recovery', SCRIPTS / 'precise-cache.py')
PLAN = '7' * 64
CRASH_PHASES = ('after_intent', 'after_rename_before_receipt',
                'after_capture_receipt', 'after_unlink_intent', 'after_unlink')
CHILD = r'''
import importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('crash_fixture',sys.argv[1])
cache=importlib.util.module_from_spec(spec);spec.loader.exec_module(cache)
home=Path(sys.argv[2]); item=json.loads((home/'selection.json').read_text())
phase=sys.argv[3]
def hook(current,*args):
    if current==phase: os._exit(73)
result=cache.execute(sys.argv[4],[item],home,probe=lambda path,fd:'CLEAR',
                     hook=hook,row_map={item['candidate_id']:9})
print(json.dumps(result))
'''


@unittest.skipUnless(platform.system() == 'Darwin', 'native exclusive rename/ACL APIs require macOS')
class PreciseRecoveryTests(unittest.TestCase):
    def fixture(self):
        temp = tempfile.TemporaryDirectory(prefix='precise-recovery-fixture-',
                                           dir=Path(tempfile.gettempdir()).resolve())
        self.addCleanup(temp.cleanup)
        home = Path(temp.name).resolve()
        (home/'Library/Application Support').mkdir(parents=True)
        root = home.joinpath(*cache.ROOTS['homebrew_bottle'])
        root.mkdir(parents=True)
        old = time.time() - cache.MIN_AGE - 3600
        paths = []
        for letter in ('a', 'b'):
            path = root / (letter * 64 + '--SYNTHETIC--1.arm64_sonoma.bottle.tar.gz')
            path.write_bytes(letter.encode() * 8192)
            os.utime(path, (old, old))
            paths.append(path)
        trash = home / '.Trash'
        trash.mkdir()
        sentinel = trash / 'synthetic-unselected'
        sentinel.write_bytes(b'untouched synthetic trash')
        items = cache.discover(home)[0]['objects']
        self.assertEqual(len(items), 2)
        item = next(value for value in items if value['parts'][-1] == paths[0].name)
        selection = home / 'selection.json'
        selection.write_text(json.dumps(item))
        selection.chmod(0o600)
        state = home / 'Library/Application Support/is-clean-my-mac-recovery' / PLAN
        return home, paths[0], paths[1], sentinel, item, state

    def crash(self, fixture, phase):
        home, _, _, _, _, _ = fixture
        run = subprocess.run([sys.executable, '-B', '-c', CHILD,
                              str(SCRIPTS / 'precise-cache.py'), str(home), phase, PLAN],
                             capture_output=True, text=True, timeout=20)
        self.assertEqual(run.returncode, 73, 'fixture hook was not reached; no crash evidence')
        self.assertEqual(run.stdout, '')
        self.assertEqual(run.stderr, '')

    def assert_protected(self, fixture):
        _, _, unselected, sentinel, _, _ = fixture
        self.assertEqual(unselected.read_bytes(), b'b' * 8192)
        self.assertEqual(sentinel.read_bytes(), b'untouched synthetic trash')

    def events(self, state):
        return [json.loads(line) for line in (state / 'events.jsonl').read_text().splitlines()]

    def test_process_exit_at_every_transition_preserves_truthful_recovery_states(self):
        for phase in CRASH_PHASES:
            with self.subTest(phase=phase):
                fixture = self.fixture()
                home, source, _, _, item, state = fixture
                self.crash(fixture, phase)
                private = json.loads((state / 'manifest.json').read_text())
                self.assertEqual(private['plan_id'], PLAN)
                self.assertEqual(private['objects'][0]['target'], item['target'])
                self.assertEqual(private['row_map'][item['candidate_id']], 9)
                self.assertEqual((state.stat().st_mode & 0o777), 0o700)
                for file in ('events.jsonl', 'manifest.json'):
                    self.assertEqual((state / file).stat().st_mode & 0o777, 0o600)
                status = cache.recovery_status(PLAN, home)
                self.assertEqual(status['status'], 'INSPECTED')
                self.assertIsNone(status['actual_freed_bytes'])
                self.assertEqual(status['rows'][0]['row_id'], 9)
                self.assertNotIn(str(home), json.dumps(status))
                self.assertNotIn('SYNTHETIC--', json.dumps(status))
                hold = state / item['candidate_id']
                phases = [event['phase'] for event in self.events(state)]
                self.assertIn('CAPTURE_INTENT', phases)
                if phase in ('after_intent', 'after_unlink'):
                    self.assertFalse(hold.exists())
                    self.assertEqual(source.exists(), phase == 'after_intent')
                    self.assertEqual(status['rows'][0]['status'], 'NOT_HELD_OUTCOME_UNVERIFIED')
                    self.assertNotIn('UNLINKED', phases)
                else:
                    self.assertFalse(source.exists())
                    self.assertEqual(hold.stat().st_ino, item['target']['st_ino'])
                    self.assertEqual(status['rows'][0]['status'], 'HELD_RESTORE_AVAILABLE')
                    restored = cache.restore_held(PLAN, [item['candidate_id']], home)
                    self.assertEqual(restored['status'], 'RESTORED')
                    self.assertEqual(source.stat().st_ino, item['target']['st_ino'])
                    self.assertEqual(source.read_bytes(), b'a' * 8192)
                    self.assertFalse(hold.exists())
                    self.assertIn('RESTORED', [e['phase'] for e in self.events(state)])
                self.assert_protected(fixture)

    def test_completed_unlink_has_persistent_receipt(self):
        fixture = self.fixture()
        home, source, _, _, item, state = fixture
        run = subprocess.run([sys.executable, '-B', '-c', CHILD,
                              str(SCRIPTS / 'precise-cache.py'), str(home), 'no_crash', PLAN],
                             capture_output=True, text=True, timeout=20)
        self.assertEqual(run.returncode, 0)
        result = json.loads(run.stdout)
        self.assertEqual(result['status'], 'SUCCEEDED')
        self.assertIsNone(result['actual_freed_bytes'])
        self.assertFalse(source.exists())
        status = cache.recovery_status(PLAN, home)
        self.assertEqual(status['rows'][0]['status'], 'REMOVED_RECORDED')
        self.assertIn('UNLINKED', [e['phase'] for e in self.events(state)])
        self.assert_protected(fixture)

    def test_crash_hold_restore_never_overwrites_recreated_original(self):
        fixture = self.fixture()
        home, source, _, _, item, state = fixture
        self.crash(fixture, 'after_capture_receipt')
        source.write_bytes(b'replacement must survive')
        result = cache.restore_held(PLAN, [item['candidate_id']], home)
        self.assertEqual(result['status'], 'PARTIAL')
        self.assertEqual(result['rows'][0]['status'], 'RECOVERY_REQUIRED')
        self.assertEqual(source.read_bytes(), b'replacement must survive')
        hold = state / item['candidate_id']
        self.assertEqual(hold.stat().st_ino, item['target']['st_ino'])
        self.assertEqual(hold.read_bytes(), b'a' * 8192)
        self.assertNotIn('RESTORED', [e['phase'] for e in self.events(state)])
        self.assert_protected(fixture)

    def test_torn_final_journal_append_does_not_break_explicit_restore_receipts(self):
        fixture = self.fixture()
        home, source, _, _, item, state = fixture
        self.crash(fixture, 'after_capture_receipt')
        with (state / 'events.jsonl').open('ab') as output:
            output.write(b'{"phase":"interrupted')
            output.flush()
            os.fsync(output.fileno())
        self.assertEqual(cache.recovery_status(PLAN, home)['status'], 'INSPECTED')
        restored = cache.restore_held(PLAN, [item['candidate_id']], home)
        self.assertEqual(restored['status'], 'RESTORED')
        self.assertEqual(source.read_bytes(), b'a' * 8192)
        self.assertEqual(cache.recovery_status(PLAN, home)['status'], 'INSPECTED')
        self.assertIn('RESTORED', [e['phase'] for e in self.events(state)])
        self.assert_protected(fixture)


@unittest.skipUnless(platform.system() == 'Darwin' and os.environ.get('IS_CLEAN_RUN_NATIVE_LSOF_FIXTURE') == '1',
                     'opt-in native lsof probe against disposable fixture only')
class NativeLsofFixtureTests(unittest.TestCase):
    def test_native_probe_recognizes_own_descriptor_and_other_fixture_holder(self):
        with tempfile.TemporaryDirectory(prefix='precise-lsof-fixture-',
                                         dir=Path(tempfile.gettempdir()).resolve()) as temporary:
            path = Path(temporary) / 'synthetic-open-file'
            path.write_bytes(b'fixture')
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                self.assertEqual(cache.busy_state(path, fd), 'CLEAR', 'native own-FD visibility was not verified')
                code = 'import sys,time;f=open(sys.argv[1],"rb");print("READY",flush=True);time.sleep(15)'
                child = subprocess.Popen([sys.executable, '-B', '-c', code, str(path)],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    self.assertEqual(child.stdout.readline().strip(), 'READY')
                    self.assertEqual(cache.busy_state(path, fd), 'BUSY')
                finally:
                    child.terminate()
                    child.communicate(timeout=5)
            finally:
                os.close(fd)
