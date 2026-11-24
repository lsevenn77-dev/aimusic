// Inspect a restored full database with a read-only connection. Emit only a receipt,
// never raw account or membership data. The admin API compares its source digest.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream, existsSync, statSync, readdirSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {inspectBoxSource} from '../shared/library-backup.js';

const hash = data => createHash('sha256').update(data).digest('hex');
export async function verifyLibraryBackup(file) {
  const original = statSync(file);
  if (['-wal','-journal'].some(s => existsSync(file+s) && statSync(file+s).size)) throw new Error('별도 저널이 없는 독립된 백업 복원본을 사용해 주세요.');
  const db = new DatabaseSync(file, {readOnly:true});
  const baseline = new DatabaseSync(':memory:');
  try {
    // Require all application tables from the deployment preceding this change.
    const dir = new URL('../drizzle/',import.meta.url);
    for (const name of readdirSync(dir).filter(n => /^\d{4}_.*\.sql$/.test(n) && Number(n.slice(0,4)) < 110).sort()) {
      baseline.exec(readFileSync(new URL(name,dir),'utf8'));
    }
    const tables = db => db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
    const present = new Set(tables(db));
    if (tables(baseline).some(t => !present.has(t))) throw new Error('배포 스키마의 테이블을 모두 포함한 DB 백업이 필요합니다.');
    if (db.prepare('PRAGMA integrity_check').all().some(r=>r.integrity_check!=='ok') ||
        db.prepare('PRAGMA foreign_key_check').get()) throw new Error('백업 복원본의 무결성 검증에 실패했습니다.');
    db.exec('BEGIN');
    const {fingerprint, counts} = await inspectBoxSource((sql,...args) => db.prepare(sql).get(...args), hash);
    const fileHash = createHash('sha256');
    for await (const chunk of createReadStream(file)) fileHash.update(chunk);
    if (statSync(file).mtimeMs !== original.mtimeMs || statSync(file).size !== original.size) throw new Error('검증 중 백업 파일이 변경되었습니다.');
    return {format:1,file_sha256:fileHash.digest('hex'),source_sha256:fingerprint,...counts};
  } finally {
    db.close();
    baseline.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('사용법: node scripts/verify-library-backup.mjs <복원한 SQLite 백업 파일>');
  console.log(JSON.stringify(await verifyLibraryBackup(process.argv[2])));
}
