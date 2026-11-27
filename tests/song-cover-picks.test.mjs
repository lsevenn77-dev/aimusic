import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';

async function setup(t){
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id IN ('one','two'); INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0)");
 const seed=(id,{original='one',mode='solo',parent=null,open=0,status='published',created=1}={})=>f.sql.prepare("INSERT INTO tracks(id,user_id,producer_id,artist_id,title,kind,original_id,cover_mode,duet_parent_id,duet_open,status,genre,ai_tool,rights_accepted,original_ext,original_bytes,created) VALUES(?,'other','producer','artist','동일한 제목','cover',?,?,?,?,?,'Rock','',1,'wav',128,?)").run(id,original,mode,parent,open,status,created);
 const pick=(cover_id,expected_revision=0,user='owner',original='one')=>f.call('/api/tracks/'+original+'/cover-pick','PUT',{cover_id,expected_revision},user);
 const list=(extra='',user='owner')=>f.call('/api/tracks/one/covers?view=all'+extra,'GET',undefined,user);
 return {...f,seed,pick,list};
}
test('PICK checks composer ownership, login, exact original, completion and publication',async t=>{
 const f=await setup(t);f.seed('solo');f.seed('other-song',{original:'two'});f.seed('invitation',{mode:'duet',open:1});f.seed('closed-invitation',{mode:'duet'});f.seed('joined',{mode:'duet',parent:'invitation'});f.seed('hidden-cover',{status:'hidden'});
 assert.equal((await f.pick('solo',0,null)).status,401);assert.equal((await f.pick('solo',0,'other')).status,403);
 for(const id of ['other-song','invitation','closed-invitation','one'])assert.equal((await f.pick(id)).status,400,id);
 assert.equal((await f.pick('hidden-cover')).status,404);
 f.sql.exec("UPDATE tracks SET user_id='other' WHERE id='one'");
 assert.equal((await f.pick('solo',0,'other')).status,403,'uploader is not the linked composer');assert.equal((await f.pick('solo')).status,403,'composer needs track management ownership');
 f.sql.exec("UPDATE tracks SET user_id='owner' WHERE id='one'");
 const first=await f.pick('solo');assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.cover_id,'solo');assert.equal(first.body.revision,1);
 const joined=await f.pick('joined',1);assert.equal(joined.status,200);assert.equal(joined.body.cover_id,'joined');assert.equal(joined.body.revision,2);
});
test('replacement is atomic and revision checked; stale writes cannot clear a newer PICK',async t=>{
 const f=await setup(t);f.seed('a');f.seed('b');
 const first=await Promise.all([f.pick('a'),f.pick('b')]);assert.deepEqual(first.map(r=>r.status).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT count(*) n FROM song_cover_picks').get().n,1);
 const before=f.sql.prepare('SELECT * FROM song_cover_picks').get();assert.equal((await f.pick(null,0)).status,409);assert.deepEqual(f.sql.prepare('SELECT * FROM song_cover_picks').get(),before);
 assert.equal((await f.pick(null,1)).status,200);assert.equal((await f.pick('b',2)).body.revision,3);assert.equal((await f.pick('a',1)).status,409);
});
test('PICK outside page one is promoted once; ranks, total and subsequent pages stay correct',async t=>{
 const f=await setup(t);for(let i=0;i<107;i++)f.seed('work-'+String(i).padStart(3,'0'),{created:i+1});
 assert.equal((await f.list()).body.covers[0].id,'work-106');assert.equal((await f.pick('work-000')).status,200);
 let offset=0,result=[];do{const r=await f.list('&offset='+offset+'&pick_revision=1');assert.equal(r.status,200);const d=r.body;assert.equal(d.total,107);assert.equal(d.counts.all,107);result.push(...d.covers);offset=d.next_offset;}while(offset!==null);
 assert.equal(result.length,107);assert.equal(new Set(result.map(t=>t.id)).size,107);assert.equal(result[0].id,'work-000');assert.equal(result[0].rank,107);assert(result[0].is_composer_pick);assert.deepEqual(result.slice(1).map(t=>t.rank),Array.from({length:106},(_,i)=>i+1));
 const recent=(await f.call('/api/tracks/one/covers?view=recent')).body;assert.equal(recent.covers[0].id,'work-000');assert.equal(recent.pick.cover_id,result[0].id);
 await f.pick(null,1);assert.equal((await f.list('&offset=50&pick_revision=1')).status,409);assert.equal((await f.list()).body.covers[0].id,'work-106');
});
test('details and feeds expose PICK while only an opted-in original cover ranking changes display order',async t=>{
 const f=await setup(t);f.seed('selection',{created:1});f.seed('popular',{created:2});
 f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','popular',2)");
 assert.equal((await f.pick('selection')).status,200);
 const detail=async user=>(await f.call('/api/tracks/selection','GET',undefined,user)).body.track;
 assert.equal((await detail('owner')).can_manage_cover_pick,true);
 for(const user of [null,'other']){
  const track=await detail(user);
  assert.ok(track.is_composer_pick);
  assert.equal(track.cover_pick_revision,1);
  assert.ok(!track.can_manage_cover_pick);
  assert.equal((await f.pick(null,1,user)).status,user?403:401);
 }
 const read=async(path,key)=>(await f.call(path,'GET',undefined,null)).body[key];
 const legacy='/api/tracks/one/covers',feed='/api/community?kind=cover';
 assert.deepEqual((await read(legacy,'covers')).map(x=>x.id),['popular','selection']);
 assert.deepEqual((await read(feed,'tracks')).map(x=>[x.id,!!x.is_composer_pick]),[['popular',false],['selection',true]]);
 const publicHTML=async path=>(await worker.fetch(new Request('https://aifect.test'+path),{DB:f.DB},{})).text();
 assert.match(await publicHTML('/music?kind=cover'),/data-pick-title="selection"[^<]*><span[^>]+>[^<]+<\/span><span class="composer-pick-badge"/);
 assert.match(await publicHTML('/music/selection'),/<h1>.*composer-pick-badge/);
 const popular=async()=>(await read(legacy+'?promote_pick=1','covers')).map(x=>[x.id,x.rank,x.likes,x.plays]);
 assert.deepEqual(await popular(),[['selection',2,0,0],['popular',1,1,0]]);
 f.sql.exec("UPDATE likes SET created=unixepoch(); INSERT INTO likes(user_id,track_id,created) VALUES('owner','selection',unixepoch())");
 const community=()=>read('/api/community/rankings?category=cover','rows');
 const ranked=await community();
 assert.ok(ranked.some(row=>row.id==='selection'&&row.is_composer_pick));
 assert.equal((await f.pick(null,1)).status,200);
 assert.deepEqual(await popular(),[['popular',1,1,0],['selection',2,1,0]]);
 const cleared=await community();
 assert.deepEqual(cleared.map(row=>[row.id,row.score]),ranked.map(row=>[row.id,row.score]));
 assert.ok(cleared.every(row=>!row.is_composer_pick));
 assert.ok(!(await detail(null)).is_composer_pick);
});
test('hiding/deleting a work, original or parent clears PICK; republication never reselects',async t=>{
 for(const change of ["UPDATE tracks SET status='hidden' WHERE id='solo'","UPDATE tracks SET status='deleted' WHERE id='solo'","DELETE FROM tracks WHERE id='solo'","UPDATE tracks SET status='hidden' WHERE id='one'","UPDATE tracks SET karaoke_at=0 WHERE id='one'","UPDATE tracks SET cover_mode='duet',duet_open=1 WHERE id='solo'"]){
  const f=await setup(t);f.seed('solo');await f.pick('solo');f.sql.exec(change);assert.equal(f.sql.prepare('SELECT cover_id FROM song_cover_picks').get().cover_id,null,change);
  f.sql.exec("UPDATE tracks SET status='published',karaoke_at=1 WHERE id='one'; UPDATE tracks SET status='published',cover_mode='solo',duet_open=0 WHERE id='solo'");assert.equal((await f.list()).body.pick.cover_id,null);
 }
 const f=await setup(t);f.seed('parent',{mode:'duet',open:1});f.seed('child',{mode:'duet',parent:'parent'});await f.pick('child');f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='parent'");assert.equal(f.sql.prepare('SELECT cover_id FROM song_cover_picks').get().cover_id,null);
});
test('viewer blocks preserve the public PICK, rank and count without mutating global selection',async t=>{
 const f=await setup(t);f.seed('solo');await f.pick('solo');const before=f.sql.prepare('SELECT * FROM song_cover_picks').get();f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',1)");
 const blocked=(await f.list()).body;assert.equal(blocked.pick.cover_id,'solo');assert.equal(blocked.counts.all,1);assert.equal(blocked.covers[0].rank,1);assert.deepEqual(f.sql.prepare('SELECT * FROM song_cover_picks').get(),before);assert.equal((await f.list('',null)).body.pick.cover_id,'solo');
});
test('visibility changing between validation and write preserves the previous valid PICK',async t=>{
 const f=await setup(t);f.seed('a');f.seed('b');await f.pick('a');const prepare=f.DB.prepare;
 f.DB.prepare=function(sql){if(sql.startsWith('INSERT INTO song_cover_picks'))f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='b'");return prepare(sql);};
 assert.equal((await f.pick('b',1)).status,409);assert.equal((await f.list()).body.pick.cover_id,'a');
});
