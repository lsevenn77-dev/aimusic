import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const input={title:'선택한 이름으로 공개',producer:'QA',genre:'Rock',ai_tool:'QA',rights:true,is_ai:true,karaoke:true,extension:'wav',bytes:128};

test('songs without an AI singer use the public nickname in every catalog response',async t=>{
 const f=await fixture(t);
 const draft=await f.call('/api/uploads','POST',{...input,artist_id:'none'});
 assert.equal(draft.status,201);assert.equal(draft.body.artist_id,null);
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(draft.body.id);
 const song=(await f.call('/api/tracks/'+draft.body.id)).body.track;
 assert.equal(song.artist,'QA');assert.equal(song.artist_id,null);assert.equal(song.has_ai_artist,0);
 const placeholder=f.sql.prepare('SELECT artist_id FROM tracks WHERE id=?').get(draft.body.id).artist_id;
 assert.equal((await f.call('/api/artists/'+placeholder)).status,404);
 assert.equal((await f.call('/api/studio')).body.artists.some(a=>a.id===placeholder),false);
 assert.equal((await f.call('/api/catalog?section=artists')).body.artists.some(a=>a.id===placeholder),false);
 assert.equal((await f.call('/api/search?q=없음')).body.artists.length,0);
 await f.call('/api/studio/profile','PUT',{name:'바뀐 활동명',bio:''});
 assert.equal((await f.call('/api/tracks/'+draft.body.id)).body.track.artist,'바뀐 활동명');
 for(const name of ['없음','미등록','-','선택 안함','선택안함']){
  f.sql.prepare('UPDATE artists SET name=? WHERE id=?').run(name,placeholder);
  assert.equal((await f.call('/api/tracks/'+draft.body.id)).body.track.artist,'바뀐 활동명');
 }
});

test('choosing and clearing a singer changes only the song credit, retaining the creator and cover singer',async t=>{
 const f=await fixture(t);
 const draft=await f.call('/api/uploads','POST',{...input,artist:'별빛'});assert.equal(draft.status,201);
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(draft.body.id);
 let song=(await f.call('/api/tracks/'+draft.body.id)).body.track;
 assert.equal(song.artist,'별빛');assert.equal(song.producer,'QA');assert.equal(song.has_ai_artist,1);
 const selected=await f.call('/api/uploads','POST',{...input,artist_id:draft.body.artist_id});assert.equal(selected.status,201);
 const edit={...input,tags:'',description:'',participation:'',artist_id:'none',lyrics_mode:'none',lyrics:''};
 assert.equal((await f.call('/api/studio/tracks/'+draft.body.id,'PUT',edit)).status,200);
 song=(await f.call('/api/tracks/'+draft.body.id)).body.track;assert.equal(song.artist,'QA');assert.equal(song.has_ai_artist,0);
 assert.equal((await f.call('/api/studio/tracks/'+draft.body.id,'PUT',{...edit,artist_id:'foreign'})).status,404);
 assert.equal((await f.call('/api/studio/tracks/'+draft.body.id,'PUT',{...edit,artist_id:selected.body.artist_id})).status,200);
 assert.equal((await f.call('/api/tracks/'+draft.body.id)).body.track.artist,'별빛');
 const cover=await f.call('/api/covers','POST',{original_id:draft.body.id,own_voice:true,rights:true,extension:'wav',bytes:128},'other');assert.equal(cover.status,201);
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(cover.body.id);
 const c=(await f.call('/api/tracks/'+cover.body.id)).body.track;assert.equal(c.has_ai_artist,0);assert.equal(c.artist,'other · 커버');assert.equal(c.original_artist,'별빛');
});
