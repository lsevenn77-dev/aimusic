import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const closeEvents=[],listeners=new Map(),nodes=new Map(),observed=new Set(),focus=[],rootAttrs=new Map();
 function node(id=''){
  const attrs=new Map(),classes=new Set();
  const element={id,open:false,hidden:false,isConnected:true,dataset:{},firstChild:{textContent:''},
   classList:{contains:name=>classes.has(name),add:name=>classes.add(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
   setAttribute:(name,value)=>attrs.set(name,value),getAttribute:name=>attrs.get(name),removeAttribute:name=>attrs.delete(name),
   append(){},prepend(){},after(){},querySelector:()=>node(),querySelectorAll:()=>[],closest:()=>null,
   show(){this.open=true;},close(){if(!this.open)return;this.open=false;closeEvents.push(()=>listeners.get('close')?.({target:this}));},
   focus(){focus.push(id);},addEventListener(){}};
  nodes.set(id,element);return element;
 }
 const sheets=['voice-sound','voice-room-settings','voice-members','talk-leave','voice-invite-sheet','voice-emoji-picker'].map(node);
 nodes.get('voice-emoji-picker').hidden=true;
 const buttons=['sound','settings','participants','leave','share'].map(action=>{const button=node('trigger-'+action);button.dataset.voice=action;return button;});
 const panel=node('chat-panel'),auxiliary=node('auxiliary');auxiliary.closest=()=>auxiliary;auxiliary.querySelector=()=>auxiliary;
 const host={querySelector:selector=>selector==='.voice-chat-panel'?panel:selector==='.room-header button'?buttons[0]:nodes.get(selector.slice(1))||auxiliary,
  querySelectorAll:selector=>selector==='dialog'?sheets:selector.includes('.room-header')?buttons:[],
  addEventListener:(type,handler)=>listeners.set(type,handler),contains:()=>true};
 const context=vm.createContext({VoiceRoomClient:class{},AbortController,clearTimeout(){},
  $:selector=>nodes.get(selector.slice(1))||auxiliary,
  document:{getElementById:id=>nodes.get(id),addEventListener(){},activeElement:null,documentElement:{setAttribute:(key,value)=>rootAttrs.set(key,value),removeAttribute:key=>rootAttrs.delete(key)}},
  positionRoomPopup:client=>client.talkPopup.setAttribute('data-room-anchored',''),
 });
 vm.runInContext(readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8'),context);
 const client=new context.VoiceRoomClient();
 Object.assign(client,{host,roomResizeObserver:{observe:sheet=>observed.add(sheet),unobserve:sheet=>observed.delete(sheet)},
  bindRoomSettings(){},bindRoomShare(){},bindRoomRelease(){}});
 client.bindTalkViews();
 return {client,nodes,observed,focus,rootAttrs,open:(id,action)=>client.adoptRoomPopup(nodes.get(id),nodes.get('trigger-'+action)),flush:()=>{while(closeEvents.length)closeEvents.shift()();}};
}

test('switching from sound retires its live mic test and observer before the old close event',()=>{
 const f=fixture(),sound=f.nodes.get('voice-sound'),settings=f.nodes.get('voice-room-settings');
 f.open('voice-sound','sound');let stopped=0,closed=0;
 f.client.testOwned=true;f.client.testRaw={getTracks:()=>[{stop(){stopped++;}}]};f.client.testGraph={close(){closed++;}};
 assert.ok(f.observed.has(sound));
 f.open('voice-room-settings','settings');
 assert.equal(stopped,1);assert.equal(closed,1);assert.equal(f.client.testRaw,null);assert.equal(f.client.testGraph,null);
 assert.equal(sound.open,false);assert.equal(sound.getAttribute('data-room-anchored'),undefined);assert.equal(f.observed.has(sound),false);
 assert.equal(settings.open,true);assert.equal(f.client.talkPopup,settings);assert.ok(f.observed.has(settings));
 const ticket=f.client.settingsTicket,focusCount=f.focus.length;
 f.client.settingsDraft={ticket,values:{mode:'talk'}};f.flush();
 assert.equal(settings.open,true);assert.equal(f.client.talkPopup,settings);assert.equal(f.client.settingsTicket,ticket);assert.equal(f.client.settingsDraft.ticket,ticket);
 assert.equal(f.focus.length,focusCount);assert.equal(f.nodes.get('trigger-settings').getAttribute('aria-expanded'),'true');assert.ok(f.rootAttrs.has('data-room-popup'));
});

test('switching away from leave cancels pending navigation without a late close disturbing the next popup',()=>{
 const f=fixture(),leave=f.nodes.get('talk-leave'),share=f.nodes.get('voice-invite-sheet');
 f.open('talk-leave','leave');f.client.pendingRoomNavigation='https://example.test/#home';
 f.open('voice-invite-sheet','share');
 assert.equal(f.client.pendingRoomNavigation,null);assert.equal(f.observed.has(leave),false);assert.equal(leave.getAttribute('data-room-anchored'),undefined);
 const ticket=f.client.settingsTicket;f.flush();
 assert.equal(share.open,true);assert.equal(f.client.talkPopup,share);assert.equal(f.client.settingsTicket,ticket);
 f.open('voice-invite-sheet','share');f.flush();
 assert.equal(share.open,false);assert.equal(f.client.talkPopup,null);assert.equal(f.observed.has(share),false);assert.equal(f.rootAttrs.has('data-room-popup'),false);
});
