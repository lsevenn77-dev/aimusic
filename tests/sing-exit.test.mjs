import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function session(mode){
 const records=new Map(),c=vm.createContext({
  document:{addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},me:{id:'account'},Float32Array,
  setTimeout(){throw Error('Draft persistence must not be scheduled');}, clearTimeout(){},
  singingKey:()=>0,records,crypto,
 });
 for(const file of ['karaoke.js','sing-drafts.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 const run=js=>vm.runInContext(js,c);
 c.mode=mode;
 run(`sing={id:'song',mode,part:'female',owner:'account',state:'review',data:{track:{title:'take'}},mix:{offset:0},voice:{length:2,sampleRate:32000,getChannelData:()=>new Float32Array([.4,.7])}};
 draftOp=async(method,key,value)=>{if(method!=='put')throw Error('unexpected write');records.set(key,value);};`);
 return {c,run,records};
}
for(const mode of ['solo','duet']){
 test(mode+' writes only explicit completed takes, preserving the previous snapshot on discard or failure',async()=>{
  const {run,records}=session(mode);
  for(const change of ["sing.state='singing'","sing.state='preroll'","sing.state='review';sing.editingRecording=true"]){
   run(change+';queueSingDraft(sing)');await assert.rejects(run('saveSingDraft()'));assert.equal(records.size,0);
  }
  run("sing.editingRecording=false;sing.state='review';queueSingDraft(sing)");
  assert.equal(records.size,0);await run('saveSingDraft()');
  const key=run('singDraftKey(sing)'),saved=records.get(key);assert.equal(saved.samples.length,2);
  run('sing.mix.offset=40;queueSingDraft(sing)');assert.equal(saved.mix.offset,0);
  run("draftOp=async()=>{throw Error('quota');}");await assert.rejects(run('saveSingDraft()'),/quota/);
  assert.equal(run('sing.dirty&&sing.draftError'),true);
  run('askSingExit=async()=>true;cleanupSing=()=>{sing=null;}');
  await run('requestSingExit(sing,()=>{})');assert.equal(records.get(key),saved);
 });
 test(mode+' repeated navigation creates only one decision and releases a discarded recorder once',async()=>{
  const {run,c,records}=session(mode);let decide;
  Object.assign(c,{choose:()=>new Promise(resolve=>{decide=resolve;}),dialogs:0,stops:0,moves:0});
  run("sing.state='singing';askSingExit=()=>{dialogs++;return choose()};cleanupSing=()=>{stops++;sing=null;}");
  const leave=()=>run('requestSingExit(sing,()=>moves++)');
  const pending=leave();await leave();assert.equal(c.dialogs,1);decide(false);await pending;
  assert.equal(c.stops,0);const confirmed=leave();decide(true);await confirmed;
  assert.deepEqual([c.stops,c.moves,records.size],[1,1,0]);
 });
}

test('saving twice during an IndexedDB write stores one revision and keeps later edits dirty',async()=>{
 const {run,c}=session('solo');let finish,writes=0;
 c.write=()=>{writes++;return new Promise(resolve=>{finish=resolve;});};
 run('draftOp=write');
 const first=run('saveSingDraft()'),repeat=run('saveSingDraft()');
 await new Promise(r=>setImmediate(r));
 run('sing.mix.offset=80;queueSingDraft(sing)');finish();
 await Promise.all([first,repeat]);
 assert.equal(writes,1);assert.equal(run('sing.dirty'),true);
});
test('a failed exit save keeps the dialog and provides retry or continue',async()=>{
 const {run,c}=session('duet'),listeners={},error={hidden:true},btn={focus(){}},buttons=[{},{},{}];
 const dlg={setAttribute(){},addEventListener(name,fn){listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;},remove(){},querySelectorAll:()=>buttons,querySelector:q=>q==='[role="alert"]'?error:btn};
 c.document.createElement=()=>dlg;c.document.body={append(){}};
 run('draftOp=async()=>{throw Error("full")};');
 const decision=run("askSingExit(sing,'edit')");
 const click=choice=>listeners.click({target:{closest:()=>({dataset:{choice}})}});
 await click('save');assert.equal(dlg.open,true);assert.equal(error.hidden,false);
 assert.match(error.textContent,/저장하지 못/);assert(buttons.every(b=>!b.disabled));
 await click('stay');assert.equal(await decision,false);assert.equal(run('sing.voice.length'),2);
});
