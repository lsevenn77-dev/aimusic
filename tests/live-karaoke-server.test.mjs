import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';
import voiceWorker from '../realtime/worker-live-karaoke.js';
import {DECORATIONS} from '../shared/decorations.js';


test('live Site bridge creates karaoke rooms, lists only available consented originals and does not trust client track metadata',async t=>{
 const f=await liveFixture(t);
 f.addSong('no-rights',{rights_accepted:0});f.addSong('too-long',{duration:601});f.addSong('zero-length',{duration:0});f.addSong('cover',{kind:'cover',original_id:'one'});
 const r=await f.create(),state=r.state;
 assert.equal(state.room.mode,'karaoke');assert.equal(state.room.theme.sku,'navy');
 const search=await f.search(r,state);assert.equal(search.status,200,JSON.stringify(search.body));
 assert.deepEqual(search.body.tracks.map(x=>x.id),['one']);
 assert.deepEqual((await f.search(r,state,'')).body.tracks,[]);
 const queued=await f.command(r,state,'request',{track_id:'one',track:{id:'no-rights',title:'Forged title',duration:9999}});
 assert.equal(queued.status,200,JSON.stringify(queued.body));
 const selected=queued.body.karaoke.queue[0].track;
 assert.deepEqual([selected.id,selected.title,selected.duration],['one','Live one',120]);
 const bridge=f.calls.findLast(x=>x.path.endsWith('/karaoke')).body;
 assert.equal(bridge.input.track.id,'one');assert.equal(bridge.actor.id,'owner');
 assert.equal(queued.body.room.theme.sku,'navy');
 for(const id of ['two','three','hidden','no-rights','too-long','zero-length','cover']){
  assert.equal((await f.command(r,state,'request',{track_id:id})).status,404,id);
 }
 const directory=await f.call('/api/voice/public-rooms','GET',undefined,null);
 assert.equal(directory.status,200);assert.equal(directory.body.rooms.find(x=>x.id===state.room.id).mode,'karaoke');
});

test('live APIs reject anonymous requests, missing and stale generations, non-members and forged bridge identity',async t=>{
 const f=await liveFixture(t),r=await f.create();
 assert.equal((await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'Anonymous',mode:'karaoke'},null)).status,401);
 assert.equal((await f.call(r.root+'karaoke-search?q=Live','GET',undefined,null)).status,401);
 assert.equal((await f.call(r.root+'karaoke-search?q=Live')).status,409);
 assert.equal((await f.call(r.root+'karaoke','POST',{operation:'request',track_id:'one'})).status,409);
 assert.equal((await f.search(r,{generation:'forged-generation'})).status,409);
 assert.equal((await f.command(r,{generation:'forged-generation'},'request',{track_id:'one'})).status,409);
 assert.equal((await f.search(r,r.state,'Live','other')).status,403);
 assert.equal((await f.command(r,r.state,'call',{},'other')).status,403);
 const bad=await voiceWorker.fetch(new Request('https://voice/rooms/'+r.state.room.id+'/karaoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:{id:'owner'},input:{operation:'call'}})}),{VOICE_BRIDGE_SECRET:'local-live-karaoke-bridge-00000001'});
 assert.equal(bad.status,401);
 const joined=await f.join(r),before=r.room.data.karaoke.queue.length;
 const after=await f.command(r,joined,'request',{track_id:'one',actor:{id:'owner'}},'other');
 assert.equal(after.status,200,JSON.stringify(after.body));assert.equal(after.body.karaoke.queue[before].user_id,'other');
});

test('live queue ownership and one-singer permissions are enforced through the Site endpoints',async t=>{
 const f=await liveFixture(t),r=await f.create(),other=await f.join(r);
 assert.equal((await f.command(r,other,'request',{track_id:'one'},'other')).status,200);
 assert.equal((await f.command(r,r.state,'request',{track_id:'one'})).status,200);
 assert.equal((await f.command(r,other,'cancel',{target_id:'owner'},'other')).status,403);
 assert.equal((await f.command(r,other,'call',{},'other')).status,403);
 const called=await f.command(r,r.state,'call');assert.equal(called.status,200,JSON.stringify(called.body));
 assert.equal(called.body.karaoke.active.user_id,'other');assert.equal(called.body.karaoke.phase,'invited');
 assert.equal((await f.command(r,other,'accept',{invitation_id:called.body.karaoke.active.invitation_id},'other')).status,200);
 assert.equal((await f.command(r,other,'request',{track_id:'one'},'other')).status,409);
 assert.equal((await f.call(r.root+'publish','POST',{generation:r.state.generation})).status,403,'host cannot publish while another member is the singer');
 assert.equal((await f.call(r.root+'self-mute','POST',{generation:r.state.generation,muted:false})).status,403);
 assert.equal((await f.command(r,other,'next',{},'other')).status,403);
 assert.equal((await f.command(r,other,'start',{},'other')).status,409,'an actual ready microphone is required');
 r.room.data.members.other.pub={ready:true};r.room.data.members.other.muted=false;
 const started=await f.command(r,other,'start',{},'other');assert.equal(started.status,200,JSON.stringify(started.body));
 assert.equal(started.body.karaoke.phase,'singing');assert.ok(started.body.karaoke.startsAt>Date.now());
 const next=await f.command(r,r.state,'next');assert.equal(next.status,200);
 assert.equal(next.body.karaoke.active.user_id,'owner');assert.equal(r.room.data.members.other.pub,null);assert.equal(r.room.data.members.other.seat,null);
 assert.equal((await f.command(r,other,'finish',{},'other')).status,403,'previous singer cannot finish the next singer');
 assert.equal((await f.command(r,r.state,'finish')).status,200);
 assert.equal(r.room.data.karaoke.active,null);
});

test('live start rechecks creator permission, publication and MR availability after a request is queued',async t=>{
 const f=await liveFixture(t),r=await f.create();
 await f.command(r,r.state,'request',{track_id:'one'});await f.command(r,r.state,'call');
 await f.command(r,r.state,'accept',{invitation_id:r.room.data.karaoke.active.invitation_id});
 r.room.data.members.owner.pub={ready:true};r.room.data.members.owner.muted=false;
 for(const change of [
  "UPDATE tracks SET karaoke_at=0 WHERE id='one'",
  "UPDATE tracks SET karaoke_at=1,status='hidden' WHERE id='one'",
  "UPDATE tracks SET status='published',rights_accepted=0 WHERE id='one'",
  "UPDATE tracks SET rights_accepted=1 WHERE id='one';UPDATE karaoke_jobs SET mr_ready=0 WHERE track_id='one'"
 ]){
  f.sql.exec(change);const blocked=await f.command(r,r.state,'start');
  assert.equal(blocked.status,409,JSON.stringify(blocked.body));assert.equal(r.room.data.karaoke.phase,'ready');
 }
 f.sql.exec("UPDATE karaoke_jobs SET mr_ready=1 WHERE track_id='one'");
 assert.equal((await f.command(r,r.state,'start')).status,200);
});

test('live command snapshots preserve validated paid themes and equipped public frames',async t=>{
 const f=await liveFixture(t);
 f.sql.prepare("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('local-funds','owner','web',10000,1000000,0,'paid',0,1)").run();
 for(const sku of ['theme_aurora_night','frame_aurora_ring']){
  const bought=await f.call('/api/decorations/buy','POST',{sku,period:'P7D',request_id:crypto.randomUUID()});
  assert.equal(bought.status,201,JSON.stringify(bought.body));
  const used=await f.call('/api/decorations/inventory/'+bought.body.order.inventory_id+'/use','POST',{request_id:crypto.randomUUID()});
  assert.equal(used.status,200,JSON.stringify(used.body));
  if(sku.startsWith('frame')){
   const active=f.sql.prepare("SELECT id FROM player_inventory WHERE user_id='owner' AND item_key=? AND source='decoration'").get(sku);
   const equipped=await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:active.id});
   assert.equal(equipped.status,200,JSON.stringify(equipped.body));
  }
 }
 const r=await f.create(),other=await f.join(r);
 for(const state of [r.state,other,(await f.command(r,r.state,'request',{track_id:'one'})).body,(await f.command(r,r.state,'call')).body]){
  assert.equal(state.room.theme.sku,'theme_aurora_night');assert.deepEqual(state.room.theme.assets,DECORATIONS.theme_aurora_night.assetPaths);
  const host=state.members.find(x=>x.id==='owner');assert.equal(host.profile_frame,'frame_aurora_ring');
  assert.equal(host.profile_frame_artwork,DECORATIONS.frame_aurora_ring.assetPaths.overlay);assert.equal(host.inventory,undefined);
 }
 assert.equal((await f.call(r.root+'music-search?generation='+encodeURIComponent(other.generation)+'&q=Live','GET',undefined,'other')).status,409,'live mode cannot accidentally use the ordinary shared music queue');
});

test('ordinary talk rooms retain free seating and reject karaoke operations without creating economic entries',async t=>{
 const f=await liveFixture(t),r=await f.create({mode:'talk',seating_mode:'free'}),other=await f.join(r);
 const economy=()=>Object.fromEntries(['gold_purchases','gifts','free_gifts','diamond_ledger','stream_settlements','payout_statements','listens'].map(name=>[name,f.sql.prepare('SELECT * FROM '+name+' ORDER BY rowid').all().map(x=>({...x}))]));
 const before=economy();
 assert.equal(r.state.room.mode,'talk');assert.equal(r.state.room.seating_mode,'free');
 assert.equal((await f.search(r,r.state)).status,409);
 assert.equal((await f.command(r,r.state,'request',{track_id:'one'})).status,409);
 const seat=await f.call(r.root+'request-mic','POST',{generation:other.generation,seat:1},'other');
 assert.equal(seat.status,200,JSON.stringify(seat.body));assert.equal(seat.body.members.find(x=>x.id==='other').seat,1);
 const live=await f.create();await f.command(live,live.state,'request',{track_id:'one'});await f.command(live,live.state,'call');
 await f.command(live,live.state,'accept',{invitation_id:live.room.data.karaoke.active.invitation_id});
 live.room.data.members.owner.pub={ready:true};live.room.data.members.owner.muted=false;
 assert.equal((await f.command(live,live.state,'start')).status,200);assert.equal((await f.command(live,live.state,'finish')).status,200);
 assert.deepEqual(economy(),before,'creating, queueing, singing and leaving do not charge gold, create gifts or count as paid streaming');
});

test('live private, follower and crew restrictions use the existing admission rules and invitations link to live',async t=>{
 const f=await liveFixture(t),privateRoom=await f.create({visibility:'private'});
 const enter=(room)=>f.call(room.root+'join','POST',{request_id:crypto.randomUUID()},'other');
 assert.equal((await enter(privateRoom)).status,403);
 const invite=await f.call(privateRoom.root+'invite','POST',{generation:privateRoom.state.generation,profile_id:'friend',request_id:crypto.randomUUID()});
 assert.equal(invite.status,201,JSON.stringify(invite.body));
 const dm=f.sql.prepare("SELECT body FROM direct_messages WHERE sender_id='owner' AND recipient_id='other'").get();
 assert.match(dm.body,/라이브 노래방/);assert.ok(dm.body.includes('https://aifect.co.kr/#live/'+privateRoom.state.room.id));
 assert.equal((await enter(privateRoom)).status,200);
 const followerRoom=await f.create({visibility:'followers'});
 assert.equal((await enter(followerRoom)).status,403);
 f.sql.exec("INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','producer','producer',0)");
 assert.equal((await enter(followerRoom)).status,200);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('live-crew','owner','Local live crew',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('live-crew','owner','owner',0)");
 const crewRoom=await f.create({visibility:'crew',crew_id:'live-crew'});
 assert.equal((await enter(crewRoom)).status,403);
 f.sql.exec("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('live-crew','other','member',0)");
 assert.equal((await enter(crewRoom)).status,200);
 const directory=await f.call('/api/voice/public-rooms','GET',undefined,null);
 assert.deepEqual(directory.body.rooms,[],'private, followers and crew room metadata stays out of the public directory');
});


test('search uses a bounded metadata query without engagement aggregation or theme decoration',async t=>{
 const f=await liveFixture(t),r=await f.create(),queries=[];
 const prepare=f.DB.prepare.bind(f.DB);f.DB.prepare=q=>{queries.push(q);return prepare(q);};
 const result=await f.search(r,r.state,'Live');assert.equal(result.status,200);
 const song=queries.find(q=>q.includes('SELECT t.id,t.title'));
 assert.ok(song);assert.match(song,/LIMIT \?/);assert.doesNotMatch(song,/COUNT\(|SUM\(|FROM gifts|FROM listens|FROM comments/i);
 assert.ok(!queries.some(q=>q.includes('FROM player_inventory')),'search must not fetch room cosmetics');
 assert.deepEqual(Object.keys(result.body.tracks[0]).sort(),['artist','cover','duration','id','title']);
 for(let i=0;i<50;i++)f.addSong('bulk-'+i);
 assert.equal((await f.search(r,r.state)).body.tracks.length,40);
});
