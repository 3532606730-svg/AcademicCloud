#!/usr/bin/env python3
"""Member-only network/version boundary before loading the unchanged sidecar."""
import ctypes, errno, importlib.metadata, runpy, socket, sys

def network_guard():
    # No dependency install or permissive fallback: this Linux library is mandatory.
    lib=ctypes.CDLL('libseccomp.so.2',use_errno=True)
    lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
    lib.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint];lib.seccomp_rule_add.restype=ctypes.c_int
    lib.seccomp_load.argtypes=[ctypes.c_void_p];lib.seccomp_load.restype=ctypes.c_int
    lib.seccomp_release.argtypes=[ctypes.c_void_p]
    context=lib.seccomp_init(0x7fff0000)
    if not context: raise RuntimeError('offline_guard_unavailable')
    try:
        for name in (b'connect',b'sendto',b'sendmsg',b'sendmmsg'):
            syscall=lib.seccomp_syscall_resolve_name(name)
            if syscall<0 or lib.seccomp_rule_add(context,0x00050000|errno.EACCES,syscall,0)!=0:raise RuntimeError('offline_guard_unavailable')
        if lib.seccomp_load(context)!=0:raise RuntimeError('offline_guard_unavailable')
    finally:lib.seccomp_release(context)

def verify_versions(version=importlib.metadata.version):
    if version('paddleocr')!='3.7.0':raise RuntimeError('engine_version_mismatch')
    try:runtime=version('paddlepaddle-gpu')
    except importlib.metadata.PackageNotFoundError:runtime=version('paddlepaddle')
    if runtime!='3.3.1':raise RuntimeError('engine_version_mismatch')

def self_check():
    with socket.socket() as probe:
        try:probe.connect(('127.0.0.1',9))
        except OSError as error:
            if error.errno!=errno.EACCES:raise RuntimeError('offline_guard_unavailable')
        else:raise RuntimeError('offline_guard_unavailable')

def main():
    try:
        network_guard();self_check();verify_versions()
        if sys.argv[1:]==['--self-check']:
            print('{"networkGuard":"pass","versionGuard":"pass"}',flush=True);return 0
        if len(sys.argv)<2:return 20
        sys.argv=sys.argv[1:]
        runpy.run_path(sys.argv[0],run_name='__main__')
        return 0
    except Exception:
        # Deliberately exclude exception text, file paths, environment and document content.
        sys.stderr.write('member_engine_preflight_failed\n');return 20

if __name__=='__main__':raise SystemExit(main())
