// Real HTTP + Python/FFmpeg round trip. In-memory DB/R2 and synthetic voices only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fixture} from './fixture.mjs';
import {sampleScript,options,memoryBucket} from './dubbing-fixtures.mjs';
import {encodeWav} from '../shared/karaoke-audio.js';
import worker from '../server/index.js';

test('HTTP worker pipeline generates a background, accepts two roles and publishes a real final AAC', {skip:!process.env.FFMPEG_BIN,timeout:60000}, async t=>{
 const env={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',TRANSCODER_TOKEN:'local-pipeline-test',BUCKET:memoryBucket()};
 const f=await fixture(t,env);env.DB=f.DB;
 const server=createServer(async(req,res)=>{
  try{
   const parts=[];for await(const chunk of req)parts.push(chunk);
   const response=await worker.fetch(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:parts.length?Buffer.concat(parts):undefined}),env,{waitUntil(p){p.catch(()=>{});}});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Pipeline failure');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const runPython=final=>new Promise((resolve,reject)=>{
  const source=`import json\nfrom dubbing import process,process_final\nfrom worker import request\nwith request('${final?'/internal/dubbing-final/':'/internal/dubbing/'}claim','POST',{}) as response: job=json.load(response)['job']\nassert job is not None\n${final?'process_final':'process'}(job,request)\n`;
  const child=spawn(process.env.PYTHON_BIN||'python3',['-c',source],{cwd:new URL('../transcoder/',import.meta.url),env:{...process.env,AIFECT_ORIGIN:'http://127.0.0.1:'+server.address().port,TRANSCODER_TOKEN:env.TRANSCODER_TOKEN},stdio:['ignore','pipe','pipe']});
  let diagnostic='';child.stderr.on('data',b=>diagnostic+=b);child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(diagnostic||'Python worker failed')));
 });
 let p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).body.project;
 const path='/api/dubbing/projects/'+p.id;
 p=(await f.call(path+'/publish','POST',{revision:p.revision,rightsAccepted:true})).body.project;
 p=(await f.call(path+'/claims/'+p.script.roles[0].id,'POST',{revision:p.revision})).body.project;
 const prepared=await f.call(path+'/recording/prepare','POST',{});
 assert.equal(prepared.status,202);
 const soundId=prepared.body.sound.id;
 await runPython(false);
 assert.equal((await f.call(path)).body.project.sound.state,'ready');
 for(const [i,user] of ['owner','other'].entries()){
  const role=p.script.roles[i].id,line=p.script.lines[i].id;
  p=(await f.call(path+'/claims/'+role,'POST',{revision:p.revision},user)).body.project;
  assert.equal((await f.call(path+'/recording/'+role+'/start','POST',{soundId},user)).status,200);
  const audio=encodeWav([Float32Array.from({length:48000},(_,n)=>.1*Math.sin(2*Math.PI*(220+i*110)*n/48000))],48000);
  const saved=await worker.fetch(new Request('https://aifect.test'+path+'/recording/'+role+'/lines/'+line+'?revision=1&take='+crypto.randomUUID(),{method:'PUT',headers:{origin:'https://aifect.test',cookie:'aifect_session='+user,'content-type':'audio/wav'},body:audio}),env,{waitUntil(){}});
  assert.equal(saved.status,200,await saved.text());
  assert.equal((await f.call(path+'/recording/'+role+'/submit','POST',{revision:2,rightsAccepted:true},user)).status,200);
 }
 await runPython(true);
 const final=f.sql.prepare('SELECT * FROM dubbing_final_jobs').get();assert.equal(final.state,'ready');
 const response=await worker.fetch(new Request('https://aifect.test'+path+'/final'),env,{waitUntil(){}});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mp4');
 const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length>1000);assert.equal(new TextDecoder().decode(bytes.slice(4,8)),'ftyp');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_provider_usage').get().n,0);
});
