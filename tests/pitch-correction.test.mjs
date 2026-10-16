import test from 'node:test';
import assert from 'node:assert/strict';
import {correctVocalPitch,detectPitch} from '../shared/pitch-correction.js';
import {defaultVocalMix,restoreVocalMix,presetMix} from '../shared/vocal-effects.js';
import {fixture} from './fixture.mjs';
import {pitchCorrectionRoute} from '../server/pitch-correction.js';
const tone=(rate,hz,seconds=2)=>Float32Array.from({length:rate*seconds},(_,i)=>.25*Math.sin(i*2*Math.PI*hz/rate));
function frequency(samples,rate,start=.3,end=samples.length/rate-.3){const cross=[];for(let i=Math.max(1,Math.ceil(start*rate));i<end*rate;i++)if(samples[i-1]<0&&samples[i]>=0)cross.push(i-samples[i]/(samples[i]-samples[i-1]));return (cross.length-1)*rate/(cross.at(-1)-cross[0]);}
const cents=(hz,target)=>1200*Math.log2(hz/target);
test('off is bit-exact, source and duration stay unchanged, restored legacy drafts default off',()=>{
 const input=tone(32000,225),copy=input.slice();assert.deepEqual(correctVocalPitch(input,32000,0).samples,input);assert.deepEqual(input,copy);assert.equal(defaultVocalMix().pitchCorrection,0);
 assert.equal(restoreVocalMix({voice:1}).pitchCorrection,0);assert.equal(restoreVocalMix({pitchCorrection:99}).pitchCorrection,0);assert.equal(presetMix({...defaultVocalMix(),pitchCorrection:2},'hall').pitchCorrection,2);
});
test('mild and medium reduce both sharp and flat errors without quantizing completely, across vocal range/rates',()=>{
 for(const rate of [32000,44100,48000])for(const hz of [110,220,440,880])for(const error of [-32,32]){
  const input=tone(rate,hz*2**(error/1200)),copy=input.slice();const mild=correctVocalPitch(input,rate,1),medium=correctVocalPitch(input,rate,2);
  const e1=Math.abs(cents(frequency(mild.samples,rate),hz)),e2=Math.abs(cents(frequency(medium.samples,rate),hz));assert(e1<Math.abs(error)*.8,`${rate}/${hz}/${error} mild ${e1}`);assert(e2<e1*.8,`${rate}/${hz}/${error} medium ${e2}`);
  assert.equal(input.length,medium.samples.length);assert.deepEqual(input,copy);assert(medium.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.26));
 }
});
test('in-tune sustained notes, silence, breath noise and fast glides are not hard tuned',()=>{
 for(const rate of [32000,48000]){
  const silence=new Float32Array(rate),note=tone(rate,220);assert.deepEqual(correctVocalPitch(silence,rate,2).samples,silence);assert.deepEqual(correctVocalPitch(note,rate,2).samples,note);
  let seed=12345;const noise=Float32Array.from({length:rate},()=>{seed=(seed*1664525+1013904223)>>>0;return (seed/2**32-.5)*.05;});assert.equal(correctVocalPitch(noise,rate,2).correctedSeconds,0);
  let phase=0;const glide=Float32Array.from({length:rate},(_,i)=>{phase+=2*Math.PI*(180+400*i/rate)/rate;return .2*Math.sin(phase);});assert(correctVocalPitch(glide,rate,2).correctedSeconds<.3);
 }
});
test('slow correction retains expressive vibrato while bringing its center toward the note',()=>{
 const rate=32000;let phase=0;const input=Float32Array.from({length:rate*4},(_,i)=>{phase+=2*Math.PI*220*2**((24+15*Math.sin(2*Math.PI*5*i/rate))/1200)/rate;return .25*Math.sin(phase);});const out=correctVocalPitch(input,rate,2).samples;
 const deviations=data=>Array.from({length:80},(_,j)=>cents(frequency(data,rate,.8+j*.025,.84+j*.025),220));const a=deviations(input),b=deviations(out),mean=x=>x.reduce((s,v)=>s+v,0)/x.length,depth=x=>Math.sqrt(x.reduce((s,v)=>s+(v-mean(x))**2,0)/x.length);
 assert(Math.abs(mean(b))<Math.abs(mean(a))*.6);assert(depth(b)>depth(a)*.65);assert(depth(b)<depth(a)*1.5);
});
test('unvoiced gaps, consonant bursts and original alignment survive the correction',()=>{
 const rate=32000,input=new Float32Array(rate*3);input.set(tone(rate,224.1,1));input.set(tone(rate,218,1),rate*2);input[rate+200]=.7;
 const out=correctVocalPitch(input,rate,2).samples;assert.deepEqual(out.subarray(rate+100,rate*2-100),input.subarray(rate+100,rate*2-100));assert.equal(out.length,input.length);
 let step=0;for(let i=1;i<out.length;i++)step=Math.max(step,Math.abs(out[i]-out[i-1]));assert(step<=.701);
});
test('progress is bounded and completes; malformed and oversized recordings fail explicitly',()=>{
 const progress=[];correctVocalPitch(tone(32000,224),32000,1,p=>progress.push(p));assert.equal(progress.at(-1),100);assert(progress.every((p,i)=>p>=0&&p<=100&&(i===0||p>=progress[i-1])));
 assert.throws(()=>correctVocalPitch(new Float32Array([NaN]),32000,1));assert.throws(()=>correctVocalPitch([],32000,1));assert.throws(()=>correctVocalPitch(tone(32000,224),0,1));
});
test('retired correction endpoints return Gone for every membership',async t=>{
 const {call}=await fixture(t);
 for(const path of ['/api/pitch-correction/access','/api/pitch-correction/worker.js']){
  assert.equal((await call(path,'GET',undefined,null)).status,410);
  assert.equal((await call(path)).status,410);
  const res=await pitchCorrectionRoute(new Request('https://aifect.test'+path),{},path,{id:'owner',premium_until:Date.now()/1000+600});
  assert.equal(res.status,410);assert.doesNotMatch(await res.text(),/onmessage/);
 }
 assert.equal(restoreVocalMix({pitchCorrection:2,tone:-1}).pitchCorrection,0);
});
