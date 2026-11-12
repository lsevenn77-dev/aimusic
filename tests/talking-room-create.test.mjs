import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';

test('talk creation stores a suggested or trimmed title once per request',async t=>{
 const f=await liveFixture(t);
 const create=(request_id,input)=>f.call('/api/voice/rooms','POST',{request_id,visibility:'public',...input});
 for(const input of [{},{title:'   '},{title:'  자유토크방  '}]){
  const id=crypto.randomUUID(),response=await create(id,input);
  assert.equal(response.status,201,JSON.stringify(response.body));
  const room=response.body.room;
  assert.match(room.title,/[가-힣]/);
  if(input.title?.trim())assert.equal(room.title,input.title.trim());
  assert.equal(f.roomSql.prepare('SELECT title FROM voice_rooms WHERE id=?').get(id).title,room.title);
  if(!input.title){
   const retry=await create(id,{title:'  '});
   assert.equal(retry.status,201);assert.equal(retry.body.room.title,room.title);assert.equal(retry.body.room.id,id);
  }
 }
 assert.equal(f.roomSql.prepare('SELECT COUNT(*) n FROM voice_rooms').get().n,3);
 assert.equal((await create(crypto.randomUUID(),{title:'가'.repeat(61)})).status,400);
});

test('room title suggestions match each mode and exclude the current title',async t=>{
 const f=await liveFixture(t),initial=await f.call('/api/voice/options');
 assert.equal(initial.status,200);
 assert.equal(initial.body.suggested_title,initial.body.suggested_titles.talk);
 for(const mode of ['talk','karaoke']){
  let previous=initial.body.suggested_titles[mode];
  const subject=mode==='karaoke'?/노래|곡|마이크/:/토크|수다|이야기|어땠|얘기/;
  assert.match(previous,subject);
  for(let attempt=0;attempt<8;attempt++){
   const response=await f.call('/api/voice/options?'+new URLSearchParams({mode,exclude:previous}));
   assert.equal(response.status,200);
   const title=response.body.suggested_title;
   assert.equal(title,response.body.suggested_titles[mode]);
   assert.notEqual(title,previous,'regenerating avoids the visible title');
   assert.match(title,subject);
   previous=title;
  }
 }
 assert.ok(Array.isArray(initial.body.crews));
 assert.deepEqual(initial.body.themes.map(theme=>theme.sku),['basic_dark','basic_light']);
});

test('karaoke creation can fill an empty title and preserves it on retry',async t=>{
 const f=await liveFixture(t),request_id=crypto.randomUUID();
 const input={request_id,mode:'karaoke',visibility:'public',title:'   '};
 const created=await f.call('/api/voice/rooms','POST',input);
 assert.equal(created.status,201,JSON.stringify(created.body));
 assert.equal(created.body.room.mode,'karaoke');
 assert.match(created.body.room.title,/노래|곡|마이크/);
 const retried=await f.call('/api/voice/rooms','POST',input);
 assert.equal(retried.status,201);
 assert.equal(retried.body.room.id,created.body.room.id);
 assert.equal(retried.body.room.title,created.body.room.title);
 const custom=await f.call('/api/voice/rooms','POST',{...input,request_id:crypto.randomUUID(),title:'  내가 정한 노래방  '});
 assert.equal(custom.status,201);
 assert.equal(custom.body.room.title,'내가 정한 노래방');
 assert.equal(f.roomSql.prepare('SELECT COUNT(*) n FROM voice_rooms').get().n,2);
});

test('crew rooms bind the authenticated sole membership without a second selection',async t=>{
 const f=await liveFixture(t);
 const crew=await f.call('/api/crews','POST',{name:'우리 크루'});
 assert.equal(crew.status,201,JSON.stringify(crew.body));
 const crewId=crew.body.crew.id;
 const create=(more={},user='owner')=>f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),visibility:'crew',...more},user);
 const inferred=await create();
 assert.equal(inferred.status,201,JSON.stringify(inferred.body));
 assert.equal(inferred.body.room.crew_id,crewId);
 const explicit=await create({crew_id:crewId,mode:'karaoke'});
 assert.equal(explicit.status,201);
 assert.equal(explicit.body.room.crew_id,crewId);
 const mismatch=await create({crew_id:'unrelated-crew'});
 assert.equal(mismatch.status,409);
 assert.equal((await create({crew_id:crewId},'other')).status,403,'a supplied id does not grant membership');
 assert.equal(f.roomSql.prepare('SELECT COUNT(*) n FROM voice_rooms').get().n,2,'rejected requests create no room');
});

test('room creation preserves all three capacity presets and direct integer entry',async t=>{
 const f=await liveFixture(t);
 for(const max_members of [2,8,15,30,12]){
  const response=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'인원 설정 확인',visibility:'public',max_members});
  assert.equal(response.status,201,JSON.stringify(response.body));
  assert.equal(response.body.room.max_members,max_members);
  assert.equal(f.roomSql.prepare('SELECT max_members FROM voice_rooms WHERE id=?').get(response.body.room.id).max_members,max_members);
 }
});

test('room capacity rejects invalid direct input at the server',async t=>{
 const f=await liveFixture(t);
 for(const max_members of [1,31,2.5,'','eight']){
  const response=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'잘못된 인원',visibility:'public',max_members});
  assert.equal(response.status,400,JSON.stringify(response.body));
 }
 assert.equal(f.roomSql.prepare('SELECT COUNT(*) n FROM voice_rooms').get().n,0);
});
