import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as karaoke from '../shared/karaoke-audio.js';
import * as duet from '../shared/duet-guide.js';
const source=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8');
const words=[{s:0,w:[{t:'<내 목소리>',s:0,e:3}]},{s:6,w:[{t:'파트너 목소리',s:6,e:9}]}];
function sandbox(extra={}){
 const context=vm.createContext({window:{AifectKaraoke:karaoke,addEventListener(){}},AifectDuetGuide:duet,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),time:n=>String(n),icon:()=>'',paintPunchCountdown(){},...extra,document:{addEventListener(){},...extra.document}});
 vm.runInContext(source,context);return context;
}
test('manual duet assignments must cover both singers before recording; free takes and inherited guides remain usable',()=>{
 const c=sandbox();c.take={mode:'duet',data:{words},duetGuide:{mode:'lyrics',lines:['A','']}};
 assert.match(vm.runInContext('duetAssignmentIssue(take)',c),/1줄/);
 c.take.duetGuide.lines=['A','A'];assert.match(vm.runInContext('duetAssignmentIssue(take)',c),/모두/);
 for(const lines of [['A','B'],['both','both']]){c.take.duetGuide.lines=lines;assert.equal(vm.runInContext('duetAssignmentIssue(take)',c),'');}
 c.take.duetGuide={mode:'free',lines:[]};assert.equal(vm.runInContext('duetAssignmentIssue(take)',c),'');
 c.take.parent='existing';c.take.duetGuide=null;assert.equal(vm.runInContext('duetAssignmentIssue(take)',c),'');
});
test('duet editor escapes lyrics and leaves inherited parts read-only, with labels relative to the joining singer',()=>{
 const c=sandbox();c.take={mode:'duet',data:{words,track:{duration:12}},duetGuide:{mode:'lyrics',lines:['A','B']}};
 let html=vm.runInContext('duetEditorHTML(take)',c);assert.ok(html.includes('&lt;내 목소리&gt;'));assert.ok(!html.includes('<내 목소리>'));assert.equal((html.match(/data-duet-brush=/g)||[]).length,3);assert.equal((html.match(/data-duet-line=/g)||[]).length,2);
 c.take.parent='existing';html=vm.runInContext('duetEditorHTML(take)',c);assert.ok(!html.includes('data-duet-line='));assert.ok(!html.includes('data-duet-method='));assert.ok(!html.includes('data-duet-fill'));
 assert.ok(html.indexOf('&lt;내 목소리&gt; · 상대 파트')<html.indexOf('파트너 목소리 · 내 파트'));assert.equal((html.match(/ disabled/g)||[]).length,2);
});
test('browser monitoring uses the selected voice gain without a hidden 25% reduction, and stays separate from the dry take',async()=>{
 for(const enabled of [true,false]){
  const node=()=>({gain:{value:1,setTargetAtTime(v){this.value=v;}},port:{},connect(next){return next;},disconnect(){},start(){},stop(){}});
  const ctx={currentTime:0,state:'running',destination:node(),resume:async()=>{},createGain:node,createMediaStreamSource:node,createBufferSource:node,audioWorklet:{addModule:async()=>{}}};
  const input={readyState:'live',enabled:true,addEventListener(){},stop(){}},stream={getTracks:()=>[input],getAudioTracks:()=>[input]};
  const elements={'#sing-monitor':{checked:enabled},'#sing-panel':{innerHTML:''}};
  const c=sandbox({window:{AifectKaraoke:karaoke,AudioContext:function(){}},AudioWorkletNode:function(){return node();},navigator:{mediaDevices:{getUserMedia:async()=>stream}},document:{hidden:false},audio:{pause(){}},playSerial:0,requestAnimationFrame:()=>0,$:q=>elements[q]});c.context=ctx;
  vm.runInContext("sing={id:'test',mode:'solo',state:'idle',cursor:0,ctx:context,mr:{duration:30},mix:K().defaultVocalMix()};stopPreview=()=>{};updateTransport=()=>{};setSingStatus=()=>{};prepareSing=async()=>context;backingBuffer=s=>s.mr;bindMixControls=()=>{};drawLyrics=()=>{}",c);
  await vm.runInContext('startSinging()',c);
  assert.equal(vm.runInContext('sing.state',c),'singing');
  assert.equal(vm.runInContext('sing.run.monitor.gain.value',c),enabled?1:0);
  assert.equal(vm.runInContext('sing.run.voiceGain.gain.value',c),1);
  assert.equal(vm.runInContext('sing.run.mute.gain.value',c),0,'dry recorder output never feeds the speakers');
  assert.equal(vm.runInContext('sing.run.gain.gain.value',c),.8,'backing level is independent');
 }
});


test('part editor works on an isolated draft, preserves saved and inherited parts, and never guesses fresh assignments',()=>{
 const c=sandbox();c.take={mode:'duet',data:{words,track:{duration:12}},duetGuide:{version:1,mode:'lyrics',lines:['A','B']}};
 vm.runInContext("edit=duetEditorDraft(take);edit.duetGuide.lines[0]='both'",c);
 assert.equal(c.take.duetGuide.lines[0],'A');
 assert.equal(vm.runInContext('edit.duetGuide.lines[0]',c),'both');
 c.take.duetGuide={version:1,mode:'free',lines:[]};
 assert.equal(vm.runInContext('duetEditorDraft(take).duetGuide.mode',c),'lyrics');
 assert.equal(vm.runInContext('duetEditorDraft(take).duetGuide.lines.length',c),0);
 assert.equal(c.take.duetGuide.mode,'free');
 c.take.parent='existing';assert.equal(vm.runInContext('duetEditorDraft(take).duetGuide.mode',c),'free');
});

test('standby monitor unlocks audio before microphone permission and never waits for backing download or pitch work',async()=>{
 const calls=[],node=()=>({gain:{value:1},connect(n){return n;},disconnect(){}}),ctx={state:'running',destination:node(),resume(){calls.push('resume');return Promise.resolve();},audioWorklet:{addModule:async()=>{calls.push('worklet');}},createMediaStreamSource:node,createGain:node};
 const track={stop(){calls.push('stop');}},stream={getTracks:()=>[track]};
 const c=sandbox({window:{AifectKaraoke:karaoke,AudioContext:function(){return ctx;}},navigator:{mediaDevices:{getUserMedia(){calls.push('permission');return Promise.resolve(stream);}}},document:{hidden:false,querySelectorAll:()=>[]},$:()=>({checked:false}),fetch(){throw Error('monitor must not fetch an MR');}});
 vm.runInContext("sing={state:'idle',mix:K().defaultVocalMix()};setSingStatus=()=>{};connectEffects=()=>[];prepareSing=()=>{throw Error('must not process a key')}",c);
 await vm.runInContext('setMonitorEnabled(true)',c);assert(calls.indexOf('resume')<calls.indexOf('permission'));assert.equal(vm.runInContext('!!sing.standbyMonitor.mic',c),true);
 await vm.runInContext('setMonitorEnabled(false)',c);assert.equal(vm.runInContext('sing.standbyMonitor',c),null);assert(calls.includes('stop'));
});

test('rerecord starts at the preceding lyric rather than a fixed three-second offset',()=>{
 const c=sandbox();c.lines=[{s:2},{s:7},{s:15}];
 assert.equal(vm.runInContext('recordingPrerollStart(lines,15)',c),7);
 assert.equal(vm.runInContext('recordingPrerollStart(lines,7)',c),2);
 assert.equal(vm.runInContext('recordingPrerollStart(lines,2)',c),0);
 assert.equal(vm.runInContext('recordingPrerollStart([],20)',c),17);
});

test('normal and premium prerecord counts share audio time; pause clears all dots without removing their slot',()=>{
 const number={dataset:{},setAttribute(){},innerHTML:''},header={querySelector:()=>({})},countdown={querySelector:()=>number};
 const c=sandbox({$:q=>q==='.sing-punch-record-header'?header:countdown});
 vm.runInContext(readFileSync(new URL('../dist/sing-punch.js',import.meta.url),'utf8'),c);
 c.session={ctx:{currentTime:0}};c.run={recordClock:8};
 for(const [clock,count] of [[0,3],[5,3],[6.1,2],[7.1,1],[8,0]]){
  c.session.ctx.currentTime=clock;vm.runInContext('paintPunchCountdown(session,run)',c);
  assert.equal((number.innerHTML.match(/class="is-visible"/g)||[]).length,count);assert.equal(countdown.hidden,false);assert.equal(header.hidden,true);
 }
 vm.runInContext('paintPunchCountdown(session,null)',c);assert.equal(number.dataset.count,'0');assert.equal(countdown.hidden,false);
});

test('part brush persists across consecutive lines and applies only after explicit save',()=>{
 const make=dataset=>({dataset,attrs:{},setAttribute(k,v){this.attrs[k]=v;},closest(){return this;}});
 const brushes=['A','B','both'].map(duetBrush=>make({duetBrush})),rows=[0,1].map(i=>make({duetLine:String(i)})),done={},note={},dlg={classList:{add(){},remove(){}},close(){this.closed=true;},addEventListener(){}};
 const host={querySelectorAll:q=>q==='[data-duet-brush]'?brushes:q==='[data-duet-line]'?rows:[],querySelector:q=>q==='[data-duet-done]'?done:q==='[data-duet-note]'?note:null};
 let writes=0;const c=sandbox({$:q=>q==='#dialog'?dlg:host,dialog(){},queueSingDraft(){writes++;}});
 vm.runInContext("sing={mode:'duet',state:'idle',cursor:0,data:{words:[{s:0,w:[{t:'first'}]},{s:6,w:[{t:'second'}]}],track:{duration:12}},duetGuide:{version:1,mode:'lyrics',lines:['A','B']}};renderDuetGuide=()=>{};drawLyrics=()=>{}",c);
 vm.runInContext('openDuetEditor()',c);brushes[2].onclick();rows[0].onclick();rows[1].onclick();
 assert.equal(rows[0].dataset.partRole,'both');assert.equal(rows[1].dataset.partRole,'both');assert.equal(brushes[2].attrs['aria-pressed'],'true');
 assert.equal(vm.runInContext('sing.duetGuide.lines.join()',c),'A,B');assert.equal(writes,0);
 done.onclick();assert.equal(vm.runInContext('sing.duetGuide.lines.join()',c),'both,both');assert.equal(writes,1);assert.equal(dlg.closed,true);
});
