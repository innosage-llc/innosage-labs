import contextlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_audit import load, BASE

installer = load('installer', BASE / 'install.py')


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.target = self.home / '.agents/skills'
        self.commands = []

    def fake_run(self, command, **kwargs):
        self.commands.append(command)
        if command[0] == 'npx':
            upstream = Path(kwargs['env']['HOME']) / '.agents/skills/mole'
            upstream.mkdir(parents=True)
            (upstream / 'SKILL.md').write_text('Synthetic installer test fixture; not upstream code')
        return subprocess.CompletedProcess(command, 0, stdout='v26.13.0\n')

    def invoke(self, answer='INSTALL', plan=False, missing_mole=False, agent_stdin=False, update=False):
        def which(command):
            return None if missing_mole and command == 'mo' else '/synthetic/' + command
        args = ['install.py', '--skills-dir', str(self.target)] + (['--plan'] if plan else [])
        if update:
            args.append('--update-managed')
        consent_input = (patch('sys.stdin', io.StringIO('' if answer is None else answer + '\n'))
                         if agent_stdin else patch('builtins.input', return_value=answer))
        with patch('sys.argv', args), patch.object(installer.platform, 'system', return_value='Darwin'), \
             patch.object(installer.platform, 'mac_ver', return_value=('26.0', '', '')), \
             patch.object(installer.shutil, 'which', side_effect=which), \
             patch.object(installer, 'run', side_effect=self.fake_run), \
             patch.object(installer.Path, 'home', return_value=self.home), \
             patch.dict('os.environ', {'CODEX_HOME': str(self.home / '.codex')}), \
             consent_input, contextlib.redirect_stdout(io.StringIO()):
            installer.main()

    def test_plan_and_denied_consent_no_writes(self):
        self.invoke(plan=True)
        self.assertFalse(self.target.exists())
        with self.assertRaises(ValueError):
            self.invoke(answer='no')
        self.assertFalse(self.target.exists())
        self.assertFalse(any(c[0] == 'npx' for c in self.commands))

    def test_agent_can_submit_approved_plan_acknowledgement_on_stdin(self):
        # Synthetic owner approval fixture; never authorization for host installs.
        self.invoke(agent_stdin=True)
        self.assertTrue((self.target / 'mole/SKILL.md').is_file())
        self.assertTrue((self.target / 'is-clean-my-mac/SKILL.md').is_file())
        self.assertFalse(any(c[0] == 'brew' for c in self.commands))

    def test_agent_decline_or_eof_never_installs(self):
        for answer in ('no', None):
            with self.assertRaises(ValueError):
                self.invoke(answer=answer, agent_stdin=True)
            self.assertFalse(self.target.exists())
        self.assertFalse(any(c[0] in ('npx', 'brew') for c in self.commands))

    def test_plan_does_not_require_stdin_or_write(self):
        self.invoke(answer=None, agent_stdin=True, plan=True)
        self.assertFalse(self.target.exists())
        self.assertFalse(any(c[0] in ('npx', 'brew') for c in self.commands))

    def test_install_rerun_preserves_cli(self):
        self.invoke()
        receipt = (self.target.parent / 'is-clean-my-mac-install.json').read_bytes()
        self.commands.clear()
        self.invoke()
        self.assertEqual(receipt, (self.target.parent / 'is-clean-my-mac-install.json').read_bytes())
        self.assertFalse(any(c[0] in ('brew', 'npx') for c in self.commands))

    def test_managed_noop_completes_without_stdin_or_package_commands(self):
        self.invoke()
        self.commands.clear()
        self.invoke(answer=None, agent_stdin=True)
        self.assertEqual([c[0] for c in self.commands], ['node', 'mo'])

    def test_missing_cli_uses_only_brew_install(self):
        self.invoke(missing_mole=True)
        self.assertIn(['brew', 'install', 'mole'], self.commands)
        self.assertFalse(any('upgrade' in c for c in self.commands))

    def test_modified_or_unknown_skill_preserved(self):
        self.target.mkdir(parents=True)
        (self.target / 'mole').mkdir()
        path = self.target / 'mole/SKILL.md'
        path.write_text('existing user content')
        with self.assertRaises(ValueError):
            self.invoke()
        self.assertEqual(path.read_text(), 'existing user content')
        self.assertFalse(any(c[0] == 'npx' for c in self.commands))

    def test_modified_managed_skill_preserved(self):
        self.invoke()
        path = self.target / 'mole/SKILL.md'
        path.write_text('local modification')
        with self.assertRaises(ValueError):
            self.invoke()
        self.assertEqual(path.read_text(), 'local modification')

    def test_explicit_managed_update_retires_only_transaction_copy_and_preserves_cli(self):
        self.invoke()
        source = self.home / 'new-canonical-wrapper'
        source.mkdir()
        (source / 'SKILL.md').write_text('synthetic new canonical wrapper')
        old = installer.digest(self.target / 'is-clean-my-mac')
        self.commands.clear()
        with patch.object(installer, 'SOURCE', source):
            with self.assertRaises(ValueError):
                self.invoke()
            self.invoke(update=True, plan=True)
            self.assertEqual(installer.digest(self.target / 'is-clean-my-mac'), old)
            with self.assertRaises(ValueError):
                self.invoke(update=True, answer='no')
            self.invoke(update=True)
        backups = list(self.target.parent.glob('is-clean-my-mac-backup-*'))
        self.assertEqual(backups, [])
        self.assertFalse((self.target.parent/installer.UPDATE_DIR).exists())
        self.assertEqual(installer.digest(self.target / 'is-clean-my-mac'), installer.digest(source))
        self.assertFalse(any(c[0] in ('brew', 'npx') for c in self.commands))

    def test_update_never_bypasses_local_modification_protection(self):
        self.invoke()
        path = self.target / 'is-clean-my-mac/SKILL.md'
        path.write_text('local owner edits')
        with self.assertRaises(ValueError):
            self.invoke(update=True)
        self.assertEqual(path.read_text(), 'local owner edits')
        self.assertFalse(list(self.target.parent.glob('is-clean-my-mac-backup-*')))


if __name__ == '__main__':
    unittest.main()
