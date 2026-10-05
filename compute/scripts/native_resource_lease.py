#!/usr/bin/env python3
"""Own a lock until explicit native-cleanup acknowledgement. Never log paths."""
import fcntl, os, signal, stat, sys

def main():
    if len(sys.argv) != 2: return 20
    path=sys.argv[1]
    try:
        fd=os.open(path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o022: return 20
        try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('{"status":"busy"}',flush=True);os.close(fd);return 10
        # A lost holder leaves a durable busy marker even after its OS lock is
        # released. Never start another engine until cleanup has been verified.
        previous=os.read(fd,32)
        if previous not in (b'',b'closed\n'):
            print('{"status":"failed"}',flush=True);os.close(fd);return 20
        def state(value):
            os.lseek(fd,0,os.SEEK_SET);os.ftruncate(fd,0);os.write(fd,value);os.fsync(fd)
        state(b'owned\n')
        # systemd control-group shutdown and terminal Ctrl+C also reach this
        # helper. The parent closes native engines before explicitly releasing.
        signal.signal(signal.SIGTERM,signal.SIG_IGN)
        signal.signal(signal.SIGINT,signal.SIG_IGN)
        print('{"status":"acquired"}',flush=True)
        if sys.stdin.buffer.readline(32)!=b'release\n':
            os.close(fd);return 20
        state(b'closed\n')
        os.close(fd)
        return 0
    except Exception:
        print('{"status":"failed"}',flush=True)
        return 20

if __name__=='__main__':raise SystemExit(main())
