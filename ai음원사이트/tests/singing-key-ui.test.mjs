import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderBackingKeys} from '../shared/backing-pitch.js';

const source=readFileSync(new URL('../dist/sing-key.js',import.meta.url),'utf8');
function fixture(state='idle'){
 const buttons=[-1,1].map(keyStep=>({dataset:{keyStep}})),output={},calls=[];
 const context=vm.createContext({document:{querySelectorAll:q=>q==='[data-key-step]'?buttons:q==='[data-key-value]'?[output]:[]},
  sing:{state,keySemitones:0,ctx:{currentTime:4}},singBusy:s=>s.state==='loading',nativeSinging:()=>false,queueSingDraft(){},
  stopPreview(){throw Error('must not restart playback');}});
 vm.runInContext(source,context);
 return {s:context.sing,buttons,output,calls,paint:at=>vm.runInContext('paintBackingKey(sing,'+at+')',context),live:{at:1,param:{setValueAtTime(...args){calls.push(args);}}},change:value=>vm.runInContext('changeSingingKey('+value+')',context)};
}
test('live key taps keep the recording and transport clock, including a joined duet',()=>{
 const f=fixture('singing'),run={t0:1,from:5,recordAt:5,pitch:f.live,keyEvents:[{at:5,key:0}]};
 Object.assign(f.s,{run,parent:'partner'});
 for(const key of [1,3,-2])f.change(key);
 assert.deepEqual(f.calls,[[1,4],[3,4],[-2,4]]);
 assert.equal(f.s.run,run);assert.equal(f.s.state,'singing');
 assert.deepEqual(JSON.parse(JSON.stringify(run.keyEvents)),[{at:5,key:0},{at:8,key:-2}]);
 assert.equal(f.output.textContent,'-2');
});
test('preroll key changes apply at the scheduled source start, and do not duplicate the first event',()=>{
 const f=fixture('preroll');f.live.at=7;
 f.s.run={t0:7,from:0,recordAt:0,pitch:f.live,keyEvents:[{at:0,key:0}]};
 f.change(3);assert.deepEqual(f.calls,[[3,7]]);
 assert.deepEqual(JSON.parse(JSON.stringify(f.s.run.keyEvents)),[{at:0,key:3}]);
});
test('playback updates its own parameter in place and keeps key bounds and protected states',()=>{
 const f=fixture('backing');f.s.previewPitch=f.live;f.change(20);
 assert.deepEqual(f.calls,[[6,4]]);assert.equal(f.buttons[1].disabled,true);assert.equal(f.output.textContent,'+6');assert.equal(f.s.state,'backing');
 f.s.state='loading';f.change(0);assert.equal(f.s.keySemitones,6);
 f.s.state='review';f.s.punchRange={start:1,end:2};f.change(0);assert.equal(f.s.keySemitones,6);
});
test('resuming an older dry take preserves its recorded key before selecting a new key',()=>{
 const f=fixture('review');Object.assign(f.s,{voice:{},keySemitones:-2});f.change(2);
 assert.deepEqual(JSON.parse(JSON.stringify(f.s.keyEvents)),[{at:0,key:-2}]);assert.equal(f.s.keySemitones,2);
});
test('recorded key events change stereo frequency and preserve elapsed time, dry PCM and continuity',()=>{
 const rate=32000,channels=[220,330].map(hz=>Float32Array.from({length:3*rate},(_,i)=>.3*Math.sin(i*2*Math.PI*hz/rate)));
 const original=channels[0].slice(),events=[{at:0,key:0},{at:1,key:3},{at:2,key:-2}];
 const out=renderBackingKeys(channels,rate,events);
 for(const [c,pcm] of out.entries()){
  assert.equal(pcm.length,channels[c].length);
  for(const [i,{key}] of events.entries()){
   let crossings=0;for(let n=(i+.25)*rate;n<(i+.75)*rate;n++)if(pcm[n]<=0&&pcm[n+1]>0)crossings++;
   assert.ok(Math.abs(crossings*2-[220,330][c]*2**(key/12))<3);
  }
  // Check the actual transitions, including the fade on each side.
  for(const {at} of events.slice(1)){
   for(let n=(at-.1)*rate;n<(at+.1)*rate;n+=128)assert.ok(pcm.subarray(n,n+128).some(x=>Math.abs(x)>.005),'silent block at key change');
  }
 }
 assert.deepEqual(channels[0],original);
});

test('review and punch-in display the key actually playing at the lyric cursor',()=>{
 const f=fixture('playing');Object.assign(f.s,{voice:{},keySemitones:-2,keyEvents:[{at:0,key:0},{at:2,key:3},{at:4,key:-2}]});
 for(const [at,label] of [[0,'0'],[2,'+3'],[3,'+3'],[4,'-2'],[1,'0']]){f.paint(at);assert.equal(f.output.textContent,label);}
 f.s.punchRange={start:2,end:4};f.s.editingRecording=true;f.paint(2);assert.equal(f.output.textContent,'+3');
});
