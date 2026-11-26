import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {punchClock,punchCountdown,punchLyricLines,punchLyricRange,planPunch,capturedPunch,analyzePunch} from '../shared/punch-recording.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mergeTake} from '../shared/karaoke-audio.js';
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
test('audio-clock punch covers measured input and output delay at both ends of the song',()=>{
 for(const prepare of [3,5,8]){
  const start=planPunch({start:0,end:3},{start:0,end:14},[],prepare,100,.08);
  assert.ok(Math.abs(start.recordClock-100.15-prepare)<1e-9);
  assert.equal(start.from,0);assert.equal(start.start,0);
  assert.ok(Math.abs(start.captureClock-start.recordClock-.08)<1e-9);
  const end=planPunch({start:11,end:14},{start:0,end:14},words,prepare,200,.15);
  assert.equal(end.end,14);
  assert.ok(Math.abs(end.endClock-end.t0-14-.15)<1e-9);
 }
});

test('adaptive joins preserve dry audio, honor actual overlap and avoid adjacent lyrics',()=>{
 const rate=32000,old=new Float32Array(14*rate),capture=new Float32Array(7*rate);
 for(let i=0;i<old.length;i++)if(i<4.98*rate||i>5.04*rate&&i<7.96*rate||i>8.06*rate)old[i]=Math.sin(i*2*Math.PI*220/rate)*.10;
 for(let i=0;i<capture.length;i++){
  const t=3+i/rate;
  if(t>5.04&&t<7.99)capture[i]=Math.sin(i*2*Math.PI*246/rate)*.19;
 }
 const snapshot=old.slice();
 const take=capturedPunch([{t:101,d:capture.subarray(0,64000)},{t:103,d:capture.subarray(64000)}],101,{start:3,end:10},rate,rate,.05);
 const plan=analyzePunch(old,take,{start:5,end:8},words,.05);
 assert.ok(plan);assert.equal(plan.warning,false);assert.ok(plan.range.start>=4.58&&plan.range.start<=5);
 assert.ok(plan.range.end>=8&&plan.range.end<=8.42);
 assert.ok(plan.fades.start>0&&plan.fades.start<=.2);assert.ok(plan.fades.end>0&&plan.fades.end<=.2);
 const edited=old.slice();edited.set(plan.samples,plan.first);
 assert.deepEqual(edited.slice(0,plan.first),snapshot.slice(0,plan.first));
 assert.deepEqual(edited.slice(plan.end),snapshot.slice(plan.end));
 assert.deepEqual(old,snapshot);
 assert.equal(Math.sign(edited[plan.first]-snapshot[plan.first]),0);
 assert.ok(edited.some((sample,i)=>sample!==old[i]));
 assert.equal(analyzePunch(old,take,{start:2,end:9},[],.05),null);
 assert.equal(capturedPunch([{t:101,d:capture.subarray(0,64000)},{t:103.02,d:capture.subarray(64000)}],101,{start:3,end:10},rate,rate,.05),null);
 assert.equal(capturedPunch([{t:101,d:new Float32Array(7*rate)}],101,{start:3,end:10},rate,rate,0),null);
 const loud=capturedPunch([{t:101,d:new Float32Array(7*rate).fill(1)}],101,{start:3,end:10},rate,rate,0);
 assert.equal(analyzePunch(old,loud,{start:5,end:8},words,0).warning,true);
});

test('finishing or cancelling a punch leaves the source and saved draft untouched',async()=>{
 const code=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),finish=code.slice(code.indexOf('async function finishSinging('),code.indexOf('function studioRangeHTML'));
 const ui=readFileSync(new URL('../dist/sing-punch.js',import.meta.url),'utf8');
 const completion=ui.slice(ui.indexOf('function completePunch('),ui.indexOf('async function acceptPunchResult('));
 for(const discardPunch of [false,true]){
  const rate=8000,original=new Float32Array(10*rate).fill(.2),range={start:2,end:4},plan={start:1,end:5,captureClock:101};
  const s={state:'singing',voice:{getChannelData:()=>original,sampleRate:rate},punchRange:range,punchReturn:'select',punchSelection:range,mix:{offset:0},mr:{duration:10},ctx:{sampleRate:rate,currentTime:105}};
  s.run={recordAt:1,recordClock:101,from:0,t0:100,punchRange:range,punchPlan:plan,chunks:[{t:101,d:new Float32Array(4*rate).fill(-.2)}],captureDone:true,src:{stop(){}},monitor:{gain:{}}};
  const context=nicknameContext({sing:s,canEditPaid:()=>true,Float32Array,singLive:take=>take.state==='singing',cancelAnimationFrame(){},paintPunchCountdown(){},updateTransport(){},setSingStatus(){},releaseRun(){},renderStudioEditTool(){},drawLyrics(){},returnPunchLyrics(){},punchBounds:()=>plan,fitTakeRange:r=>r,K:()=>({capturedPunch})});
  vm.runInContext(finish+completion,context);await context.finishSinging({discardPunch});
  assert.strictEqual(s.voice.getChannelData(0),original);assert.equal(s.dirty,undefined);
  assert.equal(s.punchPage,discardPunch?'select':'result');
  assert.equal(s.punchCandidates?.length??0,discardPunch?0:1);
 }
});

test('ordinary continuation keeps only the prefix of any previous premium edit and backs it up',async()=>{
 const code=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8'),finish=code.slice(code.indexOf('async function finishSinging('),code.indexOf('function studioRangeHTML'));
 const rate=100,original=new Float32Array(600).fill(.1),edited=original.slice();
 edited.fill(.2,100,300);
 const buffer=data=>({duration:data.length/rate,getChannelData:()=>data,copyToChannel:array=>data.set(array)});
 const s={state:'singing',voice:buffer(edited),beforePunch:buffer(original),punchUndo:[{first:100,range:{start:1,end:3},samples:original.slice(100,300)}],
  mr:{duration:6},ctx:{sampleRate:rate,currentTime:104,createBuffer:(_,len)=>buffer(new Float32Array(len))}};
 s.run={recordAt:2,recordClock:102,from:0,t0:100,keyEvents:[{at:2,key:0}],chunks:[{t:102,d:new Float32Array(200).fill(.3)}],
  captureDone:true,src:{stop(){}},monitor:{gain:{}}};
 const context=nicknameContext({sing:s,singLive:take=>take.state==='singing',cancelAnimationFrame(){},paintPunchCountdown(){},updateTransport(){},
  setSingStatus(){},releaseRun(){},renderSingPanel(){},drawLyrics(){},cleanupPunch(){},refreshVocalGuide(){},renderDuetGuide(){},time:String,K:()=>({mergeTake})});
 vm.runInContext(finish,context);await context.finishSinging();
 assert.equal(s.punchUndo.length,1);assert.equal(s.punchUndo[0].samples.length,100);
 assert.deepEqual(s.beforePunch.getChannelData(0).slice(0,200),original.slice(0,200));
 assert.deepEqual(s.voice.getChannelData(0).slice(0,200),edited.slice(0,200));
 assert.deepEqual(s.beforePunch.getChannelData(0).slice(200),s.voice.getChannelData(0).slice(200));
});
test('premium authorization is server enforced for opening and recording, while normal singing stays free',async t=>{
 const f=await fixture(t),path='/api/karaoke/one/rerecord',crop='/api/karaoke/one/crop';
 const selection={duration:20,start:1,end:6};
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'");
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','job','ready',1,'ready',?,0,0)").run(JSON.stringify(words));
 assert.equal((await f.call(path,'GET',null,null)).status,401);
 assert.equal((await f.call(crop,'POST',selection,null)).status,401);
 assert.equal((await f.call(path)).status,403);
 assert.equal((await f.call(path,'POST',{duration:20,first:0})).status,403);
 assert.equal((await f.call(crop,'POST',selection)).status,403);
 assert.equal((await f.call('/api/account/summary')).body.plan,'free');
 assert.equal((await f.call('/api/karaoke/one')).status,200);
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");
 const account=(await f.call('/api/account/summary')).body;
 assert.equal(account.plan,'premium');
 assert.deepEqual(account.benefits.map(({label})=>label),['광고 없는 이용','고음질 스트리밍','제작곡 월 10곡','음색 보정','구간 재녹음','구간 크롭','프리미엄 배지','골드 닉네임','전용 프로필 테두리']);
 assert.equal((await f.call(path)).status,200);
 const ok=await f.call(path,'POST',{duration:20,first:0,last:1});assert.equal(ok.status,200);assert.deepEqual(ok.body.range,{start:0,end:8});assert.equal(ok.body.countdown,3);
 const cropped=await f.call(crop,'POST',selection);
 assert.equal(cropped.status,200);
 assert.deepEqual(cropped.body.range,{start:1,end:6});
 for(const body of [{...selection,start:-1},{...selection,end:1.01},{...selection,end:21},{...selection,duration:21},{...selection,start:'1'}])assert.equal((await f.call(crop,'POST',body)).status,400);
 for(const body of [{duration:20,first:7,last:7},{duration:999,first:0,last:0},{duration:20,first:0,last:0,manual:true,start:-1,end:2}])assert.equal((await f.call(path,'POST',body)).status,400);
 f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");assert.equal((await f.call(path,'POST',{duration:20,first:0,last:0})).status,403);
 assert.equal((await f.call(crop,'POST',selection)).status,403);
});

test('manual punch can be authorized without aligned lyrics',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'; UPDATE users SET premium_until=unixepoch()+60 WHERE id='owner'");
 f.sql.exec("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','mr-only','ready',1,'attention','[]',0,0)");
 const result=await f.call('/api/karaoke/one/rerecord','POST',{duration:20,manual:true,start:0,end:2.25});
 assert.equal(result.status,200);assert.deepEqual(result.body.range,{start:0,end:2.25});
});

test('premium edit publication preserves authority and rebases cropped lyrics',async t=>{
 const f=await fixture(t,{BUCKET:{head:async()=>({size:300})}});
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'");
 const aligned=words.map(line=>({...line,w:line.w.map(word=>({...word,s:line.s}))}));
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','crop-job','ready',1,'ready',?,0,0)").run(JSON.stringify(aligned));
 const body={request_id:'8997e72b-6bed-4fda-8c98-dd14c2661450',original_id:'one',extension:'mp3',bytes:300,own_voice:true,rights:true,
  recording_edit:{rerecorded:true,tone:true,crop:{start:6,end:12,duration:20}}};
 for(const edit of [{tone:true},{rerecorded:true},body.recording_edit])assert.equal((await f.call('/api/covers','POST',{...body,recording_edit:edit})).status,403);
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+60 WHERE id='owner'");
 const created=await f.call('/api/covers','POST',body);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.id;
 const row=()=>f.sql.prepare('SELECT status,recording_edit,lyrics FROM tracks WHERE id=?').get(id);
 assert.deepEqual(JSON.parse(row().recording_edit).window,{start:6,end:12});
 assert.match(row().lyrics,/\[00:00[.:]0+\]두 번째/);
 assert.match(row().lyrics,/\[00:04[.:]0+\]세 번째/);
 assert.equal((await f.call('/api/covers','POST',{...body,recording_edit:undefined})).status,409);
 f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");
 assert.equal((await f.call('/api/uploads/'+id+'/complete','POST')).status,403);
 assert.equal(row().status,'uploading');
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+60 WHERE id='owner'");
 assert.equal((await f.call('/api/uploads/'+id+'/complete','POST')).status,200);
 f.sql.prepare("UPDATE tracks SET status='published',duration=6 WHERE id=?").run(id);
 const line=await f.call('/api/tracks/'+id+'/lyrics/line?at=4.2');
 assert.equal(line.status,200);assert.equal(line.body.line.text,'세 번째');
});

test('duet invitations carry their cropped clock and retain inherited part assignments',async t=>{
 const f=await fixture(t,{BUCKET:{head:async()=>({size:300})}});
 f.sql.exec("UPDATE tracks SET karaoke_at=1,duration=20 WHERE id='one'; UPDATE users SET premium_until=unixepoch()+60 WHERE id='owner'");
 const aligned=words.map(line=>({...line,w:line.w.map(word=>({...word,s:line.s}))}));
 f.sql.prepare("INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,words,created,updated) VALUES('one','crop-duet','ready',1,'ready',?,0,0)").run(JSON.stringify(aligned));
 const base={original_id:'one',extension:'mp3',bytes:300,own_voice:true,rights:true,cover_mode:'duet'};
 const create=await f.call('/api/covers','POST',{...base,publish_as:'duet_invitation',duet_slot:'first',duet_consent:true,
  duet_guide:{mode:'lyrics',version:1,lines:['A','A','B']},recording_edit:{crop:{start:6,end:14,duration:20}}});
 assert.equal(create.status,201,JSON.stringify(create.body));
 f.sql.prepare("UPDATE tracks SET status='published',duration=8 WHERE id=?").run(create.body.id);
 const invitation=await f.call('/api/duets/'+create.body.id,'GET',null,'other');
 assert.equal(invitation.status,200,JSON.stringify(invitation.body));
 assert.equal(invitation.body.track.duration,8);
 assert.deepEqual(invitation.body.duet.guide.lines,['A','B']);
 assert.deepEqual(invitation.body.words.map(line=>[line.s,line.e]),[[0,2],[4,7]]);
 const join=await f.call('/api/covers','POST',{...base,publish_as:'duet_complete',duet_slot:'second',duet_parent_id:create.body.id},'other');
 assert.equal(join.status,201,JSON.stringify(join.body));
 const edit=JSON.parse(f.sql.prepare('SELECT recording_edit FROM tracks WHERE id=?').get(join.body.id).recording_edit);
 assert.equal(edit.premium,false);assert.deepEqual(edit.window,{start:6,end:14});
});
