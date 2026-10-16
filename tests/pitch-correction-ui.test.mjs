import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as karaoke from '../shared/karaoke-audio.js';
const controller=readFileSync(new URL('../dist/sing-tune.js',import.meta.url),'utf8');
const recorder=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8');
function buffer(data=new Float32Array([.1,.2,.3,.4]),rate=32000){return {length:data.length,sampleRate:rate,duration:data.length/rate,getChannelData:()=>data,copyToChannel:values=>data.set(values)};}
function setup({recording=false}={}){
 const workers=[],requests=[];let revoked=false;
 const ctx={createBuffer:(channels,length,rate)=>buffer(new Float32Array(length),rate)};
 const c=vm.createContext({Float32Array,Blob,Date,console,member:{plan:'premium',premium_until:Date.now()/1000+3600},document:{querySelectorAll:()=>[],addEventListener(){}},window:{AifectKaraoke:karaoke,addEventListener(){}},icon:()=>'',setSingStatus(){},queueSingDraft(){},Worker:class{
  constructor(url){this.url=url;workers.push(this);}
  postMessage(data){this.input=data;}
  terminate(){this.terminated=true;}
 },api:async(path)=>{requests.push(path);if(revoked)throw Object.assign(new Error('Premium 구독자 전용'),{status:403});return {allowed:true,expires:Date.now()/1000+3600};},singBusy:s=>['tuning','loading','exporting'].includes(s.state),singLive:s=>s.state==='singing',ctx});
 if(recording)vm.runInContext(recorder,c);
 vm.runInContext(controller,c);
 c.take={state:'review',voice:buffer(),mix:{...karaoke.defaultVocalMix(),pitchCorrection:2},ctx,cursor:0};
 vm.runInContext("sing=take;updateTransport=()=>{};stopPreview=()=>{}",c);
 return {c,workers,requests,revoke:()=>revoked=true,run:code=>vm.runInContext(code,c)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function finish(worker){worker.onmessage({data:{samples:new Float32Array([.08,.18,.28,.38]),correctedSeconds:1}});}
test('free members see locked controls and cannot start correction; every cached reuse checks the server',async()=>{
 const t=setup();t.c.member={plan:'free',premium_until:null};t.c.take.mix.pitchCorrection=0;
 assert.match(t.run('vocalTuneHTML(sing)'),/잠금/);await t.run('changeVocalTuning(2)');assert.equal(t.workers.length,0);assert.equal(t.c.take.mix.pitchCorrection,0);
 t.c.member={plan:'premium',premium_until:Date.now()/1000+3600};t.c.take.mix.pitchCorrection=2;
 const original=t.c.take.voice.getChannelData(0).slice(),ready=t.run('prepareVocalTuning(sing)');await flush();assert.equal(t.workers.length,1);
 assert.notEqual(t.workers[0].input.samples,t.c.take.voice.getChannelData(0));finish(t.workers[0]);await ready;
 assert.deepEqual(t.c.take.voice.getChannelData(0),original);assert.equal(t.run('vocalPlaybackBuffer(sing)'),t.c.take.tuned.buffer);
 await t.run('prepareVocalTuning(sing)');assert.equal(t.requests.length,3);assert.equal(t.workers.length,1);
 t.revoke();await assert.rejects(t.run('prepareVocalTuning(sing)'),/Premium/);assert.equal(t.c.take.tuned,null);assert.equal(t.c.take.mix.pitchCorrection,0);assert.equal(t.c.member.plan,'free');
});
test('turning correction off during authorization never starts a stale worker',async()=>{
 const t=setup();let authorize;t.c.api=()=>new Promise(resolve=>authorize=resolve);
 const pending=t.run('prepareVocalTuning(sing)');await t.run('changeVocalTuning(0)');authorize({expires:Date.now()/1000+3600});await assert.rejects(pending,/변경/);assert.equal(t.workers.length,0);assert.equal(t.c.take.mix.pitchCorrection,0);
});
test('duplicate requests await the entire job and cancelled or replaced takes never receive a late result',async()=>{
 const t=setup(),first=t.run('prepareVocalTuning(sing)');await flush();const second=t.run('prepareVocalTuning(sing)');await flush();assert.equal(t.workers.length,1);finish(t.workers[0]);await Promise.all([first,second]);assert.ok(t.c.take.tuned);assert.equal(t.c.take.tuneJob,null);
 t.c.take.tuned=null;const pending=t.run('prepareVocalTuning(sing)');await flush();const rejected=assert.rejects(pending,/취소/);t.run('cancelVocalTuning(sing)');await rejected;assert.equal(t.workers[1].terminated,true);finish(t.workers[1]);await flush();assert.equal(t.c.take.tuned,null);
 const changed=t.run('prepareVocalTuning(sing)');await flush();t.c.take.voice=buffer();const replaced=assert.rejects(changed,/변경/);finish(t.workers[2]);await replaced;assert.equal(t.c.take.tuned,null);
});
test('export uses the same corrected vocal as preview even during original comparison, and keeps the backing untouched',async()=>{
 const t=setup({recording:true}),s=t.c.take,raw=s.voice,tuned=buffer(new Float32Array([.05,.1,.15,.2]));
 s.mr=buffer(new Float32Array([.4,.3,.2,.1]));s.mode='solo';s.tuned={source:raw,level:2,buffer:tuned};s.compareRaw=true;
 assert.equal(t.run('vocalPlaybackBuffer(sing)'),raw);
 const scheduled=[];
 const node=()=>({gain:{value:1},connect(){},start(){}});
 t.c.OfflineAudioContext=class{
  constructor(channels,length,rate){this.length=length;this.sampleRate=rate;this.destination={};}
  createGain(){return node();}
  createBufferSource(){const source=node();scheduled.push(source);return source;}
  async startRendering(){return buffer(new Float32Array(this.length),this.sampleRate);}
 };
 t.run('prepareSing=async s=>s.ctx;backingBuffer=s=>s.mr');
 const file=await t.run('renderSung(sing)');assert.equal(file.type,'audio/wav');assert.ok(file.size>44);assert.equal(s.compareRaw,false);assert.equal(s.processed.source,tuned);assert.equal(t.run('vocalPlaybackBuffer(sing)'),tuned);assert.equal(scheduled[0].buffer,s.mr);assert.equal(s.voice,raw);assert.equal(t.requests.length,2);
});
