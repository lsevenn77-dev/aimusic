import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import {generateDubbingScript,retrieveDubbingScript} from '../server/dubbing-ai.js';
import {isRandomDubbingIdea,randomDubbingIdea} from '../shared/dubbing-writing.js';
const enabled={DUBBING_ENABLED:'true',DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'local-fixture-only',TRANSCODER_TOKEN:'fixture',BUCKET:memoryBucket()};
const completed=()=>({id:'resp_test',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(sampleScript())}]}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}});
const unlock=(f,id)=>f.sql.prepare('UPDATE dubbing_generations SET updated=updated-5 WHERE id=?').run(id);

test('random marker supports hidden stories, broad combinations, and leaves specific ideas intact',async()=>{
 for(const v of ['(랜덤)','랜덤','무작위','알아서','（랜덤）','random'])assert.ok(isRandomDubbingIdea(v),v);
 for(const v of ['랜덤 사건을 조사하는 경찰','(무작위)로 뽑은 사람의 이야기',''])assert.equal(isRandomDubbingIdea(v),false);
 let seed=38;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const ideas=Array.from({length:120},()=>randomDubbingIdea({...options,genres:['이세계물'],mood:'랜덤',ending:'랜덤'},'',random));
 assert.equal(new Set(ideas).size,120);assert.ok(new Set(ideas.map(x=>x.split('에서')[0])).size>=9);
 const requests=[];
 const fake=async(url,init)=>{requests.push(JSON.parse(init.body));return Response.json({id:'resp_test',status:'queued'});};
 const previous=[{title:'이전 작품',scenes:[{description:'같은 장소'}]}];
 await generateDubbingScript(enabled,{...options,idea:'(랜덤)'},fake,previous);
 const body=requests[0],input=JSON.parse(body.input);
 assert.equal(body.background,true);assert.equal(body.store,false);
 assert.equal(input.idea,'(랜덤)');assert.ok(input.creativeDirection.length>80);assert.deepEqual(input.avoidRepeating,previous);
 await generateDubbingScript(enabled,{...options,idea:'내가 정한 이야기'},fake,previous);
 assert.equal(JSON.parse(requests[1].input).creativeDirection,undefined);
});
test('queued response survives reconnect; replay and polling never create a second AI job',async t=>{
 const calls=[];let done=false;
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,method:init.method||'GET'});return Response.json(done?completed():{id:'resp_test',status:'in_progress'});});
 const f=await fixture(t,enabled),id=crypto.randomUUID(),body={requestId:id,options};
 const first=await f.call('/api/dubbing/generations','POST',body);
 assert.equal(first.status,202);assert.equal(first.body.state,'running');
 assert.equal(f.sql.prepare('SELECT provider_id FROM dubbing_generations').get().provider_id,'resp_test');
 assert.equal((await f.call('/api/dubbing/generations','POST',body)).status,202);
 assert.equal((await f.call('/api/dubbing/generations/'+id,'GET',null,'other')).status,404);
 assert.equal(calls.length,1);
 done=true;unlock(f,id);
 const ready=(await f.call('/api/dubbing/generations/'+id)).body;
 assert.equal(ready.state,'ready');assert.deepEqual(ready.options,options);assert.equal(ready.script.title,sampleScript().title);
 assert.equal(ready.usage.totalTokens,30);assert.equal(calls.filter(c=>c.method==='POST').length,1);
 assert.equal(calls[1].url,'https://api.openai.com/v1/responses/resp_test');
 assert.equal((await f.call('/api/dubbing/generations/latest')).body.id,id);
 assert.equal((await f.call('/api/dubbing/generations/latest','GET',null,'other')).body.id,null);
 assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,0);
});
test('transient result lookup retains ID and quota, then background collector saves result without browser',async t=>{
 let phase=0,posts=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{if(init.method==='POST'){posts++;return Response.json({id:'resp_test',status:'queued'});}if(!phase)throw new Error('Temporary network error');return Response.json(completed());});
 const f=await fixture(t,enabled),id=crypto.randomUUID();
 await f.call('/api/dubbing/generations','POST',{requestId:id,options});unlock(f,id);
 assert.equal((await f.call('/api/dubbing/generations/'+id)).body.state,'running');
 assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,0);
 phase=1;unlock(f,id);
 const {dubbingGenerationInternalRoute}=await import('../server/dubbing-generation.js');
 const r=await dubbingGenerationInternalRoute(new Request('https://test/internal/dubbing-generations/reconcile',{method:'POST'}),{...enabled,DB:f.DB},'/internal/dubbing-generations/reconcile');
 assert.equal((await r.json()).checked,1);assert.equal(posts,1);
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_generations').get().state,'ready');
 assert.equal((await f.call('/internal/dubbing-generations/reconcile','POST',{})).status,401);
});
test('irrecoverable missing ID restores free turn once, retains unknown audit and never resubmits',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('private provider details');});
 const f=await fixture(t,enabled),id=crypto.randomUUID(),request={requestId:id,options};
 const result=(await f.call('/api/dubbing/generations','POST',request)).body;
 assert.equal(result.state,'unknown');assert.equal(result.recoverable,false);assert.equal(result.quotaRestored,true);
 assert.match(result.message,/복구할 수 없어요/);assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,1);
 for(let i=0;i<3;i++)await f.call('/api/dubbing/generations','POST',request);
 assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT state FROM dubbing_generations').get().state,'unknown');
 assert.ok(!JSON.stringify(result).includes('private provider details'));
});
test('expired response releases turn and invalid response URLs never receive the key',async t=>{
 let done=false;
 t.mock.method(globalThis,'fetch',async()=>done?new Response('',{status:404}):Response.json({id:'resp_test',status:'queued'}));
 const f=await fixture(t,enabled),id=crypto.randomUUID();
 await f.call('/api/dubbing/generations','POST',{requestId:id,options});done=true;unlock(f,id);
 assert.equal((await f.call('/api/dubbing/generations/'+id)).body.state,'failed');
 assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,1);
 let called=false;
 await assert.rejects(retrieveDubbingScript(enabled,'https://example.test',options,async()=>{called=true;}));
 assert.equal(called,false);
});
test('legacy failed acknowledgement with NULL result restores the actual daily quota',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Must not submit');});
 const f=await fixture(t,enabled),id=crypto.randomUUID(),at=Math.floor(Date.now()/1000);
 f.sql.prepare("INSERT INTO dubbing_generations(id,user_id,input_hash,state,result_json,created,updated) VALUES(?,'owner','legacy-null','unknown',NULL,?,?)").run(id,at,at);
 assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,0);
 for(let i=0;i<2;i++){
  const result=(await f.call('/api/dubbing/generations/'+id)).body;
  assert.equal(result.quotaRestored,true);
  assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,1);
 }
 assert.equal(calls,0);
 assert.equal(JSON.parse(f.sql.prepare('SELECT result_json FROM dubbing_generations WHERE id=?').get(id).result_json).quotaRestored,true);
});
test('lost DB acknowledgement preserves the committed provider ID instead of destroying recoverability',async t=>{
 let posts=0;t.mock.method(globalThis,'fetch',async()=>{posts++;return Response.json({id:'resp_test',status:'queued'});});
 const f=await fixture(t,enabled),prepare=f.DB.prepare;let interrupted=false;
 f.DB.prepare=function(sql){
  const query=prepare(sql);
  if(!sql.includes('SET state=?,result_json=?'))return query;
  return {bind(...args){const bound=query.bind(...args),run=bound.run;bound.run=async()=>{const result=await run();if(!interrupted){interrupted=true;throw new Error('lost database acknowledgement');}return result;};return bound;}};
 };
 const id=crypto.randomUUID();
 const result=(await f.call('/api/dubbing/generations','POST',{requestId:id,options})).body;
 assert.equal(result.state,'running');assert.equal(posts,1);
 assert.equal(f.sql.prepare('SELECT provider_id FROM dubbing_generations').get().provider_id,'resp_test');
 assert.equal((await f.call('/api/dubbing/config')).body.quota.remaining,0);
});
test('legacy completed generations can reopen with reconstructable settings and do not call AI',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('No provider needed for saved results');});
 const f=await fixture(t,enabled),id=crypto.randomUUID();
 f.sql.prepare("INSERT INTO dubbing_generations(id,user_id,input_hash,state,result_json,created,updated) VALUES(?,'owner','legacy','ready',?,0,0)").run(id,JSON.stringify({script:sampleScript()}));
 const latest=(await f.call('/api/dubbing/generations/latest')).body;
 assert.equal(latest.state,'ready');assert.equal(latest.options.roleCount,2);assert.deepEqual(latest.options.genres,options.genres);
});
