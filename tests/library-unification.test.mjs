import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './fixture.mjs';
import {verifyLibraryBackup} from '../scripts/verify-library-backup.mjs';
import {applyBoxUnification} from '../server/library-unification.js';
import {migrateLibraryBatch} from '../server/library-migration.js';

function seed(sql) {
  sql.exec(`UPDATE tracks SET kind='cover' WHERE id='two';
    INSERT INTO my_boxes(id,user_id,name,created,updated) VALUES('mix','owner',' Ｍix ',10,13),('empty','other','Mix',11,12);
    INSERT INTO my_box_items VALUES
      ('mix','cover','two',7,120),('mix','original','one',7,10),
      ('mix','dubbing','one',7,100),('mix','original','missing',37,121),
      ('mix','cover','one',9,90);
    INSERT INTO playlists(id,user_id,name,name_key,created) VALUES('other-list','other','원본','원본',10);
    INSERT INTO playlist_saves(user_id,playlist_id,created) VALUES('owner','other-list',12);`);
}

async function backup(t,sql) {
  const dir = mkdtempSync(join(tmpdir(),'aifect-library-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const path = join(dir,'restore.sqlite');
  sql.prepare('VACUUM INTO ?').run(path);
  return verifyLibraryBackup(path);
}

test('verified restore and cutover preserve mixed IDs, unavailable items, stored order, owners, titles and existing saves',async t => {
  const {sql,DB,call} = await fixture(t);
  seed(sql);
  assert.equal((await call('/api/library/unification','GET',null,null)).body.ready,false);
  assert.equal((await call('/api/admin/library-unification')).status,403);
  const original = sql.prepare('SELECT * FROM my_box_items ORDER BY box_id,position,kind,content_id').all();
  const restored = await backup(t,sql);
  const result = await applyBoxUnification({DB},restored);
  assert.equal(result.boxes,2);
  assert.equal(result.items,5);
  assert.equal(result.backup_sha256,restored.file_sha256);
  assert.deepEqual(await applyBoxUnification({DB},restored),result);
  assert.deepEqual(sql.prepare('SELECT * FROM my_box_items ORDER BY box_id,position,kind,content_id').all(),original);
  assert.equal(sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
  assert.deepEqual(sql.prepare('SELECT user_id,name,is_public FROM playlists WHERE id LIKE ? ORDER BY id').all('from-box-%').map(p=>[p.user_id,p.name,p.is_public]),[['other','Mix',0],['owner',' Ｍix ',0]]);
  const detail=(await call('/api/playlists/from-box-mix')).body;
  assert.deepEqual(detail.items.map(i=>[i.kind,i.content_id]),original.map(i=>[i.kind,i.content_id]));
  assert.equal(detail.items.find(i=>i.content_id==='missing').content,null);
  assert.equal((await call('/api/playlists/from-box-mix','GET',null,'other')).status,404);
  assert.equal((await call('/api/library/unification','GET',null,null)).body.ready,true);
  assert.equal((await call('/api/my-boxes/mix')).status,410);
  assert.equal((await call('/api/me/music-library?section=myboxes')).status,410);
  await migrateLibraryBatch({DB});
  assert.equal(sql.prepare('SELECT count(*) n FROM playlist_items WHERE playlist_id=?').get('from-box-mix').n,5);
});

test('a title collision or changed backup keeps every original accessible without partial playlists',async t => {
  const {sql,DB,call} = await fixture(t);
  seed(sql);
  const snapshot=await backup(t,sql);
  sql.exec("UPDATE my_boxes SET name='새로운 제목' WHERE id='empty'");
  await assert.rejects(applyBoxUnification({DB},snapshot),e=>e.status===409);
  sql.exec("UPDATE my_boxes SET name='원본' WHERE id='empty'");
  await assert.rejects(applyBoxUnification({DB},await backup(t,sql)),e=>e.status===409);
  assert.equal((await call('/api/library/unification')).body.ready,false);
  assert.equal((await call('/api/my-boxes/mix')).status,200);
  assert.equal(sql.prepare("SELECT count(*) n FROM playlists WHERE id LIKE 'from-box-%'").get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM my_box_items').get().n,5);
});

test('source edits racing with cutover and copy verification failures roll back the whole copy',async t => {
  const {sql,DB} = await fixture(t);
  seed(sql);
  const saved=await backup(t,sql);
  const changed={...DB,batch(statements){sql.exec("UPDATE my_box_items SET position=123 WHERE content_id='missing'");return DB.batch(statements);}};
  await assert.rejects(applyBoxUnification({DB:changed},saved),e=>e.status===409);
  sql.exec(`CREATE TRIGGER lost_member AFTER INSERT ON playlist_extra_items WHEN new.content_id='missing'
    BEGIN UPDATE playlist_extra_items SET position=-1 WHERE content_id=new.content_id AND playlist_id=new.playlist_id; END;`);
  await assert.rejects(applyBoxUnification({DB},await backup(t,sql)),e=>e.status===409);
  assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,1);
  assert.equal(sql.prepare('SELECT count(*) n FROM library_unification_state').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM my_box_items').get().n,5);
});
