import test from 'node:test';import assert from 'node:assert/strict';
import {NoiseCleaner,VocalProcessor,renderVocals,presetMix,editVocalMix,defaultVocalMix,restoreVocalMix,vocalPresets} from '../shared/vocal-effects.js';
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
test('custom values survive preset excursions, persisted reloads and further edits',()=>{
 let m=presetMix(defaultVocalMix(),'custom');for(const [key,value] of Object.entries({echo:.41,room:.67,size:.81,tone:.23,noise:4}))m=editVocalMix(m,key,value);
 const custom={...m.custom};m=presetMix(m,'hall');assert.equal(m.preset,'hall');assert.equal(m.room,.45);assert.deepEqual(m.custom,custom);
 m=restoreVocalMix(JSON.parse(JSON.stringify(m)));m=presetMix(m,'custom');for(const key of Object.keys(custom))assert.equal(m[key],custom[key]);
 m=editVocalMix(m,'tone',.31);assert.equal(presetMix(presetMix(m,'studio'),'custom').tone,.31);
 assert.equal(m.offset,80);assert.equal(m.voice,1);assert.equal(m.mr,.8);
});
test('editing a preset starts from that sound while custom button recalls previous custom sound',()=>{
 let m=editVocalMix(defaultVocalMix(),'echo',.45);const old=m.custom;m=presetMix(m,'hall');const room=m.room;
 m=editVocalMix(m,'tone',.8);assert.equal(m.preset,'custom');assert.equal(m.room,room);assert.equal(m.tone,.8);assert.notEqual(m.echo,old.echo);assert.equal(old.tone,.5);
});
test('one-touch effects set distinct mixes and keep volume, sync and chosen noise mode',()=>{
 const old={voice:1.2,mr:.7,noise:4,offset:125},unique=new Set();for(const p of vocalPresets){const m=presetMix(old,p.id,.5);for(const k of Object.keys(old))assert.equal(m[k],old[k]);unique.add(JSON.stringify([m.echo,m.room,m.size,m.tone]));}
 assert.equal(unique.size,4);assert.equal(defaultVocalMix().preset,'studio');assert.equal(defaultVocalMix().noise,2);
 const off=presetMix(old,'hall',0);assert.equal(off.echo+off.room+off.tone,0);assert.ok(presetMix(old,'hall',1).room<=1);
});
test('draft restoration preserves custom effects and migrates previous room scale only once',()=>{
 const old={echo:.4,room:.2,noise:0,offset:123,voice:1.4},m=restoreVocalMix(old);assert.equal(m.preset,'custom');assert.equal(m.room,.4);assert.equal(m.echo,.4);assert.equal(m.noise,0);assert.equal(m.tone,0);assert.deepEqual(restoreVocalMix(m),m);
 const preset=defaultVocalMix();assert.deepEqual(restoreVocalMix(preset),preset);
});
test('strong cleaning reduces loud cable-rumble fixtures while retaining sung harmonics',()=>{
 for(const rate of [32000,48000]){
  const input=Float32Array.from({length:rate*2},(_,i)=>.3*Math.sin(i*2*Math.PI*35/rate)+.15*Math.sin(i*2*Math.PI*220/rate)+.07*Math.sin(i*2*Math.PI*440/rate));const copy=input.slice();
  const f=new NoiseCleaner(rate),out=Float32Array.from(input,x=>f.process(x,4));
  const component=(data,hz)=>{let a=0,b=0;for(let i=rate;i<data.length;i++){a+=data[i]*Math.cos(i*2*Math.PI*hz/rate);b+=data[i]*Math.sin(i*2*Math.PI*hz/rate);}return 2*Math.hypot(a,b)/rate;};
  assert.ok(component(out,35)<component(input,35)*.08);assert.ok(component(out,220)>component(input,220)*.85);assert.ok(component(out,440)>component(input,440)*.95);assert.deepEqual(input,copy);
 }
});
test('presets are finite, preserve original with noise off, and hall rings longer than studio',()=>{
 const input=new Float32Array(48000*3);input[0]=.3;const original=renderVocals(input,48000,presetMix({noise:0},'original'));assert.deepEqual(original,input);
 const energy={};for(const p of vocalPresets){const out=renderVocals(input,48000,presetMix({noise:0},p.id,1));assert.ok(out.every(Number.isFinite));energy[p.id]=rms(out.subarray(24000));}assert.ok(energy.hall>energy.studio*2);
});
test('live preset/noise changes keep the processor clock and output bounded',()=>{
 const f=new VocalProcessor(48000,defaultVocalMix());let peak=0;for(let i=0;i<96000;i++){if(i%12000===0)f.update(presetMix({noise:i%24000?4:0},vocalPresets[(i/12000)%4].id,.8));const y=f.process(i%997===0?NaN:.4*Math.sin(i*.03));assert.ok(Number.isFinite(y));peak=Math.max(peak,Math.abs(y));}assert.ok(peak<1.5);
});
test('tone control gives an audible spectral change at matched input level, without changing pitch or the source',()=>{
 for(const rate of [32000,48000]){
  const input=Float32Array.from({length:rate},(_,i)=>.12*Math.sin(i*2*Math.PI*220/rate)+.06*Math.sin(i*2*Math.PI*2640/rate));
  const copy=input.slice(),mix={noise:0,echo:0,room:0,size:.5,tone:0},off=renderVocals(input,rate,mix),mid=renderVocals(input,rate,{...mix,tone:.5}),full=renderVocals(input,rate,{...mix,tone:1});
  const component=(a,hz)=>{let x=0,y=0;for(let i=rate/2;i<rate;i++){x+=a[i]*Math.cos(i*2*Math.PI*hz/rate);y+=a[i]*Math.sin(i*2*Math.PI*hz/rate);}return Math.hypot(x,y);};
  const contrast=a=>20*Math.log10(component(a,2640)/component(a,220)),delta=contrast(full)-contrast(off);
  assert(delta>8&&delta<12,`expected clear broad EQ, got ${delta} dB`);assert(contrast(mid)>contrast(off)+3);assert(contrast(mid)<contrast(full));
  assert(component(full,220)>component(input,220)*.5,'fundamental remains audible');assert.deepEqual(off,input);assert.deepEqual(input,copy);
 }
});
test('changing tone during live processing stays continuous and converges to the same saved result',()=>{
 const rate=32000,mix={noise:0,echo:0,room:0,tone:0},live=new VocalProcessor(rate,mix),input=Float32Array.from({length:rate*2},(_,i)=>.15*Math.sin(i*2*Math.PI*220/rate)+.04*Math.sin(i*2*Math.PI*2640/rate)),out=new Float32Array(input.length);
 for(let i=0;i<input.length;i++){if(i===rate)live.update({...mix,tone:1});out[i]=live.process(input[i]);}
 const saved=renderVocals(input,rate,{...mix,tone:1});let error=0,edge=0;for(let i=rate+rate/2;i<input.length;i++)error=Math.max(error,Math.abs(out[i]-saved[i]));for(let i=rate-4;i<rate+4;i++)edge=Math.max(edge,Math.abs(out[i]-out[i-1]));
 assert(error<1e-6);assert(edge<.04,'no discontinuity at the control change');
});

test('extended tone range deepens or brightens without retuning and survives draft/preset round trips',()=>{
 const rate=32000,input=Float32Array.from({length:rate},(_,i)=>.08*Math.sin(i*2*Math.PI*220/rate)+.04*Math.sin(i*2*Math.PI*2640/rate));
 const energy=(data,hz)=>{let a=0,b=0;for(let i=rate/2;i<rate;i++){a+=data[i]*Math.cos(i*2*Math.PI*hz/rate);b+=data[i]*Math.sin(i*2*Math.PI*hz/rate);}return Math.hypot(a,b);};
 const values=[-1,0,1,2].map(tone=>renderVocals(input,rate,{noise:0,echo:0,room:0,tone}));
 const contrast=values.map(a=>20*Math.log10(energy(a,2640)/energy(a,220)));
 assert(contrast[0]<contrast[1]-8);assert(contrast[3]>contrast[2]+4);assert.deepEqual(values[1],input);
 for(const tone of [-1,2]){let m=editVocalMix(defaultVocalMix(),'tone',tone);m=restoreVocalMix(presetMix(m,'hall'));assert.equal(presetMix(m,'custom').tone,tone);assert.equal(restoreVocalMix({...m,tone}).tone,tone);}
 assert(values.every(a=>a.every(Number.isFinite)));
});
