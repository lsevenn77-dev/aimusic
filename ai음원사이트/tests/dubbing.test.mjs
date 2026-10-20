import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import {dubbingOptions,validateDubbingScript,dubbingTimeline,DUBBING_MODEL} from '../shared/dubbing.js';
import {generateDubbingScript} from '../server/dubbing-ai.js';
import {dubbingRoute} from '../server/dubbing.js';
import {deleteAccount,drainDeletedFiles} from '../server/account-safety.js';
const enabled={DUBBING_ENABLED:'true'};
const create=(call,body={},who='owner')=>call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript(),...body},who);
function mockResponse(){return {id:'response-local-test',status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify(sampleScript())}]}],usage:{input_tokens:10,output_tokens:20,total_tokens:30}};}

test('script contract checks references, exact roles, stable IDs and bounded timeline',()=>{
 const s=sampleScript(),v=validateDubbingScript(s,options);
 assert.equal(v.lines[0].id,s.lines[0].id);assert.equal(dubbingTimeline(v).lines[1].start,16);
 for(const mutate of [
  x=>x.roles.pop(),x=>x.lines[1].id=x.lines[0].id,x=>x.lines[0].roleId='missing',
  x=>x.soundCues[0].lineId='missing',x=>x.soundCues[0].volume=1,x=>x.lines[0].durationSeconds=NaN,
  x=>x.soundCues[0].generationSeconds=1,x=>x.lines=[]
 ]){const x=structuredClone(s);mutate(x);assert.throws(()=>validateDubbingScript(x,options));}
 const long=structuredClone(s);long.lines=Array.from({length:10},(_,i)=>({...s.lines[i%2],id:'line'+i,durationSeconds:35}));long.soundCues=[];assert.throws(()=>validateDubbingScript(long,options),/5분/);
 assert.throws(()=>dubbingOptions({...options,genres:['일상','감동','액션']}));
});
test('manual create/edit is private, revision-checked, R2-backed and idempotent',async t=>{
 const bucket=memoryBucket(),{call,sql}=await fixture(t,{...enabled,BUCKET:bucket}),pid=crypto.randomUUID(),script=sampleScript();
 const a=await create(call,{id:pid,script});assert.equal(a.status,201,JSON.stringify(a));
 assert.equal(a.body.project.canEdit,true);assert.equal(bucket.objects.size,1);assert.match([...bucket.objects.keys()][0],/^dubbing\/owner\//);
 assert.equal((await call('/api/dubbing/projects/'+pid,'GET',null,'other')).status,404);
 assert.equal((await call('/api/dubbing/projects/'+pid,'GET',null,null)).status,404);
 assert.equal((await create(call,{id:pid,script})).status,200);assert.equal(bucket.objects.size,1);
 const changed=structuredClone(script);changed.title='새로운 제목';
 const edits=await Promise.all([call('/api/dubbing/projects/'+pid,'PUT',{revision:1,options,script:changed}),call('/api/dubbing/projects/'+pid,'PUT',{revision:1,options,script:changed})]);
 assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);assert.equal(bucket.objects.size,2);
 assert.equal(sql.prepare('SELECT revision FROM dubbing_projects WHERE id=?').get(pid).revision,2);
 assert.equal((await call('/api/dubbing/projects/'+pid,'PUT',{revision:2,options,script},'other')).status,404);
});
test('failed R2 persistence never creates a partially saved work',async t=>{
 const {call,sql}=await fixture(t,{...enabled,BUCKET:{async put(){throw new Error('bucket unavailable');}}});
 assert.equal((await create(call)).status,503);assert.equal(sql.prepare('SELECT COUNT(*) n FROM dubbing_projects').get().n,0);
});
test('publish requires rights; public catalogue excludes private works and preserves privacy',async t=>{
 const {call}=await fixture(t,{...enabled,BUCKET:memoryBucket()}),p=(await create(call)).body.project;
 assert.equal((await call('/api/dubbing/projects?tab=latest','GET',null,null)).body.projects.length,0);
 assert.equal((await call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:false})).status,400);
 assert.equal((await call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true})).status,200);
 const list=await call('/api/dubbing/projects?tab=latest','GET',null,null);assert.equal(list.body.projects.length,1);
 const detail=await call('/api/dubbing/projects/'+p.id,'GET',null,null);
 assert.equal(detail.status,200);assert.equal(detail.body.project.canEdit,false);
 assert.equal(JSON.stringify(detail.body).includes('example.test'),false);
 assert.equal((await call('/api/dubbing/projects/'+p.id,'PUT',{revision:2,options,script:sampleScript()})).status,409);
});
test('genre browsing separates open scripts and completed works without revealing private or blocked projects',async t=>{
 const {call,sql}=await fixture(t,{...enabled,BUCKET:memoryBucket()});
 const make=async(genres,state='recruiting',visibility='public')=>{
  const result=await create(call,{options:{...options,genres}});
  assert.equal(result.status,201,JSON.stringify(result.body));
  const p=result.body.project;sql.prepare('UPDATE dubbing_projects SET state=?,visibility=? WHERE id=?').run(state,visibility,p.id);return p.id;
 };
 const open=await make(['SF','액션']),complete=await make(['SF'],'complete');
 await make(['SF'],'script_ready','private');
 await make(['이세계물','판타지']);await make(['사극','로맨스']);
 const browse=async(tab,genre,who=null)=>call('/api/dubbing/projects?'+new URLSearchParams({tab,genre}),'GET',null,who);
 assert.deepEqual((await browse('open','SF')).body.projects.map(p=>p.id),[open]);
 assert.deepEqual((await browse('complete','SF')).body.projects.map(p=>p.id),[complete]);
 assert.equal((await browse('open','이세계물')).body.projects.length,1);
 assert.equal((await browse('open','사극')).body.projects.length,1);
 assert.equal((await browse('open','공포')).body.projects.length,0);
 assert.equal((await browse('open',"' OR 1=1 --")).status,400);
 assert.equal((await browse('mine','SF')).status,401);
 assert.equal((await browse('mine','SF','owner')).body.projects.length,3);
 sql.prepare('INSERT INTO dubbing_role_claims VALUES(?,?,?,0)').run(open,'role_1','owner');
 sql.prepare('INSERT INTO dubbing_role_claims VALUES(?,?,?,0)').run(open,'role_2','other');
 assert.equal((await browse('open','SF')).body.projects.length,0,'fully reserved works are not offered for joining');
 sql.exec("INSERT INTO user_blocks VALUES('other','owner',0)");
 assert.equal((await browse('complete','SF','other')).body.projects.length,0);
 sql.exec("UPDATE users SET provider='deleted' WHERE id='owner'");
 assert.equal((await browse('complete','SF')).body.projects.length,0);
});
test('genre filtering happens before pagination and keeps secondary genres discoverable',async t=>{
 const {call,sql}=await fixture(t,{...enabled,BUCKET:memoryBucket()});
 const expected=new Set();
 for(let i=0;i<28;i++){
  const genres=i<26?['액션','SF']:['로맨스'];
  const result=await create(call,{options:{...options,genres}});assert.equal(result.status,201);
  const id=result.body.project.id;sql.prepare("UPDATE dubbing_projects SET state='recruiting',visibility='public' WHERE id=?").run(id);
  if(i<26)expected.add(id);
 }
 const first=(await call('/api/dubbing/projects?tab=open&genre=SF','GET',null,null)).body;
 assert.equal(first.projects.length,25);assert.equal(first.nextOffset,25);
 const second=(await call('/api/dubbing/projects?tab=open&genre=SF&offset='+first.nextOffset,'GET',null,null)).body;
 assert.equal(second.projects.length,1);assert.equal(second.nextOffset,null);
 assert.deepEqual(new Set([...first.projects,...second.projects].map(p=>p.id)),expected);
});
test('same-role concurrent reservations and stale writes cannot overwrite participants',async t=>{
 const {call,sql}=await fixture(t,{...enabled,BUCKET:memoryBucket()}),p=(await create(call)).body.project;
 await call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true});
 const path='/api/dubbing/projects/'+p.id+'/claims/role_1';
 const claims=await Promise.all([call(path,'POST',{revision:2},'owner'),call(path,'POST',{revision:2},'other')]);
 assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
 const claim=sql.prepare('SELECT user_id FROM dubbing_role_claims').get(),winner=claim.user_id,loser=winner==='owner'?'other':'owner';
 assert.equal((await call(path,'POST',{revision:2},winner)).status,200,'same claimant retries do not reserve twice');
 assert.equal((await call('/api/dubbing/projects/'+p.id+'/claims/role_2','POST',{revision:3},winner)).status,409);
 assert.equal((await call(path,'DELETE',{revision:3},loser)).status,403);
 assert.equal((await call(path,'DELETE',{revision:3},winner)).status,200);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM dubbing_role_claims').get().n,0);
 assert.equal(sql.prepare('SELECT revision FROM dubbing_projects').get().revision,4,'failed second reservation rolls revision back');
});
test('editing stays locked until all reservations are released, and first recording freezes timeline',async t=>{
 const {call,sql}=await fixture(t,{...enabled,BUCKET:memoryBucket()}),p=(await create(call)).body.project;
 await call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true});
 await call('/api/dubbing/projects/'+p.id+'/claims/role_1','POST',{revision:2});
 await call('/api/dubbing/projects/'+p.id+'/unpublish','POST',{revision:3});
 assert.equal((await call('/api/dubbing/projects/'+p.id,'PUT',{revision:4,options,script:sampleScript()})).status,409);
 await call('/api/dubbing/projects/'+p.id+'/claims/role_1','DELETE',{revision:4});
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET')).body.project.canEdit,true);
 sql.prepare('UPDATE dubbing_projects SET first_recorded_at=1 WHERE id=?').run(p.id);
 assert.equal((await call('/api/dubbing/projects/'+p.id,'PUT',{revision:5,options,script:sampleScript()})).status,409);
});
test('blocked and deleted owners never appear in browsing or participation',async t=>{
 const {call,sql}=await fixture(t,{...enabled,BUCKET:memoryBucket()}),p=(await create(call)).body.project;
 await call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true});
 sql.exec("INSERT INTO user_blocks VALUES('other','owner',0)");
 assert.equal((await call('/api/dubbing/projects?tab=latest','GET',null,'other')).body.projects.length,0);
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET',null,'other')).status,404);
 sql.exec("UPDATE users SET provider='deleted' WHERE id='owner'");
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET',null,null)).status,404);
});
test('feature and AI gates cause zero provider calls and zero Gold changes',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected network');});
 const {call,sql}=await fixture(t,{...enabled,BUCKET:memoryBucket(),OPENAI_API_KEY:'local-test-only'});
 assert.equal((await call('/api/dubbing/config')).body.aiAvailable,false);
 assert.equal((await call('/api/dubbing/generations','POST',{requestId:crypto.randomUUID(),options})).status,503);
 assert.equal((await call('/api/dubbing/generations','POST',{requestId:crypto.randomUUID(),options},null)).status,401);
 assert.equal(calls,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM dubbing_generations').get().n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,0);
 const disabled=await fixture(t,{BUCKET:memoryBucket()});assert.equal((await disabled.call('/api/dubbing/projects')).status,503);
});
test('AI adapter uses Luna, strict schema and server credentials with reported usage only',async()=>{
 let request;
 const result=await generateDubbingScript({DUBBING_AI_ENABLED:'true',LLM_API_KEY:'local-test-secret'},options,async(url,init)=>{
  request={url,...init};return Response.json(mockResponse());
 });
 const body=JSON.parse(request.body);assert.equal(body.model,DUBBING_MODEL);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
 assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.headers.Authorization,'Bearer local-test-secret');
 assert.equal(result.usage.billedUsd,null);assert.equal(result.usage.totalTokens,30);
 assert.equal(JSON.stringify(result).includes('local-test-secret'),false);
 for(const data of [{...mockResponse(),status:'incomplete'},{...mockResponse(),output:[{type:'message',content:[{type:'refusal'}]}]},{...mockResponse(),output:[]}]){
  await assert.rejects(generateDubbingScript({DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'test'},options,async()=>Response.json(data)));
 }
});
test('AI idempotency persists results and prevents duplicate requests on replay or timeout',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(mockResponse());});
 const {call,sql}=await fixture(t,{...enabled,DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'local-test-secret',BUCKET:memoryBucket()});
 const requestId=crypto.randomUUID(),body={requestId,options};
 assert.equal((await call('/api/dubbing/generations','POST',body)).body.state,'ready');
 assert.equal((await call('/api/dubbing/generations','POST',body)).body.state,'ready');assert.equal(calls,1);
 assert.equal((await call('/api/dubbing/generations','POST',{...body,options:{...options,idea:'different'}})).status,409);
 assert.equal((await call('/api/dubbing/generations/'+requestId,'GET',null,'other')).status,404);
 assert.equal(sql.prepare('SELECT usage_json FROM dubbing_generations').get().usage_json.includes('billedUsd'),true);
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('timeout with secret provider details');});
 const id=crypto.randomUUID();assert.equal((await call('/api/dubbing/generations','POST',{requestId:id,options},'other')).body.state,'unknown');
 const replay=await call('/api/dubbing/generations','POST',{requestId:id,options},'other');assert.equal(replay.body.state,'unknown');assert.equal(calls,2);
 assert.equal(JSON.stringify(replay).includes('secret provider details'),false);
});
test('account deletion removes dubbing scripts, claims, generations and queues R2 cleanup even when disabled',async t=>{
 const BUCKET=memoryBucket(),{call,sql,DB}=await fixture(t,{...enabled,BUCKET}),p=(await create(call)).body.project;
 await deleteAccount({DB,BUCKET},{id:'owner',provider:'email'});
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM dubbing_projects').get().n,0);
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET',null,null)).status,404);
 assert.ok(JSON.parse(sql.prepare('SELECT targets FROM account_file_deletions').get().targets).some(x=>x.prefix==='dubbing/owner/'));
 await drainDeletedFiles({DB,BUCKET});assert.equal(BUCKET.objects.size,0);
});
test('existing participants can release reservations after owner stops public recruitment',async t=>{
 const {call}=await fixture(t,{...enabled,BUCKET:memoryBucket()}),p=(await create(call)).body.project;
 await call('/api/dubbing/projects/'+p.id+'/publish','POST',{revision:1,rightsAccepted:true});
 await call('/api/dubbing/projects/'+p.id+'/claims/role_1','POST',{revision:2},'other');
 await call('/api/dubbing/projects/'+p.id+'/unpublish','POST',{revision:3});
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET',null,null)).status,404);
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET',null,'other')).status,200);
 assert.equal((await call('/api/dubbing/projects/'+p.id+'/claims/role_1','DELETE',{revision:4},'other')).status,200);
 assert.equal((await call('/api/dubbing/projects/'+p.id,'GET',null,'other')).status,404);
});
test('invalid generated output retains provider usage without retry or a false completed script',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({...mockResponse(),status:'incomplete'});});
 const {call,sql}=await fixture(t,{...enabled,DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'local-test-only',BUCKET:memoryBucket()});
 const requestId=crypto.randomUUID(),result=await call('/api/dubbing/generations','POST',{requestId,options});
 assert.equal(result.body.state,'failed');assert.equal(result.body.script,undefined);
 assert.equal(JSON.parse(sql.prepare('SELECT usage_json FROM dubbing_generations').get().usage_json).totalTokens,30);
 await call('/api/dubbing/generations','POST',{requestId,options});assert.equal(calls,1);
});
test('a lost DB acknowledgement cannot delete an already committed R2 script',async t=>{
 const BUCKET=memoryBucket(),{call,DB,sql}=await fixture(t,{...enabled,BUCKET}),body={id:crypto.randomUUID(),options,script:sampleScript()};
 let loseResponse=true;
 const flakyDB={...DB,prepare(statement){const prepared=DB.prepare(statement);return {bind(...args){const q=prepared.bind(...args);return {...q,async first(){
  const result=await q.first();if(loseResponse&&statement.startsWith('INSERT INTO dubbing_projects')){loseResponse=false;throw Error('Acknowledgement lost');}return result;
 }}}};}};
 await assert.rejects(dubbingRoute(new Request('https://aifect.test/api/dubbing/projects',{method:'POST',body:JSON.stringify(body)}),{...enabled,DB:flakyDB,BUCKET},'/api/dubbing/projects',{id:'owner'}),/Acknowledgement/);
 const p=sql.prepare('SELECT script_key FROM dubbing_projects').get();assert.ok(BUCKET.objects.has(p.script_key));
 assert.equal((await call('/api/dubbing/projects','POST',body)).status,200);assert.equal(BUCKET.objects.size,1);
});
