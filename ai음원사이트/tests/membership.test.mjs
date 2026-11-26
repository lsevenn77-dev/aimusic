import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('concurrent distinct titles are unlimited and never leave orphan tracks',async t=>{
 const {call,sql}=await fixture(t);
 const attempts=await Promise.all(Array.from({length:12},(_,i)=>call('/api/playlists','POST',{name:'동시 요청 '+i,track_ids:['one']})));
 assert.ok(attempts.every(r=>r.status===201));assert.equal(sql.prepare('SELECT count(*) n FROM playlists').get().n,12);assert.equal(sql.prepare('SELECT count(*) n FROM playlist_tracks').get().n,12);
});
test('premium expiry preserves every owned playlist and public bookmark without quota locks',async t=>{
 const {call,sql}=await fixture(t);sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 const ids=[];for(let i=0;i<12;i++)ids.push((await call('/api/playlists','POST',{name:'취향 '+i,is_public:true,track_ids:['one','two']})).body.id);
 await call('/api/playlists/'+ids[0]+'/save','PUT',null,'other');sql.exec("UPDATE users SET premium_until=0 WHERE id='owner'");
 const m=(await call('/api/membership')).body.membership;assert.equal(m.playlist_limit,null);assert.equal(m.owned_count,12);assert.equal(m.locked_count,0);
 assert.ok((await call('/api/library')).body.playlists.every(p=>!p.locked));assert.equal((await call('/api/library','GET',null,'other')).body.playlists.length,1);
 for(const pid of ids)assert.equal((await call('/api/playlists/'+pid,'GET',null,'other')).body.tracks.length,2);
});

test('listeners get one timed line while premium gets full lyrics; studio access stays owner-only',async t=>{
 const {call,sql}=await fixture(t);const lyrics='[00:03.000]처음\n[00:12.250]다음\n[01:04.000]마지막';
 sql.prepare("UPDATE tracks SET lyrics=?,lyrics_mode='synced',duration=90 WHERE id IN ('one','hidden')").run(lyrics);
 for(const user of [null,'owner','other']){const tr=(await call('/api/tracks/one','GET',null,user)).body.track;assert.equal(tr.lyrics,'');assert.equal(tr.lyrics_access,'line');}
 for(const user of [null,'other']){
  const publicText=await call('/api/tracks/one/lyrics/text','GET',null,user);
  assert.equal(publicText.status,200);assert.deepEqual(publicText.body.lines,['처음','다음','마지막']);
 }
 assert.equal((await call('/api/tracks/hidden/lyrics/text','GET',null,null)).status,404);
 assert.deepEqual((await call('/api/tracks/two/lyrics/text','GET',null,null)).body.lines,[]);
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
