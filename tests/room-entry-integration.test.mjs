import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';
import {VoiceRoom} from '../realtime/worker-live-karaoke.js';

test('saved mode reaches every connected member and survives room reload without replacing common data',async t=>{
 const f=await liveFixture(t),r=await f.create({title:'유지할 방 제목',visibility:'private',announcement:'유지할 공지'});
 await f.call(r.root+'invite','POST',{generation:r.state.generation,profile_id:'friend',request_id:crypto.randomUUID()});
 const guest=await f.join(r);
 await f.call(r.root+'chat','POST',{generation:guest.generation,body:'유지할 채팅',request_id:crypto.randomUUID()},'other');
 const before=structuredClone(r.room.data),events=new Map([['owner',[]],['other',[]]]);
 r.room.ctx.getWebSockets=()=>[...events].map(([id,messages])=>({deserializeAttachment:()=>({id,generation:before.members[id].generation}),send:raw=>messages.push(JSON.parse(raw)),close(){throw Error('A mode change must retain membership');}}));
 r.room.notify=VoiceRoom.prototype.notify;
 for(const mode of ['talk','karaoke']){
  const revision=r.room.data.config.settings_revision||0;
  const denied=await f.call(r.root+'settings','POST',{generation:guest.generation,mode,revision},'other');assert.equal(denied.status,403);
  const changed=await f.call(r.root+'settings','POST',{generation:r.state.generation,mode,revision});assert.equal(changed.status,200,JSON.stringify(changed.body));
  for(const [id,messages] of events){const state=messages.at(-1).state;assert.equal(state.room.mode,mode);assert.equal(state.self,id);assert.equal(state.generation,before.members[id].generation);assert.equal(state.room.id,before.config.id);}
  const reopened=new VoiceRoom(r.room.ctx,r.room.env);await reopened.load();
  assert.equal(reopened.data.config.mode,mode);assert.deepEqual(reopened.data.chat,before.chat);
  for(const key of ['id','host_id','title','visibility','announcement','max_members','background'])assert.equal(reopened.data.config[key],before.config[key]);
  assert.deepEqual(Object.keys(reopened.data.members),Object.keys(before.members));
  assert.equal((await f.call(r.root+'settings','POST',{generation:r.state.generation,mode,revision})).status,409);
 }
});

for(const mode of ['talk','karaoke'])test(mode+' moderation denies self/host/non-host and applies mute, unlock and kick to other members',async t=>{
 const f=await liveFixture(t),r=await f.create({mode}),guest=await f.join(r);
 const moderate=(operation,target_id,user='owner')=>f.call(r.root+'moderate','POST',{generation:user==='owner'?r.state.generation:guest.generation,operation,target_id},user);
 for(const operation of ['mute','unlock','kick']){
  assert.equal((await moderate(operation,'owner')).status,403);
  assert.equal((await moderate(operation,'owner','other')).status,403);
  assert.equal((await moderate(operation,'other','other')).status,403);
 }
 assert.equal((await moderate('mute','other')).status,200);assert.equal(r.room.data.members.other.locked,true);
 assert.equal((await moderate('unlock','other')).status,200);assert.equal(r.room.data.members.other.locked,false);
 assert.equal((await moderate('kick','other')).status,200);assert.equal(r.room.data.members.other,undefined);assert.ok(r.room.data.members.owner);
});
for(const mode of ['talk','karaoke'])test(mode+' settings and shares use authenticated room state and real idempotent DMs',async t=>{
 const f=await liveFixture(t),r=await f.create({mode,visibility:'private'}),generation=r.state.generation;
 const settings=more=>f.call(r.root+'settings','POST',{generation,revision:r.room.data.config.settings_revision,...more});
 const denied=await f.call(r.root+'join','POST',{request_id:crypto.randomUUID()},'other');assert.equal(denied.status,403);
 const payload={generation,profile_id:'friend',request_id:crypto.randomUUID(),message:'함께 들어와요'};
 for(let n=0;n<2;n++){const sent=await f.call(r.root+'invite','POST',payload);assert.equal(sent.status,201,JSON.stringify(sent.body));}
 const messages=f.sql.prepare('SELECT body FROM direct_messages').all();assert.equal(messages.length,1);
 assert.ok(messages[0].body.includes('함께 들어와요'));assert.ok(messages[0].body.includes(mode==='talk'?'토킹룸':'라이브 노래방'));assert.ok(messages[0].body.includes('/#'+(mode==='talk'?'voice':'live')+'/'+r.state.room.id));
 const joined=await f.join(r);assert.equal(joined.room.id,r.state.room.id);
 const forbidden=await f.call(r.root+'settings','POST',{generation:joined.generation,title:'denied'},'other');assert.equal(forbidden.status,403);
 // Inject one extra active local participant to exercise the current-member floor.
 r.room.data.members.third={...r.room.data.members.other,id:'third',name:'Third',seat:null,generation:'third'};
 assert.equal((await settings({max_members:2})).status,409);
 delete r.room.data.members.third;
 const saved=await settings({title:'저장한 방 제목',announcement:'저장한 공지',visibility:'public',max_members:8,background:'night'});
 assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.room.title,'저장한 방 제목');assert.equal(saved.body.room.max_members,8);assert.equal(saved.body.room.announcement,'저장한 공지');
 const state=await f.call(r.root+'state','GET',undefined,'other');assert.equal(state.body.room.title,'저장한 방 제목');
 assert.equal((await settings({max_members:31})).status,400);
 assert.equal((await settings({announcement:'가'.repeat(201)})).status,400);
});
