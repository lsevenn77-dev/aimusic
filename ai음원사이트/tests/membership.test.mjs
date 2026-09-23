import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('concurrent create requests cannot cross the plan cap or leave orphan tracks',async t=>{
 const {call,sql}=await fixture(t);
 await call('/api/playlists','POST',{name:'첫 목록'});
 const attempts=await Promise.all(Array.from({length:5},(_,i)=>call('/api/playlists','POST',{name:'동시 요청 '+i,track_ids:['one']})));
 assert.equal(attempts.filter(r=>r.status===201).length,1);assert.equal(attempts.filter(r=>r.status===409).length,4);
 assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,2);assert.equal(sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,1);
});

test('server enforces free 2 / premium 10 and ignores forged entitlement fields',async t=>{
 const {call,sql}=await fixture(t);
 assert.equal((await call('/api/membership','GET',null,null)).body.membership.playlist_limit,2);
 assert.equal((await call('/api/me')).body.membership.plan,'free');
 const make=()=>call('/api/playlists','POST',{name:'내 취향',track_ids:['one'],plan:'premium',premium_until:9999999999});
 for(let i=0;i<2;i++)assert.equal((await make()).status,201);
 assert.equal((await make()).status,409);assert.equal(sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,2);
 sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 for(let i=2;i<10;i++)assert.equal((await make()).status,201);
 assert.equal((await make()).status,409);assert.equal((await call('/api/library')).body.membership.owned_count,10);
 sql.exec("UPDATE users SET premium_until=unixepoch()-1 WHERE id='owner'");
 const m=(await call('/api/membership')).body.membership;assert.equal(m.plan,'free');assert.equal(m.playlist_limit,2);assert.equal(m.owned_count,10);assert.equal(m.locked_count,8);assert.equal(m.active_ids.length,2);
 assert.equal((await make()).status,409);
});

test('bookmarks do not consume owned limits; downgrade preserves music and hides locked public lists',async t=>{
 const {call,sql}=await fixture(t);sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 const ids=[];for(let i=0;i<4;i++)ids.push((await call('/api/playlists','POST',{name:'취향 '+i,is_public:true,track_ids:['one','two']})).body.id);
 for(const id of ids)assert.equal((await call('/api/playlists/'+id+'/save','PUT',null,'other')).status,200);
 for(let i=0;i<2;i++)assert.equal((await call('/api/playlists','POST',{name:'다른 회원 '+i},'other')).status,201);
 let lib=(await call('/api/library','GET',null,'other')).body;assert.equal(lib.saved.length,4);assert.equal(lib.membership.owned_count,2);
 sql.exec("UPDATE users SET premium_until=0 WHERE id='owner'");
 lib=(await call('/api/library')).body;assert.equal(lib.playlists.length,4);const locked=lib.playlists.filter(p=>p.locked),active=lib.membership.active_ids;
 assert.equal(locked.length,2);assert.equal(locked[0].tracks,2);assert.equal(sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,8);
 for(const p of locked){
  const path='/api/playlists/'+p.id;assert.equal((await call(path,'GET',null,null)).status,404);assert.equal((await call(path,'GET',null,'other')).status,404);
  const own=(await call(path)).body;assert.equal(own.playlist.locked,true);assert.equal(own.playlist.tracks,2);assert.deepEqual(own.tracks,[]);
  assert.equal((await call(path,'PATCH',{name:'수정 시도'})).status,403);
  assert.equal((await call(path+'/tracks/three','PUT')).status,403);
  assert.equal((await call(path+'/tracks/one','DELETE')).status,403);
  assert.equal((await call(path+'/order','PUT',{track_ids:['two','one']})).status,403);
  assert.equal((await call(path+'/save','PUT',null,'other')).status,404);
 }
 assert.equal((await call('/api/playlists')).body.playlists.length,2);
 assert.equal((await call('/api/search?q='+encodeURIComponent('취향'),'GET',null,null)).body.playlists.length,2);
 assert.equal((await call('/api/library','GET',null,'other')).body.saved.length,2);
 for(const playlist_ids of [[ids[0]],[ids[0],ids[0]],['missing',ids[0]],ids])assert.equal((await call('/api/library/playlists/active','PUT',{playlist_ids})).status,400);
 assert.equal((await call('/api/library/playlists/active','PUT',{playlist_ids:ids.slice(0,2)},'other')).status,400);
 const selected=locked.map(p=>p.id);assert.equal((await call('/api/library/playlists/active','PUT',{playlist_ids:selected})).status,200);
 assert.deepEqual(new Set((await call('/api/membership')).body.membership.active_ids),new Set(selected));
 for(const id of selected)assert.equal((await call('/api/playlists/'+id,'GET',null,'other')).body.tracks.length,2);
 for(const id of active)assert.equal((await call('/api/playlists/'+id,'GET',null,'other')).status,404);
 sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 assert.equal((await call('/api/library','GET',null,'other')).body.saved.length,4);
 assert.equal((await call('/api/membership')).body.membership.locked_count,0);
 sql.exec("UPDATE users SET premium_until=0 WHERE id='owner'");
 const toDelete=(await call('/api/library')).body.playlists.find(p=>p.locked).id;
 assert.equal((await call('/api/playlists/'+toDelete,'DELETE')).status,200);assert.equal((await call('/api/membership')).body.membership.owned_count,3);
});

test('listeners get one timed line while premium gets full lyrics; studio access stays owner-only',async t=>{
 const {call,sql}=await fixture(t);const lyrics='[00:03.000]처음\n[00:12.250]다음\n[01:04.000]마지막';
 sql.prepare("UPDATE tracks SET lyrics=?,lyrics_mode='synced',duration=90 WHERE id IN ('one','hidden')").run(lyrics);
 for(const user of [null,'owner','other']){const tr=(await call('/api/tracks/one','GET',null,user)).body.track;assert.equal(tr.lyrics,'');assert.equal(tr.lyrics_access,'line');}
 let line=(await call('/api/tracks/one/lyrics/line?at=0','GET',null,null)).body.line;assert.equal(line.text,'');assert.equal(line.intro,true);assert.equal(line.until,3);
 line=(await call('/api/tracks/one/lyrics/line?at=12.25','GET',null,null)).body.line;assert.equal(line.text,'다음');assert.equal(line.from,12.25);assert.equal(line.until,60);
 assert.equal((await call('/api/tracks/one/lyrics/line?at=60','GET',null,null)).status,401);
 assert.equal((await call('/api/tracks/one/lyrics/line?at=65')).body.line.text,'마지막');
 for(const q of ['', '?at=', '?at=-1','?at=NaN','?at=Infinity','?at=91'])assert.equal((await call('/api/tracks/one/lyrics/line'+q)).status,400);
 assert.equal((await call('/api/tracks/hidden/lyrics/line?at=0')).status,404);
 assert.equal((await call('/api/tracks/two/lyrics/line?at=0')).body.line,null);
 assert.equal((await call('/api/studio/tracks/one')).body.profile.lyrics,lyrics);
 assert.equal((await call('/api/studio/tracks/one','GET',null,'other')).status,404);
 sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='other'");
 const full=(await call('/api/tracks/one','GET',null,'other')).body.track;assert.equal(full.lyrics,lyrics);assert.equal(full.lyrics_access,'full');assert.ok(full.lyrics_access_until>Date.now()/1000);
 sql.exec("UPDATE users SET premium_until=unixepoch()-1 WHERE id='other'");
 const expired=(await call('/api/tracks/one','GET',null,'other')).body.track;assert.equal(expired.lyrics,'');assert.equal(expired.lyrics_access,'line');
});
