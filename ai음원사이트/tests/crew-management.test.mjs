import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

const month=30*86400;
const makeCrew=async f=>(await f.call('/api/crews','POST',{name:'First crew'})).body.crew.id;
const otherProfile=async f=>(await f.call('/api/me/profile','PUT',{name:'Guest singer',bio:''},'other')).body.profile.id;

test('crew name can change once, then only after 30 days; other edits do not restart the clock',async t=>{
 const f=await fixture(t),cid=await makeCrew(f),path='/api/crews/'+cid;
 let r=await f.call(path,'PATCH',{name:'Second crew'});
 assert.equal(r.status,200);assert.equal(r.body.crew.name,'Second crew');assert.equal(r.body.crew.can_rename,false);
 const changed=r.body.crew.name_changed_at;assert.equal(r.body.crew.name_change_available_at,changed+month);
 r=await f.call(path,'PATCH',{name:'Third crew',description:'must not save'});
 assert.equal(r.status,409);assert.match(r.body.error,/30일 뒤에 수정 가능합니다/);
 assert.equal(f.sql.prepare('SELECT description FROM crews WHERE id=?').get(cid).description,'');
 r=await f.call(path,'PATCH',{name:'Second crew',description:'Updated intro',recruiting:false});
 assert.equal(r.status,200);assert.equal(r.body.crew.description,'Updated intro');assert.equal(r.body.crew.name_changed_at,changed);
 f.sql.prepare('UPDATE crews SET name_changed_at=? WHERE id=?').run(Math.floor(Date.now()/1000)-month,cid);
 assert.equal((await f.call(path)).body.crew.can_rename,true);
 assert.equal((await f.call(path,'PATCH',{name:'Third crew'})).status,200);
});

test('only owner can rename; unique names and competing rename requests are safe',async t=>{
 const f=await fixture(t),cid=await makeCrew(f),path='/api/crews/'+cid;
 await f.call(path+'/join','POST',{},'other');
 assert.equal((await f.call(path,'PATCH',{name:'Not owner'},'other')).status,403);
 f.sql.prepare("INSERT INTO crews(id,owner_id,name,created) VALUES('taken','owner','Taken',0)").run();
 const conflict=await f.call(path,'PATCH',{name:'Taken'});assert.equal(conflict.status,409);assert.match(conflict.body.error,/이미 사용/);
 assert.equal((await f.call(path)).body.crew.name_changed_at,0);
 const results=await Promise.all([f.call(path,'PATCH',{name:'Change A'}),f.call(path,'PATCH',{name:'Change B'})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 assert.equal((await f.call(path,'PATCH',{name:'  '})).status,400);
});

test('crew invitation creates one unread DM, a push event and a live crew link; retry is idempotent',async t=>{
 const f=await fixture(t),cid=await makeCrew(f),pid=await otherProfile(f),path='/api/dm/'+pid+'/crew-invite';
 const profile=await f.call('/api/producers/'+pid);assert.equal(profile.body.invite_crew.id,cid);
 assert.equal((await f.call('/api/producers/producer')).body.invite_crew,null,'no invite on own page');
 const data={crew_id:cid,request_id:crypto.randomUUID()};
 const first=await f.call(path,'POST',data);assert.equal(first.status,201);assert.equal(first.body.peer_id,pid);
 const second=await f.call(path,'POST',data);assert.equal(second.status,200);assert.equal(second.body.message_id,first.body.message_id);
 const thread=await f.call('/api/dm/producer','GET',null,'other'),message=thread.body.messages[0];
 assert.equal(thread.body.messages.length,1);assert.equal(message.crew_invite_id,cid);assert.equal(message.read_at,0);
 assert.match(message.body,/First crew.*크루에 초대합니다/);assert.ok(message.body.includes('https://aifect.co.kr/#crew/'+cid));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM push_outbox WHERE kind='dm' AND recipient='other'").get().n,1);
 const inbox=await f.call('/api/dm','GET',null,'other');assert.equal(inbox.body.conversations[0].unread,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_members WHERE user_id='other'").get().n,0,'invitation does not auto-join');
 assert.equal((await f.call(path,'POST',{...data,crew_id:'different'})).status,409);
 await f.call('/api/crews/'+cid+'/leave','POST');
 const historic=await f.call('/api/dm/producer','GET',null,'other');assert.equal(historic.body.messages[0].crew_invite_id,null);assert.match(historic.body.messages[0].body,/First crew/);
});

test('invites enforce membership, blocking, same crew, bans, recruitment and capacity',async t=>{
 const f=await fixture(t),cid=await makeCrew(f),pid=await otherProfile(f),path='/api/dm/'+pid+'/crew-invite';
 const invite=()=>f.call(path,'POST',{crew_id:cid,request_id:crypto.randomUUID()});
 assert.equal((await f.call(path,'POST',{crew_id:cid,request_id:crypto.randomUUID()},null)).status,401);
 assert.equal((await f.call('/api/dm/producer/crew-invite','POST',{crew_id:cid,request_id:crypto.randomUUID()},'other')).status,403);
 assert.equal((await f.call('/api/dm/producer/crew-invite','POST',{crew_id:cid,request_id:crypto.randomUUID()})).status,400);
 await f.call('/api/crews/'+cid,'PATCH',{recruiting:false});assert.equal((await invite()).status,409);
 await f.call('/api/crews/'+cid,'PATCH',{recruiting:true});
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");assert.equal((await invite()).status,403);
 f.sql.exec('DELETE FROM user_blocks');
 f.sql.prepare('INSERT INTO crew_bans(crew_id,user_id,created) VALUES(?,?,0)').run(cid,'other');assert.equal((await invite()).status,403);
 f.sql.exec('DELETE FROM crew_bans');
 await f.call('/api/crews/'+cid+'/join','POST',{},'other');assert.equal((await invite()).status,409);
 assert.equal((await f.call('/api/producers/'+pid)).body.invite_crew,null);
 await f.call('/api/crews/'+cid+'/leave','POST',{},'other');
 for(let i=0;i<9;i++){
  f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run('member'+i,'member'+i+'@test.invalid','Member');
  f.sql.prepare("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES(?,?,'member',0)").run(cid,'member'+i);
 }
 assert.equal((await invite()).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,0);
});
