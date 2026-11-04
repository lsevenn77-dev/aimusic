import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';
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
