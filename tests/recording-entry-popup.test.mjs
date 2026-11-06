import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8');
function setup(){
 const events=new Map(),handlers={},buttons=['solo','duet'].map(singMode=>({dataset:{singMode}}));
 let attached=false,back=0,renders=0,focus=0,requests=0;
 const state={from:'song'},location={hash:'#song/one'},history={state,pushState(s){this.state=s;},replaceState(s,_,url){this.state=s;location.hash=url;},back(){back++;this.state=state;events.get('popstate')?.();}};
 const dlg={dataset:{},setAttribute(){},querySelectorAll:()=>buttons,addEventListener(k,f){handlers[k]=f;},showModal(){this.open=true;},close(){this.open=false;},remove(){attached=false;},getBoundingClientRect:()=>({left:100,right:400,top:100,bottom:250})};
 const document={addEventListener(){},documentElement:{style:{overflow:'auto'}},activeElement:{isConnected:true,focus(){focus++;}},body:{append(){attached=true;}},querySelector:()=>attached?dlg:null,createElement:()=>dlg};
 const c=nicknameContext({document,window:{addEventListener(k,f){events.set(k,f);},removeEventListener(k){events.delete(k);}},history,location,URLSearchParams,render(){renders++;},api:async()=>{requests++;return {track:{id:'one'}};},toast(message){c.error=message;}});
 vm.runInContext(source,c);
 const open=()=>vm.runInContext("openRecordingMode({track:{id:'one'}})",c);
 return {c,open,dlg,handlers,buttons,events,history,location,document,counts:()=>({back,renders,focus,requests,attached})};
}
test('outside click, Escape and browser Back dismiss only the popup and restore focus and scrolling',()=>{
 for(const action of ['outside','escape','back']){
  const s=setup();s.open();s.open();assert.equal(s.dlg.open,true);assert.equal(s.document.documentElement.style.overflow,'hidden');
  s.handlers.click({target:s.dlg,clientX:110,clientY:110});assert.equal(s.dlg.open,true,'padding click stays inside');
  if(action==='outside')s.handlers.click({target:s.dlg,clientX:20,clientY:20});
  else if(action==='escape'){let cancelled=false;s.handlers.cancel({preventDefault(){cancelled=true;}});assert(cancelled);}
  else s.history.back();
  assert.equal(s.location.hash,'#song/one');assert.equal(s.counts().back,1);assert.equal(s.counts().renders,0);assert.equal(s.counts().focus,1);assert.equal(s.counts().attached,false);assert.equal(s.events.has('popstate'),false);assert.equal(s.events.has('hashchange'),false);assert.equal(s.document.documentElement.style.overflow,'auto');
 }
});
test('solo and duet immediately replace the popup history entry with the selected recording route',()=>{
 for(const i of [0,1]){const s=setup();s.open();s.buttons[i].onclick();assert.equal(s.location.hash,'#sing/one?mode='+['solo','duet'][i]);assert.equal(s.counts().renders,1);assert.equal(s.counts().back,0);assert.equal(s.counts().attached,false);assert.deepEqual(s.history.state,{from:'song'});assert.equal(s.events.has('popstate'),false);assert.equal(s.events.has('hashchange'),false);}
});
test('entry checks existing permissions, while joining, drafts and explicit modes keep their original navigation',async()=>{
 for(const query of ['?duet=first','?draft=1','?mode=solo','?mode=duet']){
  const s=setup();s.c.event={target:{closest:()=>({getAttribute:()=> '#sing/one'+query,hasAttribute:()=>false})},button:0,preventDefault(){throw Error('must retain navigation');}};
  await vm.runInContext('recordingEntryClick(event)',s.c);assert.equal(s.counts().requests,0);assert.equal(s.counts().attached,false);
 }
 const s=setup();let prevented=false;s.c.event={target:{closest:()=>({getAttribute:()=> '#sing/one',hasAttribute:()=>false})},button:0,preventDefault(){prevented=true;}};
 await vm.runInContext('recordingEntryClick(event)',s.c);assert(prevented);assert.equal(s.counts().requests,1);assert.equal(s.location.hash,'#song/one');assert.equal(s.counts().attached,true);
 const denied=setup();denied.c.event=s.c.event;vm.runInContext("api=async()=>{throw Error('권한 없음')}",denied.c);await vm.runInContext('recordingEntryClick(event)',denied.c);assert.equal(denied.c.error,'권한 없음');assert.equal(denied.counts().attached,false);
});
test('record and resume buttons do not enter the chooser, and route changes dismiss an open popup',async()=>{
 const s=setup();s.c.event={target:{closest:()=>null},button:0};await vm.runInContext('recordingEntryClick(event)',s.c);assert.equal(s.counts().requests,0);assert.equal(s.counts().attached,false);
 s.open();s.location.hash='#home';s.events.get('hashchange')();assert.equal(s.counts().attached,false);assert.equal(s.counts().back,0);assert.equal(s.document.documentElement.style.overflow,'auto');
});
