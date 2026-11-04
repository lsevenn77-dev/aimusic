import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('summary reuses four ordered covers, includes public artist labels and resolves the current playlist owner nickname',async t=>{
 const {call,sql}=await fixture(t);
 sql.exec("UPDATE tracks SET status='published'; UPDATE artists SET name='AI 가수'; INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES('listener-profile','other','이전 닉네임',1,0)");
 const created=await call('/api/playlists','POST',{name:'실제 순서',description:'소개',is_public:true,track_ids:['three','one','hidden','two']},'other');
 assert.equal(created.status,201);const path='/api/playlists/'+created.body.id;
 const read=async()=>(await call('/api/playlists?sort=popular','GET',null,null)).body.playlists[0];
 let p=await read();assert.equal(p.owner_name,'이전 닉네임');assert.equal(p.tracks,4);assert.equal(p.saves,undefined);assert.equal(p.saved,undefined);assert.equal(p.pinned,undefined);
 assert.deepEqual(p.covers.map(t=>t.id),['three','one','hidden','two']);assert.ok(p.covers.every(t=>t.artist==='AI 가수'));
 for(const song of p.covers)for(const field of ['audio_url','original_ext','lyrics','description','duration'])assert.equal(song[field],undefined);
 sql.exec("UPDATE producers SET name='최신 닉네임' WHERE user_id='other'; UPDATE artists SET name='바뀐 AI 가수'");
 p=await read();assert.equal(p.owner_name,'최신 닉네임');assert.equal(p.covers[0].artist,'바뀐 AI 가수');
 assert.equal((await call('/api/playlists?q='+encodeURIComponent('최신 닉네임'),'GET',null,null)).body.playlists.length,1);
 await call(path+'/order','PUT',{track_ids:['two','hidden','one','three']},'other');
 assert.deepEqual((await read()).covers.map(t=>t.id),['two','hidden','one','three']);
 sql.exec("UPDATE tracks SET status='hidden' WHERE id='hidden'");
 p=await read();assert.equal(p.tracks,3);assert.deepEqual(p.covers.map(t=>t.id),['two','one','three']);
});

test('retired save and pin routes cannot mutate history; legacy popularity sorts by creation',async t=>{
 const {call,sql}=await fixture(t);
 const first=(await call('/api/playlists','POST',{name:'Old popular',is_public:true,track_ids:['one']})).body.id;
 const second=(await call('/api/playlists','POST',{name:'New',is_public:true,track_ids:['two']})).body.id;
 sql.prepare('UPDATE playlists SET created=1 WHERE id=?').run(first);
 sql.prepare('UPDATE playlists SET created=2 WHERE id=?').run(second);
 sql.prepare("INSERT INTO playlist_saves VALUES('other',?,3)").run(first);
 sql.prepare("INSERT INTO playlist_preferences(user_id,playlist_id,pinned,position) VALUES('owner',?,1,99)").run(first);
 for(const user of ['owner','other',null]){
  for(const method of ['PUT','DELETE'])assert.equal((await call('/api/playlists/'+first+'/save',method,null,user)).status,404);
  assert.equal((await call('/api/library/playlists/'+first,'PATCH',{pinned:true},user)).status,404);
 }
 for(const sort of ['', 'popular','saved','recent']){
  const lists=(await call('/api/playlists?sort='+sort,'GET',null,'other')).body.playlists;
  assert.deepEqual(lists.map(p=>p.id),[second,first]);
  for(const p of lists)for(const field of ['saved','saves','pinned'])assert.equal(p[field],undefined);
 }
 assert.equal(sql.prepare('SELECT count(*) n FROM playlist_saves').get().n,1);
 assert.equal(sql.prepare('SELECT pinned FROM playlist_preferences').get().pinned,1);
 assert.deepEqual((await call('/api/library','GET',null,'other')).body.collections,[]);
 assert.equal((await call('/api/playlists/'+first,'GET',null,'other')).body.tracks[0].id,'one');
 assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,2);
 assert.equal(sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,2);
});
