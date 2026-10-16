import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as karaoke from '../shared/karaoke-audio.js';

const effects=readFileSync(new URL('../dist/sing-effects.js',import.meta.url),'utf8');
const recorder=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8');
function buffer(data=new Float32Array([.1,.2,.3,.4]),rate=32000){return {length:data.length,sampleRate:rate,duration:data.length/rate,getChannelData:()=>data,copyToChannel:values=>data.set(values)};}
function setup({recording=false}={}){
 const workers=[],requests=[];let revoked=false;
 const ctx={createBuffer:(channels,length,rate)=>buffer(new Float32Array(length),rate)};
 const c=vm.createContext({Float32Array,Blob,Date,console,clearTimeout,setTimeout,member:{plan:'premium',premium_until:Date.now()/1000+3600},document:{querySelectorAll:()=>[],addEventListener(){}},window:{AifectKaraoke:karaoke,addEventListener(){}},icon:()=>'',setSingStatus(){},queueSingDraft(){},Worker:class{
  constructor(url){this.url=url;workers.push(this);}
  postMessage(data){this.input=data;if(this.url.includes('vocal-render'))queueMicrotask(()=>this.onmessage({data:{samples:karaoke.renderVocals(data.samples,data.sampleRate,data.mix)}}));}
  terminate(){this.terminated=true;}
 },api:async(path)=>{requests.push(path);if(revoked)throw Object.assign(new Error('Premium 구독자 전용'),{status:403});return {allowed:true,expires:Date.now()/1000+3600};},singBusy:s=>['tuning','loading','exporting'].includes(s.state),singLive:s=>s.state==='singing',ctx});
 if(recording)vm.runInContext(recorder,c);
 vm.runInContext(effects,c);
 c.take={state:'review',voice:buffer(),mix:{...karaoke.defaultVocalMix(),pitchCorrection:2},ctx,cursor:0};
 vm.runInContext("sing=take;updateTransport=()=>{};stopPreview=()=>{}",c);
 return {c,workers,requests,revoke:()=>revoked=true,run:code=>vm.runInContext(code,c)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function finish(worker){worker.onmessage({data:{samples:new Float32Array([.08,.18,.28,.38]),correctedSeconds:1}});}
test('retired pitch settings never affect preview or export of legacy drafts',async()=>{
 const t=setup({recording:true}),s=t.c.take,raw=s.voice,tuned=buffer(new Float32Array([.05,.1,.15,.2]));
 s.mr=buffer(new Float32Array([.4,.3,.2,.1]));s.mode='solo';s.tuned={source:raw,level:2,buffer:tuned};s.compareRaw=true;
 assert.equal(t.run('vocalPlaybackBuffer(sing)'),raw);
 const scheduled=[];
 const node=()=>({gain:{value:1},connect(){return this;},disconnect(){},start(){}});
 t.c.OfflineAudioContext=class{
  constructor(channels,length,rate){this.length=length;this.sampleRate=rate;this.destination={};}
  createGain(){return node();}
  createBufferSource(){const source=node();scheduled.push(source);return source;}
  async startRendering(){return buffer(new Float32Array(this.length),this.sampleRate);}
 };
 t.run('prepareSing=async s=>s.ctx;backingBuffer=s=>s.mr');
 const file=await t.run('renderSung(sing)');assert.equal(file.type,'audio/wav');assert.ok(file.size>44);assert.equal(s.processed.source,raw);assert.equal(t.run('vocalPlaybackBuffer(sing)'),raw);assert.equal(scheduled[0].buffer,s.mr);assert.equal(s.voice,raw);assert.equal(t.requests.length,0);
});
test('review plays the exported PCM without a DSP worklet, and changing effects crossfades only the voice',async()=>{
 const t=setup({recording:true}),s=t.c.take;s.voice=buffer(new Float32Array(32000).fill(.1));s.mr=buffer(new Float32Array(32000).fill(.2));s.mode='solo';s.mix.pitchCorrection=0;
 const rendered=await t.run('prepareVocalEffects(sing)');assert.deepEqual(rendered.getChannelData(0),karaoke.renderVocals(s.voice.getChannelData(0),32000,s.mix));
 const scheduled=[],gains=[],compressors=[],param=()=>({value:0,events:[],setTargetAtTime(v,time){this.events.push(['target',v,time]);},setValueAtTime(v,time){this.events.push(['set',v,time]);},linearRampToValueAtTime(v,time){this.events.push(['ramp',v,time]);},cancelScheduledValues(){}});
 const node=()=>({connect(){return this;},disconnect(){},start(...args){this.started=args;},stop(time){this.stopped=time;}});
 t.c.playContext={currentTime:1,destination:{},createGain(){const n={...node(),gain:param()};gains.push(n);return n;},createBufferSource(){const n=node();scheduled.push(n);return n;},createDynamicsCompressor(){const n={...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};compressors.push(n);return n;}};
 t.c.AudioWorkletNode=function(){throw new Error('review must not instantiate a real-time DSP worklet');};t.run('backingBuffer=s=>s.mr');
 const mix=t.run('scheduleMix(playContext,0,1.05,sing)');assert.equal(scheduled[1].buffer,rendered);assert.equal(scheduled[0].buffer,s.mr);assert.equal(compressors.length,1);assert.equal(compressors[0].threshold.value,-1);
 const backing=mix.sources[0],voice=mix.sources[1];t.c.playContext.currentTime=1.4;mix.replaceVoice(buffer(new Float32Array(32000).fill(.3)));assert.equal(mix.sources[0],backing);assert.notEqual(mix.sources[1],voice);assert.equal(scheduled.filter(n=>n.buffer===s.mr).length,1);assert.equal(voice.stopped,1.436);assert.ok(Math.abs(mix.sources[1].started[1]-.44)<1e-10);assert.ok(gains.at(-1).gain.events.some(e=>e[0]==='ramp'&&e[1]===1));
});
test('rapid effect edits discard cancelled work and never replace the current source with stale samples',async()=>{
 const t=setup({recording:true});t.c.take.mix.pitchCorrection=0;
 const first=t.run('prepareVocalEffects(sing)'),rejected=assert.rejects(first,e=>e.cancelled===true);t.c.take.mix.tone=1;const second=t.run('prepareVocalEffects(sing)');await rejected;await second;
 assert.equal(t.workers[0].terminated,true);assert.equal(t.c.take.processed.key,t.run('vocalEffectKey(sing.mix)'));assert.equal(t.c.take.effectJob,null);assert.equal(t.c.take.voice.getChannelData(0)[0],Math.fround(.1));
});
