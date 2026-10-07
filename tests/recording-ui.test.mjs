import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as karaoke from '../shared/karaoke-audio.js';
import * as duet from '../shared/duet-guide.js';
const source=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8');
const words=[{s:0,w:[{t:'<내 목소리>',s:0,e:3}]},{s:6,w:[{t:'파트너 목소리',s:6,e:9}]}];
function sandbox(extra={}){
 const context=vm.createContext({window:{AifectKaraoke:karaoke,addEventListener(){}},AifectDuetGuide:duet,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),time:n=>String(n),icon:()=>'',...extra,document:{addEventListener(){},...extra.document}});
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
 let html=vm.runInContext('duetEditorHTML(take)',c);assert.ok(html.includes('&lt;내 목소리&gt;'));assert.ok(!html.includes('<내 목소리>'));assert.equal((html.match(/data-duet-part=/g)||[]).length,6);
 c.take.parent='existing';html=vm.runInContext('duetEditorHTML(take)',c);assert.ok(!html.includes('data-duet-line='));assert.ok(!html.includes('data-duet-method='));assert.ok(!html.includes('data-duet-fill'));
 assert.ok(html.indexOf('duet-part-label">파트너')<html.indexOf('duet-part-label">내 파트'));
});
test('browser monitoring uses the selected voice gain without a hidden 25% reduction, and stays separate from the dry take',async()=>{
 for(const enabled of [true,false]){
  const node=()=>({gain:{value:1,setTargetAtTime(v){this.value=v;}},port:{},connect(next){return next;},disconnect(){},start(){},stop(){}});
  const ctx={currentTime:0,state:'running',destination:node(),resume:async()=>{},createGain:node,createMediaStreamSource:node,createBufferSource:node,audioWorklet:{addModule:async()=>{}}};
  const input={readyState:'live',enabled:true,addEventListener(){},stop(){}},stream={getTracks:()=>[input],getAudioTracks:()=>[input]};
  const elements={'#sing-monitor':{checked:enabled},'#sing-panel':{innerHTML:''}};
  const c=sandbox({window:{AifectKaraoke:karaoke,AudioContext:function(){}},AudioWorkletNode:function(){return node();},navigator:{mediaDevices:{getUserMedia:async()=>stream}},document:{hidden:false},audio:{pause(){}},playSerial:0,requestAnimationFrame:()=>0,$:q=>elements[q]});c.context=ctx;
  vm.runInContext("sing={id:'test',mode:'solo',state:'idle',cursor:0,ctx:context,mr:{duration:30},mix:K().defaultVocalMix()};stopPreview=()=>{};updateTransport=()=>{};setSingStatus=()=>{};prepareSing=async()=>context;bindMixControls=()=>{};drawLyrics=()=>{}",c);
  await vm.runInContext('startSinging()',c);
  assert.equal(vm.runInContext('sing.state',c),'singing');
  assert.equal(vm.runInContext('sing.run.monitor.gain.value',c),enabled?1:0);
  assert.equal(vm.runInContext('sing.run.voiceGain.gain.value',c),1);
  assert.equal(vm.runInContext('sing.run.mute.gain.value',c),0,'dry recorder output never feeds the speakers');
  assert.equal(vm.runInContext('sing.run.gain.gain.value',c),.8,'backing level is independent');
 }
});
