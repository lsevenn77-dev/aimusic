"""Restore a trusted D1 SQL backup into a NEW private staging DB. Never switches traffic."""
import argparse, hashlib, hmac, json, os, sqlite3, stat, struct, sys
from pathlib import Path

def quote(name):
    return '"' + name.replace('"','""') + '"'

def fingerprint(conn, key):
    if conn.execute("PRAGMA integrity_check").fetchall() != [('ok',)]:raise ValueError('integrity check failed')
    if next(conn.execute('PRAGMA foreign_key_check'), None) is not None:
        raise ValueError('foreign key check failed')
    result = {}
    for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name"):
        table = quote(name)
        cols = [quote(c[1]) for c in conn.execute('PRAGMA table_info('+table+')')]
        if not cols:
            raise ValueError('table without data columns')
        mac = hmac.new(key, name.encode()+b'\0', hashlib.sha256); n=0
        for row in conn.execute('SELECT '+','.join(cols)+' FROM '+table+' ORDER BY '+','.join(c+' COLLATE BINARY' for c in cols)):
            n+=1
            for value in row:
                if value is None: v=b'n'
                elif isinstance(value, bytes): v=b'b'+value
                elif isinstance(value, str): v=b's'+value.encode()
                elif isinstance(value, float): v=b'f'+struct.pack('>d',value)
                else: v=b'i'+str(value).encode()
                mac.update(struct.pack('>Q',len(v))+v)
        result[name]=[n,mac.hexdigest()]
    return result

def restore(source, dest, key, expected=None):
    if source.stat().st_mode & 0o077 and os.name!='nt': raise ValueError('backup must be private (chmod 600)')
    if not stat.S_ISREG(source.stat().st_mode): raise ValueError('backup must be a regular file')
    os.close(os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600))
    try:
        db=sqlite3.connect(dest)
        try:
            db.enable_load_extension(False)
            def auth(op,p,q,*_):
                if op in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) or (op==sqlite3.SQLITE_FUNCTION and (q or '').lower()=='load_extension'):return sqlite3.SQLITE_DENY
                return sqlite3.SQLITE_OK
            db.set_authorizer(auth)
            # Cloudflare's .sql export is SQL, not sqlite-shell dot commands.
            db.executescript(source.read_text(encoding='utf-8-sig'))
            if db.in_transaction:raise ValueError('incomplete SQL transaction')
            manifest=fingerprint(db,key)
            if not manifest or (expected is not None and manifest!=expected):raise ValueError('manifest mismatch or empty backup')
        finally:db.close()
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('backup',type=Path);p.add_argument('new_database',type=Path);p.add_argument('--key-file',type=Path,required=True);p.add_argument('--compare',type=Path)
    a=p.parse_args()
    if os.name!='nt' and a.key_file.stat().st_mode & 0o077:sys.exit('key file must be private')
    key=a.key_file.read_bytes()
    if len(key)<32:sys.exit('verification key must contain at least 32 random bytes')
    try: print(json.dumps(restore(a.backup,a.new_database,key,json.loads(a.compare.read_text()) if a.compare else None),sort_keys=True))
    except Exception as e:sys.exit('Restore failed ('+type(e).__name__+'); destination was not activated.')
