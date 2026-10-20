import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import {pikaSubmit,pikaPoll,pikaRequest,pikaAudioURL} from '../server/dubbing-pika.js';
import worker from '../server/index.js';

const settings={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',TRANSCODER_TOKEN:'local-worker-test'};
const paid={...settings,DUBBING_PAID_API_ENABLED:'true',PIKA_API_KEY:'mock-pika-key'};
async function setup(t,extra={}){
 const BUCKET=memoryBucket(),f=await fixture(t,{...settings,BUCKET,...extra}),env={...settings,BUCKET,...extra,DB:f.DB};
 const internal=async(path,body={},job=null,method='POST')=>{
  const binary=body instanceof Uint8Array;
  const r=await worker.fetch(new Request('https://aifect.test/internal/dubbing/'+path,{method,headers:{authorization:'Bearer local-worker-test',
   ...(job?{'x-job-token':job.lease_token}:{}),'content-type':binary?'audio/mp4':'application/json',...(binary?{'content-length':String(body.byteLength)}:{})},body:binary?body:JSON.stringify(body)}),env,{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,body:await r.json()};
 };
 const create=async(script=sampleScript())=>(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script})).body.project;
 const queue=(p,mode='basic',requestId=crypto.randomUUID())=>f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId,mode,revision:p.revision,acceptedGold:50,acceptedChargeGold:0});
 return {...f,env,internal,create,queue,BUCKET};
}
const relax=(sql,jid)=>sql.prepare('UPDATE dubbing_sound_jobs SET next_poll=0 WHERE id=?').run(jid);
test('Pika REST adapter sends documented models, server key and stable idempotency header',async()=>{
 const c=sampleScript().soundCues[0],requests=[];
 const fetcher=async(url,init)=>{requests.push({url,...init});return Response.json({id:'media_test',status:'queued'});};
 await pikaSubmit(paid,c,'job:rain',fetcher);await pikaSubmit(paid,{...c,kind:'bgm',generationSeconds:10},'job:music',fetcher);
 assert.match(requests[0].url,/pika-sfx$/);assert.match(requests[1].url,/pika-music$/);
 assert.equal(requests[0].headers['Idempotency-Key'],'job:rain');assert.equal(requests[0].headers['X-API-Key'],'mock-pika-key');
 const music=JSON.parse(requests[1].body);assert.equal(music.mode,'text_to_music');assert.equal(music.lyrics,'');assert.match(music.prompt,/No vocals/);
 await assert.rejects(()=>pikaSubmit(settings,c,'key',()=>{throw Error('must not call');}),/승인/);
 assert.throws(()=>pikaRequest({...c,generationSeconds:21}));
 for(const url of ['http://cdn.pika.art/a','https://127.0.0.1/a','https://cdn.pika.art.evil.test/a','https://secret@cdn.pika.art/a'])assert.throws(()=>pikaAudioURL(url));
 const bad=await pikaPoll(paid,'media_test',async()=>Response.json({id:'media_test',status:'completed',output:{audio:{url:'http://localhost/a'}},billing:{state:'charged',charge_micro_usd:321}}));
 assert.equal(bad.status,'failed');assert.equal(bad.billing.chargeMicroUsd,321,'paid invalid output still records cost');
});
test('basic background is private, queued once, authenticated, finalized only after verified upload',async t=>{
 const f=await setup(t),p=await f.create(),requestId=crypto.randomUUID();
 assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId,mode:'basic',revision:1},'other')).status,404);
 const pair=await Promise.all([f.queue(p,'basic',requestId),f.queue(p,'basic',requestId)]);assert.ok(pair.every(r=>[200,202].includes(r.status)),JSON.stringify(pair));
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,1);
 assert.equal((await f.queue(p,'ai')).status,409);
 const j=(await f.internal('claim')).body.job;assert.ok(j);assert.equal((await f.internal('claim')).body.job,null);
 assert.equal((await f.internal(j.id+'/step',{}, {...j,lease_token:'bad'})).status,409);
 const mix=await f.internal(j.id+'/step',{},j);assert.equal(mix.body.state,'mixing');assert.deepEqual(mix.body.assets,[]);
 assert.equal((await f.internal(j.id+'/finish',{duration:p.duration,sampleRate:48000,peakDb:-3},j)).status,409);
 const bytes=new Uint8Array(32);bytes.set(new TextEncoder().encode('ftyp'),4);
 assert.equal((await f.internal(j.id+'/output',bytes,j,'PUT')).status,200);
 assert.equal((await f.internal(j.id+'/finish',{duration:p.duration,sampleRate:48000,peakDb:0},j)).status,400);
 assert.equal((await f.internal(j.id+'/finish',{duration:p.duration,sampleRate:48000,peakDb:-3},j)).status,200);
 const detail=await f.call('/api/dubbing/projects/'+p.id);assert.equal(detail.body.project.sound.state,'ready');assert.equal(detail.body.project.sound.progress,100);
 assert.doesNotMatch(JSON.stringify(detail.body),/mock-pika|lease_token|output_key/);
 assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/background','GET',null,'other')).status,404);
});
test('Pika async jobs retain provider IDs, usage and actual micro-dollar charges without resubmission',async t=>{
 const f=await setup(t,paid),p=await f.create();await f.queue(p,'ai');const j=(await f.internal('claim')).body.job;
 let submits=0,polls=0;const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,init)=>{
  assert.match(String(url),/^https:\/\/api.dev.pika.art\//);
  if(init.method==='POST'){submits++;return Response.json({id:'media_rain',status:'queued'});}
  polls++;return Response.json({id:'media_rain',status:'completed',output:{media_type:'audio',audio:{url:'https://cdn.pika.art/test.wav'}},usage:{audio_seconds:5},billing:{state:'charged',charge_micro_usd:1000}});
 };
 assert.equal((await f.internal(j.id+'/step',{},j)).status,200);
 assert.equal(f.sql.prepare('SELECT provider_id FROM dubbing_sound_assets').get().provider_id,'media_rain');
 relax(f.sql,j.id);await f.internal(j.id+'/step',{},j);relax(f.sql,j.id);
 assert.equal((await f.internal(j.id+'/step',{},j)).body.state,'mixing');
 await f.queue(p,'ai');assert.equal(submits,1);assert.equal(polls,1);
 const a=f.sql.prepare('SELECT * FROM dubbing_sound_assets').get();assert.equal(JSON.parse(a.billing_json).chargeMicroUsd,1000);assert.equal(JSON.parse(a.usage_json).audio_seconds,5);
 const ledger=f.sql.prepare('SELECT * FROM dubbing_provider_usage').get();assert.equal(JSON.parse(ledger.billing_json).chargeMicroUsd,1000);
 f.sql.prepare('DELETE FROM dubbing_projects WHERE id=?').run(p.id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_provider_usage').get().n,1);
});
test('in-flight provider billing survives content deletion without reviving a cancelled job',async t=>{
 const f=await setup(t,paid),p=await f.create();await f.queue(p,'ai');const j=(await f.internal('claim')).body.job;
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async()=>{f.sql.prepare('DELETE FROM dubbing_projects WHERE id=?').run(p.id);return Response.json({id:'media_cancelled',status:'completed',output:{audio:{url:'https://cdn.pika.art/test.wav'}},billing:{state:'charged',charge_micro_usd:600}});};
 assert.equal((await f.internal(j.id+'/step',{},j)).status,409);
 const ledger=f.sql.prepare('SELECT * FROM dubbing_provider_usage').get();assert.equal(ledger.provider_id,'media_cancelled');assert.equal(JSON.parse(ledger.billing_json).chargeMicroUsd,600);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,0);
});
test('unknown submission never retries a potentially charged generation',async t=>{
 const f=await setup(t,paid),p=await f.create();await f.queue(p,'ai');const j=(await f.internal('claim')).body.job;
 let calls=0;const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async()=>{calls++;throw new TypeError('lost response');};
 assert.equal((await f.internal(j.id+'/step',{},j)).body.state,'unknown');
 assert.equal((await f.queue(p,'ai')).body.sound.state,'unknown');assert.equal((await f.internal('claim')).body.job,null);assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT state FROM dubbing_provider_usage').get().state,'submitting');
});
test('restart resumes stored Pika job; stale leases and edited script cannot finish',async t=>{
 const f=await setup(t,paid),p=await f.create();await f.queue(p,'ai');const oldJob=(await f.internal('claim')).body.job;
 f.sql.prepare("UPDATE dubbing_sound_assets SET state='running',provider_id='media_resume'").run();
 f.sql.prepare("UPDATE dubbing_sound_jobs SET state='generating',lease_until=0").run();
 const j=(await f.internal('claim')).body.job;assert.equal(j.id,oldJob.id);assert.notEqual(j.lease_token,oldJob.lease_token);
 assert.equal((await f.internal(j.id+'/step',{},oldJob)).status,409);
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async(url,init)=>{assert.notEqual(init.method,'POST');return Response.json({id:'media_resume',status:'running'});};
 assert.equal((await f.internal(j.id+'/step',{},j)).status,200);
 const script=sampleScript();script.title='수정된 대본';assert.equal((await f.call('/api/dubbing/projects/'+p.id,'PUT',{revision:1,options,script})).status,200);
 assert.equal((await f.internal(j.id+'/step',{},j)).status,409);
 assert.equal((await f.call('/api/dubbing/projects/'+p.id)).body.project.sound.state,'not_started');
});
test('API approval gates stop paid work and deleted accounts cascade audio queues',async t=>{
 const f=await setup(t),p=await f.create();assert.equal((await f.queue(p,'ai')).status,503);
 await f.queue(p);f.sql.prepare('DELETE FROM dubbing_projects WHERE id=?').run(p.id);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,0);assert.equal((await f.internal('claim')).body.job,null);
});
test('manual scripts get a Luna sound plan once before Pika; scene and line clock stay fixed',async t=>{
 const f=await setup(t,{...paid,DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'mock-openai-key'}),script=sampleScript();script.soundCues=[];
 const p=await f.create(script);await f.queue(p,'ai');const j=(await f.internal('claim')).body.job;
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);let plans=0,submits=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.openai.com/')){plans++;const input=JSON.parse(init.body);assert.equal(input.model,'gpt-6-luna');
   return Response.json({id:'response_plan',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({soundCues:sampleScript().soundCues.map(c=>({...c,lineId:script.lines[0].id}))})}]}],usage:{input_tokens:20,output_tokens:40}});}
  submits++;return Response.json({id:'media_manual',status:'queued'});
 };
 const r=await f.internal(j.id+'/step',{},j);assert.equal(r.status,200,JSON.stringify(r));assert.equal(plans,1);assert.equal(submits,1);
 const timeline=JSON.parse(f.sql.prepare('SELECT timeline_json FROM dubbing_sound_jobs').get().timeline_json);assert.equal(timeline.duration,p.duration);assert.equal(timeline.lines[0].id,script.lines[0].id);
 assert.equal(f.sql.prepare('SELECT provider_id FROM dubbing_generations').get().provider_id,'response_plan');
});
