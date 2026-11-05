import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture} from './fixture.mjs';
import {homeTracks,homePlaylists} from '../server/home-shelves.js';

const at=1800000000;
const insert=(sql,id,pub,owner='owner',created=pub)=>sql.prepare(`INSERT INTO tracks
 (id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,duration,first_published_at)
 VALUES(?,?,'artist','producer',?,'Rock','QA',1,'wav',128,?,'published',60,?)`).run(id,owner,id,created,pub);
function measured(db){
 const stats={reads:0,batches:0,scored:[]};
 const DB={batch:s=>{stats.batches++;return db.batch(s);},prepare(sql){const stmt=db.prepare(sql);return {bind(...args){
  if(sql.includes(') score'))stats.scored.push(JSON.parse(args.findLast(a=>typeof a==='string'&&a.startsWith('['))).length);
  const bound=stmt.bind(...args);return {...bound,all:()=>{stats.reads++;return bound.all();}};
 }};}};
 return {DB,stats};
}
test('home release pagination is by first public time; actor blocks and invalid audio are filtered before display',async t=>{
 const f=await fixture(t),{DB,stats}=measured(f.DB);
 for(let i=0;i<80;i++)insert(f.sql,'blocked-'+i,at-i,'other');
 insert(f.sql,'old-draft-new-release',at-81,'owner',at-9000000);
 insert(f.sql,'also-new',at-900);insert(f.sql,'old-but-liked',at-45*86400,'owner',at-10);
 insert(f.sql,'bad-audio',at-82);insert(f.sql,'removed-song',at-83);insert(f.sql,'future',at+10);
 f.sql.exec("UPDATE tracks SET duration=0 WHERE id='bad-audio'; UPDATE tracks SET status='removed' WHERE id='removed-song'; INSERT INTO likes(user_id,track_id,created) VALUES('owner','old-but-liked',0)");
 const result=await homeTracks({DB,AIFECT_BLOCKED:['other']},8,at);
 assert.deepEqual(result.releases,['old-draft-new-release','also-new']);assert.equal(result.tracks[0].id,'old-but-liked');
 assert.deepEqual(new Set(result.tracks.map(t=>t.id)),new Set(['old-but-liked',...result.releases]));
 assert.equal(stats.batches,1);assert.ok(stats.scored.length>=2&&stats.scored.length<=3);assert.ok(stats.reads<=4);
 // A hit outside the recent-release window can enter through real activity.
 for(let i=0;i<220;i++)insert(f.sql,'new-'+i,at-1000-i);
 assert.equal((await homeTracks({DB:f.DB},16,at)).tracks[0].id,'old-but-liked');
});
test('home playlist refill, membership and preview all use playable, unblocked entries',async t=>{
 const f=await fixture(t),{DB,stats}=measured(f.DB);
 insert(f.sql,'playable',at);insert(f.sql,'blocked-member',at,'other');insert(f.sql,'no-audio',at);
 f.sql.exec("UPDATE tracks SET duration=0 WHERE id='no-audio'; INSERT INTO playlists(id,user_id,name,is_public,created) VALUES('valid','owner','valid',1,1),('private','owner','private',0,2),('locked','owner','locked',1,3)");
 for(const [i,id] of ['blocked-member','no-audio','hidden','playable'].entries())f.sql.prepare("INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('valid',?,?,0)").run(id,i);
 for(let i=0;i<100;i++)f.sql.prepare("INSERT INTO playlists(id,user_id,name,is_public,created) VALUES(?,'other','ignored',1,?)").run('empty-'+i,100+i);
 const found=await homePlaylists({DB,AIFECT_BLOCKED:['other']},'owner');
 assert.deepEqual(found.map(p=>p.id),['valid']);assert.equal(found[0].tracks,1);assert.equal(found[0].duration,60);
 assert.deepEqual(found[0].covers.map(t=>t.id),['playable']);assert.equal(stats.reads,5);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='playable'");
 assert.deepEqual(await homePlaylists({DB:f.DB,AIFECT_BLOCKED:['other']},'owner'),[]);
});
test('home empty data, public API, and deleted accounts do not leak fallback content',async t=>{
 const f=await fixture(t);const path='/api/discovery?home=1&slots=16';
 assert.deepEqual((await f.call(path)).body,{tracks:[],releases:[]});
 insert(f.sql,'deleted-owner',at,'other');f.sql.exec("UPDATE users SET provider='deleted' WHERE id='other'");
 assert.deepEqual(await homeTracks({DB:f.DB},16,at),{tracks:[],releases:[]});
});
test('two-row selection preserves scores, fills distinct shelves, then reuses real songs when sparse',()=>{
 const c=vm.createContext({Map,console});vm.runInContext(readFileSync('dist/home.js','utf8'),c);
 const tracks=Array.from({length:65},(_,i)=>({id:'t'+i,artist_id:'a'+(i%8),genre:'g'+(i%5),moods:['m'+(i%3)],likes:i===62?3:0}));
 const data={tracks:[...tracks,tracks[0]],releases:tracks.slice(0,16).map(t=>t.id)};
 for(const [music,discovery] of [[6,6],[10,14],[16,14]]){
  const out=c.homeSelectMusic(data,{music,discovery},['t64']);
  assert.deepEqual(Array.from(out.latest,t=>t.id),data.releases.slice(0,music));
  assert.equal(out.recommended[0].id,'t62');assert.equal(out.recommended.length,music);assert.equal(out.discovery.length,discovery);
  assert.equal(new Set(Object.values(out).flat().map(t=>t.id)).size,music*2+discovery);
  assert.ok(new Set(out.discovery.map(t=>t.artist_id)).size>=Math.min(5,discovery));
 }
 for(const count of [0,1,3]){const items=tracks.slice(0,count);const out=c.homeSelectMusic({tracks:[...items,...items],releases:items.map(t=>t.id)},{music:10,discovery:14});
  for(const shelf of Object.values(out)){assert.equal(shelf.length,count);assert.equal(new Set(shelf.map(t=>t.id)).size,count);}}
});

