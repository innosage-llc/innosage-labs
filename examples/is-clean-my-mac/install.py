#!/usr/bin/env python3
"""Consent-based dependency installer; never invokes an audit or cleanup."""
import argparse
import hashlib
import copy
import contextlib
import ctypes
import fcntl
import stat
import importlib.util
import json
import itertools
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

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
    root=directory.lstat()
    if not stat.S_ISDIR(root.st_mode):raise ValueError('Skill root is not a physical directory.')
    result={};total=0
    for count,path in enumerate(directory.rglob('*'),1):
        if count>4096:raise ValueError('Skill exceeds metadata verification budget; preserve it.')
        info=path.lstat()
        if stat.S_ISDIR(info.st_mode):continue
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
            raise ValueError('Skill contains a link/special object; resolve ownership manually.')
        total+=info.st_size
        if info.st_size>8388608 or total>16777216:
            raise ValueError('Skill exceeds byte verification budget; preserve it.')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        with os.fdopen(fd,'rb') as stream:
            held=os.fstat(stream.fileno())
            value=hashlib.sha256(stream.read(8388609)).hexdigest()
            if identity(held)!=identity(info) or identity(os.fstat(stream.fileno()))!=identity(held) or identity(path.lstat())!=identity(held):
                raise ValueError('Skill changed during verification; preserve it.')
        result[str(path.relative_to(directory))]=value
    if 'SKILL.md' not in result:raise ValueError('Skill is missing SKILL.md.')
    return result


UPDATE_DIR = '.is-clean-my-mac-update'


def sync_directory(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)


def atomic_json(path,value):
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False) as output:
        temporary=Path(output.name)
        json.dump(value,output,sort_keys=True)
        output.flush();os.fsync(output.fileno())
    os.replace(temporary,path)
    sync_directory(path.parent)




def identity(info):
    # Reading verification bytes may update atime; it is not content drift.
    return tuple(getattr(info,key,0) for key in ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns','st_flags'))

def owned_json(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1
            or info.st_mode&0o022 or info.st_size>1048576):raise ValueError('Unsafe owned record; preserve state.')
        try:value=json.loads(stream.read(1048577))
        except (ValueError,UnicodeError):raise ValueError('Unrecognized owned record; preserve state.') from None
        if identity(os.fstat(stream.fileno()))!=identity(info) or identity(path.lstat())!=identity(info) or not isinstance(value,dict):
            raise ValueError('Changed/unrecognized owned record; preserve state.')
    return value

def managed_files(path,expected,subset=False):
    """Only known owned ordinary files/directories; never follow links or specials."""
    if not isinstance(expected,dict) or not 0<len(expected)<=1024 or 'SKILL.md' not in expected:raise ValueError('Invalid managed manifest.')
    allowed_dirs={'.'}
    for name,value in expected.items():
        rel=Path(name)
        if (not isinstance(value,str) or not re.fullmatch('[0-9a-f]{64}',value)
            or rel.is_absolute() or '..' in rel.parts or str(rel)!=name):raise ValueError('Invalid managed manifest.')
        allowed_dirs.update(str(parent) for parent in rel.parents)
    root=path.lstat()
    if not stat.S_ISDIR(root.st_mode) or root.st_uid!=os.getuid() or root.st_mode&0o022:
        raise ValueError('Unsafe managed directory; preserve recovery.')
    actual={}
    total=0
    for entry in itertools.chain([path],path.rglob('*')):
        info=entry.lstat()
        relative=str(entry.relative_to(path))
        if info.st_uid!=os.getuid() or info.st_mode&0o022 or entry.is_symlink():raise ValueError('Managed tree ownership/permissions changed; preserve recovery.')
        if stat.S_ISDIR(info.st_mode):
            if relative not in allowed_dirs:raise ValueError('Unknown directory; preserve recovery.')
        elif stat.S_ISREG(info.st_mode) and info.st_nlink==1:
            if relative not in expected:raise ValueError('Unknown file; preserve recovery.')
            total+=info.st_size
            if info.st_size>8388608 or total>16777216:raise ValueError('Managed files exceed verification budget; preserve recovery.')
            fd=os.open(entry,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
            with os.fdopen(fd,'rb') as stream:
                held=os.fstat(stream.fileno())
                value=hashlib.sha256(stream.read()).hexdigest()
                if identity(os.fstat(stream.fileno()))!=identity(held) or identity(entry.lstat())!=identity(held):raise ValueError('Managed file changed while verifying.')
            actual[relative]=value
        else:raise ValueError('Unsupported managed object; preserve recovery.')
    if (not subset and actual!=expected) or any(value!=expected[name] for name,value in actual.items()):
        raise ValueError('Managed files changed; preserve recovery.')
    return actual


def retire_managed_tree(path,expected):
    # Only the exact transaction-owned managed tree. A partial retirement can
    # resume after consent, but changed/extra entries always stop and survive.
    actual=managed_files(path,expected,subset=True)
    for relative in sorted(actual):
        entry=path/relative
        fd=os.open(entry,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        with os.fdopen(fd,'rb') as stream:
            held=os.fstat(stream.fileno())
            if (held.st_nlink!=1 or held.st_uid!=os.getuid() or held.st_mode&0o022 or not stat.S_ISREG(held.st_mode)
                or hashlib.sha256(stream.read()).hexdigest()!=expected[relative]
                or identity(os.fstat(stream.fileno()))!=identity(held) or identity(entry.lstat())!=identity(held)):
                raise ValueError('Retirement target changed; preserve recovery.')
            entry.unlink()
    directories={parent for name in expected for parent in Path(name).parents if str(parent)!='.'}
    for relative in sorted(directories,key=lambda p:len(p.parts),reverse=True):
        directory=path/relative
        if not os.path.lexists(directory):continue
        info=directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o022:
            raise ValueError('Retirement directory changed; preserve recovery.')
        directory.rmdir()
    path.rmdir();sync_directory(path.parent)



@contextlib.contextmanager
def transaction_lock(transaction,create=False):
    fd=None
    try:
        root=transaction.lstat()
        if not stat.S_ISDIR(root.st_mode) or root.st_uid!=os.getuid() or root.st_mode&0o077:
            raise ValueError('Unsafe transaction directory; preserve state.')
        if not create and not list(transaction.iterdir()):
            yield False;return
        fd=os.open(transaction/'lock',os.O_RDWR|os.O_NOFOLLOW|(os.O_CREAT|os.O_EXCL if create else 0),0o600)
        info=os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1
            or info.st_mode&0o077 or (transaction/'lock').lstat()!=info):raise ValueError('Unsafe update lock; preserve state.')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('Managed update/recovery is running; no overlap.') from None
        yield True
    finally:
        if fd is not None:os.close(fd)


def move_exclusive(source,destination):
    """macOS same-volume rename; never overwrite a concurrently created entry."""
    library=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True)
    rename=library.renameatx_np
    rename.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
    rename.restype=ctypes.c_int
    first=os.open(source.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        second=os.open(destination.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:
            if rename(first,os.fsencode(source.name),second,os.fsencode(destination.name),4):
                code=ctypes.get_errno();raise OSError(code,'Exclusive update rename failed; preserve state.')
        finally:os.close(second)
    finally:os.close(first)


def physical_chain(path):
    if not path.is_absolute() or '..' in path.parts:raise ValueError('Physical absolute target required.')
    result=[]
    for entry in [*reversed(path.parents),path]:
        info=entry.lstat()
        if not stat.S_ISDIR(info.st_mode):raise ValueError('Target ancestry is a link/non-directory; no update.')
        result.append([info.st_dev,info.st_ino,info.st_uid,info.st_mode])
    return result


def check_target(target,expected):
    if physical_chain(target)!=expected:raise ValueError('Installation target ancestry changed; preserve all copies.')

def transaction_state(target,record):
    transaction=target.parent/UPDATE_DIR
    info=transaction.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:
        raise ValueError('Update state is not a private owned directory; preserve it.')
    entries=set(p.name for p in transaction.iterdir())
    if not entries or entries=={'lock'}:
        receipt=owned_json(record)
        item=receipt.get('is-clean-my-mac',{})
        if item.get('source')!='innosage-labs/examples/is-clean-my-mac':raise ValueError('Unknown empty marker; preserve it.')
        physical_chain(target)
        managed_files(target/'is-clean-my-mac',item['files'])
        return transaction,None,'remove-empty-marker'
    if entries-{'state.json','new','old','lock'}:raise ValueError('Unknown update state; preserve it.')
    statefile=transaction/'state.json';info=statefile.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_uid!=os.getuid()
        or info.st_mode&0o077 or info.st_size>1048576):raise ValueError('Unsafe update record; preserve it.')
    state=owned_json(statefile)
    if not isinstance(state,dict) or set(state)!={'schema','old_receipt','new_receipt','phase','ancestors'} or state['schema']!=1 or state['phase'] not in ('prepared','retiring'):
        raise ValueError('Unknown update record; preserve it.')
    check_target(target,state['ancestors'])
    old=state['old_receipt'];new=state['new_receipt'];name='is-clean-my-mac'
    if (not isinstance(old,dict) or not isinstance(new,dict) or name not in old or name not in new or not isinstance(old[name],dict) or not isinstance(new[name],dict)
        or old[name].get('source')!='innosage-labs/examples/is-clean-my-mac'
        or new[name].get('source')!=old[name]['source'] or set(old[name])!={'source','files'} or set(new[name])!={'source','files'}
        or {k:v for k,v in old.items() if k!=name}!={k:v for k,v in new.items() if k!=name}):
        raise ValueError('Invalid update ownership record; preserve it.')
    receipt=owned_json(record)
    if receipt not in (old,new):raise ValueError('Receipt changed outside transaction; preserve all files.')
    active=target/name
    if os.path.lexists(active):
        if active.is_symlink():raise ValueError('Active wrapper became a link; preserve all files.')
        current=digest(active)
    else:current=None
    oldfiles=old[name]['files'];newfiles=new[name]['files']
    # Validate all copies before deciding any recovery action.
    if (transaction/'old').exists():managed_files(transaction/'old',oldfiles,subset=state['phase']=='retiring')
    if (transaction/'new').exists():managed_files(transaction/'new',newfiles,subset=True)
    if current==newfiles and receipt==new:
        if (transaction/'new').exists():raise ValueError('Ambiguous duplicate staging; preserve all files.')
        managed_files(active,newfiles)
        return transaction,state,'finish'
    if state['phase']=='retiring':raise ValueError('Committed wrapper/receipt changed; preserve recovery.')
    if receipt!=old or current not in (None,oldfiles,newfiles):raise ValueError('Wrapper conflict; preserve recovery.')
    if current in (None,newfiles) and not (transaction/'old').exists():raise ValueError('Rollback copy missing; preserve recovery.')
    if current==newfiles and (transaction/'new').exists():raise ValueError('Ambiguous update copies; preserve recovery.')
    if current==oldfiles and (transaction/'old').exists():raise ValueError('Ambiguous old copies; preserve recovery.')
    if current is not None:managed_files(active,current)
    return transaction,state,'rollback'


def _recover_update_locked(target,record,hook=lambda phase:None,locked=True):
    transaction,state,action=transaction_state(target,record)
    if action=='remove-empty-marker':
        if locked:(transaction/'lock').unlink()
        transaction.rmdir();sync_directory(transaction.parent);return action
    if not locked:raise ValueError('Update state changed during recovery; no action.')
    active=target/'is-clean-my-mac'
    oldfiles=state['old_receipt']['is-clean-my-mac']['files']
    newfiles=state['new_receipt']['is-clean-my-mac']['files']
    if action=='rollback':
        if active.exists() and digest(active)==newfiles:
            move_exclusive(active,transaction/'new');sync_directory(target)
        if not active.exists():
            move_exclusive(transaction/'old',active);sync_directory(target);sync_directory(transaction)
        managed_files(active,oldfiles)
        if owned_json(record)!=state['old_receipt']:raise ValueError('Receipt drift; preserve recovery.')
        if (transaction/'new').exists():retire_managed_tree(transaction/'new',newfiles)
    else:
        state['phase']='retiring';atomic_json(transaction/'state.json',state)
        hook('before_retire')
        check_target(target,state['ancestors'])
        # Recheck committed replacement before retiring rollback files.
        managed_files(active,newfiles)
        if owned_json(record)!=state['new_receipt']:raise ValueError('Receipt drift; preserve recovery.')
        if (transaction/'old').exists():retire_managed_tree(transaction/'old',oldfiles)
    (transaction/'state.json').unlink();(transaction/'lock').unlink();transaction.rmdir();sync_directory(transaction.parent)
    return action



def recover_update(target,record,hook=lambda phase:None):
    with transaction_lock(target.parent/UPDATE_DIR) as locked:
        return _recover_update_locked(target,record,hook,locked)

def update_wrapper(target,record,state,planned,hook=lambda phase:None,ancestors=None):
    ancestors=physical_chain(target) if ancestors is None else ancestors
    check_target(target,ancestors)
    name='is-clean-my-mac';active=target/name
    managed_files(active,state[name]['files'])
    if owned_json(record)!=state:raise ValueError('Receipt changed after plan; no update.')
    transaction=target.parent/UPDATE_DIR
    transaction.mkdir(mode=0o700) # exclusive: pending transaction blocks overlap
    with transaction_lock(transaction,create=True):
        new=copy.deepcopy(state);new[name]={'source':state[name]['source'],'files':planned}
        atomic_json(transaction/'state.json',dict(schema=1,phase='prepared',old_receipt=state,new_receipt=new,ancestors=ancestors))
        hook('before_stage')
        shutil.copytree(SOURCE,transaction/'new')
        managed_files(transaction/'new',planned)
        hook('after_stage')
        check_target(target,ancestors)
        managed_files(active,state[name]['files'])
        if owned_json(record)!=state:raise ValueError('Receipt changed during staging; preserve transaction.')
        move_exclusive(active,transaction/'old');sync_directory(target);sync_directory(transaction)
        hook('after_old_capture')
        check_target(target,ancestors)
        try:managed_files(transaction/'old',state[name]['files'])
        except ValueError:
            try:move_exclusive(transaction/'old',active)
            except OSError:pass
            raise ValueError('Old wrapper changed during capture; preserved, no activation.') from None
        move_exclusive(transaction/'new',active);sync_directory(target);sync_directory(transaction)
        hook('after_activation')
        check_target(target,ancestors)
        managed_files(active,planned)
        if owned_json(record)!=state:raise ValueError('Receipt changed before commit; preserve transaction.')
        atomic_json(record,new)
        hook('after_commit')
        _recover_update_locked(target,record,hook)
        print('Update verified: one active wrapper; temporary rollback retired. Historical backups untouched.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills-dir', type=Path,
                        default=Path.home() / '.agents/skills',
                        help='Codex-discoverable skills directory; use a temporary project .agents/skills for acceptance')
    parser.add_argument('--plan', action='store_true', help='Preflight and plan only; no writes')
    parser.add_argument('--update-managed', action='store_true',
                        help='With consent, replace verified wrapper; temporary rollback only until verified commit')
    parser.add_argument('--recover-update',action='store_true',help='With consent, reconcile only this installer pending update')
    args = parser.parse_args()
    if platform.system() != 'Darwin' or int(platform.mac_ver()[0].split('.')[0]) < 12:
        raise ValueError('Requires local macOS 12+. Intel acceptance is not yet verified.')
    if sys.version_info < (3, 9):
        raise ValueError('Requires Python 3.9+.')
    target = args.skills_dir.expanduser().absolute()
    if any(p.is_symlink() for p in [target, *target.parents]):
        raise ValueError('Symlink installation target; choose a verified physical directory.')
    record = target.parent / 'is-clean-my-mac-install.json'
    if record.is_symlink() or (record.exists() and
            (not record.is_file() or record.stat().st_nlink != 1 or record.stat().st_uid != os.getuid())):
        raise ValueError('Installation receipt is not an owned regular single-link file; no changes.')
    state = owned_json(record) if record.is_file() else {}
    planned_target_chain=physical_chain(target) if target.exists() else None
    pending=target.parent/UPDATE_DIR
    if os.path.lexists(pending):
        if not args.recover_update:raise ValueError('Pending managed update. Inspect --recover-update --plan; no package commands or automatic retry.')
        _,_,action=transaction_state(target,record)
        print('Recovery plan: '+action+' pending managed wrapper transaction only; preserve historical backups and unknown/modified objects.')
        if args.plan:return
        try:consent=input('Type INSTALL for this exact recovery plan (agent: only after owner approval): ')
        except EOFError:raise ValueError('No recovery consent on stdin; obtain owner approval before INSTALL.') from None
        if consent!='INSTALL':raise ValueError('Consent not given; no changes made.')
        recover_update(target,record)
        print('Recovery verified; one active wrapper. Start a fresh session.');return
    if args.recover_update:raise ValueError('No pending update; nothing to recover.')
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
        print('Update: verified wrapper only; private temporary rollback during transaction, then retire that verified old copy after replacement/receipt commit. Historical backups untouched.')
    print('No disk audit, user-cache cleanup, permission change, Mole upgrade or uninstall will run.')
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
            update_wrapper(target,record,state,planned_wrapper,ancestors=planned_target_chain)
    run(['mo', '--version'])
    print('Files verified. Start a fresh local Codex session; confirm mole and is-clean-my-mac are listed.')
    print('Discovery is a separate acceptance gate; file presence alone does not prove session discovery.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('STOP: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
