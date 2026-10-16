import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/sing-key.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const timers=new Map(),workers=[],buttons=[{dataset:{keyStep:'-1'}},{dataset:{keyStep:'1'}}];let timer=0;
 const mr={numberOfChannels:1,sampleRate:32000,getChannelData:()=>new Float32Array([.1,.2])};
 const c=vm.createContext({Float32Array,document:{querySelectorAll:q=>q==='[data-key-step]'?buttons:[]},setTimeout:f=>{timers.set(++timer,f);return timer;},clearTimeout:id=>timers.delete(id),singBusy:s=>s.state==='loading',singLive:s=>s.state==='singing',nativeSinging:()=>false,stopPreview(){},setSingStatus(){},queueSingDraft(){},prepareSingAudio:async()=>{},Worker:class{constructor(){workers.push(this);}postMessage(data){this.data=data;}terminate(){this.terminated=true;}}});
 c.sing={state:'idle',keySemitones:0,mr,ctx:{createBuffer:()=>({copyToChannel(){}})}};
 vm.runInContext(source,c);vm.runInContext('updateTransport=updateKeyControls',c);
 return {c,workers,buttons,run:code=>vm.runInContext(code,c),async fire(){for(const [id,f] of timers){timers.delete(id);f();}await flush();},finish(worker){worker.onmessage({data:{channels:[new Float32Array([.1,.2])]}});}};
}
test('rapid key taps update immediately, remain enabled, and convert only the final selection',async()=>{
 const t=setup(),a=t.run('changeSingingKey(1)'),b=t.run('changeSingingKey(2)'),c=t.run('changeSingingKey(3)');
 assert.equal(t.c.sing.keySemitones,3);assert(t.buttons.every(b=>!b.disabled));assert.equal(t.workers.length,0);
 await t.fire();assert.equal(t.workers.length,1);assert.equal(t.workers[0].data.semitones,3);t.finish(t.workers[0]);await Promise.all([a,b,c]);
 assert.equal(t.c.sing.state,'idle');assert.equal(t.c.sing.keyMR.key,3);
});
test('changes cancel in-flight conversion; late results cannot roll back the selected key',async()=>{
 const t=setup(),a=t.run('changeSingingKey(1)');await t.fire();const old=t.workers[0];
 const b=t.run('changeSingingKey(-2)');assert(old.terminated);t.finish(old);await t.fire();assert.equal(t.c.sing.keyMR,undefined);assert.equal(t.c.sing.keySemitones,-2);
 t.finish(t.workers[1]);await Promise.all([a,b]);assert.equal(t.c.sing.keyMR.key,-2);assert.equal(t.c.sing.state,'idle');
});
test('reset cancels conversion without another job; leaving cancels the debounce',async()=>{
 const t=setup(),a=t.run('changeSingingKey(2)');await t.fire();const b=t.run('changeSingingKey(0)');await t.fire();await Promise.all([a,b]);
 assert.equal(t.workers.length,1);assert.equal(t.run('backingBuffer(sing)'),t.c.sing.mr);assert.equal(t.c.sing.state,'idle');
 const c=t.run('changeSingingKey(4)');t.run('cancelKeyProcessing(sing);sing=null');await t.fire();await c;assert.equal(t.workers.length,1);
});
test('failure restores the last completed key; recording and parent duets stay locked',async()=>{
 const t=setup(),a=t.run('changeSingingKey(1)'),b=t.run('changeSingingKey(4)');await t.fire();t.workers[0].onerror();await Promise.all([a,b]);assert.equal(t.c.sing.keySemitones,0);assert.equal(t.c.sing.state,'idle');
 for(const state of [{state:'singing'},{state:'loading'},{state:'idle',voice:{}},{state:'idle',parent:'duet'}]){Object.assign(t.c.sing,{voice:null,parent:null},state);await t.run('changeSingingKey(2)');assert.equal(t.c.sing.keySemitones,0);}
});
