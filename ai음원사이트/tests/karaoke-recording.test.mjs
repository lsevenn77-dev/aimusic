import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeTake,reduceNoise,encodeWav} from '../shared/karaoke-audio.js';
test('punch-in skips preroll, preserves the earlier take, and trims everything after the stop',()=>{
 const old=Float32Array.from([1,2,3,4,5,6,7,8]);
 const out=mergeTake(old,[{t:1,d:Float32Array.from([90,91,10,11,12,13,14,15])}],2,2,2,4);
 assert.deepEqual([...out],[1,2,3,4,10,11,12,13]);
 assert.strictEqual(mergeTake(old,[],2,2,2,1),old,'stopping in preroll must not erase a take');
 const short=mergeTake(null,[{t:0,d:new Float32Array(8)}],0,2,0,2);
 assert.equal(short.length,4);assert.equal(new DataView(encodeWav([short,short],2).buffer).getUint32(40,true),16);
});
test('noise reduction has four increasingly strong levels and never mutates dry audio',()=>{
 // Audible noise/voice fixtures. DC is now deliberately rejected by the handling-noise filter.
 const input=Float32Array.from({length:32000},(_,i)=>.001*Math.cos(i*2*Math.PI*440/32000)),rms=x=>Math.sqrt(x.reduce((n,v)=>n+v*v,0)/x.length);let previous=1;
 for(let level=1;level<=4;level++){const out=reduceNoise(input,32000,level),volume=rms(out.subarray(16000));assert.ok(volume<previous);previous=volume;}
 assert.deepEqual(reduceNoise(input,32000,0),input);assert.ok(Math.abs(input[0]-.001)<1e-7);
 const loud=Float32Array.from({length:32000},(_,i)=>.4*Math.cos(i*2*Math.PI*440/32000));assert.ok(rms(reduceNoise(loud,32000,4).subarray(16000))>.28);
 assert.ok(rms(reduceNoise(new Float32Array(32000).fill(.4),32000,4).subarray(16000))<.00001);
});
