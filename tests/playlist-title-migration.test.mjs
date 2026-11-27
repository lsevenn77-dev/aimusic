import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmdirSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir=new URL('../drizzle/',import.meta.url);
const migration='0119_remove_playlist_title_uniqueness.sql';

test('removing title uniqueness after restore preserves playlists, history, and the previous Worker table',t=>{
 const original=new DatabaseSync(':memory:');
 t.after(()=>original.close());
 original.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(dir).filter(name=>name.endsWith('.sql')&&name<migration).sort()){
  original.exec(readFileSync(new URL(name,dir),'utf8'));
 }
 original.exec(`
  INSERT INTO users(id,email,name,created) VALUES('owner','owner@example.test','창작자',0),('listener','listener@example.test','감상자',0);
  INSERT INTO producers(id,user_id,name,created) VALUES('producer','owner','창작자',0);
  INSERT INTO artists(id,producer_id,name,created) VALUES('artist','producer','가수',0);
  INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status)
    VALUES('audio','owner','artist','producer','곡','Rock','QA',1,'wav',128,0,'published');
  INSERT INTO playlists(id,user_id,name,name_key,is_public,created,updated,description,image_version,image_type)
    VALUES('public-id','owner','앨범','앨범',1,10,15,'공개 소개','image-version','image/webp');
  INSERT INTO playlists(id,user_id,name,name_key,is_public,created,updated,source_id)
    VALUES('copy-id','listener','앨범','앨범',0,20,21,'public-id');
  INSERT INTO playlist_title_claims VALUES('앨범');
  INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('public-id','audio',0,10),('copy-id','audio',1,20);
  INSERT INTO playlist_extra_items(playlist_id,kind,content_id,position,created) VALUES('copy-id','dubbing','dubbing-id',0,20);
  INSERT INTO playlist_saves(user_id,playlist_id,created) VALUES('listener','public-id',12);
  INSERT INTO playlist_recents(user_id,playlist_id,played) VALUES('listener','public-id',14);
  INSERT INTO playlist_preferences(user_id,playlist_id,pinned,position) VALUES('listener','public-id',1,2);
  INSERT INTO library_requests(user_id,request_id,fingerprint,result_id,created) VALUES('listener','request','digest','copy-id',20);
  INSERT INTO likes(user_id,track_id,created) VALUES('listener','audio',13);
  INSERT INTO listens(id,listener,user_id,track_id,started,day) VALUES('listen','listener','listener','audio',14,'2026-11-26');
 `);
 const folder=mkdtempSync(join(tmpdir(),'aifect-playlist-migration-')),file=join(folder,'restore.sqlite');
 original.prepare('VACUUM INTO ?').run(file);
 const restored=new DatabaseSync(file);
 t.after(()=>{restored.close();unlinkSync(file);rmdirSync(folder);});
 restored.exec('PRAGMA foreign_keys=ON');
 const snapshot=(db,table)=>db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all();
 const tables=['users','tracks','playlists','playlist_tracks','playlist_extra_items','playlist_items','playlist_preferences','playlist_recents','playlist_saves','library_requests','likes','listens'];
 const dataHash=db=>createHash('sha256').update(JSON.stringify(tables.map(name=>snapshot(db,name)))).digest('hex');
 const schema=db=>db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE tbl_name!='playlist_title_claims' ORDER BY type,name").all();
 assert.equal(dataHash(original),dataHash(restored));
 restored.exec(readFileSync(new URL(migration,dir),'utf8'));
 assert.equal(dataHash(original),dataHash(restored));
 assert.deepEqual(schema(restored),schema(original));
 assert.deepEqual(restored.prepare('SELECT key FROM playlist_title_claims ORDER BY key').all(),
  original.prepare('SELECT key FROM playlist_title_claims ORDER BY key').all());
 assert.equal(restored.prepare('PRAGMA table_info(playlist_title_claims)').get().pk,0);
 assert.equal(restored.prepare('PRAGMA index_list(playlist_title_claims)').all().some(index=>index.unique),false);
 restored.exec("INSERT INTO playlist_title_claims VALUES('앨범')");
 assert.equal(restored.prepare("SELECT count(*) n FROM playlist_title_claims WHERE key='앨범'").get().n,2);
 assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
 restored.exec("INSERT INTO playlists(id,user_id,name,name_key,is_public,created) VALUES('third-id','owner','앨범','앨범',1,30)");
 assert.equal(restored.prepare("SELECT count(*) n FROM playlists WHERE name='앨범'").get().n,3);
 assert.throws(()=>restored.exec("INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('third-id','missing',0,0)"),/FOREIGN KEY/);
});
