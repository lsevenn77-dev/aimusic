import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {validGenre,GENRES} from '../shared/genres.js';

test('expanded and custom genres persist through upload and editing and can be filtered',async t=>{
 const {call,sql}=await fixture(t),genre='Dark Contemporary Korean Folklore Fusion';
 assert(GENRES.includes('Dark Pop'));assert(GENRES.includes('Fusion'));assert(validGenre(genre));
 for(const invalid of ['', ' ', 'a'.repeat(81), 'Jazz\nPop', null])assert.equal(validGenre(invalid),false);
 const body={title:'Genre test',artist:'AI',producer:'Creator',genre,ai_tool:'QA',extension:'wav',bytes:128,rights:true,is_ai:true,karaoke:true,lyrics_mode:'auto',lyrics_source:'[Verse 1]\nHello\n[Chorus]\nAgain\n[Chorus]\nAgain',lyrics_language:'en'};
 const uploaded=await call('/api/uploads','POST',body);assert.equal(uploaded.status,201);
 const id=uploaded.body.id;assert.equal(sql.prepare('SELECT genre FROM tracks WHERE id=?').get(id).genre,genre);
 assert.equal(sql.prepare('SELECT source_text FROM lyric_jobs WHERE track_id=?').get(id).source_text,'Hello\nAgain\nAgain');
 sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(id);
 assert.equal((await call('/api/catalog?genre='+encodeURIComponent(genre))).body.tracks.length,1);
 const profile=(await call('/api/studio/tracks/'+id)).body.profile;
 assert.equal((await call('/api/studio/tracks/'+id,'PUT',{...profile,genre:'Dark Pop'})).status,200);
 assert.equal((await call('/api/studio/tracks/'+id,'PUT',{...profile,genre:'a'.repeat(81)})).status,400);
});

test('track deletion is owner-only, hides linked covers and preserves financial history',async t=>{
 const {call,sql}=await fixture(t);
 sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; UPDATE tracks SET kind='cover',original_id='one' WHERE id='two'; INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES('gift','other','one',10,100000,'producer',80000,20000,'2026-09',0)");
 assert.equal((await call('/api/uploads/one','DELETE',undefined,null)).status,401);
 assert.equal((await call('/api/uploads/one','DELETE',undefined,'other')).status,404);
 assert.equal((await call('/api/uploads/one','DELETE')).status,200);
 assert.equal((await call('/api/uploads/one','DELETE')).status,200);
 assert.equal(sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'deleted');
 assert.equal(sql.prepare('SELECT count(*) n FROM gifts').get().n,1);
 assert(!(await call('/api/studio')).body.tracks.some(t=>t.id==='one'));
 for(const path of ['/api/tracks/one','/api/tracks/two','/api/studio/tracks/one','/media/one/cover','/api/studio/tracks/one/lyrics/align','/api/studio/tracks/one/karaoke'])assert.equal((await call(path)).status,404,path);
 for(const action of ['retry','unpublish','complete','karaoke'])assert.equal((await call('/api/uploads/one/'+action,'POST',{accept:true})).status,404);
 assert.equal((await call('/api/studio/tracks/one','PUT',{genre:'Rock'})).status,404);
 assert.equal((await call('/api/uploads/two','DELETE')).status,200);
 assert.equal(sql.prepare("SELECT status FROM tracks WHERE id='two'").get().status,'deleted');
});

test('deleting a processing upload revokes its worker lease and pending jobs',async t=>{
 const {call,sql}=await fixture(t);
 sql.exec("UPDATE tracks SET status='processing',lease_token='old-worker',lease_until=9999999999 WHERE id='one'");
 await call('/api/studio/tracks/one/lyrics/align','POST',{lyrics_source:'Hello',lyrics_language:'en'});
 assert.equal(sql.prepare('SELECT count(*) n FROM lyric_jobs').get().n,1);
 await call('/api/uploads/one','DELETE');
 assert.equal(sql.prepare('SELECT count(*) n FROM lyric_jobs').get().n,0);
 assert.equal(sql.prepare("SELECT lease_token FROM tracks WHERE id='one'").get().lease_token,null);
});
