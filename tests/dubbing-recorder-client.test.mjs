// Controller tests use an in-memory audio clock and PCM, never a physical mic.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {placeChunks} from '../shared/karaoke-audio.js';
const code=readFileSync(new URL('../dist/dubbing-recording.js',import.meta.url),'utf8');
function harness(){
 const tracks=[],sources=[];
 const context={currentTime:10,sampleRate:48000,destination:{},audioWorklet:{async addModule(){}},createGain(){return {gain:{value:1},connect(){return this;},disconnect(){}};},createMediaStreamSource(){return {connect(next){return next;},disconnect(){}};},async close(){context.closed=true;}};
 const sandbox={Float32Array,Map,AbortSignal,crypto,console,setTimeout,clearTimeout,requestAnimationFrame(){return 1;},cancelAnimationFrame(){},confirm:()=>true,history:{replaceState(){}},toast(){},window:{addEventListener(){}},document:{hidden:false,addEventListener(){}},navigator:{mediaDevices:{async getUserMedia(){const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};}}},AifectKaraoke:{placeChunks},AudioWorkletNode:class{constructor(){this.port={postMessage:()=>this.port.onmessage({data:'done'})};}connect(next){return next;}disconnect(){}}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 vm.runInContext("dubbingRecordDraw=()=>{};dubbingRecordMessage=(s,m)=>{s.message=m;};dubbingPlayGuide=(s,from,when)=>{s.guide={from,when};};",sandbox);
 sandbox.dubbingRecordAudio=async s=>{s.ctx=context;};
 const state={p:{id:'local-project',sound:{id:'background'}},data:{recording:{roles:[{roleId:'role',state:'draft',revision:1}]},lines:[{id:'line',roleId:'role',start:2,end:4,recordEnd:5}]},role:'role',line:'line',cursor:0,busy:false,closed:false,sources,route:'dubbing/local?record=1'};
 const chunk=(start,length,value)=>state.run.node.port.onmessage({data:{t:start,d:new Float32Array(length).fill(value)}});
 return {sandbox,state,context,tracks,chunk};
}
test('pause/resume keeps earlier PCM and drops the preparation interval',async()=>{
 const h=harness(),{sandbox:s,state:r,context:c}=h;
 await s.dubbingStartRecording(r);const first=r.run.t0;
 assert.equal(r.guide.from,1);assert.equal(r.run.mute.gain.value,0);
 h.chunk(first-.1,4800,.9);h.chunk(first,48000,.5);c.currentTime=first+1;
 await s.dubbingPauseRecording(r);
 assert.equal(r.cursor,1);assert.equal(r.samples[0],.5);assert.equal(r.samples[47999],.5);assert.ok(h.tracks[0].stopped);
 await s.dubbingStartRecording(r);const second=r.run.t0;
 h.chunk(second,48000,.25);c.currentTime=second+1;
 await s.dubbingPauseRecording(r);
 assert.equal(r.cursor,2);assert.equal(r.samples[0],.5);assert.equal(r.samples[48000],.25);assert.equal(r.samples[96000],0);assert.ok(h.tracks[1].stopped);
});
test('the end boundary clips capture to this line and keeps the rerecording state',async()=>{
 const h=harness(),{sandbox:s,state:r,context:c}=h;await s.dubbingStartRecording(r);const t=r.run.t0;
 h.chunk(t,4*48000,.3);c.currentTime=t+4;await s.dubbingPauseRecording(r,true);
 assert.equal(r.cursor,3);assert.equal(r.samples.length,3*48000);assert.equal(r.run,null);assert.equal(r.dirty,true);assert.match(r.message,/다시 녹음/);
});
test('microphone denial recovers controls and leaving closes tracks and audio context',async()=>{
 const h=harness(),{sandbox:s,state:r,context:c}=h;const media=s.navigator.mediaDevices.getUserMedia;
 s.navigator.mediaDevices.getUserMedia=async()=>{throw Error('permission denied');};await s.dubbingStartRecording(r);assert.equal(r.busy,false);assert.ok(!r.run);assert.match(r.message,/permission/);
 s.navigator.mediaDevices.getUserMedia=media;await s.dubbingStartRecording(r);s.dubbingReleaseRecorder(r);
 assert.ok(h.tracks[0].stopped);assert.equal(r.closed,true);assert.equal(c.closed,true);assert.equal(r.run,null);
});
