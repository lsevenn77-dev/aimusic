import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';

function fixture(){
 const handlers=[],listeners=new Map(),classes=new Set(),records=new Map([['account:song','saved take'],['index:account:song','saved index'],['other:song','another account']]);
 const counts={opens:0,deletes:0,stops:0,renders:0,draws:0,focus:0},trigger={isConnected:true,focus(){counts.focus++;}};
 const dlg={open:false,content:null,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  close(){if(!this.open)return;this.open=false;dispatch('close',{});},
  querySelector(selector){return selector==='.sing-draft-delete-dialog'?this.content:null;},
  getBoundingClientRect:()=>({left:100,right:400,top:100,bottom:300})};
 const dispatch=(type,event)=>{for(const fn of [...listeners.get(type)||[]])fn(event);};
 const document={activeElement:trigger,addEventListener(type,fn){if(type==='click')handlers.push(fn);},querySelectorAll:()=>[]};
 const c=nicknameContext({document,window:{addEventListener(){}},me:{id:'account'},Float32Array,crypto,
  $:selector=>selector==='#dialog'?dlg:null,
  dialog(html){counts.opens++;dlg.html=html;dlg.open=true;const button=()=>({disabled:false,focus(){this.focused=true;}}),cancel=button(),confirm=button(),error={hidden:true,textContent:''};dlg.content={cancel,confirm,error,querySelector(selector){return selector==='[data-sing-draft-cancel]'?cancel:selector==='[data-sing-draft-delete]'?confirm:selector==='[role="alert"]'?error:null;}};},
  confirm(){throw Error('The recorder confirmation must be site-owned');},
  clearTimeout(){},cancelAnimationFrame(){},
  drawLyrics(){counts.draws++;},setSingStatus(message){c.status=message;},
  cleanupPunch(){},cancelKeyProcessing(){},cancelVocalEffects(){},
 });
 for(const file of ['karaoke.js','sing-drafts.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 c.deleteRecord=async key=>{counts.deletes++;records.delete(key);records.delete('index:'+key);};
 c.stop=()=>counts.stops++;c.paint=()=>counts.renders++;c.draw=()=>counts.draws++;
 vm.runInContext("sing={id:'song',mode:'solo',owner:'account',state:'review',voice:{length:2},beforePunch:{},editMixBaseline:{},coverFile:{},publishRequest:'request',savedAt:1,processed:{},dirty:true,cursor:10};stopPreview=stop;renderSingPanel=paint;drawLyrics=draw;stopStandbyMonitor=()=>{};setSingStatus=message=>{status=message;};draftOp=async(kind,key)=>{if(kind!=='delete')throw Error('unexpected operation');await deleteRecord(key);};",c);
 const run=source=>vm.runInContext(source,c),click=()=>handlers.find(fn=>String(fn).includes('[data-discard-draft]'))({target:{closest:selector=>selector==='[data-discard-draft]'?trigger:null}});
 return {c,run,click,dlg,dispatch,classes,listeners,records,counts,trigger,take:run('sing')};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('cancel, Escape, close and outside dismissal retain the recording and restore focus without writes',async()=>{
 for(const how of ['cancel','escape','close','outside']){
  const f=fixture();await f.click();assert.equal(f.dlg.open,true);assert.equal(f.dlg.content.cancel.focused,true);assert(f.classes.has('sing-draft-delete-popup'));
  f.dispatch('click',{target:f.dlg,clientX:110,clientY:110});assert.equal(f.dlg.open,true,'inside dialog padding does not dismiss');
  if(how==='cancel')f.dlg.content.cancel.onclick();
  else if(how==='escape'){let prevented=false;f.dispatch('cancel',{preventDefault(){prevented=true;}});assert(prevented);}
  else if(how==='close')f.dlg.close();
  else f.dispatch('click',{target:f.dlg,clientX:20,clientY:20});
  assert.equal(f.dlg.open,false);assert.equal(f.counts.deletes,0);assert.equal(f.records.size,3);assert.equal(f.take.voice.length,2);assert.equal(f.take.draftDeleteOpen,false);assert.equal(f.counts.focus,1);
  assert(!f.classes.has('sing-draft-delete-popup'));assert([...f.listeners.values()].every(set=>!set.size));
 }
});

test('unavailable sessions, foreign owners and already open dialogs never open a deletion confirmation',async()=>{
 for(const change of ["sing=null","sing.voice=null","sing.owner='other'","sing.state='singing'","sing.state='exporting'"]){
  const f=fixture();f.run(change);await f.click();assert.equal(f.counts.opens,0);assert.equal(f.counts.deletes,0);
 }
 const f=fixture();f.dlg.open=true;await f.click();assert.equal(f.counts.opens,0);assert.equal(f.counts.deletes,0);
});

test('duplicate opening and confirmation delete exactly once and reset only the completed current take',async()=>{
 const f=fixture();let finish;f.c.deleteRecord=async key=>{f.counts.deletes++;await new Promise(resolve=>{finish=resolve;});f.records.delete(key);f.records.delete('index:'+key);};
 f.run('sing.preparationOpen=false');
 await f.click();await f.click();assert.equal(f.counts.opens,1);
 const content=f.dlg.content,first=content.confirm.onclick();await tick();await content.confirm.onclick();
 assert.equal(f.counts.deletes,1);assert.equal(content.cancel.disabled,true);assert.equal(content.confirm.disabled,true);assert.equal(f.take.voice.length,2);
 finish();await first;
 assert.equal(f.dlg.open,false);assert.equal(f.records.has('account:song'),false);assert.equal(f.records.get('other:song'),'another account');
 for(const key of ['voice','beforePunch','editMixBaseline','coverFile','publishRequest','processed'])assert.equal(f.take[key],null,key);
 assert.equal(f.take.state,'idle');assert.equal(f.take.cursor,0);assert.equal(f.take.savedAt,0);assert.equal(f.take.dirty,false);assert.equal(f.take.draftDeletePending,false);assert.equal(f.take.draftDeleteOpen,false);assert.equal(f.counts.renders,1);assert.equal(f.counts.draws,1);
 assert.equal(f.take.preparationOpen,true);assert.equal(f.run('singPreparationVisible(sing)'),true);
});

test('a stale session or signed-in account cannot confirm an earlier deletion prompt',async()=>{
 for(const change of ["sing={id:'new',owner:'account',voice:{length:4},state:'review'}","me={id:'other'}","sing.state='singing'"]){
  const f=fixture();await f.click();f.run(change);await f.dlg.content.confirm.onclick();
  assert.equal(f.counts.deletes,0);assert.equal(f.records.size,3);assert.equal(f.take.voice.length,2);assert.equal(f.dlg.open,false);assert.equal(f.counts.renders,0);
 }
});

test('storage failure preserves the take, shows an error and permits an explicit retry',async()=>{
 const f=fixture();let fail=true;f.c.deleteRecord=async key=>{f.counts.deletes++;if(fail)throw Error('unavailable');f.records.delete(key);f.records.delete('index:'+key);};
 await f.click();const content=f.dlg.content;await content.confirm.onclick();
 assert.equal(f.dlg.open,true);assert.equal(f.take.voice.length,2);assert.equal(f.records.size,3);assert.equal(content.error.hidden,false);assert.match(content.error.textContent,/삭제하지 못/);assert.equal(content.confirm.disabled,false);assert.equal(content.cancel.disabled,false);assert.equal(content.confirm.focused,true);assert.equal(f.counts.renders,0);
 fail=false;await content.confirm.onclick();assert.equal(f.counts.deletes,2);assert.equal(f.take.voice,null);assert.equal(f.dlg.open,false);
});

test('an already confirmed deletion cannot clear a later session or close a replacement popup',async()=>{
 const f=fixture();let finish;f.c.deleteRecord=async key=>{f.counts.deletes++;await new Promise(resolve=>{finish=resolve;});f.records.delete(key);f.records.delete('index:'+key);};
 await f.click();const pending=f.dlg.content.confirm.onclick();await tick();f.dlg.close();
 f.run("sing={id:'new',owner:'account',voice:{length:4},state:'review'}");f.c.dialog('<div>Unrelated popup</div>');const replacement=f.dlg.content;
 finish();await pending;
 assert.equal(f.run('sing.voice.length'),4);assert.equal(f.counts.renders,0);assert.equal(f.dlg.open,true);assert.equal(f.dlg.content,replacement);assert(!f.classes.has('sing-draft-delete-popup'));assert.equal(f.take.draftDeletePending,false);
});

test('closing during a confirmed delete does not allow another delete while storage is pending',async()=>{
 const f=fixture();let finish;f.c.deleteRecord=async()=>{f.counts.deletes++;await new Promise(resolve=>{finish=resolve;});};
 await f.click();const pending=f.dlg.content.confirm.onclick();await tick();f.dlg.close();await f.click();
 assert.equal(f.counts.opens,1);assert.equal(f.counts.deletes,1);finish();await pending;assert.equal(f.take.draftDeletePending,false);
});

test('a replacement take in the same session is not cleared after storage completes',async()=>{
 const f=fixture();let finish;f.c.deleteRecord=async()=>{f.counts.deletes++;await new Promise(resolve=>{finish=resolve;});};
 await f.click();const pending=f.dlg.content.confirm.onclick();await tick();f.run('sing.voice={length:8}');finish();await pending;
 assert.equal(f.take.voice.length,8);assert.equal(f.counts.renders,0);assert.equal(f.dlg.open,false);
});

test('recorder cleanup dismisses its draft confirmation without deleting any local take',async()=>{
 const f=fixture();await f.click();f.run('cleanupSing()');
 assert.equal(f.run('sing'),null);assert.equal(f.dlg.open,false);assert.equal(f.counts.deletes,0);assert.equal(f.records.size,3);assert.equal(f.take.draftDeleteOpen,false);assert(!f.classes.has('sing-draft-delete-popup'));
});
