import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';

async function setup(t){
 const f=await fixture(t),objects=new Map();let rejectDelete=false;
 globalThis.FixedLengthStream=class extends TransformStream{constructor(){super();}};
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id!='one'");
 const original=Buffer.alloc(128,3);objects.set('original/one.wav',{body:original,size:128});
 const BUCKET={async head(k){return objects.get(k)||null;},async get(k){return objects.get(k)||null;},async put(k,body,opt){const bytes=Buffer.from(await new Response(body).arrayBuffer()),sha=createHash('sha256').update(bytes).digest();assert.equal(sha.toString('hex'),Buffer.from(opt.sha256).toString('hex'));objects.set(k,{body:bytes,size:bytes.length,checksums:{sha256:sha}});},async delete(k){if(rejectDelete)throw Error('cleanup unavailable');objects.delete(k);}};
 const call=async(path,body={},job=null,method='POST',extra={})=>{const headers={authorization:'Bearer test','content-type':'application/json',...(job?{'x-job-token':job.lease_token}:{}),...extra};const payload=Buffer.isBuffer(body)?body:JSON.stringify(body);if(method!=='GET')headers['content-length']=String(Buffer.byteLength(payload));const r=await worker.fetch(new Request('https://aifect.test/internal/archives/'+path,{method,headers,body:method==='GET'?undefined:payload}),{DB:f.DB,BUCKET,TRANSCODER_TOKEN:'test'},{});return {status:r.status,body:await r.json()};};
 const claim=async()=>{const r=await call('claim');assert.equal(r.status,200,JSON.stringify(r));return r.body.job;};
 const upload=async(job)=>{const data=Buffer.alloc(80,5),sha=createHash('sha256').update(data).digest('hex');assert.equal((await call('one/output',data,job,'PUT',{'x-content-sha256':sha})).status,200);return {stored_sha:sha,source_pcm_sha:'a'.repeat(64),output_pcm_sha:'a'.repeat(64)};};
 return {...f,objects,call,claim,upload,setDeleteFailure(v){rejectDelete=v;}};
}
test('archives require a lease, matching audio and stored checksum before an atomic pointer switch; cleanup retries safely',async t=>{
 const f=await setup(t),j=await f.claim();assert.equal(j.track_id,'one');
 assert.equal((await f.call('one/commit',{},null)).status,409);
 assert.equal((await f.call('one/cleanup',{},j)).status,409);
 const b=await f.upload(j);
 assert.equal((await f.call('one/commit',{...b,output_pcm_sha:'b'.repeat(64)},j)).status,400);
 assert.equal(f.sql.prepare("SELECT original_ext FROM tracks WHERE id='one'").get().original_ext,'wav');
 const key=j.output_key,obj=f.objects.get(key);f.objects.set(key,{...obj,checksums:{}});
 assert.equal((await f.call('one/commit',b,j)).status,409);f.objects.set(key,obj);
 assert.equal((await f.call('one/commit',b,j)).status,200);
 assert.equal(f.sql.prepare("SELECT original_key FROM tracks WHERE id='one'").get().original_key,key);
 assert.ok(f.objects.has('original/one.wav'),'WAV is still present until explicit cleanup');
 assert.equal((await f.call('one/commit',b,j)).status,200,'commit is idempotent');
 f.setDeleteFailure(true);assert.equal((await f.call('one/cleanup',{},j)).status,500);
 assert.equal((await f.call('one/fail',{},j)).status,409,'a failed cleanup cannot undo committed metadata');
 f.sql.exec('UPDATE original_archives SET lease_until=0');const retry=await f.claim();assert.equal(retry.state,'committed');assert.equal(retry.output_key,key);
 f.setDeleteFailure(false);assert.equal((await f.call('one/cleanup',{},retry)).body.saved_bytes,48);
 assert.ok(!f.objects.has('original/one.wav'));assert.ok(f.objects.has(key));assert.equal(await f.claim(),null);
});
test('expired workers, in-flight transcodes and skip paths preserve WAV originals',async t=>{
 const f=await setup(t),old=await f.claim();f.sql.exec('UPDATE original_archives SET lease_until=0');const j=await f.claim();
 assert.notEqual(j.output_key,old.output_key);assert.equal((await f.call('one/skip',{},old)).status,409);
 const b=await f.upload(j);f.sql.exec("UPDATE tracks SET status='processing' WHERE id='one'");
 assert.equal((await f.call('one/commit',b,j)).status,409);assert.ok(f.objects.has('original/one.wav'));
 assert.equal((await f.call('one/skip',{reason:'unsupported_precision_keep_wav'},j)).status,200);
 assert.ok(!f.objects.has(j.output_key));assert.equal(f.sql.prepare('SELECT state FROM original_archives').get().state,'skipped');
});
