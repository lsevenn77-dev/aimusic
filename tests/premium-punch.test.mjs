import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {punchClock,punchCountdown,punchLyricLines,punchLyricRange} from '../shared/punch-recording.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {replaceTakeRange} from '../shared/karaoke-audio.js';
const words=[{s:0,e:3,w:[{t:'첫 가사',e:3}]},{s:5,e:8,w:[{t:'두 번째',e:8}]},{s:10,e:13,w:[{t:'세 번째',e:13}]}];
test('lyric ranges support one line, reverse selection and short takes, with a full countdown at zero',()=>{
 assert.deepEqual(punchLyricRange(words,20,1),{first:1,last:1,count:1,start:5,end:8});
 assert.equal(punchLyricRange(words,20,2,0).end,13);
 assert.equal(punchLyricLines(words,6)[1].end,6);
 assert.throws(()=>punchLyricRange(words,4,2));
 for(const start of [0,1,2,10]){
  const c=punchClock(start,100);assert.equal(c.recordClock,103.15);
  assert.ok(Math.abs(c.t0+start-c.from-c.recordClock)<1e-8);
  assert.deepEqual([100.16,101.16,102.16,103.16].map(t=>punchCountdown(c.recordClock,t)),[3,2,1,0]);
 }
});
test('completed punch keeps original audio and draft untouched until acceptance, and cancellation preserves it',async()=>{
 const code=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),finish=code.slice(code.indexOf('async function finishSinging('),code.indexOf('function studioRangeHTML'));
 for(const discardPunch of [false,true]){
  let saves=0;const original=Float32Array.from({length:100},(_,i)=>i/100),buffer=data=>({getChannelData:()=>data,copyToChannel:v=>data.set(v),duration:data.length/10});
  const s={state:'singing',voice:buffer(original),punchRange:{start:2,end:4},punchSelection:{first:0,last:1},mr:{duration:10},ctx:{sampleRate:10,currentTime:104,createBuffer:(_n,len)=>buffer(new Float32Array(len))}};
  s.run={recordAt:2,recordClock:102,from:0,t0:100,punchRange:s.punchRange,chunks:[{t:102,d:new Float32Array(20).fill(-.2)}],src:{stop(){}},monitor:{gain:{}},node:{port:{postMessage(){s.run.flushed();}}}};
  const context=nicknameContext({sing:s,Float32Array,setTimeout,clearTimeout,singLive:s=>s?.state==='singing',cancelAnimationFrame(){},paintPunchCountdown(){},updateTransport(){},setSingStatus(){},releaseRun(){},renderSingPanel(){},showPunchComplete(s){s.punchPage='result';},saveSingDraft(){saves++;},K:()=>({replaceTakeRange})});
  vm.runInContext(finish,context);await context.finishSinging({discardPunch});
  assert.strictEqual(s.voice.getChannelData(0),original);assert.equal(saves,0);
  if(discardPunch){assert.equal(s.punchPage,'select');assert.equal(s.pendingPunch,undefined);}else{
   assert.equal(s.punchPage,'result');const take=s.pendingPunch.voice.getChannelData(0);assert.deepEqual(take.slice(0,20),original.slice(0,20));assert.deepEqual(take.slice(40),original.slice(40));assert.ok(take[25]<0);
  }
 }
});
test('premium authorization is server enforced for opening and recording, while normal singing stays free',async t=>{
 const f=await fixture(t),path='/api/karaoke/one/rerecord';
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'");
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','job','ready',1,'ready',?,0,0)").run(JSON.stringify(words));
 assert.equal((await f.call(path,'GET',null,null)).status,401);
 assert.equal((await f.call(path)).status,403);
 assert.equal((await f.call(path,'POST',{duration:20,first:0})).status,403);
 assert.equal((await f.call('/api/karaoke/one')).status,200);
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 assert.equal((await f.call(path)).status,200);
 const ok=await f.call(path,'POST',{duration:20,first:0,last:1});assert.equal(ok.status,200);assert.deepEqual(ok.body.range,{start:0,end:8});assert.equal(ok.body.countdown,3);
 for(const body of [{duration:20,first:7,last:7},{duration:999,first:0,last:0},{duration:20,first:0,last:0,manual:true,start:-1,end:2}])assert.equal((await f.call(path,'POST',body)).status,400);
 f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");assert.equal((await f.call(path,'POST',{duration:20,first:0,last:0})).status,403);
});
