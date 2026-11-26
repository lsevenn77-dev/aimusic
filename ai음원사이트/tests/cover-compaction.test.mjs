import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {encodeWav} from '../shared/karaoke-audio.js';

export async function setup(t){
 const f=await fixture(t),objects=new Map();
 const previous=globalThis.FixedLengthStream;globalThis.FixedLengthStream=class extends TransformStream{constructor(){super();}};
 t.after(()=>{globalThis.FixedLengthStream=previous;});
 f.sql.exec("UPDATE tracks SET kind='cover',duration=6,original_bytes=10000 WHERE id='one'");
 objects.set('original/one.wav',{body:Buffer.alloc(10000,1),size:10000});
 objects.set('stream/one.m4a',{body:Buffer.alloc(1000,2),size:1000});
 const BUCKET={
  async head(k){return objects.get(k)||null;},async get(k){return objects.get(k)||null;},async delete(k){objects.delete(k);},
  async put(k,b,opt){const body=Buffer.from(await new Response(b).arrayBuffer()),sha=createHash('sha256').update(body).digest();assert.equal(sha.toString('hex'),Buffer.from(opt.sha256).toString('hex'));objects.set(k,{body,size:body.length,checksums:{sha256:sha}});}
 };
 const env={DB:f.DB,BUCKET,TRANSCODER_TOKEN:'test',ADMIN_USER_IDS:'owner'};
 const call=async(path,method='GET',body,user='owner',j=null,extra={})=>{
  const payload=body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body);
  const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{origin:'https://aifect.test','content-type':'application/json',...(path.startsWith('/internal/')?{authorization:'Bearer test'}:{}),...(user?{cookie:'aifect_session='+user}:{}),...(j?{'x-job-token':j.lease_token}:{}),...(payload?{'content-length':String(Buffer.byteLength(payload))}:{}),...extra},body:payload}),env,{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
 };
 const internal=(path,body={},j=null,method='POST',extra={})=>call('/internal/cover-compression/'+path,method,body,null,j,extra);
 const queue=()=>call('/api/admin/cover-compression','POST',{ids:['one'],confirmed:true});
 const claim=async()=>{const r=await internal('claim');assert.equal(r.status,200,JSON.stringify(r.body));return r.body.job;};
 const upload=async j=>{const b=Buffer.alloc(2000,3),sha=createHash('sha256').update(b).digest('hex'),r=await internal(j.track_id+'/output',b,j,'PUT',{'x-content-sha256':sha});assert.equal(r.status,200,JSON.stringify(r.body));return {codec:'mp3',bitrate_kbps:256,channels:2,sample_rate:44100,duration:6,sha256:sha};};
 return {...f,objects,BUCKET,env,call,internal,queue,claim,upload};
}

test('only the operator can select existing covers; repeated requests create one audited job and never select original songs',async t=>{
 const f=await setup(t);
 assert.equal((await f.call('/api/admin/cover-compression','GET',undefined,null)).status,401);
 assert.equal((await f.call('/api/admin/cover-compression','POST',{ids:['one'],confirmed:true},'other')).status,403);
 assert.equal((await f.call('/api/admin/cover-compression','POST',{ids:['one']})).status,400);
 assert.deepEqual((await f.call('/api/admin/cover-compression')).body.targets.map(x=>x.id),['one']);
 await f.queue();await f.queue();await f.call('/api/admin/cover-compression','POST',{ids:['two'],confirmed:true});
 assert.equal(f.sql.prepare('SELECT count(*) n FROM cover_compressions').get().n,1);
 assert.equal((await f.internal('claim',{},null,'POST',{authorization:'Bearer wrong'})).status,401);
 const j=await f.claim();assert.equal(j.state,'processing');assert.equal(await f.claim(),null);
 assert.notEqual((await f.call('/internal/archives/claim','POST',{},null)).body.job.track_id,'one');
});

test('validated replacement is atomic, original deletion is last and repeat cleanup/download are safe',async t=>{
 const f=await setup(t);await f.queue();const j=await f.claim(),b=await f.upload(j);
 assert.equal((await f.internal('one/cleanup',{},j)).status,409);assert.ok(f.objects.has(j.source_key));
 assert.equal((await f.internal('one/finish',{...b,duration:6.2},j)).status,400);
 assert.equal((await f.internal('one/finish',b,j)).status,200);assert.ok(f.objects.has(j.source_key));
 assert.equal((await f.internal('one/finish',b,j)).status,200);
 assert.equal((await f.internal('one/fail',{reason:'late response'},j)).status,409);
 const streamBefore=f.objects.get('stream/one.m4a');
 assert.equal((await f.internal('one/cleanup',{},j)).status,200);assert.equal((await f.internal('one/cleanup',{},j)).status,200);
 assert.equal(f.objects.has(j.source_key),false);assert.ok(f.objects.has(j.output_key));assert.equal(f.objects.get('stream/one.m4a'),streamBefore);
 const download=await f.call('/api/covers/one/download');assert.equal(download.headers.get('content-type'),'audio/mpeg');assert.match(download.headers.get('content-disposition'),/\.mp3/);
 assert.equal((await f.call('/api/covers/one/download','GET',undefined,'other')).status,403);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='cover_source_replaced'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='cover_source_deleted'").get().n,1);
});

test('stale leases, corrupt storage and concurrent source changes never delete or replace an original',async t=>{
 const f=await setup(t);await f.queue();const old=await f.claim();f.sql.exec('UPDATE cover_compressions SET lease_until=0');const j=await f.claim();
 assert.equal((await f.internal('one/fail',{},old)).status,409);const b=await f.upload(j),stored=f.objects.get(j.output_key);
 f.objects.set(j.output_key,{...stored,checksums:{}});assert.equal((await f.internal('one/finish',b,j)).status,409);assert.ok(f.objects.has(j.source_key));
 f.objects.set(j.output_key,stored);f.sql.exec("UPDATE tracks SET original_key='new-upload.wav' WHERE id='one'");
 assert.equal((await f.internal('one/finish',b,j)).status,409);assert.ok(f.objects.has(j.source_key));
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='cover_source_replaced'").get().n,0);
});

test('FLAC archive sources and active legacy processors are handled without competing for a file',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE tracks SET original_key='archive/one/token.flac',original_ext='flac' WHERE id='one'; INSERT INTO original_archives(track_id,source_key,source_bytes,state,lease_until,updated) VALUES('one','original/one.wav',10000,'committed',0,0)");
 f.objects.set('archive/one/token.flac',f.objects.get('original/one.wav'));await f.queue();assert.equal(await f.claim(),null);
 f.sql.exec("UPDATE original_archives SET state='done'");const j=await f.claim(),b=await f.upload(j);assert.equal(j.source_key,'archive/one/token.flac');
 assert.equal((await f.internal('one/finish',b,j)).status,200);
 f.sql.exec("INSERT INTO premium_audio_jobs(track_id,state,lease_until,updated) VALUES('one','processing',unixepoch()+60,0)");
 assert.equal((await f.internal('one/cleanup',{},j)).status,409);assert.ok(f.objects.has(j.source_key));
 f.sql.exec("UPDATE premium_audio_jobs SET state='ready'");assert.equal((await f.internal('one/cleanup',{},j)).status,200);assert.equal(f.objects.has(j.source_key),false);
});

test('conversion failures retry finitely, and already smaller lossless sources remain intact',async t=>{
 const f=await setup(t);await f.queue();let j;
 for(let i=1;i<=3;i++){j=await f.claim();assert.equal(j.attempts,i);await f.internal('one/fail',{reason:'invalid MP3'},j);}
 assert.equal(await f.claim(),null);assert.equal(f.sql.prepare('SELECT state FROM cover_compressions').get().state,'failed');assert.ok(f.objects.has('original/one.wav'));
 f.sql.exec("UPDATE cover_compressions SET state='queued',attempts=0");j=await f.claim();await f.internal('one/skip',{reason:'already smaller'},j);assert.equal(await f.claim(),null);assert.ok(f.objects.has('original/one.wav'));
});

test('actual Python/FFmpeg worker verifies uploaded MP3, swaps source and deletes only the old cover', {skip:!process.env.FFMPEG_BIN,timeout:60000},async t=>{
 const f=await setup(t),pcm=Float32Array.from({length:32000*6},(_,i)=>.25*Math.sin(i*2*Math.PI*440/32000)),wav=Buffer.from(encodeWav([pcm,pcm],32000));
 f.objects.set('original/one.wav',{body:wav,size:wav.length});f.sql.prepare("UPDATE tracks SET original_bytes=? WHERE id='one'").run(wav.length);await f.queue();
 const server=createServer(async(req,res)=>{
  try{const parts=[];for await(const p of req)parts.push(p);const r=await worker.fetch(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:parts.length?Buffer.concat(parts):undefined}),f.env,{waitUntil(p){p.catch(()=>{});}});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const source="import json\nfrom worker import request,download,command\nfrom cover_compression import compress_cover\nwith request('/internal/cover-compression/claim','POST',{}) as response: job=json.load(response)['job']\nassert job is not None\ncompress_cover(job,request,download,command)\n";
 await new Promise((resolve,reject)=>{const c=spawn(process.env.PYTHON_BIN||'python3',['-c',source],{cwd:new URL('../transcoder/',import.meta.url),env:{...process.env,AIFECT_ORIGIN:'http://127.0.0.1:'+server.address().port,TRANSCODER_TOKEN:'test'},windowsHide:true});let err='';c.stderr.on('data',s=>err+=s);c.once('error',reject);c.once('close',code=>code===0?resolve():reject(Error(err)));});
 const track=f.sql.prepare("SELECT * FROM tracks WHERE id='one'").get(),job=f.sql.prepare('SELECT * FROM cover_compressions').get();
 assert.equal(track.original_ext,'mp3');assert.equal(job.state,'done');assert.equal(f.objects.has('original/one.wav'),false);assert.ok(f.objects.get(track.original_key).size<wav.length*.3);assert.ok(f.objects.has('stream/one.m4a'));
 t.diagnostic(`existing cover WAV ${wav.length} -> MP3 ${track.original_bytes} bytes; original deleted only after readback`);
});
