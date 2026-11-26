import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderBackingKeys} from '../shared/backing-pitch.js';

test('worker packets span device quanta and match the offline key timeline at packet boundaries',async()=>{
 const rate=32000,total=4*rate,channels=[233,349].map(hz=>Float32Array.from({length:total},(_,i)=>.4*Math.sin(2*Math.PI*hz*i/rate)));
 const keys=[{at:0,key:0},{at:.73,key:4},{at:1.38,key:-3},{at:2.53,key:0}],expected=renderBackingKeys(channels,rate,keys);
 let reply;globalThis.self={postMessage:v=>reply=v};try{
  await import('../shared/pitch-worker.js');
  for(let position=0;position<total;position+=6400){
   const count=Math.min(6400,total-position),start=Math.max(0,position-5120);
   self.onmessage({data:{live:true,generation:1,activation:0,position,start,count,rate,events:keys.map(e=>({...e,at:Math.round(e.at*rate)})),inputs:channels.map(c=>c.slice(start,position+count+12800))}});
   assert.equal(reply.error,undefined);assert.equal(reply.pcm.length,count*2);
   for(let i=0;i<count;i++)for(let c=0;c<2;c++)assert.equal(reply.pcm[2*i+c],expected[c][position+i]);
  }
 }finally{delete globalThis.self;}
});
test('device worklet preserves channel timing, eases key swaps and stops at the requested frame',()=>{
 let Processor;const ctx=vm.createContext({sampleRate:32000,currentFrame:0,registerProcessor:(_,p)=>Processor=p,AudioWorkletProcessor:class{constructor(){this.port={};}}});
 vm.runInContext(readFileSync(new URL('../shared/backing-worklet.js',import.meta.url),'utf8'),ctx);
 const dsp=new Processor({processorOptions:{at:0,duration:.2}}),dry=[new Float32Array(128).fill(.2),new Float32Array(128).fill(-.2)],out=dry.map(()=>new Float32Array(128));const pcm=new Float32Array(8000);for(let i=0;i<4000;i++){pcm[2*i]=.6;pcm[2*i+1]=-.4;}
 dsp.port.onmessage({data:{generation:1,position:512,activation:512,count:4000,pcm}});const left=[];
 for(let n=0;n<3072;n+=128){ctx.currentFrame=n;dsp.process([dry],[out]);left.push(...out[0]);if(n===2304)assert.ok(Math.abs(out[1][0]+.4)<1e-6);}
 assert.equal(left[511],left[512]);assert.ok(left[1279]>.5999);assert.ok(left.slice(513,1280).every((v,i)=>v-left[i+512]>=0&&v-left[i+512]<.001));
 ctx.currentFrame=6400;assert.equal(dsp.process([dry],[out]),false);
});
