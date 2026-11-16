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

    def invoke(self, answer='INSTALL', plan=False, missing_mole=False):
        def which(command):
            return None if missing_mole and command == 'mo' else '/synthetic/' + command
        args = ['install.py', '--skills-dir', str(self.target)] + (['--plan'] if plan else [])
        with patch('sys.argv', args), patch.object(installer.platform, 'system', return_value='Darwin'), \
             patch.object(installer.platform, 'mac_ver', return_value=('26.0', '', '')), \
             patch.object(installer.shutil, 'which', side_effect=which), \
             patch.object(installer, 'run', side_effect=self.fake_run), \
             patch.object(installer.Path, 'home', return_value=self.home), \
             patch.dict('os.environ', {'CODEX_HOME': str(self.home / '.codex')}), \
             patch('builtins.input', return_value=answer), contextlib.redirect_stdout(io.StringIO()):
            installer.main()

    def test_plan_and_denied_consent_no_writes(self):
        self.invoke(plan=True)
        self.assertFalse(self.target.exists())
        with self.assertRaises(ValueError):
            self.invoke(answer='no')
        self.assertFalse(self.target.exists())
        self.assertFalse(any(c[0] == 'npx' for c in self.commands))

    def test_install_rerun_preserves_cli(self):
        self.invoke()
        receipt = (self.target.parent / 'is-clean-my-mac-install.json').read_bytes()
        self.commands.clear()
        self.invoke()
        self.assertEqual(receipt, (self.target.parent / 'is-clean-my-mac-install.json').read_bytes())
        self.assertFalse(any(c[0] in ('brew', 'npx') for c in self.commands))

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


if __name__ == '__main__':
    unittest.main()
