import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
import * as karaoke from '../shared/karaoke-audio.js';
import * as duet from '../shared/duet-guide.js';

const source=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8');
const words=[{s:0,w:[{t:'첫 소절',s:0,e:3}]},{s:6,w:[{t:'다음 소절',s:6,e:9}]}];
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function element(extra={}){
 const attrs={},classes=new Set();
 return {dataset:{},attrs,innerHTML:'',textContent:'',hidden:false,disabled:false,isConnected:true,
  setAttribute(name,value){attrs[name]=String(value);},getAttribute(name){return attrs[name]??null;},removeAttribute(name){delete attrs[name];},
  classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},contains:name=>classes.has(name),toggle(name,force){const on=force??!classes.has(name);if(on)classes.add(name);else classes.delete(name);return on;}},
  querySelector:()=>null,querySelectorAll:()=>[],scrollIntoView(){},focus(){},...extra};
}
function fixture(extra={}){
 const main=element({dataset:{route:'sing/one?mode=solo'},innerHTML:'CURRENT RECORDER'}),panel=element(),dialog=element({open:false});
 const counts={render:0,api:0,transport:0,panels:0,guides:0,stop:0,sync:0,deleted:0},positions=[],messages=[];
 const location={hash:'#sing/one?mode=solo',href:'https://aifect.co.kr/#sing/one?mode=solo'};
 const history={state:{keep:'navigation'},replaceState(state,_title,href){this.state=state;location.hash=href;location.href='https://aifect.co.kr/'+href;}};
 const nodes={'#main':main,'#sing-panel':panel,'#dialog':dialog,'#sing':element(),'#sing-monitor':element({checked:false})};
 const c=nicknameContext({
  URLSearchParams,me:{id:'owner'},playSerial:0,location,history,
  window:{AifectKaraoke:karaoke,addEventListener(){},AifectRender:{syncTarget(){counts.sync++;}}},
  document:{addEventListener(){},querySelectorAll:()=>[],querySelector:q=>nodes[q]||null,getElementById:id=>nodes['#'+id]||null,hidden:false},
  AifectDuetGuide:duet,esc:String,time:String,icon:()=>'',audio:{pause(){}},cancelAnimationFrame(){},
  cleanupPunch(){},cancelKeyProcessing(){},cancelVocalEffects(){},paintPunchCountdown(){},
  render(){counts.render++;throw Error('Mode switching must not remount the recorder');},
  api(){counts.api++;throw Error('Mode switching must not refetch the song');},
  removeSingDraft(){counts.deleted++;throw Error('Switching mode must not delete saved drafts');},
  $:q=>nodes[q]||null,counts,positions,messages,...extra
 });
 vm.runInContext(source,c);
 c.actualRenderDuetGuide=vm.runInContext('renderDuetGuide',c);
 vm.runInContext('updateTransport=()=>{counts.transport++;};renderSingPanel=()=>{counts.panels++;};renderDuetGuide=()=>{counts.guides++;};drawLyrics=t=>positions.push(t);setSingStatus=t=>messages.push(t);stopPreview=()=>{counts.stop++;};stopStandbyMonitor=()=>{};',c);
 const take={id:'one',owner:'owner',mode:'solo',part:'male',parent:null,state:'idle',cursor:0,mix:{...karaoke.defaultVocalMix(),voice:.7,mr:.8,room:.6},keySemitones:2,ctx:{sampleRate:32000},mr:{duration:30},data:{track:{id:'one',duration:30},words,mode:'solo'},duetGuide:{version:1,mode:'lyrics',lines:['A','B']},routeHash:location.hash};
 c.take=take;vm.runInContext('sing=take',c);
 return {c,take,counts,positions,messages,main,panel,dialog,location,nodes,run:code=>vm.runInContext(code,c)};
}

test('recording preparation stays hidden through capture, pause and review and reopens only for an explicit restart',()=>{
 const f=fixture();
 for(const [state,expected] of [
  [{state:'idle'},true],
  [{state:'loading',startingRecording:true},false],
  [{state:'preroll',preparationOpen:false},false],
  [{state:'singing',preparationOpen:false},false],
  [{state:'review',voice:{},editingRecording:true,preparationOpen:false},false],
  [{state:'review',voice:{},editingRecording:false,preparationOpen:false},false],
  [{state:'review',voice:{},editingRecording:false},false],
  [{state:'review',voice:{},editingRecording:true,preparationOpen:true},true],
  [{state:'idle',preparationOpen:false},false],
  [{state:'review',voice:{},editingRecording:true,preparationOpen:true,punchPage:'select'},false],
  [{state:'review',voice:{},editingRecording:true,preparationOpen:true,punchRange:{start:1,end:2}},false]
 ]){
  f.c.state=state;
  assert.equal(f.run('singPreparationVisible(state)'),expected,JSON.stringify(state));
 }
 assert.equal(f.run('singPreparationVisible(null)'),false);
});

test('standalone songs expose both recording modes while an inherited duet cannot become a solo recording',()=>{
 const f=fixture();
 for(const mode of ['solo','duet']){
  f.c.data={mode};const html=f.run('singRecordingModeHTML(data)');
  assert.match(html,/data-sing-record-mode="solo"/);
  assert.match(html,/data-sing-record-mode="duet"/);
  assert.match(html,new RegExp('data-sing-record-mode="'+mode+'"[^>]*aria-pressed="true"'));
 }
 f.c.data={mode:'duet',duet:{parent_id:'partner-take'}};
 assert.equal(f.run('singRecordingModeHTML(data)'),'');
});

test('switching a fresh take preserves audio settings, MR and session while synchronizing the route in place',async()=>{
 const f=fixture(),settings=f.take.mix,context=f.take.ctx,backing=f.take.mr,guide=f.take.duetGuide;
 assert.equal(await f.run("switchSingRecordingMode('duet')"),true);
 assert.equal(f.run('sing'),f.take);
 assert.equal(f.take.mode,'duet');assert.equal(f.take.data.mode,'duet');
 assert.equal(f.take.mix,settings);assert.equal(f.take.ctx,context);assert.equal(f.take.mr,backing);assert.equal(f.take.duetGuide,guide);assert.equal(f.take.keySemitones,2);
 assert.match(f.location.hash,/mode=duet/);assert.equal(f.take.routeHash,f.location.hash);
 assert.equal(f.main.dataset.route,f.location.hash.slice(1));assert.equal(f.main.innerHTML,'CURRENT RECORDER');
 assert.equal(f.counts.api,0);assert.equal(f.counts.render,0);assert.ok(f.counts.sync>0);
 assert.equal(await f.run("switchSingRecordingMode('solo')"),true);
 assert.equal(f.take.mode,'solo');assert.match(f.location.hash,/mode=solo/);
 assert.equal(f.take.duetGuide,guide);assert.equal(f.take.mix,settings);
});

test('mode switching refuses capture, hidden preparation, busy recorders and inherited duet sessions',async()=>{
 const variants=[
  {state:'singing',preparationOpen:false},
  {state:'preroll',preparationOpen:false},
  {state:'loading',startingRecording:true},
  {state:'exporting'},
  {state:'stopping'},
  {preparationOpen:false},
  {punchRange:{start:1,end:2}},
  {punchPage:'select'},
  {parent:'partner-take',mode:'duet',data:{mode:'duet',duet:{parent_id:'partner-take'}},partnerStem:{id:'partner'},instrumentStem:{id:'backing'}}
 ];
 for(const change of variants){
  const f=fixture();Object.assign(f.take,change);const before=JSON.stringify(f.take),target=f.take.mode==='solo'?'duet':'solo';f.c.target=target;
  assert.equal(await f.run('switchSingRecordingMode(target)'),false,JSON.stringify(change));
  assert.equal(JSON.stringify(f.take),before);assert.equal(f.counts.api,0);assert.equal(f.counts.render,0);
 }
 const f=fixture();
 for(const mode of ['solo','unknown','']){f.c.target=mode;assert.equal(await f.run('switchSingRecordingMode(target)'),false);}
});

test('restart stops playback and preserves the old take, selected mode, part choices and audio settings at zero',async()=>{
 const f=fixture(),voice={length:16000,duration:.5},settings=f.take.mix,guide=f.take.duetGuide;
 Object.assign(f.take,{voice,mode:'duet',state:'playing',cursor:12,preparationOpen:false,previewRequest:4,editingRecording:false});
 await f.run('restartSinging()');
 assert.equal(f.take.voice,voice);assert.equal(f.take.mode,'duet');assert.equal(f.take.mix,settings);assert.equal(f.take.duetGuide,guide);assert.equal(f.take.keySemitones,2);
 assert.equal(f.take.cursor,0);assert.equal(f.take.editingRecording,true);assert.equal(f.take.preparationOpen,true);
 assert.equal(f.run('singPreparationVisible(sing)'),true);assert.equal(f.take.state,'review');
 assert.ok(f.counts.stop>0);assert.ok(f.take.previewRequest>4);assert.equal(f.positions.at(-1),0);
 assert.equal(f.counts.deleted,0);
});

test('restart waits for live audio to finish and cannot reset a replacement recording session',async()=>{
 const f=fixture(),finished=deferred();f.c.finished=finished.promise;
 Object.assign(f.take,{state:'singing',cursor:10,preparationOpen:false});
 f.run("finishSinging=async()=>{sing.state='stopping';await finished;};");
 const work=f.run('restartSinging()');
 assert.equal(f.take.preparationOpen,false);assert.equal(f.take.cursor,10);
 const replacement={id:'other',mode:'solo',state:'idle',cursor:9};f.c.replacement=replacement;f.run('sing=replacement');
 finished.resolve();await work;
 assert.equal(f.run('sing'),replacement);assert.equal(replacement.cursor,9);assert.equal(replacement.preparationOpen,undefined);
});

test('cancelling a mode change preserves the existing take and its draft route without deleting local drafts',async()=>{
 const f=fixture(),voice={length:32000,duration:1};
 Object.assign(f.take,{voice,state:'review',editingRecording:true,preparationOpen:true,savedAt:123,publishRequest:'existing-publish',keyEvents:[{at:0,key:2}]});
 f.take.routeHash=f.location.hash='#sing/one?mode=solo&draft=1';f.main.dataset.route=f.location.hash.slice(1);
 const before=JSON.stringify(f.take),route=f.location.hash;
 f.run('askSingModeChange=async()=>false');
 assert.equal(await f.run("switchSingRecordingMode('duet')"),false);
 assert.equal(f.take.voice,voice);assert.equal(f.take.mode,'solo');assert.equal(f.location.hash,route);assert.equal(f.take.savedAt,123);assert.equal(f.take.publishRequest,'existing-publish');
 const after={...f.take};delete after.modeSwitchPending;
 const expected=JSON.parse(before);delete expected.modeSwitchPending;
 assert.deepEqual(JSON.parse(JSON.stringify(after)),expected);
 assert.equal(f.counts.deleted,0);assert.equal(f.counts.render,0);
});

test('confirmed mode changes reset only the current take and keep manually assigned duet parts and mixer settings',async()=>{
 const f=fixture(),settings=f.take.mix,guide=f.take.duetGuide,backing=f.take.mr,context=f.take.ctx;
 Object.assign(f.take,{voice:{length:32000,duration:1},beforePunch:{},processed:{},keyEvents:[{at:0,key:1}],keyMR:{},publishRequest:'old-publish',savedAt:123,editMixBaseline:{},state:'review',editingRecording:true,preparationOpen:true,selection:{start:2,end:3},abEnabled:true});
 f.take.routeHash=f.location.hash='#sing/one?mode=solo&draft=1';
 f.run('askSingModeChange=async()=>true');
 assert.equal(await f.run("switchSingRecordingMode('duet')"),true);
 for(const key of ['voice','beforePunch','processed','keyEvents','keyMR','publishRequest','editMixBaseline'])assert.ok(!f.take[key],key+' must not cross recording modes');
 assert.equal(f.take.savedAt,0);assert.equal(f.take.cursor,0);assert.equal(f.take.mode,'duet');
 assert.equal(f.take.mix,settings);assert.equal(f.take.duetGuide,guide);assert.equal(f.take.mr,backing);assert.equal(f.take.ctx,context);assert.equal(f.take.keySemitones,2);
 assert.equal(f.take.abEnabled,false);assert.ok(!f.take.selection);assert.doesNotMatch(f.location.hash,/draft=1/);
 assert.equal(f.counts.deleted,0);assert.equal(f.counts.api,0);assert.equal(f.counts.render,0);
});

test('automatic activity from a discarded take does not leak into a newly selected recording mode',async()=>{
 const f=fixture();Object.assign(f.take,{mode:'duet',voice:{length:32000},state:'review',editingRecording:true,preparationOpen:true,duetGuide:{version:1,mode:'free',lines:[],activity:[{start:0,end:1}]}});
 f.run('askSingModeChange=async()=>true');
 assert.equal(await f.run("switchSingRecordingMode('solo')"),true);
 assert.ok(!f.take.duetGuide.activity);
 assert.equal(f.take.duetGuide.mode,'free');assert.equal(f.take.duetGuide.lines.length,0);
});

test('switching back to solo removes duet lyric roles and restores ordinary accessible lyric labels',()=>{
 const f=fixture(),rows=words.map(()=>element()),legend=element(),partButton=element();
 const host=element({querySelector:q=>q==='[data-duet-editor]'?partButton:null});f.nodes['#duet-guide']=host;
 f.c.document.querySelectorAll=q=>q==='[data-sing-line]'?rows:q==='[data-sing-part-legend]'?[legend]:[];
 f.take.mode='duet';f.c.actualRenderDuetGuide();
 assert.equal(legend.hidden,false);assert.match(host.innerHTML,/파트 나누기/);
 assert.equal(rows[0].dataset.partRole,'mine');assert.equal(rows[1].dataset.partRole,'partner');
 assert.match(rows[0].attrs['aria-label'],/내 파트/);assert.match(rows[1].attrs['aria-label'],/상대 파트/);
 f.take.mode='solo';f.c.actualRenderDuetGuide();
 assert.equal(legend.hidden,true);assert.equal(host.innerHTML,'');
 for(const [index,row] of rows.entries()){
  assert.equal(row.dataset.partRole,undefined);
  assert.equal(row.attrs['aria-label'],words[index].s+' '+words[index].w.map(word=>word.t).join(' '));
 }
});

test('hidden preparation controls leave the layout node in place and cannot receive keyboard focus or clicks',()=>{
 const f=fixture(),buttons=['solo','duet'].map(mode=>element({dataset:{singRecordMode:mode}})),partButton=element();
 const group=element({querySelectorAll:q=>q==='[data-sing-record-mode]'?buttons:q==='[data-duet-editor]'?[partButton]:[]});
 f.nodes['[data-sing-prep-controls]']=group;
 f.run('updateSingPreparation()');
 assert.equal(group.inert,false);assert.equal(group.attrs['aria-hidden'],'false');assert.equal(buttons[0].attrs['aria-pressed'],'true');
 Object.assign(f.take,{state:'singing',preparationOpen:false});f.run('updateSingPreparation()');
 assert.equal(group.inert,true);assert.equal(group.attrs['aria-hidden'],'true');assert.equal(group.classList.contains('is-hidden'),true);assert.equal(group.hidden,false);
 assert.ok([...buttons,partButton].every(button=>button.disabled));
 Object.assign(f.take,{state:'review',voice:{length:100},editingRecording:true,preparationOpen:true});f.run('updateSingPreparation()');
 assert.equal(group.inert,false);assert.equal(group.attrs['aria-hidden'],'false');assert.equal(group.classList.contains('is-hidden'),false);
 assert.ok([...buttons,partButton].every(button=>!button.disabled));
});

test('mode switching waits for an in-flight draft save before resetting take metadata',async()=>{
 const f=fixture(),saved=deferred();Object.assign(f.take,{voice:{length:32000},state:'review',editingRecording:true,preparationOpen:true,savedAt:1,draftWrite:saved.promise});
 f.run('askSingModeChange=async()=>true');
 const work=f.run("switchSingRecordingMode('duet')");await Promise.resolve();await Promise.resolve();
 assert.equal(f.take.mode,'solo');assert.ok(f.take.voice);
 f.take.savedAt=99;saved.resolve();assert.equal(await work,true);
 assert.equal(f.take.savedAt,0);assert.equal(f.take.mode,'duet');assert.ok(!f.take.voice);
});

test('an asynchronous confirmation cannot alter a different session after navigation',async()=>{
 const f=fixture(),decision=deferred();Object.assign(f.take,{voice:{length:32000},state:'review',editingRecording:true,preparationOpen:true});
 f.c.decision=decision.promise;f.run('askSingModeChange=()=>decision');
 const work=f.run("switchSingRecordingMode('duet')");
 const replacement={id:'other',mode:'solo',state:'idle',cursor:4};f.c.replacement=replacement;f.run('sing=replacement');decision.resolve(true);
 assert.equal(await work,false);assert.equal(f.run('sing'),replacement);assert.equal(replacement.mode,'solo');assert.equal(replacement.cursor,4);assert.equal(f.take.mode,'solo');
});

test('microphone denial hides preparation while requesting access and restores the retry state with the old take intact',async()=>{
 const request=deferred(),context={resume:async()=>{},sampleRate:32000};
 const f=fixture({window:{AifectKaraoke:karaoke,addEventListener(){},AudioContext:function(){return context;}},navigator:{mediaDevices:{getUserMedia:()=>request.promise}}});
 const voice={length:32000};Object.assign(f.take,{ctx:context,voice,state:'review',editingRecording:true,preparationOpen:true});
 const work=f.run('startSinging()');
 assert.equal(f.take.state,'loading');assert.equal(f.run('singPreparationVisible(sing)'),false);
 const error=new Error('permission denied');error.name='NotAllowedError';request.reject(error);await work;
 assert.equal(f.take.voice,voice);assert.equal(f.take.preparationOpen,true);assert.equal(f.run('singPreparationVisible(sing)'),true);
 assert.equal(f.take.state,'review');assert.equal(f.take.startingRecording,false);assert.match(f.messages.at(-1),/마이크 권한/);
});

test('a failed native recorder launch restores mode selection without requesting a browser microphone',async()=>{
 let microphoneRequests=0;const opened=deferred();
 const f=fixture({window:{AifectKaraoke:karaoke,addEventListener(){},Capacitor:{isNativePlatform:()=>true,Plugins:{AifectKaraoke:{open:()=>opened.promise}}}},navigator:{mediaDevices:{getUserMedia(){microphoneRequests++;throw Error('Unexpected browser microphone');}}}});
 const work=f.run('startSinging()');
 assert.equal(f.take.state,'loading');assert.equal(f.run('singPreparationVisible(sing)'),false);
 opened.reject(new Error('녹음 화면을 열 수 없어요.'));await work;
 assert.equal(f.take.state,'idle');assert.equal(f.run('singPreparationVisible(sing)'),true);assert.equal(microphoneRequests,0);
});
