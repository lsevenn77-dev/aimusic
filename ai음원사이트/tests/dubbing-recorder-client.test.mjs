import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(fetcher=async()=>{throw Error('unexpected upload');}){
 const nodes=new Map(),messages=[];
 const root={querySelector(k){if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:'',scrollTop:0,children:[],querySelector(){return null;}});return nodes.get(k);},querySelectorAll(){return [];}};
 const ctx=vm.createContext({Map,Float32Array,Math,Number,crypto,AbortSignal,fetch:fetcher,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame(){},window:{addEventListener(){}},document:{addEventListener(){}},icon:()=>'',esc:String,time:n=>String(Math.floor(n)),dubbingMessage:(_,m)=>messages.push(m),AifectKaraoke:{encodeWav:([data])=>data},confirm:()=>{throw Error('Unexpected confirmation');}});
 vm.runInContext(readFileSync(new URL('../dist/dubbing-recording.js',import.meta.url),'utf8'),ctx);
 const lines=[{id:'a',roleId:'mine',text:'最初',start:4,end:5,recordEnd:5.5},{id:'b',roleId:'other',text:'相手',start:6,end:7,recordEnd:7.5},{id:'c',roleId:'mine',text:'最後',start:8,end:9,recordEnd:9.5}];
 const s={p:{id:'fixture',script:{lines},roles:[{id:'mine',name:'내 배역'},{id:'other',name:'상대'}]},data:{lines,recording:{roles:[{roleId:'mine',state:'draft',revision:1}]}},root,role:'mine',line:'a',takes:new Map(),buffers:new Map(),sources:[],ctx:{sampleRate:48000,currentTime:0},cursor:0,dirty:false};
 return {ctx,s,nodes,messages};
}
function record(c,s,line){s.line=line;s.samples=new Float32Array(24000);s.cursor=.5;s.pendingTake=null;c.dubbingRememberTake(s);}

test('switching lines keeps all takes, checks recorded lines and counts unsaved recordings without asking',()=>{
 const {ctx,s,nodes}=setup();record(ctx,s,'a');ctx.dubbingSelectTake(s,'c');
 assert.equal(s.samples,null);assert.equal(s.dirty,true);assert.ok(nodes.get('#dubbing-record-lines').innerHTML.includes('✓ 녹음됨 · 저장 전'));
 record(ctx,s,'c');ctx.dubbingSelectTake(s,'a');assert.equal(s.cursor,.5);assert.equal(s.takes.size,2);
 assert.match(nodes.get('#dubbing-record-count').textContent,/2 \/ 2개 녹음 · 2개 저장 전/);
 assert.equal(nodes.get('#dubbing-record-submit').disabled,true);
});

test('one save uploads all pending takes in revision order and retries only the remaining take after a failure',async()=>{
 const calls=[];let fail=true;const {ctx,s,nodes}=setup(async url=>{
  calls.push(url);if(url.includes('/c?')&&fail){fail=false;return {ok:false,status:503,json:async()=>({error:'연결 끊김'})};}
  const line=url.includes('/a?')?'a':'c';const revision=line==='a'?2:3;
  const lines=s.data.lines.map(l=>l.id===line?{...l,audioUrl:'/saved/'+line,takeId:'saved',duration:.5}:l);
  return {ok:true,json:async()=>({lines,recording:{roles:[{roleId:'mine',state:'draft',revision}]}})};
 });
 record(ctx,s,'a');record(ctx,s,'c');const pending=s.takes.get('c').takeId;
 await ctx.dubbingSaveRecording(s);assert.equal(s.takes.get('a').dirty,false);assert.equal(s.takes.get('c').dirty,true);assert.equal(s.dirty,true);
 assert.match(calls[0],/revision=1/);assert.match(calls[1],/revision=2/);
 await ctx.dubbingSaveRecording(s);assert.equal(calls.length,3);assert.ok(calls[2].includes('take='+pending));assert.ok(calls[2].includes('/c?'));
 assert.equal(s.dirty,false);assert.equal(nodes.get('#dubbing-record-submit').disabled,false);assert.match(nodes.get('#dubbing-record-lines').innerHTML,/✓ 임시 저장됨/);
});

test('3 2 1 pre-roll never consumes spoken recording time',()=>{
 const {ctx,s,nodes}=setup();s.run={offset:0,t0:4};
 for(const [now,label] of [[0,'효과음을 듣고 준비하세요'],[1,'3'],[2,'2'],[3,'1']]){
  s.ctx.currentTime=now;ctx.dubbingRecordTick(s);assert.equal(nodes.get('#dubbing-record-cue').textContent,label);assert.equal(nodes.get('#dubbing-record-progress').value,0);
 }
 s.ctx.currentTime=4.5;ctx.dubbingRecordTick(s);assert.equal(nodes.get('#dubbing-record-cue').textContent,'지금 대사하세요');assert.equal(nodes.get('#dubbing-record-progress').value,.5);
});

// Controller tests use an in-memory audio clock and PCM, never a physical mic.
import {placeChunks} from '../shared/karaoke-audio.js';
const code=readFileSync(new URL('../dist/dubbing-recording.js',import.meta.url),'utf8');
function harness(){
 const tracks=[],sources=[];
 const context={currentTime:10,sampleRate:48000,destination:{},audioWorklet:{async addModule(){}},createGain(){return {gain:{value:1},connect(){return this;},disconnect(){}};},createMediaStreamSource(){return {connect(next){return next;},disconnect(){}};},async close(){context.closed=true;}};
 const sandbox={Float32Array,Map,AbortSignal,crypto,console,setTimeout,clearTimeout,requestAnimationFrame(){return 1;},cancelAnimationFrame(){},confirm:()=>true,history:{replaceState(){}},toast(){},window:{addEventListener(){}},document:{hidden:false,addEventListener(){}},navigator:{mediaDevices:{async getUserMedia(){const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]};}}},AifectKaraoke:{placeChunks},AudioWorkletNode:class{constructor(){this.port={postMessage:()=>this.port.onmessage({data:'done'})};}connect(next){return next;}disconnect(){}}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 vm.runInContext("dubbingRecordDraw=()=>{};dubbingRecordMessage=(s,m)=>{s.message=m;};dubbingPlayGuide=(s,from,when)=>{s.guide={from,when};};",sandbox);
 sandbox.dubbingRecordAudio=async s=>{s.ctx=context;};
 const state={p:{id:'local-project',sound:{id:'background'}},data:{recording:{roles:[{roleId:'role',state:'draft',revision:1}]},lines:[{id:'line',roleId:'role',start:2,end:4,recordEnd:5}]},role:'role',line:'line',cursor:0,busy:false,closed:false,sources,takes:new Map(),route:'dubbing/local?record=1'};
 const chunk=(start,length,value)=>state.run.node.port.onmessage({data:{t:start,d:new Float32Array(length).fill(value)}});
 return {sandbox,state,context,tracks,chunk};
}
test('pause/resume keeps earlier PCM and drops the preparation interval',async()=>{
 const h=harness(),{sandbox:s,state:r,context:c}=h;
 await s.dubbingStartRecording(r);const first=r.run.t0;
 assert.equal(r.guide.from,0);assert.equal(r.run.mute.gain.value,0);
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
 assert.equal(r.cursor,3);assert.equal(r.samples.length,3*48000);assert.equal(r.run,null);assert.equal(r.dirty,true);assert.match(r.message,/임시 저장/);
});
test('microphone denial recovers controls and leaving closes tracks and audio context',async()=>{
 const h=harness(),{sandbox:s,state:r,context:c}=h;const media=s.navigator.mediaDevices.getUserMedia;
 s.navigator.mediaDevices.getUserMedia=async()=>{throw Error('permission denied');};await s.dubbingStartRecording(r);assert.equal(r.busy,false);assert.ok(!r.run);assert.match(r.message,/permission/);
 s.navigator.mediaDevices.getUserMedia=media;await s.dubbingStartRecording(r);s.dubbingReleaseRecorder(r);
 assert.ok(h.tracks[0].stopped);assert.equal(r.closed,true);assert.equal(c.closed,true);assert.equal(r.run,null);
});
