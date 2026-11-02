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
