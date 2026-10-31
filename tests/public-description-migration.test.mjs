import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';

const source=JSON.parse(readFileSync(new URL('../docs/music-description-reviewed-source-20261026.json',import.meta.url)));
const copy=JSON.parse(readFileSync(new URL('../docs/music-description-copy-20261026.json',import.meta.url)));
// Git checks out SQL with CRLF on Windows; compare the repository's LF literal content.
const migration=readFileSync(new URL('../drizzle/0078_public_music_descriptions.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
function seed(f){
 for(const producer of new Set(source.map(t=>t.producer_id))){
  f.sql.prepare("INSERT INTO users(id,email,name,created) VALUES(?,?,'Copy fixture',0)").run('copy-'+producer,producer+'@example.test');
  f.sql.prepare("INSERT INTO producers(id,user_id,name,created) VALUES(?,?,'Copy fixture',0)").run(producer,'copy-'+producer);
 }
 // Existing IDs in the copy list include both originals and their cover children.
 for(const t of [...source].sort((a,b)=>(a.kind==='cover')-(b.kind==='cover')))f.sql.prepare("INSERT INTO tracks(id,artist_id,user_id,producer_id,title,genre,description,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,cover_mode,original_id,duration) VALUES(?,'artist',?,?,?,'Rock',?,'QA',1,'mp3',1234,0,'published',?,?,?,180)").run(t.id,'copy-'+t.producer_id,t.producer_id,t.title,t.description,t.kind,t.cover_mode,t.original_id);
}
const counts=f=>Object.fromEntries(['ai_bot_jobs','user_xp_events','listens','wallet_lots','gifts'].filter(table=>f.sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)).map(table=>[table,f.sql.prepare('SELECT count(*) n FROM '+table).get().n]));
test('editorial description migration changes only reviewed descriptions, audits originals and is idempotent',async t=>{
 const f=await fixture(t);seed(f);
 const before=f.sql.prepare('SELECT * FROM tracks ORDER BY id').all(),activity=counts(f);
 f.sql.exec(migration);
 for(const old of before){
  const current=f.sql.prepare('SELECT * FROM tracks WHERE id=?').get(old.id);
  assert.deepEqual({...current},{...old,description:copy[old.id]??old.description});
 }
 const audits=f.sql.prepare("SELECT target FROM admin_audit WHERE action='track_description_editorial'").all().map(r=>JSON.parse(r.target));
 assert.equal(audits.length,19);assert.deepEqual(counts(f),activity);
 for(const entry of audits){assert.equal(entry.before,source.find(s=>s.id===entry.track_id).description);assert.equal(entry.after,copy[entry.track_id]);}
 f.sql.exec(migration);assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='track_description_editorial'").get().n,19);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='public_copy_0078_audit'").get().n,0);
});
test('editorial copy skips concurrent author edits, changed metadata and hidden tracks',async t=>{
 const f=await fixture(t);seed(f);
 const original=source.filter(x=>x.kind==='original').slice(0,3);
 f.sql.prepare('UPDATE tracks SET description=? WHERE id=?').run('새로 작성한 창작자 소개',original[0].id);
 f.sql.prepare('UPDATE tracks SET title=? WHERE id=?').run('변경된 제목',original[1].id);
 f.sql.prepare("UPDATE tracks SET status='hidden' WHERE id=?").run(original[2].id);
 f.sql.exec(migration);
 assert.equal(f.sql.prepare('SELECT description FROM tracks WHERE id=?').get(original[0].id).description,'새로 작성한 창작자 소개');
 assert.equal(f.sql.prepare('SELECT description FROM tracks WHERE id=?').get(original[1].id).description,original[1].description);
 assert.equal(f.sql.prepare('SELECT description FROM tracks WHERE id=?').get(original[2].id).description,original[2].description);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='track_description_editorial'").get().n,16);
});
