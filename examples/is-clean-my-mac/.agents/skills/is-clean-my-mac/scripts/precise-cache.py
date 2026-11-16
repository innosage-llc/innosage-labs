#!/usr/bin/env python3
"""Exact-file cache adapter. Private paths never belong in its public results.

No Mole command is used. Only the two versioned filename/layout conventions
below are eligible. This is bounded revalidation for ordinary concurrent use,
not an isolation boundary against a hostile process sharing the same UID.
"""
import ctypes
import argparse
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import pwd
import re
import resource
import stat
import subprocess
import sys
import tempfile
import time
import uuid

OPERATION = 'discard_download_cache_file_v1'
ROOTS = {'homebrew_bottle': ('Library','Caches','Homebrew','downloads'),
         'pip_http_body': ('Library','Caches','pip','http-v2')}
MIN_AGE = 7*86400
MAX_OBJECTS = 8
FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
STATE_PARENT = ('Library','Application Support')
STATE_NAME = 'is-clean-my-mac-recovery'


class Stop(Exception):
    pass


def private_acl(fd):
    """Reject all extended allow ACEs; accept absent/deny-only ACL metadata."""
    if platform.system()!='Darwin':return False
    library=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True)
    get=library.acl_get_fd_np;get.argtypes=[ctypes.c_int,ctypes.c_int];get.restype=ctypes.c_void_p
    entry=library.acl_get_entry;entry.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.POINTER(ctypes.c_void_p)];entry.restype=ctypes.c_int
    tag=library.acl_get_tag_type;tag.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_int)];tag.restype=ctypes.c_int
    free=library.acl_free;free.argtypes=[ctypes.c_void_p];free.restype=ctypes.c_int
    ctypes.set_errno(0)
    acl=get(fd,0x100)
    if not acl:return ctypes.get_errno()==errno.ENOENT
    try:
        pointer=ctypes.c_void_p()
        state=entry(acl,0,ctypes.byref(pointer))
        for _ in range(256):
            if state==0:return True
            value=ctypes.c_int()
            if state!=1 or tag(pointer,ctypes.byref(value)) or value.value!=2:return False
            state=entry(acl,-1,ctypes.byref(pointer))
        return False
    finally:free(acl)


def runtime_supported():
    if platform.system()!='Darwin' or os.geteuid()!=os.getuid() or os.getuid()==0:return False
    try:
        info=os.lstat('/usr/sbin/lsof')
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:return False
        library=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True)
        return all(hasattr(library,name) for name in ('renameatx_np','acl_get_fd_np','acl_get_entry','acl_get_tag_type','acl_free'))
    except OSError:return False


def home_directory():
    return Path(pwd.getpwuid(os.getuid()).pw_dir)


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def snapshot(info):
    return {key: getattr(info,key,0) for key in ('st_dev','st_ino','st_uid','st_gid','st_mode',
        'st_nlink','st_size','st_mtime_ns','st_ctime_ns','st_flags','st_blocks')}


def stable(value):
    return {key: item for key,item in value.items() if key != 'st_ctime_ns'}


def safe_directory(fd):
    info = os.fstat(fd)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0,os.getuid()) or info.st_mode & 0o022 or not private_acl(fd):
        raise Stop('unsafe_directory')
    try:
        os.stat('.git',dir_fd=fd,follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise Stop('repository_protected')
    return dict(st_dev=info.st_dev,st_ino=info.st_ino,st_uid=info.st_uid,st_mode=info.st_mode)


def open_directory(path, expected=None):
    if not path.is_absolute() or '..' in path.parts:
        raise Stop('invalid_scope')
    fd=os.open('/',FLAGS)
    identities=[]
    try:
        identities.append(safe_directory(fd))
        for component in path.parts[1:]:
            nxt=os.open(component,FLAGS,dir_fd=fd)
            os.close(fd);fd=nxt
            identities.append(safe_directory(fd))
        if expected is not None and identities != expected:
            raise Stop('ancestor_identity_changed')
        return fd,identities
    except BaseException:
        os.close(fd)
        raise


def safe_file(info, now):
    return (stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and info.st_nlink==1
        and not info.st_mode & 0o022 and not getattr(info,'st_flags',0)
        and info.st_size>0 and info.st_blocks>0 and 0<=now-info.st_mtime<=10**12 and now-info.st_mtime>=MIN_AGE)


def supported(category,parts):
    if category=='homebrew_bottle':
        return len(parts)==1 and re.fullmatch(r'[0-9a-f]{64}--[A-Za-z0-9_.+%@-]+\.bottle(?:\.[1-9][0-9]*)?\.tar\.gz',parts[0]) is not None
    if category=='pip_http_body':
        return (len(parts)==6 and re.fullmatch(r'[0-9a-f]{56}\.body',parts[-1]) is not None
                and tuple(parts[-1][:5])==tuple(parts[:5]))
    return False


def protection_check(home):
    """Do not reimplement Mole whitelist semantics or override user protections.

    Any declared clean whitelist (including an empty file) is manual for v1.
    Only fixed-path metadata is inspected; contents are never read or changed.
    """
    fd=None
    try:
        fd,_=open_directory(home/'.config/mole')
        os.stat('whitelist',dir_fd=fd,follow_symlinks=False)
        raise Stop('mole_protection_configuration_present')
    except FileNotFoundError:return
    finally:
        if fd is not None:os.close(fd)


def valid_item(item):
    if not isinstance(item,dict) or not isinstance(item.get('candidate_id'),str) or not re.fullmatch('[0-9a-f]{32}',item['candidate_id']):return False
    if set(item)!={'candidate_id','category','parts','ancestors','target','companion','allocated_bytes','logical_bytes','age_days','scope_digest'}:return False
    if not isinstance(item.get('category'),str) or item['category'] not in ROOTS:return False
    parts=item.get('parts')
    if not isinstance(parts,list) or any(not isinstance(p,str) or len(p)>255 for p in parts) or not supported(item['category'],parts):return False
    if not isinstance(item.get('scope_digest'),str) or not re.fullmatch('[0-9a-f]{64}',item['scope_digest']):return False
    names=set(snapshot(os.stat_result((0,)*10)))
    for key in ('target','companion'):
        value=item.get(key)
        if key=='companion' and value is None:continue
        if not isinstance(value,dict) or set(value)!=names or any(type(v) is not int or v<0 or v>2**65 for v in value.values()):return False
    chain=item.get('ancestors')
    if not isinstance(chain,list) or not 1<=len(chain)<=128:return False
    if any(not isinstance(x,dict) or set(x)!={'st_dev','st_ino','st_uid','st_mode'} or
           any(type(v) is not int or not 0<=v<=2**65 for v in x.values()) for x in chain):return False
    if any(type(item.get(k)) is not int or item[k]<0 for k in ('allocated_bytes','logical_bytes','age_days')):return False
    if item['allocated_bytes']!=item['target']['st_blocks']*512 or item['logical_bytes']!=item['target']['st_size']:return False
    return (item['category']=='pip_http_body') == (item.get('companion') is not None)


def discover(home=None, seconds=5, max_entries=20000, now=None):
    home=home_directory() if home is None else home
    now=time.time() if now is None else now
    deadline=time.monotonic()+seconds
    objects=[];reasons=set();entries=0
    if not runtime_supported():
        return (dict(schema_version=1,created_at=now,objects=[]),dict(source='precise-cache-candidates',completeness='FAILED',candidates=[],reasons=['precise_runtime_unavailable'],scope='fixed_default_download_cache_layouts_only'))
    try:protection_check(home)
    except (OSError,Stop) as error:
        code=str(error) if isinstance(error,Stop) else ''
        reason=code if code in ('repository_protected','unsafe_directory','mole_protection_configuration_present') else 'mole_protection_configuration_present_or_unverifiable'
        return (dict(schema_version=1,created_at=now,objects=[]),
                dict(source='precise-cache-candidates',completeness='PARTIAL',candidates=[],
                     reasons=[reason],scope='fixed_default_download_cache_layouts_only'))
    if any(os.environ.get(key) for key in ('HOMEBREW_CACHE','PIP_CACHE_DIR','XDG_CACHE_HOME')):
        reasons.add('custom_cache_overrides_uncovered')
    for category,base in ROOTS.items():
        root=home.joinpath(*base)
        try:
            rootfd,ancestors=open_directory(root)
        except FileNotFoundError:
            continue
        except Stop as error:
            code=str(error)
            reasons.add(code if code in ('unsafe_directory','repository_protected','ancestor_identity_changed') else 'cache_root_unavailable_or_unsafe');continue
        except OSError:
            reasons.add('cache_root_unavailable_or_unsafe');continue
        try:
            queue=[()]
            while queue:
                if entries>=max_entries or time.monotonic()>=deadline:
                    reasons.add('candidate_budget_exhausted');break
                parts=queue.pop(0);fd=None
                try:
                    fd,chain=open_directory(root.joinpath(*parts))
                    if chain[:len(ancestors)]!=ancestors:
                        raise Stop('ancestor_identity_changed')
                    with os.scandir(fd) as iterator:
                        for entry in iterator:
                            if entries>=max_entries or time.monotonic()>=deadline:
                                reasons.add('candidate_budget_exhausted');break
                            entries+=1
                            rel=parts+(entry.name,)
                            info=entry.stat(follow_symlinks=False)
                            if category=='pip_http_body' and len(rel)<=5 and re.fullmatch('[0-9a-f]',entry.name) and stat.S_ISDIR(info.st_mode):
                                if len(queue)<20000: queue.append(rel)
                                else: reasons.add('candidate_budget_exhausted')
                            elif supported(category,rel) and safe_file(info,now):
                                check=os.open(entry.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
                                try:
                                    if snapshot(os.fstat(check))!=snapshot(info) or not private_acl(check):continue
                                finally:os.close(check)
                                companion=None
                                if category=='pip_http_body':
                                    sibling=os.stat(entry.name[:-5],dir_fd=fd,follow_symlinks=False)
                                    if not safe_file(sibling,now): continue
                                    companion=snapshot(sibling)
                                item=dict(candidate_id=uuid.uuid4().hex,category=category,parts=list(rel),
                                    ancestors=chain,target=snapshot(info),companion=companion,
                                    allocated_bytes=info.st_blocks*512,logical_bytes=info.st_size,
                                    age_days=int((now-info.st_mtime)//86400))
                                item['scope_digest']=digest(item)
                                if valid_item(item):objects.append(item)
                                else:reasons.add('candidate_metadata_unsupported')
                except (OSError,Stop):
                    reasons.add('candidate_entry_unavailable_or_unsafe')
                finally:
                    if fd is not None:os.close(fd)
        finally:os.close(rootfd)
    objects.sort(key=lambda item:-item['allocated_bytes'])
    if len(objects)>MAX_OBJECTS:reasons.add('candidate_display_limit')
    objects=objects[:MAX_OBJECTS]
    private=dict(schema_version=1,created_at=now,objects=objects)
    public=dict(source='precise-cache-candidates',completeness='PARTIAL' if reasons else 'COMPLETE',
        reasons=sorted(reasons),scope='fixed_default_download_cache_layouts_only',
        candidates=[{key:item[key] for key in ('candidate_id','category','scope_digest','allocated_bytes','logical_bytes','age_days')} for item in objects])
    return private,public


def open_candidate(item,home=None,now=None):
    home=home_directory() if home is None else home
    now=time.time() if now is None else now
    protection_check(home)
    if not runtime_supported():raise Stop('precise_runtime_unavailable')
    category=item.get('category');parts=item.get('parts')
    if category not in ROOTS or not isinstance(parts,list) or any(not isinstance(p,str) for p in parts) or not supported(category,parts):
        raise Stop('unsupported_candidate_layout')
    fd,chain=open_directory(home.joinpath(*ROOTS[category],*parts[:-1]),item['ancestors'])
    filefd=None
    try:
        filefd=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        fcntl.flock(filefd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        info=os.fstat(filefd)
        entry=os.stat(parts[-1],dir_fd=fd,follow_symlinks=False)
        if snapshot(info)!=item['target'] or snapshot(entry)!=item['target'] or not safe_file(info,now):
            raise Stop('candidate_identity_or_metadata_changed')
        if not private_acl(filefd):raise Stop('extended_permission_unknown')
        if item['companion'] is not None:
            info=os.stat(parts[-1][:-5],dir_fd=fd,follow_symlinks=False)
            if snapshot(info)!=item['companion'] or not safe_file(info,now):
                raise Stop('cache_metadata_changed')
        return fd,filefd
    except BaseException:
        if filefd is not None:os.close(filefd)
        os.close(fd);raise


def revalidate(item,home=None):
    fd=None;filefd=None
    try:
        if not valid_item(item):raise Stop('candidate_manifest_invalid')
        if digest({key:value for key,value in item.items() if key!='scope_digest'})!=item['scope_digest']:
            raise Stop('candidate_manifest_changed')
        fd,filefd=open_candidate(item,home)
        return item['scope_digest']
    finally:
        if filefd is not None:os.close(filefd)
        if fd is not None:os.close(fd)


def check_parent(item,home=None):
    home=home_directory() if home is None else home
    protection_check(home)
    fd,_=open_directory(home.joinpath(*ROOTS[item['category']],*item['parts'][:-1]),item['ancestors'])
    os.close(fd)


def rename_exclusive(source_fd,source,destination_fd,destination):
    if platform.system()!='Darwin':raise Stop('platform_not_supported')
    library=ctypes.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True)
    call=library.renameatx_np
    call.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
    call.restype=ctypes.c_int
    if call(source_fd,os.fsencode(source),destination_fd,os.fsencode(destination),4):
        value=ctypes.get_errno();raise OSError(value,'exclusive_rename_failed')


def busy_state(path,filefd):
    """CLEAR is an observation of visible opens, not future/hostile-UID exclusion."""
    try:
        tool=os.stat('/usr/sbin/lsof')
        if tool.st_uid!=0 or tool.st_mode & 0o022:return 'UNKNOWN'
        with tempfile.TemporaryFile() as output,tempfile.TemporaryFile() as errors:
            def bounded():resource.setrlimit(resource.RLIMIT_FSIZE,(65536,65536))
            run=subprocess.run(['/usr/sbin/lsof','-Fpf','--',str(path)],stdout=output,stderr=errors,
                timeout=3,stdin=subprocess.DEVNULL,preexec_fn=bounded,
                env={'PATH':'/usr/bin:/bin:/usr/sbin','LC_ALL':'C'})
            if run.returncode or errors.tell() or output.tell()>=65536:return 'UNKNOWN'
            output.seek(0);text=output.read()
        current=None;own=False;others=False
        for line in text.splitlines():
            if re.fullmatch(rb'p[0-9]+',line):
                current=int(line[1:]);others=others or current!=os.getpid()
            elif re.fullmatch(rb'f[A-Za-z0-9]+',line) and current is not None:
                own=own or (current==os.getpid() and line[1:]==str(filefd).encode())
            else:return 'UNKNOWN'
        return 'BUSY' if others else ('CLEAR' if own else 'UNKNOWN')
    except (OSError,subprocess.TimeoutExpired):return 'UNKNOWN'


def event(journal,phase,**values):
    data=json.dumps(dict(phase=phase,**values),sort_keys=True).encode()+b'\n'
    if os.write(journal,data)!=len(data):raise Stop('journal_write_failed')
    os.fsync(journal)


def create_state(home,plan_id):
    base=home.joinpath(*STATE_PARENT)
    parent,_=open_directory(base)
    try:
        try:os.mkdir(STATE_NAME,0o700,dir_fd=parent)
        except FileExistsError:pass
        root=os.open(STATE_NAME,FLAGS,dir_fd=parent)
        try:
            info=os.fstat(root)
            if info.st_uid!=os.getuid() or info.st_mode & 0o077 or not private_acl(root):raise Stop('recovery_directory_unsafe')
            try:os.mkdir(plan_id,0o700,dir_fd=root)
            except FileExistsError:raise Stop('execution_replay_or_recovery_required') from None
            fd=os.open(plan_id,FLAGS,dir_fd=root)
            journal=None
            try:
                journal=os.open('events.jsonl',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
                fcntl.flock(journal,fcntl.LOCK_EX|fcntl.LOCK_NB)
                os.fsync(fd);os.fsync(root);os.fsync(parent)
                return fd,journal,base/STATE_NAME/plan_id
            except BaseException:
                if journal is not None:os.close(journal)
                os.close(fd);raise
        finally:os.close(root)
    finally:os.close(parent)


def remove_one(item,statefd,journal,statepath,home=None,probe=busy_state,hook=None):
    """Capture and validate before unlink; preserve recovery holds on uncertainty."""
    fd=filefd=None;captured=False;captured_identity=None;unlinked=False;token=item['candidate_id']
    result=dict(candidate_id=token,status='BLOCKED',actual_freed_bytes=None,
                removed_scope_allocated_bytes=None,recovery_required=False)
    def point(name):
        if hook:hook(name,item,fd,statefd)
    try:
        fd,filefd=open_candidate(item,home)
        if os.fstat(fd).st_dev!=os.fstat(statefd).st_dev:raise Stop('cross_device_recovery_unavailable')
        event(journal,'CAPTURE_INTENT',candidate_id=token)
        point('after_intent')
        point('before_capture')
        check_parent(item,home)
        if snapshot(os.fstat(filefd))!=item['target'] or snapshot(os.stat(item['parts'][-1],dir_fd=fd,follow_symlinks=False))!=item['target']:
            raise Stop('candidate_identity_or_metadata_changed')
        rename_exclusive(fd,item['parts'][-1],statefd,token)
        captured=True;os.fsync(fd);os.fsync(statefd)
        point('after_rename_before_receipt')
        captured_entry=os.stat(token,dir_fd=statefd,follow_symlinks=False)
        captured_identity=(captured_entry.st_dev,captured_entry.st_ino)
        event(journal,'CAPTURE_OBSERVED',candidate_id=token,snapshot=snapshot(captured_entry))
        point('after_capture')
        entry=os.stat(token,dir_fd=statefd,follow_symlinks=False)
        held=os.fstat(filefd)
        if snapshot(entry)!=snapshot(held) or stable(snapshot(held))!=stable(item['target']):
            raise Stop('captured_identity_or_metadata_changed')
        if not private_acl(filefd):raise Stop('extended_permission_unknown')
        check_parent(item,home)
        post=snapshot(held)
        event(journal,'CAPTURED',candidate_id=token,snapshot=post)
        point('after_capture_receipt')
        if probe(statepath/token,filefd)!='CLEAR':raise Stop('open_file_or_visibility_unknown')
        point('before_unlink')
        if snapshot(os.stat(token,dir_fd=statefd,follow_symlinks=False))!=post or snapshot(os.fstat(filefd))!=post:
            raise Stop('captured_identity_or_metadata_changed')
        if item['companion'] is not None and snapshot(os.stat(item['parts'][-1][:-5],dir_fd=fd,follow_symlinks=False))!=item['companion']:
            raise Stop('cache_metadata_changed')
        if probe(statepath/token,filefd)!='CLEAR':raise Stop('open_file_or_visibility_unknown')
        check_parent(item,home)
        # Final descriptor/name comparison; no broad command, recursion or retry.
        if snapshot(os.stat(token,dir_fd=statefd,follow_symlinks=False))!=post or snapshot(os.fstat(filefd))!=post:
            raise Stop('captured_identity_or_metadata_changed')
        event(journal,'UNLINK_INTENT',candidate_id=token)
        point('after_unlink_intent')
        check_parent(item,home)
        if probe(statepath/token,filefd)!='CLEAR':raise Stop('open_file_or_visibility_unknown')
        if (snapshot(os.stat(token,dir_fd=statefd,follow_symlinks=False))!=post
            or snapshot(os.fstat(filefd))!=post or not private_acl(filefd)):
            raise Stop('captured_identity_or_metadata_changed')
        if item['companion'] is not None and snapshot(os.stat(item['parts'][-1][:-5],dir_fd=fd,follow_symlinks=False))!=item['companion']:
            raise Stop('cache_metadata_changed')
        os.unlink(token,dir_fd=statefd)
        captured=False;unlinked=True
        point('after_unlink')
        os.fsync(statefd)
        result.update(status='SUCCEEDED',removed_scope_allocated_bytes=item['allocated_bytes'])
        event(journal,'UNLINKED',candidate_id=token)
    except (OSError,Stop) as error:
        known={'candidate_manifest_changed','candidate_identity_or_metadata_changed','cache_metadata_changed',
          'ancestor_identity_changed','unsafe_directory','repository_protected','unsupported_candidate_layout',
          'cross_device_recovery_unavailable','captured_identity_or_metadata_changed','open_file_or_visibility_unknown',
          'journal_write_failed','platform_not_supported','extended_permission_unknown','mole_protection_configuration_present'}
        result['blocker']=str(error) if isinstance(error,Stop) and str(error) in known else 'precise_operation_failed'
        if unlinked:
            result.update(status='REMOVED_RECEIPT_FAILED',removed_scope_allocated_bytes=item['allocated_bytes'])
        if captured:
            try:
                # A swapped quarantine name is never restored or deleted blindly.
                current=os.stat(token,dir_fd=statefd,follow_symlinks=False)
                if captured_identity is None or (current.st_dev,current.st_ino)!=captured_identity:
                    raise Stop('recovery_identity_unknown')
                rename_exclusive(statefd,token,fd,item['parts'][-1])
                captured=False;os.fsync(fd);os.fsync(statefd)
                result['restored']=True
            except (OSError,Stop):result.update(status='RECOVERY_REQUIRED',recovery_required=True)
        try:event(journal,result['status'],candidate_id=token,blocker=result['blocker'])
        except (OSError,Stop):result['recovery_required']=True
    finally:
        if filefd is not None:os.close(filefd)
        if fd is not None:os.close(fd)
    return result


def execute(plan_id,items,home=None,probe=busy_state,hook=None,row_map=None):
    if platform.system()!='Darwin' or os.geteuid()!=os.getuid() or os.getuid()==0:
        return dict(status='BLOCKED',blocker='platform_or_privilege_unsupported',rows=[],actual_freed_bytes=None)
    if (not isinstance(plan_id,str) or not re.fullmatch('[0-9a-f]{64}',plan_id)
        or not isinstance(items,list) or not 0<len(items)<=MAX_OBJECTS
        or any(not valid_item(item) for item in items)):
        return dict(status='BLOCKED',blocker='invalid_execution_scope',rows=[],actual_freed_bytes=None)
    if len({item['candidate_id'] for item in items})!=len(items) or len({(item['target']['st_dev'],item['target']['st_ino']) for item in items})!=len(items):
        return dict(status='BLOCKED',blocker='duplicate_or_overlapping_objects',rows=[],actual_freed_bytes=None)
    home=home_directory() if home is None else home
    statefd=journal=None
    try:
        # Prevalidate the complete selected scope before creating recovery state.
        for item in items:revalidate(item,home)
        statefd,journal,statepath=create_state(home,plan_id)
        manifest=os.open('manifest.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=statefd)
        try:
            data=json.dumps(dict(schema_version=1,plan_id=plan_id,objects=items,row_map=row_map or {}),sort_keys=True).encode()
            if len(data)>1048576 or os.write(manifest,data)!=len(data):raise Stop('state_manifest_write_failed')
            os.fsync(manifest)
        finally:os.close(manifest)
        os.fsync(statefd)
        results=[]
        deadline=time.monotonic()+90
        for item in items:
            if time.monotonic()>=deadline:
                results.append(dict(candidate_id=item['candidate_id'],status='BLOCKED',blocker='execution_budget_exhausted',actual_freed_bytes=None))
                continue
            results.append(remove_one(item,statefd,journal,statepath,home,probe,hook))
        return dict(status='SUCCEEDED' if all(r['status']=='SUCCEEDED' for r in results) else 'PARTIAL',
                    rows=results,actual_freed_bytes=None,
                    removed_scope_allocated_bytes=sum(r.get('removed_scope_allocated_bytes') or 0 for r in results))
    except (OSError,Stop):
        return dict(status='BLOCKED',blocker='execution_preflight_or_replay_failed',rows=[],actual_freed_bytes=None)
    finally:
        if journal is not None:os.close(journal)
        if statefd is not None:os.close(statefd)


def read_recovery(plan_id,home=None):
    if not isinstance(plan_id,str) or not re.fullmatch('[0-9a-f]{64}',plan_id):raise Stop('invalid_recovery_scope')
    home=home_directory() if home is None else home
    path=home.joinpath(*STATE_PARENT)/STATE_NAME/plan_id
    fd,_=open_directory(path)
    try:
        info=os.fstat(fd)
        if info.st_uid!=os.getuid() or info.st_mode&0o077:raise Stop('recovery_directory_unsafe')
        def read(name):
            filefd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
            with os.fdopen(filefd,'rb') as stream:
                value=os.fstat(stream.fileno())
                if not stat.S_ISREG(value.st_mode) or value.st_uid!=os.getuid() or value.st_nlink!=1 or value.st_mode&0o077 or value.st_size>1048576:raise Stop('recovery_receipt_unsafe')
                if name=='events.jsonl':fcntl.flock(stream.fileno(),fcntl.LOCK_SH|fcntl.LOCK_NB)
                data=stream.read(1048577)
                if len(data)>1048576:raise Stop('recovery_receipt_unsafe')
                return data
        private=json.loads(read('manifest.json'))
        items=private.get('objects') if isinstance(private,dict) else None
        if private.get('plan_id')!=plan_id or not isinstance(items,list) or not 0<len(items)<=MAX_OBJECTS or any(not valid_item(item) for item in items):raise Stop('recovery_receipt_unsafe')
        if any(digest({key:value for key,value in item.items() if key!='scope_digest'})!=item['scope_digest'] for item in items):raise Stop('recovery_receipt_unsafe')
        if len({item['candidate_id'] for item in items})!=len(items) or len({(item['target']['st_dev'],item['target']['st_ino']) for item in items})!=len(items):raise Stop('recovery_receipt_unsafe')
        mapping=private.get('row_map',{})
        if (not isinstance(mapping,dict) or not set(mapping)<={item['candidate_id'] for item in items}
            or any(type(value) is not int or not 0<value<=1000 for value in mapping.values())
            or len(set(mapping.values()))!=len(mapping)):raise Stop('recovery_receipt_unsafe')
        events=[]
        raw=read('events.jsonl')
        for line in raw.splitlines(keepends=True):
            if not line.endswith(b'\n'):break # interrupted final append, preserve earlier durable records
            value=json.loads(line)
            if not isinstance(value,dict):raise Stop('recovery_receipt_unsafe')
            events.append(value)
        return fd,private,events
    except BaseException:
        os.close(fd);raise


def recovery_status(plan_id,home=None):
    fd=None
    try:
        fd,private,events=read_recovery(plan_id,home)
        rows=[]
        for item in private['objects']:
            token=item['candidate_id'];phases=[e.get('phase') for e in events if e.get('candidate_id')==token]
            try:
                value=os.stat(token,dir_fd=fd,follow_symlinks=False)
                observed=[e.get('snapshot',{}) for e in events if e.get('candidate_id')==token and e.get('phase')=='CAPTURE_OBSERVED']
                expected=observed[-1] if observed else item['target']
                known=(value.st_dev,value.st_ino)==(expected.get('st_dev'),expected.get('st_ino'))
                status='HELD_RESTORE_AVAILABLE' if known else 'HELD_IDENTITY_UNKNOWN'
            except FileNotFoundError:
                status='REMOVED_RECORDED' if 'UNLINKED' in phases else 'NOT_HELD_OUTCOME_UNVERIFIED'
            rows.append(dict(candidate_id=token,row_id=private.get('row_map',{}).get(token),status=status))
        return dict(status='INSPECTED',rows=rows,actual_freed_bytes=None)
    except (OSError,Stop,ValueError,TypeError,KeyError,AttributeError,RecursionError):
        return dict(status='BLOCKED',blocker='recovery_inspection_failed',rows=[],actual_freed_bytes=None)
    finally:
        if fd is not None:os.close(fd)


def restore_held(plan_id,candidate_ids,home=None):
    """Separate explicit restore consent required; never delete a hold or overwrite."""
    fd=journal=None
    home=home_directory() if home is None else home
    try:
        fd,private,events=read_recovery(plan_id,home)
        items={item['candidate_id']:item for item in private['objects']}
        if (not isinstance(candidate_ids,list) or not candidate_ids
            or any(not isinstance(token,str) or not re.fullmatch('[0-9a-f]{32}',token) or token not in items for token in candidate_ids)
            or len(set(candidate_ids))!=len(candidate_ids)):raise Stop('invalid_recovery_scope')
        journal=os.open('events.jsonl',os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW,dir_fd=fd)
        fcntl.flock(journal,fcntl.LOCK_EX|fcntl.LOCK_NB)
        # A crashed append may leave only its final fragment. Repair our own
        # framing under the exclusive journal lock before adding restore records.
        readfd=os.open('events.jsonl',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
        with os.fdopen(readfd,'rb') as stream:raw=stream.read(1048577)
        if len(raw)>1048576:raise Stop('recovery_receipt_unsafe')
        if raw and not raw.endswith(b'\n'):
            os.ftruncate(journal,raw.rfind(b'\n')+1)
            os.fsync(journal)
        results=[]
        for token in candidate_ids:
            parent=None
            try:
                item=items[token]
                current=os.stat(token,dir_fd=fd,follow_symlinks=False)
                observed=[e.get('snapshot',{}) for e in events if e.get('candidate_id')==token and e.get('phase')=='CAPTURE_OBSERVED']
                expected=observed[-1] if observed else item['target']
                if (current.st_dev,current.st_ino)!=(expected.get('st_dev'),expected.get('st_ino')):raise Stop('recovery_identity_unknown')
                parent,_=open_directory(home.joinpath(*ROOTS[item['category']],*item['parts'][:-1]),item['ancestors'])
                event(journal,'RESTORE_INTENT',candidate_id=token)
                rename_exclusive(fd,token,parent,item['parts'][-1])
                os.fsync(parent);os.fsync(fd)
                event(journal,'RESTORED',candidate_id=token)
                results.append(dict(candidate_id=token,status='RESTORED'))
            except (OSError,Stop):results.append(dict(candidate_id=token,status='RECOVERY_REQUIRED',blocker='restore_identity_or_destination_conflict'))
            finally:
                if parent is not None:os.close(parent)
        return dict(status='RESTORED' if all(r['status']=='RESTORED' for r in results) else 'PARTIAL',rows=results,actual_freed_bytes=None)
    except (OSError,Stop,ValueError,TypeError,KeyError,AttributeError,RecursionError):
        return dict(status='BLOCKED',blocker='recovery_restore_failed',rows=[],actual_freed_bytes=None)
    finally:
        if journal is not None:os.close(journal)
        if fd is not None:os.close(fd)


def collect_to(path,seconds=5):
    private,public=discover(seconds=seconds)
    raw=json.dumps(private,sort_keys=True,separators=(',',':')).encode()
    parent=os.open(path.parent,FLAGS)
    try:
        info=os.fstat(parent)
        if info.st_uid!=os.getuid() or info.st_mode&0o077 or not private_acl(parent):raise Stop('private_manifest_directory_unsafe')
        fd=os.open(path.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=parent)
        try:
            if len(raw)>1048576 or os.write(fd,raw)!=len(raw):raise Stop('private_manifest_write_failed')
            os.fsync(fd)
        finally:os.close(fd)
        os.fsync(parent)
    finally:os.close(parent)
    public['manifest_digest']=hashlib.sha256(raw).hexdigest()
    return public


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect-to',type=Path)
    parser.add_argument('--timeout',type=float,default=5)
    parser.add_argument('--recovery-status',action='store_true')
    parser.add_argument('--restore-held',nargs='+',metavar='CANDIDATE_ID')
    parser.add_argument('--plan-id')
    args=parser.parse_args()
    try:
        if args.restore_held:
            if (not isinstance(args.plan_id,str) or not re.fullmatch('[0-9a-f]{64}',args.plan_id)
                or any(not re.fullmatch('[0-9a-f]{32}',token) for token in args.restore_held)):
                raise Stop('invalid_recovery_scope')
            expected='RESTORE '+args.plan_id+' '+','.join(sorted(args.restore_held))
            print('RESTORE_CONFIRM_PENDING '+args.plan_id,flush=True)
            if sys.stdin.readline(1024).rstrip('\n')!=expected:
                out=dict(status='BLOCKED',blocker='explicit_restore_consent_missing',rows=[],actual_freed_bytes=None)
            else:out=restore_held(args.plan_id,args.restore_held)
        elif args.recovery_status:
            out=recovery_status(args.plan_id)
        elif args.collect_to is not None and 0<args.timeout<=10:
            out=collect_to(args.collect_to,args.timeout)
        else:raise Stop('invalid_request')
    except (OSError,Stop,ValueError,TypeError,KeyError,AttributeError,OverflowError,RecursionError):
        out=dict(source='precise-cache-candidates',completeness='FAILED',candidates=[],
                 reasons=['precise_candidate_collection_failed'])
    print(json.dumps(out,sort_keys=True))


if __name__=='__main__':
    main()
