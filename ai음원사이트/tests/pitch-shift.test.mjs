import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftBacking,normalizeKey} from '../shared/pitch-shift.js';
const rate=32000;
const tone=(hz,seconds=3)=>Float32Array.from({length:rate*seconds},(_,i)=>.3*Math.sin(2*Math.PI*hz*i/rate));
function frequency(data){let crossings=0;const a=rate,b=Math.min(data.length-rate/2,rate*2);for(let i=a+1;i<b;i++)if(data[i-1]<=0&&data[i]>0)crossings++;return crossings*rate/(b-a);}
test('key changes move the actual stereo frequencies while preserving duration and dry input',()=>{
 const left=tone(220),right=tone(330),original=left.slice();
 for(const key of [-6,-2,2,6]){const progress=[],out=shiftBacking([left,right],rate,key,p=>progress.push(p));assert.equal(out[0].length,left.length);assert.equal(out[1].length,right.length);assert.ok(Math.abs(frequency(out[0])-220*2**(key/12))<3);assert.ok(Math.abs(frequency(out[1])-330*2**(key/12))<3);assert.ok(out.every(c=>c.every(v=>Number.isFinite(v)&&Math.abs(v)<=1)));assert.equal(progress.at(-1),100);assert.ok(progress.every((v,i)=>!i||v>=progress[i-1]));}
 assert.deepEqual(left,original);
});
test('original key is bit-exact, short and silent tracks are safe, and controls stay bounded',()=>{
 const input=tone(440,.03);assert.deepEqual(shiftBacking([input],rate,0)[0],input);assert.equal(shiftBacking([input],rate,6)[0].length,input.length);assert.ok(shiftBacking([new Float32Array(rate)],rate,-6)[0].every(v=>v===0));assert.equal(normalizeKey(99),6);assert.equal(normalizeKey(-99),-6);assert.equal(normalizeKey('bad'),0);assert.throws(()=>shiftBacking([],rate,1));
});
test('pitch shifting preserves the timing of separated accompaniment events',()=>{
 const input=new Float32Array(rate*5);for(const time of [1,2,3,4])for(let j=0;j<rate*.15;j++)input[time*rate+j]=.5*Math.sin(2*Math.PI*440*j/rate);
 for(const key of [-6,6]){const out=shiftBacking([input],rate,key)[0];for(const second of [1,2,3,4]){let energy=0,weighted=0;for(let i=(second-.15)*rate;i<(second+.3)*rate;i++){const x=out[Math.round(i)]**2;energy+=x;weighted+=i/rate*x;}assert.ok(energy>1);assert.ok(Math.abs(weighted/energy-(second+.075))<.075);}}
});
