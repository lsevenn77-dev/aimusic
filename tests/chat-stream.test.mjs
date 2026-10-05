import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {chatEventStream} from '../server/chat-stream.js';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function nextEvent(reader){const value=await reader.read();return value.done?'':new TextDecoder().decode(value.value);}
async function open(f,query,user='owner',headers={}){
 return worker.fetch(new Request('https://aifect.test/api/chat/events'+query,{headers:{cookie:'aifect_session='+user,...headers}}),{DB:f.DB},{waitUntil(){}});
}
async function crew(t){const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Other',0)");f.cid=(await f.call('/api/crews','POST',{name:'Realtime',description:'',interests:''})).body.crew.id;return f;}

test('stream sends changes only, keeps an idle heartbeat and stops all reads on cancellation',async()=>{
 let revision=1,reads=0;const response=chatEventStream(new Request('https://aifect.test'),async()=>{reads++;return {revision};},{intervalMs:5,durationMs:1000}),reader=response.body.getReader();
 assert.match(await nextEvent(reader),/event: change/);assert.match(await nextEvent(reader),/event: heartbeat/);
 revision++;assert.match(await nextEvent(reader),/event: change/);await reader.cancel();const count=reads;await pause(20);assert.equal(reads,count);
});
test('streams terminate on revocation, errors, request abort and bounded rotation',async()=>{
 for(const kind of ['revoke','error','abort','rotate']){
  const abort=new AbortController();let calls=0;
  const response=chatEventStream(new Request('https://aifect.test',{signal:abort.signal}),async()=>{if(++calls===1)return {ok:true};if(kind==='revoke')return null;if(kind==='error')throw Error('private DB error');return {ok:true};},{intervalMs:5,durationMs:kind==='rotate'?20:1000}),reader=response.body.getReader();
  await nextEvent(reader);if(kind==='abort')abort.abort();let text='';for(;;){const value=await nextEvent(reader);if(!value)break;text+=value;}
  if(kind==='revoke')assert.match(text,/event: revoked/);if(kind==='error'){assert.match(text,/event: retry/);assert.doesNotMatch(text,/private DB/);}if(kind==='rotate')assert.match(text,/event: rotate/);
  const count=calls;await pause(15);assert.equal(calls,count);
 }
});
test('stream authorization rejects guests, non-members, invalid peers and cross-origin requests',async t=>{
 const f=await crew(t);
 assert.equal((await open(f,'','')).status,401);
 assert.equal((await open(f,'?crew='+f.cid,'other')).status,403);
 assert.equal((await open(f,'?crew='+f.cid+'&peer=other-profile')).status,400);
 assert.equal((await open(f,'?peer=producer')).status,404);
 assert.equal((await open(f,'?peer=missing')).status,404);
 assert.equal((await open(f,'','owner',{Origin:'https://evil.test'})).status,403);
});
test('crew connection sees saved messages and role changes then revokes a kicked member',async t=>{
 const f=await crew(t),room='/api/crews/'+f.cid;
 await f.call(room+'/join','POST',{},'other');
 const response=await open(f,'?crew='+f.cid,'other'),reader=response.body.getReader();t.after(()=>reader.cancel());
 assert.match(response.headers.get('content-type'),/text\/event-stream/);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.match(await nextEvent(reader),/event: change/);
 const rid=crypto.randomUUID();await f.call(room+'/messages','POST',{body:'hi',request_id:rid});assert.match(await nextEvent(reader),/event: change/);
 assert.equal((await f.call(room+'/messages','GET',null,'other')).body.messages.at(-1).request_id,rid);
 await f.call(room+'/members/other-profile','PATCH',{role:'manager'});assert.match(await nextEvent(reader),/event: change/);
 await f.call(room+'/members/other-profile','DELETE');assert.match(await nextEvent(reader),/event: revoked/);assert.equal(await nextEvent(reader),'');
});

test('crew stream state follows the current join boundary across an immediate rejoin',async t=>{
 t.mock.method(Date,'now',()=>1790910000000);
 const f=await crew(t),room='/api/crews/'+f.cid;
 await f.call(room+'/messages','POST',{body:'Before joining',request_id:crypto.randomUUID()});
 const first=(await f.call(room+'/join','POST',{},'other')).body.membership;
 const states=[],prepare=f.DB.prepare;
 f.DB.prepare=q=>{const statement=prepare(q);return {bind(...args){const bound=statement.bind(...args);return {...bound,async first(){const result=await bound.first();if(q.includes('SELECT cm.role,cm.joined_sequence'))states.push(result);return result;}};}};};
 const reader=(await open(f,'?crew='+f.cid,'other')).body.getReader();t.after(()=>reader.cancel());
 assert.match(await nextEvent(reader),/event: change/);
 assert.equal(states.at(-1).joined_sequence,first.joined_sequence);
 const initialHistory=(await f.call(room+'/messages?after=1','GET',null,'other')).body.messages;
 assert.equal(initialHistory.length,1);assert.equal(initialHistory[0].kind,'system');
 assert.equal(states.at(-1).sequence,initialHistory[0].sequence);
 await f.call(room+'/leave','POST',{},'other');
 await f.call(room+'/messages','POST',{body:'While absent',request_id:crypto.randomUUID()});
 const next=(await f.call(room+'/join','POST',{},'other')).body.membership;
 assert.ok(next.joined_sequence>first.joined_sequence);
 assert.match(await nextEvent(reader),/event: change/);
 assert.equal(states.at(-1).joined_sequence,next.joined_sequence);
 const current=(await f.call(room+'/messages?after='+initialHistory[0].sequence,'GET',null,'other')).body.messages;
 assert.equal(current.length,1);assert.equal(current[0].kind,'system');
 assert.equal(states.at(-1).sequence,current[0].sequence);
});
test('DM notifications stay within the selected peer; revoked sessions stop ongoing streams',async t=>{
 const f=await crew(t);f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@test.invalid','Third',0);INSERT INTO producers(id,user_id,name,created) VALUES('third-profile','third','Third',0)");
 const reader=(await open(f,'?peer=other-profile')).body.getReader();t.after(()=>reader.cancel());await nextEvent(reader);
 await f.call('/api/dm/third-profile','POST',{body:'not this room',request_id:crypto.randomUUID()});assert.match(await nextEvent(reader),/event: heartbeat/);
 await f.call('/api/dm/other-profile','POST',{body:'this room',request_id:crypto.randomUUID()});assert.match(await nextEvent(reader),/event: change/);
 f.sql.exec("DELETE FROM sessions WHERE user_id='owner'");assert.match(await nextEvent(reader),/event: revoked/);
});
test('notification lookups use covering sequence indexes without temporary sorts',async t=>{
 const f=await fixture(t);
 for(const q of ["SELECT rowid FROM crew_messages WHERE crew_id='x' ORDER BY rowid DESC LIMIT 1","SELECT rowid FROM crew_messages WHERE crew_id='x' AND rowid>=4 ORDER BY rowid DESC LIMIT 1","SELECT rowid FROM direct_messages WHERE sender_id='x' AND recipient_id='y' ORDER BY rowid DESC LIMIT 1","SELECT rowid FROM direct_messages WHERE recipient_id='x' ORDER BY rowid DESC LIMIT 1","SELECT rowid FROM direct_messages WHERE sender_id='x' ORDER BY rowid DESC LIMIT 1"]){const plan=f.sql.prepare('EXPLAIN QUERY PLAN '+q).all().map(x=>x.detail).join(' ');assert.match(plan,/COVERING INDEX.*sequence/);assert.doesNotMatch(plan,/TEMP B-TREE|SCAN /);}
});

test('a selected DM stream notifies read receipts and the incremental response does not leak another peer',async t=>{
 const f=await crew(t);f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@test.invalid','Third',0);INSERT INTO producers(id,user_id,name,created) VALUES('third-profile','third','Third',0)");
 const message=(await f.call('/api/dm/other-profile','POST',{body:'read this',request_id:crypto.randomUUID()})).body.message;
 const reader=(await open(f,'?peer=other-profile')).body.getReader();t.after(()=>reader.cancel());await nextEvent(reader);
 await f.call('/api/dm/producer','PATCH',{},'other');assert.match(await nextEvent(reader),/event: change/);
 const increment=(await f.call('/api/dm/other-profile?after='+message.sequence)).body;
 assert.deepEqual(increment.messages,[]);assert.equal(increment.read_receipt.sequence,message.sequence);assert.ok(increment.read_receipt.read_at>0);
 assert.equal((await f.call('/api/dm/third-profile')).body.read_receipt.sequence,0);
});
