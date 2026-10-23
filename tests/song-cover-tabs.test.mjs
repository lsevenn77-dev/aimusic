import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
test('original cover filters apply before the limit and ranking follows qualified views, not likes',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'");
 const seed=(id,mode,status='published')=>f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,kind,original_id,cover_mode,status,genre,ai_tool,rights_accepted,original_ext,original_bytes,created) VALUES(?,'owner','producer','artist',?,'cover','one',?,?,'Rock','',1,'wav',128,1)").run(id,id,mode,status);
 seed('solo-one','solo');seed('duet-one','duet');seed('hidden-cover','solo','hidden');
 for(let i=0;i<105;i++)seed('duet-'+i,'duet');
 f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('other','solo-one',0)");
 for(let i=0;i<3;i++)f.sql.prepare("INSERT INTO listens(id,track_id,listener,day,started,qualified) VALUES(?,'duet-one',?,?,0,1)").run('play'+i,'person'+i,'2026-10-15');
 const solo=await f.call('/api/tracks/one/covers?mode=solo&sort=recent');assert.deepEqual(solo.body.covers.map(t=>t.id),['solo-one']);
 assert.deepEqual(solo.body.counts,{all:107,solo:1,duet:106});
 const duet=await f.call('/api/tracks/one/covers?mode=duet&sort=recent');assert.equal(duet.body.covers.length,100);assert(duet.body.covers.every(t=>t.cover_mode==='duet'));
 const ranking=await f.call('/api/tracks/one/covers?sort=plays');assert.equal(ranking.body.covers[0].id,'duet-one');assert.equal(ranking.body.covers[0].plays,3);
 assert.equal((await f.call('/api/tracks/one/covers?mode=bad')).status,400);
});

test('an open duet appears in all/duet/ranking and solo has an accurate zero count',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; UPDATE tracks SET kind='cover',original_id='one',cover_mode='duet',duet_open=1 WHERE id='two'");
 for(const mode of ['all','duet']){const d=(await f.call('/api/tracks/one/covers?mode='+mode)).body;assert.deepEqual(d.covers.map(x=>x.id),['two']);assert.deepEqual(d.counts,{all:1,solo:0,duet:1});}
 assert.equal((await f.call('/api/tracks/one/covers?mode=solo')).body.covers.length,0);
 const ranked=(await f.call('/api/tracks/one/covers?sort=plays')).body;assert.equal(ranked.covers[0].duet_open,1);
});
test('stored automatic vocalist labels no longer affect karaoke lyrics or studio responses',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','job','ready',1,'ready','[]',0,0); INSERT INTO karaoke_vocal_parts(track_id,job_id,version,state,result_json,updated) VALUES('one','job',1,'done','{\"version\":1,\"arrangement\":\"mixed_duet\",\"lines\":[\"male\",\"female\"]}',0)");
 const song=await f.call('/api/karaoke/one');assert.equal(song.status,200);assert.deepEqual(song.body.words,[]);assert.equal(song.body.mr,'/media/one/mr');assert(!('vocal_parts' in song.body));
 assert(!('vocal_parts_status' in (await f.call('/api/karaoke')).body.tracks[0]));
 assert(!('vocal_parts_status' in (await f.call('/api/studio/tracks/one/karaoke')).body.karaoke));
});
