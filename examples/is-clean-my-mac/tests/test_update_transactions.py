"""Managed update lifecycle on disposable trees only; no host installations."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from test_audit import load,BASE

installer=load('update_transaction_tests',BASE/'install.py')


class UpdateTransactionTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.base=Path(temporary.name).resolve()
        self.target=self.base/'skills';self.target.mkdir()
        self.active=self.target/'is-clean-my-mac';self.active.mkdir()
        (self.active/'SKILL.md').write_text('known old managed skill')
        (self.active/'removed.py').write_text('old managed helper')
        self.record=self.base/'is-clean-my-mac-install.json'
        self.old=dict(mole=dict(source='tw93/Mole@V1.72.0',files={'SKILL.md':'untouched'}),**{'is-clean-my-mac':dict(source='innosage-labs/examples/is-clean-my-mac',files=installer.digest(self.active))})
        self.record.write_text(json.dumps(self.old))
        self.new=self.base/'canonical';self.new.mkdir()
        (self.new/'SKILL.md').write_text('new canonical skill')
        (self.new/'new.py').write_text('new canonical helper')
        self.planned=installer.digest(self.new)
        self.transaction=self.base/installer.UPDATE_DIR
        self.historical=self.base/'is-clean-my-mac-backup-historical';self.historical.mkdir()
        (self.historical/'PRIVATE-owner-edit').write_text('must survive')

    def update(self,hook=lambda phase:None):
        with patch.object(installer,'SOURCE',self.new):
            installer.update_wrapper(self.target,self.record,self.old,self.planned,hook)

    def test_success_one_active_version_no_new_permanent_backup(self):
        import os
        for entry in self.active.iterdir():
            info=entry.stat();os.utime(entry,(1,info.st_mtime)) # verifier reads may legitimately change atime
        self.update()
        self.assertEqual(installer.digest(self.active),self.planned)
        self.assertFalse((self.active/'removed.py').exists())
        self.assertFalse(self.transaction.exists())
        self.assertEqual((self.historical/'PRIVATE-owner-edit').read_text(),'must survive')
        self.assertEqual(json.loads(self.record.read_text())['mole'],self.old['mole'])

    def test_each_interrupted_transition_has_safe_consented_recovery(self):
        for phase in ('before_stage','after_stage','after_old_capture','after_activation','after_commit','before_retire'):
            with self.subTest(phase=phase):
                def crash(current):
                    if current==phase:raise InterruptedError('owned fixture crash')
                with self.assertRaises(InterruptedError):self.update(crash)
                _,_,action=installer.transaction_state(self.target,self.record)
                self.assertEqual(action,'finish' if phase in ('after_commit','before_retire') else 'rollback')
                installer.recover_update(self.target,self.record)
                expected=self.planned if action=='finish' else self.old['is-clean-my-mac']['files']
                self.assertEqual(installer.digest(self.active),expected)
                self.assertFalse(self.transaction.exists())
                # Reset only known fixture active/receipt for the next transition.
                installer.retire_managed_tree(self.active,expected)
                self.active.mkdir();(self.active/'SKILL.md').write_text('known old managed skill');(self.active/'removed.py').write_text('old managed helper')
                self.record.write_text(json.dumps(self.old))
        self.assertTrue((self.historical/'PRIVATE-owner-edit').exists())

    def test_partial_stage_is_preserved_with_unchanged_active_and_receipt(self):
        def partial(source,destination):
            destination.mkdir();(destination/'SKILL.md').write_text('partial')
            raise OSError('fixture copy failed')
        with patch.object(installer.shutil,'copytree',side_effect=partial),self.assertRaises(OSError):self.update()
        with self.assertRaises(ValueError):installer.recover_update(self.target,self.record)
        self.assertEqual(installer.digest(self.active),self.old['is-clean-my-mac']['files'])
        self.assertEqual(json.loads(self.record.read_text()),self.old)
        self.assertEqual((self.transaction/'new/SKILL.md').read_text(),'partial')

    def test_local_edit_during_stage_blocks_capture_and_preserves_every_copy(self):
        def edit(phase):
            if phase=='after_stage':(self.active/'SKILL.md').write_text('owner changed after consent')
        with self.assertRaises(ValueError):self.update(edit)
        self.assertEqual((self.active/'SKILL.md').read_text(),'owner changed after consent')
        self.assertFalse((self.transaction/'old').exists())
        self.assertTrue((self.transaction/'new/SKILL.md').exists())
        with self.assertRaises(ValueError):installer.recover_update(self.target,self.record)

    def test_edited_rollback_copy_is_never_retired_after_commit(self):
        def edit(phase):
            if phase=='before_retire':(self.transaction/'old/SKILL.md').write_text('changed rollback must remain')
        with self.assertRaises(ValueError):self.update(edit)
        self.assertEqual(installer.digest(self.active),self.planned)
        self.assertEqual((self.transaction/'old/SKILL.md').read_text(),'changed rollback must remain')
        with self.assertRaises(ValueError):installer.recover_update(self.target,self.record)

    def test_retirement_interruption_resumes_verified_remaining_subset(self):
        real=installer.retire_managed_tree
        def partial(path,expected):
            (path/'removed.py').unlink() # only one known owned fixture entry
            raise InterruptedError('fixture retirement crash')
        with patch.object(installer,'retire_managed_tree',side_effect=partial),self.assertRaises(InterruptedError):self.update()
        self.assertEqual(installer.transaction_state(self.target,self.record)[2],'finish')
        with patch.object(installer,'retire_managed_tree',real):installer.recover_update(self.target,self.record)
        self.assertFalse(self.transaction.exists())
        self.assertEqual(installer.digest(self.active),self.planned)

    def test_recovery_conflicting_active_replacement_is_never_overwritten(self):
        def crash(phase):
            if phase=='after_old_capture':raise InterruptedError('fixture crash')
        with self.assertRaises(InterruptedError):self.update(crash)
        self.active.mkdir();(self.active/'SKILL.md').write_text('unknown concurrent replacement')
        with self.assertRaises(ValueError):installer.recover_update(self.target,self.record)
        self.assertEqual((self.active/'SKILL.md').read_text(),'unknown concurrent replacement')
        self.assertEqual(installer.digest(self.transaction/'old'),self.old['is-clean-my-mac']['files'])

    def test_unknown_extra_file_link_and_directory_stop_retirement(self):
        for kind in ('file','link','directory'):
            with self.subTest(kind=kind):
                extra=self.active/'extra'
                if kind=='file':extra.write_text('unknown')
                elif kind=='link':extra.symlink_to(self.historical/'PRIVATE-owner-edit')
                else:extra.mkdir()
                with self.assertRaises(ValueError):installer.retire_managed_tree(self.active,self.old['is-clean-my-mac']['files'])
                self.assertTrue((self.active/'SKILL.md').exists())
                if kind=='directory':extra.rmdir()
                else:extra.unlink() # own disposable injected test object only

    def test_process_crashes_release_lock_and_recover_from_durable_state(self):
        import subprocess,sys
        child='''import importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('fixture_update',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
target,record,source=map(Path,sys.argv[2:5]);m.SOURCE=source
state=json.loads(record.read_text());planned=m.digest(source)
def crash(phase):
 if phase==sys.argv[5]:os._exit(73)
m.update_wrapper(target,record,state,planned,crash)
'''
        for phase in ('after_stage','after_old_capture','after_activation','after_commit','before_retire'):
            with self.subTest(phase=phase):
                run=subprocess.run([sys.executable,'-B','-c',child,str(BASE/'install.py'),str(self.target),str(self.record),str(self.new),phase],capture_output=True,timeout=15)
                self.assertEqual(run.returncode,73)
                action=installer.recover_update(self.target,self.record)
                expected=self.planned if action=='finish' else self.old['is-clean-my-mac']['files']
                self.assertEqual(installer.digest(self.active),expected)
                self.assertFalse(self.transaction.exists())
                installer.retire_managed_tree(self.active,expected)
                self.active.mkdir();(self.active/'SKILL.md').write_text('known old managed skill');(self.active/'removed.py').write_text('old managed helper')
                self.record.write_text(json.dumps(self.old))

    def test_repeated_verified_updates_never_accumulate_new_backup_directories(self):
        for version in range(3):
            self.old=json.loads(self.record.read_text())
            (self.new/'SKILL.md').write_text('new managed revision '+str(version))
            self.planned=installer.digest(self.new)
            self.update()
            self.assertFalse(self.transaction.exists())
            self.assertEqual(list(self.base.glob('is-clean-my-mac-backup-*')),[self.historical])

    def test_unknown_empty_directory_appearing_during_retirement_is_preserved(self):
        original=Path.unlink
        def concurrent(entry,*args,**kwargs):
            result=original(entry,*args,**kwargs)
            if entry==self.active/'removed.py':(self.active/'unknown-owner-directory').mkdir()
            return result
        with patch.object(Path,'unlink',concurrent),self.assertRaises(OSError):
            installer.retire_managed_tree(self.active,self.old['is-clean-my-mac']['files'])
        self.assertTrue((self.active/'unknown-owner-directory').is_dir())
        self.assertTrue((self.historical/'PRIVATE-owner-edit').is_file())

    def test_oversized_owner_file_stops_bounded_preflight_without_retirement(self):
        extra=self.active/'owner-large-file'
        with extra.open('wb') as output:output.truncate(9*1024*1024)
        with self.assertRaises(ValueError):installer.digest(self.active)
        self.assertEqual(extra.stat().st_size,9*1024*1024)
        self.assertTrue((self.active/'SKILL.md').exists())
        self.assertFalse(self.transaction.exists())

    def test_concurrent_large_replacement_is_rejected_before_managed_file_read(self):
        original=installer.os.open
        candidate=self.active/'SKILL.md'
        def changed(path,*args,**kwargs):
            if Path(path)==candidate:
                with candidate.open('wb') as output:output.truncate(9*1024*1024)
            return original(path,*args,**kwargs)
        with patch.object(installer.os,'open',side_effect=changed),self.assertRaises(ValueError):
            installer.managed_files(self.active,self.old['is-clean-my-mac']['files'])
        self.assertEqual(candidate.stat().st_size,9*1024*1024)
        self.assertTrue((self.active/'removed.py').exists())
