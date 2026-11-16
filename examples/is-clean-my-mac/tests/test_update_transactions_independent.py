"""Managed-update fault tests; only disposable wrapper/receipt fixtures mutate."""
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from test_audit import load, BASE

install=load('independent_update_installer',BASE/'install.py')


class UpdateTransactionTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory(prefix='managed-update-fixture-')
        self.addCleanup(temporary.cleanup)
        self.home=Path(temporary.name).resolve()
        self.target=self.home/'.agents/skills';self.target.mkdir(parents=True)
        self.active=self.target/'is-clean-my-mac';self.active.mkdir()
        (self.active/'SKILL.md').write_text('old wrapper fixture')
        (self.active/'scripts').mkdir();(self.active/'scripts/helper.py').write_text('old helper fixture')
        self.source=self.home/'canonical-new';self.source.mkdir()
        (self.source/'SKILL.md').write_text('new wrapper fixture')
        (self.source/'scripts').mkdir();(self.source/'scripts/helper.py').write_text('new helper fixture')
        (self.source/'scripts/extra.py').write_text('new second helper fixture')
        self.old=install.digest(self.active);self.new=install.digest(self.source)
        self.receipt=dict(mole=dict(source=install.MOLE_SOURCE,files={'SKILL.md':'f'*64}),
            **{'is-clean-my-mac':dict(source='innosage-labs/examples/is-clean-my-mac',files=self.old)})
        self.record=self.target.parent/'is-clean-my-mac-install.json'
        self.record.write_text(json.dumps(self.receipt));self.record.chmod(0o600)
        self.transaction=self.target.parent/install.UPDATE_DIR
        self.historical=self.target.parent/'is-clean-my-mac-backup-owner-history';self.historical.mkdir()
        (self.historical/'PRIVATE-owner-data').write_bytes(b'preserve historical bytes')

    def update(self,hook=lambda phase:None):
        with patch.object(install,'SOURCE',self.source),contextlib.redirect_stdout(io.StringIO()):
            install.update_wrapper(self.target,self.record,self.receipt,self.new,hook)

    def interrupt(self,phase):
        def hook(current):
            if current==phase:raise RuntimeError('fixture interrupted')
        with self.assertRaises(RuntimeError):self.update(hook)

    def assert_historical_preserved(self):
        self.assertEqual((self.historical/'PRIVATE-owner-data').read_bytes(),b'preserve historical bytes')

    def test_success_retires_only_current_transaction_copy(self):
        self.update()
        self.assertEqual(install.digest(self.active),self.new)
        self.assertEqual(json.loads(self.record.read_text())['is-clean-my-mac']['files'],self.new)
        self.assertFalse(self.transaction.exists())
        self.assert_historical_preserved()

    def test_every_named_interruption_recovers_to_one_verified_active_copy(self):
        # Separate fresh fixtures avoid conflating update/replay state.
        for phase in ('before_stage','after_stage','after_old_capture','after_activation','after_commit'):
            with self.subTest(phase=phase):
                other=UpdateTransactionTests();other.setUp()
                try:
                    other.interrupt(phase)
                    action=install.recover_update(other.target,other.record)
                    expected=other.new if phase=='after_commit' else other.old
                    self.assertEqual(action,'finish' if phase=='after_commit' else 'rollback')
                    self.assertEqual(install.digest(other.active),expected)
                    self.assertEqual(json.loads(other.record.read_text())['is-clean-my-mac']['files'],expected)
                    self.assertFalse(other.transaction.exists());other.assert_historical_preserved()
                finally:other.doCleanups()

    def test_active_owner_edit_after_commit_prevents_rollback_retirement(self):
        def hook(phase):
            if phase=='before_retire':(self.active/'SKILL.md').write_text('owner new edit')
        with self.assertRaises(ValueError):self.update(hook)
        self.assertEqual((self.active/'SKILL.md').read_text(),'owner new edit')
        self.assertEqual(install.digest(self.transaction/'old'),self.old)
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assert_historical_preserved()

    def test_changed_or_extra_rollback_data_is_never_retired(self):
        self.interrupt('after_commit')
        private=self.transaction/'old/owner-unrecognized.txt';private.write_bytes(b'owner edit')
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assertEqual(private.read_bytes(),b'owner edit')
        self.assertEqual(install.digest(self.active),self.new)
        self.assert_historical_preserved()

    def test_hardlinked_rollback_file_is_preserved(self):
        self.interrupt('after_commit')
        old=self.transaction/'old/SKILL.md';alias=self.home/'owner-link';os.link(old,alias)
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assertEqual(old.read_bytes(),alias.read_bytes())
        self.assertEqual(install.digest(self.active),self.new)

    def test_owner_active_directory_appearing_after_capture_blocks_all_overwrite(self):
        def hook(phase):
            if phase=='after_old_capture':
                self.active.mkdir();(self.active/'SKILL.md').write_text('owner-created replacement')
        with self.assertRaises(OSError):self.update(hook)
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assertEqual((self.active/'SKILL.md').read_text(),'owner-created replacement')
        self.assertEqual(install.digest(self.transaction/'old'),self.old)
        self.assertEqual(install.digest(self.transaction/'new'),self.new)

    def test_empty_owner_destination_created_after_capture_is_not_overwritten(self):
        def hook(phase):
            if phase=='after_old_capture':self.active.mkdir()
        with self.assertRaises(OSError):self.update(hook)
        self.assertTrue(self.active.is_dir())
        self.assertEqual(list(self.active.iterdir()),[])
        self.assertEqual(install.digest(self.transaction/'old'),self.old)
        self.assertEqual(install.digest(self.transaction/'new'),self.new)

    def test_target_parent_swapped_to_symlink_during_staging_preserves_external_tree(self):
        external=self.home/'owner-external-skills';external.mkdir()
        shutil.copytree(self.active,external/'is-clean-my-mac')
        sentinel=external/'PRIVATE-unrelated';sentinel.write_bytes(b'owner external bytes')
        saved=self.target.with_name('original-skills-preserved')
        def hook(phase):
            if phase=='after_stage':
                self.target.rename(saved);self.target.symlink_to(external,target_is_directory=True)
        with self.assertRaises((ValueError,OSError)):self.update(hook)
        self.assertEqual(install.digest(external/'is-clean-my-mac'),self.old)
        self.assertEqual(install.digest(saved/'is-clean-my-mac'),self.old)
        self.assertEqual(sentinel.read_bytes(),b'owner external bytes')
        self.assertEqual(json.loads(self.record.read_text()),self.receipt)

    def test_higher_install_ancestor_swapped_to_matching_external_copy_is_rejected(self):
        external=self.home/'owner-external-agents'
        saved=self.home/'original-agents-preserved'
        def hook(phase):
            if phase=='after_stage':
                shutil.copytree(self.target.parent,external)
                self.target.parent.rename(saved)
                self.target.parent.symlink_to(external,target_is_directory=True)
        with self.assertRaises((ValueError,OSError)):self.update(hook)
        self.assertEqual(install.digest(external/'skills/is-clean-my-mac'),self.old)
        self.assertEqual(install.digest(saved/'skills/is-clean-my-mac'),self.old)
        self.assertEqual(json.loads((external/'is-clean-my-mac-install.json').read_text()),self.receipt)

    def test_receipt_drift_during_staging_preserves_every_copy(self):
        def hook(phase):
            if phase=='after_stage':self.record.write_text(json.dumps(dict(owner='new private receipt')))
        with self.assertRaises(ValueError):self.update(hook)
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assertEqual(install.digest(self.active),self.old)
        self.assertEqual(install.digest(self.transaction/'new'),self.new)
        self.assertEqual(json.loads(self.record.read_text()),dict(owner='new private receipt'))

    def test_partial_known_staging_is_safely_rolled_back_after_consent(self):
        self.interrupt('before_stage')
        partial=self.transaction/'new';partial.mkdir()
        (partial/'SKILL.md').write_bytes((self.source/'SKILL.md').read_bytes())
        self.assertEqual(install.recover_update(self.target,self.record),'rollback')
        self.assertEqual(install.digest(self.active),self.old)
        self.assertFalse(self.transaction.exists())

    def test_unknown_partial_staging_is_preserved(self):
        self.interrupt('before_stage')
        partial=self.transaction/'new';partial.mkdir()
        (partial/'SKILL.md').write_text('not the planned bytes')
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assertEqual((partial/'SKILL.md').read_text(),'not the planned bytes')
        self.assertEqual(install.digest(self.active),self.old)

    def test_interrupted_retirement_can_resume_for_finish_and_rollback(self):
        for phase in ('after_commit','after_activation'):
            with self.subTest(phase=phase):
                other=UpdateTransactionTests();other.setUp()
                try:
                    other.interrupt(phase)
                    def partial_retire(path,expected):
                        (path/'SKILL.md').unlink()
                        raise RuntimeError('fixture retirement interrupted')
                    with patch.object(install,'retire_managed_tree',side_effect=partial_retire),self.assertRaises(RuntimeError):
                        install.recover_update(other.target,other.record)
                    install.recover_update(other.target,other.record)
                    self.assertEqual(install.digest(other.active),other.new if phase=='after_commit' else other.old)
                    self.assertFalse(other.transaction.exists());other.assert_historical_preserved()
                finally:other.doCleanups()

    def test_empty_owned_transaction_marker_requires_verified_active_and_receipt(self):
        self.interrupt('after_commit')
        install.retire_managed_tree(self.transaction/'old',self.old)
        (self.transaction/'state.json').unlink()  # crash after final unlink, before rmdir
        install.recover_update(self.target,self.record)
        self.assertFalse(self.transaction.exists())
        self.assertEqual(install.digest(self.active),self.new)
        self.assert_historical_preserved()

    def test_empty_marker_never_overrides_owner_active_edits(self):
        self.interrupt('after_commit')
        install.retire_managed_tree(self.transaction/'old',self.old)
        (self.transaction/'state.json').unlink()
        (self.active/'SKILL.md').write_text('owner edit after commit')
        with self.assertRaises(ValueError):install.recover_update(self.target,self.record)
        self.assertTrue(self.transaction.exists())
        self.assertEqual((self.active/'SKILL.md').read_text(),'owner edit after commit')

    def test_overlapping_recovery_cannot_interfere_with_active_update(self):
        observed=[]
        def hook(phase):
            if phase=='after_stage':
                with self.assertRaises((ValueError,BlockingIOError)):
                    install.recover_update(self.target,self.record)
                observed.append('blocked')
                self.assertEqual(install.digest(self.active),self.old)
                self.assertEqual(install.digest(self.transaction/'new'),self.new)
        self.update(hook)
        self.assertEqual(observed,['blocked'])
        self.assertEqual(install.digest(self.active),self.new)
        self.assertFalse(self.transaction.exists())

    def test_overlapping_recovery_cannot_retire_same_state_twice(self):
        self.interrupt('after_commit')
        observed=[]
        def hook(phase):
            if phase=='before_retire':
                with self.assertRaises((ValueError,BlockingIOError)):
                    install.recover_update(self.target,self.record)
                observed.append('blocked')
        install.recover_update(self.target,self.record,hook)
        self.assertEqual(observed,['blocked'])
        self.assertFalse(self.transaction.exists())
        self.assertEqual(install.digest(self.active),self.new)

    def test_substituted_lock_never_mutates_external_or_pending_data(self):
        self.interrupt('after_stage')
        lock=self.transaction/'lock';lock.unlink()
        external=self.home/'PRIVATE-owner-lock';external.write_bytes(b'owner lock bytes');external.chmod(0o600)
        lock.symlink_to(external)
        with self.assertRaises((ValueError,OSError)):install.recover_update(self.target,self.record)
        self.assertEqual(external.read_bytes(),b'owner lock bytes')
        self.assertEqual(install.digest(self.active),self.old)
        self.assertEqual(install.digest(self.transaction/'new'),self.new)
        lock.unlink();os.link(external,lock)
        with self.assertRaises((ValueError,OSError)):install.recover_update(self.target,self.record)
        self.assertEqual(external.read_bytes(),b'owner lock bytes')

    def test_substituted_transaction_root_is_preserved_not_followed_for_cleanup(self):
        self.interrupt('after_stage')
        external=self.home/'PRIVATE-owner-transaction'
        self.transaction.rename(external)
        self.transaction.symlink_to(external,target_is_directory=True)
        with self.assertRaises((ValueError,OSError)):install.recover_update(self.target,self.record)
        self.assertTrue(self.transaction.is_symlink())
        self.assertEqual(install.digest(external/'new'),self.new)
        self.assertTrue((external/'state.json').is_file())
        self.assertEqual(install.digest(self.active),self.old)

    def test_recovery_plan_and_decline_do_not_mutate_or_call_packages(self):
        self.interrupt('after_activation')
        before={str(p.relative_to(self.home)):p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        def invoke(plan,answer):
            argv=['install.py','--skills-dir',str(self.target),'--recover-update']+(['--plan'] if plan else [])
            with patch('sys.argv',argv),patch.object(install.platform,'system',return_value='Darwin'), \
                    patch.object(install.platform,'mac_ver',return_value=('26.0','','')), \
                    patch.object(install,'run',side_effect=AssertionError('recovery must not run packages')), \
                    patch('builtins.input',return_value=answer),contextlib.redirect_stdout(io.StringIO()):
                install.main()
        invoke(True,None)
        with self.assertRaises(ValueError):invoke(False,'no')
        after={str(p.relative_to(self.home)):p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        self.assertEqual(before,after)
