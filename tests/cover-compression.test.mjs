import test from 'node:test';
import assert from 'node:assert/strict';
import {Mp3Encoder} from '@breezystack/lamejs';
import {CoverMp3Encoder,COVER_MP3_RATE as rate} from '../shared/cover-mp3.js';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {httpFixture} from './http-fixture.mjs';
import {spawn} from 'node:child_process';
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';
function encode(seconds){
 const n=Math.round(seconds*rate),e=new CoverMp3Encoder(Mp3Encoder,n);
 for(let first=0;first<n;first+=65536){const count=Math.min(65536,n-first),a=Float32Array.from({length:count},(_,j)=>sample(first+j));e.push([a,a.slice()]);}
 return e.finish();
}
function sample(i){return .25*Math.sin(i*2*Math.PI*221/rate)+.09*Math.sin(i*2*Math.PI*3331/rate)+.04*Math.sin(i*2*Math.PI*7897/rate);}
test('3-minute stereo cover is about 75% smaller and FFmpeg preserves the exact duet timeline',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aifect-mp3-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const frames=180*rate,mp3=encode(180),file=join(dir,'cover.mp3'),decoded=join(dir,'cover.f32');writeFileSync(file,mp3);
 execFileSync(ffmpeg,['-v','error','-y','-i',file,'-f','f32le',decoded],{windowsHide:true});
 assert.equal(statSync(decoded).size,frames*2*4);assert.ok(mp3.length<(44+frames*4)*.26);
 t.diagnostic(`3 min WAV ${44+frames*4} bytes -> MP3 ${mp3.length} bytes`);
 const bytes=readFileSync(decoded),pcm=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
 let signal=0,error=0;for(let i=rate;i<rate*3;i++){const a=sample(i),b=pcm[i*2];signal+=a*a;error+=(a-b)**2;}
 const snr=10*Math.log10(signal/error);assert.ok(snr>35,'decoded waveform must remain aligned and high quality: '+snr);t.diagnostic('synthetic signal SNR '+snr.toFixed(1)+' dB');
});
test('encoder rejects incomplete or oversized data and handles silence without clipping',()=>{
 assert.throws(()=>new CoverMp3Encoder(Mp3Encoder,rate*601),/길이/);
 const e=new CoverMp3Encoder(Mp3Encoder,rate);assert.throws(()=>e.finish(),/아직/);
 assert.throws(()=>e.push([new Float32Array(2)]),/데이터/);
 e.push([new Float32Array(rate),new Float32Array(rate)]);assert.ok(e.finish().length>100);
});
test('worker failure leaves the source intact and abort terminates the encoder instead of exporting WAV',async()=>{
 const source=readFileSync(new URL('../dist/cover-export.js',import.meta.url),'utf8');let job,terminated=0;
 class Worker{constructor(){job=this;}postMessage(){}terminate(){terminated++;}}
 const c=vm.createContext({Worker,Blob,setTimeout,clearTimeout,Uint8Array,Float32Array});vm.runInContext(source,c);
 const data=new Float32Array(32000),buffer={sampleRate:rate,length:data.length,getChannelData:()=>data};
 const p=c.encodeCoverMp3(buffer);job.onerror();await assert.rejects(p,/録|MP3/);assert.equal(terminated,1);assert.equal(data.length,32000);
 const a=new AbortController(),q=c.encodeCoverMp3(buffer,{signal:a.signal});a.abort();await assert.rejects(q,/취소/);assert.equal(terminated,2);
});
test('compressed cover uploads through the existing API and publishes with its exact decoded timeline',async t=>{
 const f=await httpFixture(t),data=encode(6),headers={origin:f.origin,cookie:'aifect_session=owner','content-type':'application/json'};
 f.sql.exec("UPDATE tracks SET karaoke_at=1,karaoke_terms='2026-09-24',duration=6 WHERE id='one'");
 const r=await fetch(f.origin+'/api/covers',{method:'POST',headers,body:JSON.stringify({original_id:'one',extension:'mp3',bytes:data.length,own_voice:true,rights:true})});
 const draft=await r.json();assert.equal(r.status,201,JSON.stringify(draft));
 const uploaded=await fetch(f.origin+'/api/uploads/'+draft.id+'/audio',{method:'PUT',headers:{...headers,'content-type':'audio/mpeg'},body:data});assert.equal(uploaded.status,200,await uploaded.text());
 const completed=await fetch(f.origin+'/api/uploads/'+draft.id+'/complete',{method:'POST',headers,body:'{}'});assert.equal(completed.status,200,await completed.text());
 const q=await fetch(f.origin+'/internal/jobs/claim',{method:'POST',headers:{authorization:'Bearer local-transcoder-test','content-type':'application/json'},body:'{}'}),job=(await q.json()).job;
 assert.equal(job.id,draft.id);assert.equal(job.original_ext,'mp3');
 if(process.env.FFMPEG_BIN){
  const source='import json\nfrom worker import convert\nconvert(json.loads('+JSON.stringify(JSON.stringify(job))+'))\n';
  await new Promise((resolve,reject)=>{const child=spawn(process.env.PYTHON_BIN||'python3',['-c',source],{cwd:new URL('../transcoder/',import.meta.url),env:{...process.env,AIFECT_ORIGIN:f.origin,TRANSCODER_TOKEN:'local-transcoder-test'},windowsHide:true});let err='';child.stderr.on('data',b=>err+=b);child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(err)));});
  const track=f.sql.prepare('SELECT status,duration FROM tracks WHERE id=?').get(draft.id);assert.equal(track.status,'published');assert.ok(Math.abs(track.duration-6)<.002);
 }
});
