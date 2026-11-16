"""Own disposable cache fixtures only. Never discover or execute against host HOME."""
import copy
import json
import os
from pathlib import Path
import platform
from types import SimpleNamespace
import tempfile
import time
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS

cache = load('precise_cache_tests', SCRIPTS / 'precise-cache.py')


@unittest.skipUnless(platform.system() == 'Darwin', 'native exclusive rename is macOS only')
class PreciseCacheTests(unittest.TestCase):
    def setUp(self):
        # Physical system TMPDIR is outside this host's HOME dotfiles repository
        # and /tmp. Production traversal checks remain active on all ancestors.
        self.temp = tempfile.TemporaryDirectory(prefix='precise-cache-test-',
                                                dir=Path(tempfile.gettempdir()).resolve())
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        (self.home/'Library/Application Support').mkdir(parents=True)
        self.root = self.home.joinpath(*cache.ROOTS['homebrew_bottle'])
        self.root.mkdir(parents=True)
        self.old = time.time() - cache.MIN_AGE - 3600

    def bottle(self, label='a'):
        path = self.root / (label * 64 + '--PRIVATE--1.0.arm64_sonoma.bottle.tar.gz')
        path.write_bytes(b'x' * 8192)
        os.utime(path, (self.old, self.old))
        return path

    def pip_body(self, metadata=True):
        token = 'abcdef0' * 8
        directory = self.home.joinpath(*cache.ROOTS['pip_http_body'], *token[:5])
        directory.mkdir(parents=True)
        body = directory / (token + '.body')
        body.write_bytes(b'b' * 8192)
        os.utime(body, (self.old, self.old))
        if metadata:
            sibling = directory / token
            sibling.write_bytes(b'metadata-fixture')
            os.utime(sibling, (self.old, self.old))
        return body

    def items(self):
        return cache.discover(self.home)[0]['objects']

    def execute(self, items, hook=None, probe=None, plan='1' * 64):
        return cache.execute(plan, items, self.home,
                             probe=probe or (lambda path, fd: 'CLEAR'), hook=hook)

    def test_formats_are_exact_and_rebuilt_bottles_supported(self):
        self.assertTrue(cache.supported('homebrew_bottle', ['a'*64+'--test--1.arm64.bottle.2.tar.gz']))
        for name in ('a'*63+'--test.bottle.tar.gz', 'a'*64+'--test.bottle.tar.gz.incomplete',
                     '../'+'a'*64+'--test.bottle.tar.gz', 'a'*64+'--test.bottle.json'):
            self.assertFalse(cache.supported('homebrew_bottle', [name]))
        token = 'abcdef0' * 8
        self.assertTrue(cache.supported('pip_http_body', [*token[:5], token+'.body']))
        self.assertFalse(cache.supported('pip_http_body', ['f', *token[1:5], token+'.body']))
        self.assertFalse(cache.supported('pip_http_body', [*token[:5], 'a'*64+'.body']))

    def test_discovery_pairs_pip_and_redacts_public_values(self):
        self.bottle(); self.pip_body()
        private, public = cache.discover(self.home)
        self.assertEqual({item['category'] for item in private['objects']}, {'homebrew_bottle', 'pip_http_body'})
        self.assertNotIn('PRIVATE', json.dumps(public))
        self.assertNotIn(str(self.home), json.dumps(public))
        self.assertTrue(all(item['allocated_bytes'] > 0 for item in public['candidates']))

    def test_missing_pip_sibling_never_actionable(self):
        self.pip_body(metadata=False)
        self.assertEqual(self.items(), [])

    def test_discovery_budget_and_display_limit_preserve_coverage(self):
        for index in range(10): self.bottle(format(index, 'x'))
        private, public = cache.discover(self.home)
        self.assertEqual(len(private['objects']), cache.MAX_OBJECTS)
        self.assertEqual(public['completeness'], 'PARTIAL')
        self.assertIn('candidate_display_limit', public['reasons'])
        private, public = cache.discover(self.home, max_entries=1)
        self.assertLessEqual(len(private['objects']), 1)
        self.assertIn('candidate_budget_exhausted', public['reasons'])

    def test_links_fresh_and_writable_files_are_excluded(self):
        original = self.bottle('a')
        os.link(original, self.root / ('b'*64+'--test.bottle.tar.gz'))
        (self.root / ('c'*64+'--test.bottle.tar.gz')).symlink_to(original)
        fresh = self.bottle('d'); os.utime(fresh, None)
        writable = self.bottle('e'); writable.chmod(0o666)
        self.assertEqual(self.items(), [])

    def test_manifest_and_target_drift_block_before_state_creation(self):
        target = self.bottle(); item = self.items()[0]
        tampered = copy.deepcopy(item); tampered['logical_bytes'] += 1
        with self.assertRaises(cache.Stop): cache.revalidate(tampered, self.home)
        target.write_bytes(b'changed')
        result = self.execute([item])
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertTrue(target.exists())
        self.assertFalse((self.home/'Library/Application Support/is-clean-my-mac-recovery').exists())

    def test_malformed_candidate_identifier_cannot_escape_recovery_namespace(self):
        path = self.bottle(); item = self.items()[0]
        item['candidate_id'] = '../escaped-capture'
        item['scope_digest'] = cache.digest({key:value for key,value in item.items() if key!='scope_digest'})
        result = self.execute([item])
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertTrue(path.exists())
        self.assertFalse((self.home/'Library/Application Support/is-clean-my-mac-recovery').exists())

    def test_malformed_item_schemas_stop_without_state_or_removal(self):
        path = self.bottle(); original = self.items()[0]
        changes = [lambda item:item.update(extra='PRIVATE'),
                   lambda item:item.update(allocated_bytes=True),
                   lambda item:item.update(logical_bytes=item['logical_bytes']+1),
                   lambda item:item['target'].update(st_ino=[]),
                   lambda item:item['target'].update(st_nlink=True),
                   lambda item:item['ancestors'][0].update(st_dev=-1),
                   lambda item:item.update(parts=['../PRIVATE']),
                   lambda item:item.update(companion=dict(item['target']))]
        for change in changes:
            item = copy.deepcopy(original); change(item)
            self.assertEqual(self.execute([item])['status'], 'BLOCKED')
        for value in (None, [], 'PRIVATE'):
            self.assertEqual(self.execute([value])['status'], 'BLOCKED')
        self.assertTrue(path.exists())
        self.assertFalse((self.home/'Library/Application Support/is-clean-my-mac-recovery').exists())

    def test_duplicate_ids_and_inodes_block_entire_scope_before_mutation(self):
        first = self.bottle('a'); second = self.bottle('b'); items = self.items()
        duplicate_id = copy.deepcopy(items)
        duplicate_id[1]['candidate_id'] = duplicate_id[0]['candidate_id']
        duplicate_inode = [copy.deepcopy(items[0]), copy.deepcopy(items[0])]
        duplicate_inode[1]['candidate_id'] = 'f'*32
        for values in (duplicate_id, duplicate_inode):
            for item in values:
                item['scope_digest'] = cache.digest({k:v for k,v in item.items() if k!='scope_digest'})
            result = self.execute(values)
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertEqual(result['blocker'], 'duplicate_or_overlapping_objects')
        self.assertTrue(first.exists()); self.assertTrue(second.exists())
        self.assertFalse((self.home/'Library/Application Support/is-clean-my-mac-recovery').exists())

    def test_recovery_directory_symlink_and_shared_mode_block(self):
        path = self.bottle(); item = self.items()[0]
        recovery = self.home/'Library/Application Support/is-clean-my-mac-recovery'
        other = self.home/'unselected-directory'; other.mkdir(); sentinel=other/'PRIVATE';sentinel.write_bytes(b'keep')
        recovery.symlink_to(other, target_is_directory=True)
        self.assertEqual(self.execute([item])['status'], 'BLOCKED')
        self.assertEqual(sentinel.read_bytes(), b'keep')
        recovery.unlink(); recovery.mkdir(mode=0o755)
        self.assertEqual(self.execute([item])['status'], 'BLOCKED')
        self.assertTrue(path.exists())

    def test_acl_unknown_candidate_blocks_discovery_and_revalidation(self):
        path = self.bottle(); item = self.items()[0]; inode = path.stat().st_ino
        native = cache.private_acl
        def acl(fd):
            return False if os.fstat(fd).st_ino == inode else native(fd)
        with patch.object(cache, 'private_acl', side_effect=acl):
            self.assertEqual(self.items(), [])
            self.assertEqual(self.execute([item])['status'], 'BLOCKED')
        self.assertTrue(path.exists())

    def test_acl_unknown_recovery_directory_blocks_execution(self):
        path = self.bottle(); item = self.items()[0]
        recovery = self.home/'Library/Application Support/is-clean-my-mac-recovery';recovery.mkdir(mode=0o700)
        inode = recovery.stat().st_ino; native = cache.private_acl
        def acl(fd):
            return False if os.fstat(fd).st_ino == inode else native(fd)
        with patch.object(cache, 'private_acl', side_effect=acl):
            self.assertEqual(self.execute([item])['status'], 'BLOCKED')
        self.assertTrue(path.exists())
        self.assertEqual(list(recovery.iterdir()), [])

    def test_lsof_bounded_spool_parser_is_conservative(self):
        own = ('p'+str(os.getpid())+'\nf7\n').encode()
        cases = [(own,b'',0,'CLEAR'), (own+b'p123456789\nf9\n',b'',0,'BUSY'),
                 (b'f7\n',b'',0,'UNKNOWN'), (('p'+str(os.getpid())+'\n').encode(),b'',0,'UNKNOWN'),
                 (own+b'PRIVATE\n',b'',0,'UNKNOWN'), (own,b'PRIVATE error',0,'UNKNOWN'),
                 (own,b'',1,'UNKNOWN'), (b'x'*65536,b'',0,'UNKNOWN')]
        for stdout, stderr, returncode, expected in cases:
            def run(command, **kwargs):
                self.assertEqual(command[:3], ['/usr/sbin/lsof','-Fpf','--'])
                self.assertEqual(kwargs['timeout'], 3)
                self.assertEqual(kwargs['stdin'], cache.subprocess.DEVNULL)
                self.assertTrue(callable(kwargs['preexec_fn']))
                self.assertEqual(kwargs['env']['LC_ALL'], 'C')
                kwargs['stdout'].write(stdout); kwargs['stderr'].write(stderr)
                return SimpleNamespace(returncode=returncode)
            with patch.object(cache.subprocess, 'run', side_effect=run):
                self.assertEqual(cache.busy_state(self.home/'PRIVATE-fixture',7), expected)

    def test_lsof_failure_or_timeout_never_clear(self):
        for error in (OSError('PRIVATE'), cache.subprocess.TimeoutExpired(['lsof'],3)):
            with patch.object(cache.subprocess, 'run', side_effect=error):
                self.assertEqual(cache.busy_state(self.home/'PRIVATE-fixture',7), 'UNKNOWN')

    def test_only_selected_file_removed_unselected_and_trash_preserved_replay_blocked(self):
        selected = self.bottle('a'); unselected = self.bottle('b')
        trash = self.home/'.Trash'; trash.mkdir(); sentinel = trash/'PRIVATE'; sentinel.write_bytes(b'keep')
        item = next(item for item in self.items() if item['parts'][-1] == selected.name)
        result = self.execute([item])
        self.assertEqual(result['status'], 'SUCCEEDED')
        self.assertFalse(selected.exists()); self.assertTrue(unselected.exists())
        self.assertEqual(sentinel.read_bytes(), b'keep')
        self.assertIsNone(result['actual_freed_bytes'])
        self.assertEqual(result['removed_scope_allocated_bytes'], item['allocated_bytes'])
        # A newly eligible replacement still cannot reuse an already consumed
        # plan ID; this exercises the receipt guard rather than missing-file drift.
        self.bottle('a')
        new_item = next(value for value in self.items() if value['parts'][-1] == selected.name)
        replay = self.execute([new_item])
        self.assertEqual(replay['status'], 'BLOCKED')
        self.assertEqual(replay['blocker'], 'execution_preflight_or_replay_failed')
        self.assertTrue(selected.exists())
        self.assertTrue(unselected.exists())

    def test_busy_observation_restores_without_unlink(self):
        path = self.bottle(); item = self.items()[0]
        result = self.execute([item], probe=lambda path, fd: 'BUSY')
        self.assertNotEqual(result['status'], 'SUCCEEDED')
        self.assertEqual(path.read_bytes(), b'x'*8192)
        self.assertTrue(result['rows'][0].get('restored'))

    def test_unknown_visibility_restores_without_unlink(self):
        path = self.bottle(); item = self.items()[0]
        result = self.execute([item], probe=lambda path, fd: 'UNKNOWN')
        self.assertNotEqual(result['status'], 'SUCCEEDED')
        self.assertEqual(path.read_bytes(), b'x'*8192)

    def test_pip_metadata_changed_after_capture_preserves_body(self):
        path = self.pip_body(); item = self.items()[0]
        sibling = path.with_name(path.name[:-5])
        def hook(phase, item, fd, statefd):
            if phase == 'before_unlink': sibling.write_bytes(b'updated-metadata')
        result = self.execute([item], hook=hook)
        self.assertNotEqual(result['status'], 'SUCCEEDED')
        self.assertEqual(path.read_bytes(), b'b'*8192)
        self.assertEqual(sibling.read_bytes(), b'updated-metadata')

    def test_pip_metadata_changed_at_final_unlink_intent_preserves_body(self):
        path = self.pip_body(); item = self.items()[0]
        sibling = path.with_name(path.name[:-5])
        def hook(phase, item, fd, statefd):
            if phase == 'after_unlink_intent': sibling.write_bytes(b'updated-metadata')
        result = self.execute([item], hook=hook)
        self.assertNotEqual(result['status'], 'SUCCEEDED')
        self.assertEqual(path.read_bytes(), b'b'*8192)
        self.assertEqual(sibling.read_bytes(), b'updated-metadata')

    def test_replacement_before_capture_is_preserved_not_unlinked(self):
        path = self.bottle(); item = self.items()[0]; saved = self.root/'original-preserved'
        def hook(phase, item, fd, statefd):
            if phase == 'before_capture':
                path.rename(saved); path.write_bytes(b'replacement')
        result = self.execute([item], hook=hook)
        self.assertNotEqual(result['status'], 'SUCCEEDED')
        self.assertEqual(saved.read_bytes(), b'x'*8192)
        self.assertEqual(path.read_bytes(), b'replacement')

    def test_quarantine_swap_never_restores_or_unlinks_wrong_identity(self):
        path = self.bottle(); item = self.items()[0]
        def hook(phase, item, fd, statefd):
            if phase == 'after_capture':
                os.rename(item['candidate_id'], 'saved-original', src_dir_fd=statefd, dst_dir_fd=statefd)
                replacement = os.open(item['candidate_id'], os.O_CREAT|os.O_EXCL|os.O_WRONLY, 0o600, dir_fd=statefd)
                os.write(replacement, b'wrong-identity'); os.close(replacement)
        result = self.execute([item], hook=hook)
        self.assertEqual(result['rows'][0]['status'], 'RECOVERY_REQUIRED')
        self.assertFalse(path.exists())
        state = self.home/'Library/Application Support/is-clean-my-mac-recovery'/('1'*64)
        self.assertEqual((state/item['candidate_id']).read_bytes(), b'wrong-identity')
        self.assertEqual((state/'saved-original').read_bytes(), b'x'*8192)

    def test_restore_conflict_never_overwrites_new_original_name(self):
        path = self.bottle(); item = self.items()[0]
        def hook(phase, item, fd, statefd):
            if phase == 'after_capture': path.write_bytes(b'new-original-name')
        result = self.execute([item], hook=hook, probe=lambda path, fd:'BUSY')
        self.assertEqual(result['rows'][0]['status'], 'RECOVERY_REQUIRED')
        self.assertEqual(path.read_bytes(), b'new-original-name')

    def test_explicit_recovery_rejects_unknown_tokens_and_preserves_conflicts(self):
        path = self.bottle(); item = self.items()[0]
        def hook(phase, item, fd, statefd):
            if phase == 'after_capture': path.write_bytes(b'new-original-name')
        result = self.execute([item], hook=hook, probe=lambda path,fd:'BUSY')
        self.assertEqual(result['rows'][0]['status'], 'RECOVERY_REQUIRED')
        state = self.home/'Library/Application Support/is-clean-my-mac-recovery'/('1'*64)
        held = state/item['candidate_id']
        unknown = cache.restore_held('1'*64, ['../PRIVATE'], self.home)
        self.assertEqual(unknown['status'], 'BLOCKED')
        conflict = cache.restore_held('1'*64, [item['candidate_id']], self.home)
        self.assertEqual(conflict['status'], 'PARTIAL')
        self.assertEqual(path.read_bytes(), b'new-original-name')
        self.assertTrue(held.exists())
        # Only this test-owned replacement is removed to make restoration possible.
        path.unlink()
        restored = cache.restore_held('1'*64, [item['candidate_id']], self.home)
        self.assertEqual(restored['status'], 'RESTORED')
        self.assertEqual(path.read_bytes(), b'x'*8192)
        self.assertFalse(held.exists())

    def test_recovery_manifest_tamper_cannot_redirect_restore_destination(self):
        path = self.bottle(); item = self.items()[0]
        def hook(phase, item, fd, statefd):
            if phase == 'after_capture': path.write_bytes(b'new-original-name')
        self.execute([item], hook=hook, probe=lambda path,fd:'BUSY')
        state = self.home/'Library/Application Support/is-clean-my-mac-recovery'/('1'*64)
        manifest = state/'manifest.json'
        value = json.loads(manifest.read_bytes())
        destination = 'f'*64+'--redirected.bottle.tar.gz'
        value['objects'][0]['parts'] = [destination]  # Existing scope_digest deliberately unchanged.
        manifest.write_text(json.dumps(value))
        result = cache.restore_held('1'*64, [item['candidate_id']], self.home)
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertFalse((self.root/destination).exists())
        self.assertEqual(path.read_bytes(), b'new-original-name')
        self.assertTrue((state/item['candidate_id']).exists())

    def test_parent_path_change_after_capture_or_before_unlink_preserves_target(self):
        for phase in ('after_capture', 'before_unlink'):
            with self.subTest(phase=phase):
                path = self.bottle(); item = self.items()[0]
                moved = self.root.with_name('downloads-moved')
                def hook(current, item, fd, statefd):
                    if current == phase:
                        self.root.rename(moved); self.root.mkdir()
                result = self.execute([item], hook=hook, plan=('2' if phase=='after_capture' else '3')*64)
                self.assertNotEqual(result['status'], 'SUCCEEDED')
                self.assertEqual((moved/path.name).read_bytes(), b'x'*8192)
                self.assertFalse(path.exists())
                (moved/path.name).unlink(); moved.rmdir()

    def test_partial_failure_keeps_completed_result_and_does_not_touch_unselected(self):
        first = self.bottle('a'); second = self.bottle('b'); third = self.bottle('c')
        items = sorted(self.items(), key=lambda item:item['parts'][-1])
        def hook(phase, item, fd, statefd):
            if phase == 'before_unlink' and item['candidate_id'] == items[1]['candidate_id']:
                raise cache.Stop('open_file_or_visibility_unknown')
        result = self.execute(items[:2], hook=hook)
        self.assertEqual(result['status'], 'PARTIAL')
        self.assertEqual(result['rows'][0]['status'], 'SUCCEEDED')
        self.assertFalse(first.exists()); self.assertTrue(second.exists()); self.assertTrue(third.exists())
        self.assertIsNone(result['actual_freed_bytes'])

    def test_journal_failure_after_unlink_does_not_claim_no_change(self):
        path = self.bottle(); item = self.items()[0]; original_event = cache.event
        def event(journal, phase, **values):
            if phase == 'UNLINKED': raise cache.Stop('journal_write_failed')
            return original_event(journal, phase, **values)
        with patch.object(cache, 'event', side_effect=event): result = self.execute([item])
        self.assertFalse(path.exists())
        row = result['rows'][0]
        self.assertEqual(row['status'], 'REMOVED_RECEIPT_FAILED')
        self.assertEqual(row['removed_scope_allocated_bytes'], item['allocated_bytes'])
        self.assertEqual(row['blocker'], 'journal_write_failed')


    def test_existing_mole_protection_configuration_is_manual_without_reading_contents(self):
        target=self.bottle();item=self.items()[0] if hasattr(self,'items') else cache.discover(self.home)[0]['objects'][0]
        config=self.home/'.config/mole';config.mkdir(parents=True)
        protection=config/'whitelist';protection.write_bytes(b'PRIVATE protection data')
        with patch.object(Path,'read_bytes',side_effect=AssertionError('configuration content not read')):
            private,public=cache.discover(self.home)
        self.assertEqual(private['objects'],[])
        self.assertIn('mole_protection_configuration_present',public['reasons'])
        result=cache.execute('f'*64,[item],self.home,probe=lambda path,fd:'CLEAR')
        self.assertEqual(result['status'],'BLOCKED')
        self.assertTrue(target.exists())
        self.assertNotIn('PRIVATE',json.dumps(public)+json.dumps(result))

    def test_new_protection_after_capture_preserves_selected_object(self):
        target=self.bottle();item=cache.discover(self.home)[0]['objects'][0]
        def protect(phase,*args):
            if phase=='after_capture':
                config=self.home/'.config/mole';config.mkdir(parents=True)
                (config/'whitelist').write_text('private protection')
        result=cache.execute('e'*64,[item],self.home,probe=lambda path,fd:'CLEAR',hook=protect)
        self.assertEqual(result['rows'][0]['status'],'BLOCKED')
        self.assertTrue(result['rows'][0]['restored'])
        self.assertTrue(target.exists())
