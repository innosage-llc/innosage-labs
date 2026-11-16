#!/usr/bin/env python3
"""Consent-based dependency installer; never invokes an audit or cleanup."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

SKILLS_VERSION = '1.8.1'
MOLE_SOURCE = 'tw93/Mole@V1.72.0'
SOURCE = Path(__file__).resolve().parent / '.agents/skills/is-clean-my-mac'


def run(argv, **kwargs):
    if argv == ['mo', '--version']:
        spec = importlib.util.spec_from_file_location('mole_boundary', SOURCE / 'scripts/audit-mole.py')
        adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(adapter)
        rc, output, _ = adapter.guarded_capture(argv, 10)
        match = re.search(r'Mole version (\d+\.\d+\.\d+)\b', output)
        if rc or not match:
            raise ValueError('Guarded Mole version verification failed; preserve installation and use scoped host approval, never unguarded retry.')
        print('Mole version ' + match[1])
        return subprocess.CompletedProcess(argv, 0, stdout=match[1])
    return subprocess.run(argv, check=True, timeout=300, **kwargs)


def digest(directory):
    result = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise ValueError('Skill contains a symlink; resolve ownership manually.')
        if path.is_file():
            result[str(path.relative_to(directory))] = hashlib.sha256(path.read_bytes()).hexdigest()
    if 'SKILL.md' not in result:
        raise ValueError('Skill is missing SKILL.md.')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills-dir', type=Path,
                        default=Path.home() / '.agents/skills',
                        help='Codex-discoverable skills directory; use a temporary project .agents/skills for acceptance')
    parser.add_argument('--plan', action='store_true', help='Preflight and plan only; no writes')
    parser.add_argument('--update-managed', action='store_true',
                        help='With consent, replace only receipt-verified wrapper; preserve old copy outside Skills')
    args = parser.parse_args()
    if platform.system() != 'Darwin' or int(platform.mac_ver()[0].split('.')[0]) < 12:
        raise ValueError('Requires local macOS 12+. Intel acceptance is not yet verified.')
    if sys.version_info < (3, 9):
        raise ValueError('Requires Python 3.9+.')
    for executable, instruction in [('codex', 'Install Codex CLI using its official instructions.'),
                                    ('brew', 'Install Homebrew yourself using brew.sh.'),
                                    ('node', 'Install Node.js 22.20+ yourself.'),
                                    ('npx', 'Install npm/npx with Node.js yourself.')]:
        if not shutil.which(executable):
            raise ValueError(instruction)
    version = run(['node', '--version'], capture_output=True, text=True).stdout.strip()
    match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', version)
    if not match or tuple(map(int, match.groups())) < (22, 20, 0):
        raise ValueError('Requires Node.js 22.20+.')
    target = args.skills_dir.expanduser().absolute()
    if any(p.is_symlink() for p in [target, *target.parents]):
        raise ValueError('Symlink installation target; choose a verified physical directory.')
    record = target.parent / 'is-clean-my-mac-install.json'
    if record.is_symlink() or (record.exists() and
            (not record.is_file() or record.stat().st_nlink != 1 or record.stat().st_uid != os.getuid())):
        raise ValueError('Installation receipt is not an owned regular single-link file; no changes.')
    state = json.loads(record.read_text()) if record.is_file() else {}
    planned_wrapper = digest(SOURCE)
    desired = {'mole': MOLE_SOURCE, 'is-clean-my-mac': 'innosage-labs/examples/is-clean-my-mac'}
    missing = []
    update = False
    for name, origin in desired.items():
        path = target / name
        # Duplicate legacy locations can shadow the new installation.
        legacy = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'skills' / name
        if legacy != path and os.path.lexists(legacy):
            raise ValueError('Existing legacy Skill conflicts; resolve source/ownership manually.')
        if os.path.lexists(path):
            item = state.get(name, {})
            if path.is_symlink() or item.get('source') != origin or item.get('files') != digest(path):
                raise ValueError('Existing Skill is modified or source is unverified; no overwrite.')
            if name == 'is-clean-my-mac' and digest(path) != digest(SOURCE):
                if not args.update_managed:
                    raise ValueError('Wrapper differs from this checkout; inspect --update-managed --plan for a consent-based update.')
                update = True
        else:
            missing.append(name)
    has_mole = shutil.which('mo') is not None
    print('Plan: preserve existing Mole CLI; verify its version only.' if has_mole else
          'Plan: install Mole CLI with brew install mole (Homebrew may fetch formula dependencies).')
    print('Skills to install: ' + (', '.join(missing) or 'none; verify existing managed files'))
    print('Official source: ' + MOLE_SOURCE + '; Skills CLI: ' + SKILLS_VERSION)
    print('Target: ' + str(target))
    print('Wrapper file manifest SHA-256: ' + hashlib.sha256(json.dumps(planned_wrapper, sort_keys=True).encode()).hexdigest())
    print('Writes: selected Skill directories, sibling installation receipt; temporary npm/Skills cache when needed.')
    if update:
        print('Update: receipt-verified InnoSage wrapper only; preserve old files in a unique sibling backup outside skills.')
    print('No audit, cleanup, permission change, Mole upgrade or uninstall will run.')
    if args.plan:
        return
    if not missing and not update and has_mole:
        run(['mo', '--version'])
        print('Managed files verified. Start a fresh Codex session and verify both Skills are listed.')
        return
    try:
        consent = input('Type INSTALL for this exact plan (agent: only after owner approval): ')
    except EOFError:
        raise ValueError('No consent received on stdin; disclose this plan and obtain owner approval before submitting INSTALL.') from None
    if consent != 'INSTALL':
        raise ValueError('Consent not given; no changes made.')
    # Fetch through the official Skills CLI into an isolated HOME. Do not touch
    # shared Skills locks or unrelated installations. Never execute upstream code.
    with tempfile.TemporaryDirectory(prefix='is-clean-my-mac-install-') as temporary:
        stage = Path(temporary)
        if 'mole' in missing:
            env = dict(os.environ, HOME=str(stage), npm_config_cache=str(stage / 'npm-cache'),
                       DISABLE_TELEMETRY='1')
            run(['npx', '--yes', 'skills@' + SKILLS_VERSION, 'add', MOLE_SOURCE,
                 '--skill', 'mole', '-a', 'codex', '-g', '-y', '--copy'], cwd=stage, env=env)
        sources = {'mole': stage / '.agents/skills/mole', 'is-clean-my-mac': SOURCE}
        prepared = {name: digest(sources[name]) for name in missing}
        if digest(SOURCE) != planned_wrapper:
            raise ValueError('Canonical wrapper changed after plan; no installation.')
        if not has_mole:
            run(['brew', 'install', 'mole'])
        # Exclusive destination creation; never overwrite on a race.
        target.mkdir(parents=True, exist_ok=True)
        for name in missing:
            shutil.copytree(sources[name], target / name, symlinks=False)
            state[name] = {'source': desired[name], 'files': prepared[name]}
            # Persist after each success so interrupted installs can be diagnosed.
            with tempfile.NamedTemporaryFile(mode='w', dir=record.parent, delete=False) as receipt:
                json.dump(state, receipt, sort_keys=True)
                receipt_path = receipt.name
            os.replace(receipt_path, record)
        if update:
            name = 'is-clean-my-mac'
            path = target / name
            # Revalidate after consent. Never replace unknown or locally edited files.
            if path.is_symlink() or digest(path) != state[name]['files']:
                raise ValueError('Managed wrapper changed after plan; no update.')
            staged = target.parent / ('is-clean-my-mac-stage-' + uuid.uuid4().hex)
            backup = target.parent / ('is-clean-my-mac-backup-' + uuid.uuid4().hex)
            shutil.copytree(SOURCE, staged)
            prepared_wrapper = digest(staged)
            if prepared_wrapper != planned_wrapper:
                raise ValueError('Canonical wrapper changed during staging; preserved stage, no update.')
            if digest(path) != state[name]['files']:
                raise ValueError('Managed wrapper changed during staging; preserved staged files, no update.')
            path.rename(backup)
            staged.rename(path)
            state[name] = {'source': desired[name], 'files': prepared_wrapper}
            with tempfile.NamedTemporaryFile(mode='w', dir=record.parent, delete=False) as receipt:
                json.dump(state, receipt, sort_keys=True)
                receipt_path = receipt.name
            os.replace(receipt_path, record)
            print('Previous wrapper preserved at: ' + str(backup))
    run(['mo', '--version'])
    print('Files verified. Start a fresh local Codex session; confirm mole and is-clean-my-mac are listed.')
    print('Discovery is a separate acceptance gate; file presence alone does not prove session discovery.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('STOP: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
