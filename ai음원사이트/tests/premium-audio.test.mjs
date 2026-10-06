import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';

async function setup(t){
 const objects=new Map(),f=await fixture(t);
 globalThis.FixedLengthStream=class extends TransformStream{constructor(){super();}};
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id NOT IN ('one','hidden'); UPDATE tracks SET duration=30; UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 objects.set('original/one.wav',{body:Buffer.alloc(1000,7),size:1000});objects.set('stream/one.m4a',{body:Buffer.alloc(500,1),size:500});
 const BUCKET={async head(k){return objects.get(k)||null;},async get(k,opt){const o=objects.get(k);return o?{...o,body:opt?.range?o.body.subarray(opt.range.offset,opt.range.offset+opt.range.length):o.body}:null;},async put(k,body,opt){const bytes=Buffer.from(await new Response(body).arrayBuffer()),sha=createHash('sha256').update(bytes).digest();assert.equal(sha.toString('hex'),Buffer.from(opt.sha256).toString('hex'));objects.set(k,{body:bytes,size:bytes.length,checksums:{sha256:sha}});}};
 const call=async(path,method='GET',body,user='owner',job=null,extra={})=>{
  const internal=path.startsWith('/internal/'),payload=body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body);
  const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:'https://aifect.test','content-type':'application/json',...(internal?{authorization:'Bearer test'}:{}),...(user?{Cookie:'aifect_session='+user}:{}),...(job?{'x-job-token':job.lease_token}:{}),...(payload?{'content-length':String(Buffer.byteLength(payload))}:{}),...extra},body:payload}),{DB:f.DB,BUCKET,TRANSCODER_TOKEN:'test'},{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
 };
 const internal=(path,body={},job=null,method='POST',extra={})=>call('/internal/premium-audio/'+path,method,body,null,job,extra);
 const claim=async()=>{const r=await internal('claim');assert.equal(r.status,200,JSON.stringify(r.body));return r.body.job;};
 const upload=async j=>{const bytes=Buffer.alloc(1000,2),sha=createHash('sha256').update(bytes).digest('hex');assert.equal((await internal(j.track_id+'/output',bytes,j,'PUT',{'x-content-sha256':sha})).status,200);return {codec:'aac',bitrate_kbps:256,channels:2,sample_rate:44100,duration:30,sha256:sha};};
 return {...f,objects,call,internal,claim,upload};
}
test('Premium gets verified AAC256; free/expired/anonymous users cannot fetch it, and pending music stays playable at 128',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='hidden'");
 const pending=(await f.call('/api/playback/one','POST')).body;
 assert.equal(pending.src,'/media/one/stream');assert.equal(pending.bitrate_kbps,128);assert.equal(pending.high_quality_pending,true);
 const j=await f.claim();assert.equal(j.source_key,'original/one.wav');
 assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'published');
 const body=await f.upload(j);
 assert.equal((await f.internal('one/finish',{...body,bitrate_kbps:128},j)).status,400);
 assert.equal((await f.internal('one/finish',body,j)).status,200);
 assert.equal((await f.internal('one/finish',body,j)).status,200);
 const ready=(await f.call('/api/playback/one','POST')).body;assert.equal(ready.src,'/media/one/premium');assert.equal(ready.bitrate_kbps,256);assert.equal(ready.high_quality_pending,false);
 const ranged=await f.call(ready.src,'GET',undefined,'owner',null,{Range:'bytes=10-39'});assert.equal(ranged.status,206);assert.equal(ranged.body.length,30);assert.equal(ranged.headers.get('content-range'),'bytes 10-39/1000');assert.equal(ranged.headers.get('cache-control'),'private, no-store');
 assert.equal((await f.call(ready.src,'HEAD')).status,200);
 assert.equal((await f.call(ready.src,'GET',undefined,'other')).status,403);
 assert.equal((await f.call(ready.src,'GET',undefined,null)).status,401);
 const free=(await f.call('/api/playback/one','POST',undefined,'other')).body;assert.equal(free.bitrate_kbps,128);assert.equal(free.high_quality_pending,false);
 f.sql.exec("UPDATE users SET premium_until=0 WHERE id='owner'");assert.equal((await f.call(ready.src)).status,403);
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'; UPDATE tracks SET status='hidden' WHERE id='one'");assert.equal((await f.call(ready.src)).status,404);
 assert.equal(await f.claim(),null,'ready hidden music does not requeue');assert.ok(f.objects.has('original/one.wav'));
});
test('premium leases, checksum checks, retry limit and hidden/deleted tracks are isolated from normal publishing',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE tracks SET original_ext='flac',original_key='archive/one/source.flac' WHERE id='one'; UPDATE tracks SET status='deleted' WHERE id='hidden'");
 let j=await f.claim();assert.equal(j.source_key,'archive/one/source.flac');const old=j;
 f.sql.exec('UPDATE premium_audio_jobs SET lease_until=0');j=await f.claim();assert.notEqual(j.output_key,old.output_key);
 assert.equal((await f.internal('one/fail',{},old)).status,409);
 const b=await f.upload(j),saved=f.objects.get(j.output_key);f.objects.set(j.output_key,{...saved,checksums:{}});
 assert.equal((await f.internal('one/finish',b,j)).status,409);f.objects.set(j.output_key,saved);
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='one'");assert.equal((await f.internal('one/finish',b,j)).status,409);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");assert.equal((await f.internal('one/fail',{},j)).status,200);
 j=await f.claim();assert.equal(j.attempts,3);assert.equal((await f.internal('one/fail',{},j)).status,200);assert.equal(await f.claim(),null);
 assert.equal(f.sql.prepare("SELECT state FROM premium_audio_jobs WHERE track_id='one'").get().state,'failed');
 assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'hidden');
});
test('missing premium objects fall back with an accurate label and a direct high-quality request never silently serves 128',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='hidden'");const j=await f.claim(),body=await f.upload(j);await f.internal('one/finish',body,j);f.objects.delete(j.output_key);
 const session=(await f.call('/api/playback/one','POST')).body;assert.equal(session.bitrate_kbps,128);assert.equal(session.high_quality_pending,true);assert.equal((await f.call('/media/one/premium')).status,404);
});
