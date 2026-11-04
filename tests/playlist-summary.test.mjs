import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('summary reuses four ordered covers, includes public artist labels and resolves the current playlist owner nickname',async t=>{
 const {call,sql}=await fixture(t);
 sql.exec("UPDATE tracks SET status='published'; UPDATE artists SET name='AI 가수'; INSERT INTO producers(id,user_id,name,nickname_confirmed,created) VALUES('listener-profile','other','이전 닉네임',1,0)");
 const created=await call('/api/playlists','POST',{name:'실제 순서',description:'소개',is_public:true,track_ids:['three','one','hidden','two']},'other');
 assert.equal(created.status,201);const path='/api/playlists/'+created.body.id;
 const read=async()=>(await call('/api/playlists?sort=popular','GET',null,null)).body.playlists[0];
 let p=await read();assert.equal(p.owner_name,'이전 닉네임');assert.equal(p.tracks,4);assert.equal(p.saves,0);
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

test('bookmark response reports authoritative counts and state, surviving fresh list/library/detail reads',async t=>{
 const {call}=await fixture(t);
 const made=await call('/api/playlists','POST',{name:'목록',is_public:true,track_ids:['one']});const id=made.body.id,path='/api/playlists/'+id;
 for(const [method,saved,count] of [['PUT',1,1],['PUT',1,1],['DELETE',0,0],['DELETE',0,0]]){
  const r=await call(path+'/save',method,null,'other');assert.equal(r.status,200);assert.equal(r.body.saved,saved);assert.equal(r.body.saves,count);
  const p=(await call('/api/playlists?sort=popular','GET',null,'other')).body.playlists.find(p=>p.id===id);
  assert.equal(p.saved,saved);assert.equal(p.saves,count);
  assert.equal((await call(path,'GET',null,'other')).body.playlist.saved,saved);
  assert.equal((await call('/api/library','GET',null,'other')).body.saved.length,saved);
 }
 assert.equal((await call(path+'/save','PUT',null,null)).status,401);assert.equal((await call(path+'/save','PUT')).status,400);
 await call(path+'/save','PUT',null,'other');await call(path+'/tracks/two','PUT');
 const updated=(await call('/api/library','GET',null,'other')).body.saved[0];assert.equal(updated.tracks,2);assert.deepEqual(updated.covers.map(t=>t.id),['one','two']);
 await call(path,'PATCH',{name:'비공개',is_public:false});assert.equal((await call(path,'GET',null,'other')).status,404);
 assert.equal((await call('/api/playlists','GET',null,'other')).body.playlists.length,0);assert.equal((await call(path+'/save','PUT',null,'other')).status,404);
 assert.deepEqual((await call(path+'/save','DELETE',null,'other')).body,{ok:true,saved:0,saves:0});
});
