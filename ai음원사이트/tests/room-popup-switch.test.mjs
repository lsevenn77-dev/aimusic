import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const closeEvents=[],listeners=new Map(),documentEvents=new Map(),nodes=new Map(),observed=new Set(),focus=[],rootAttrs=new Map();
 let activeElement=null;
 function node(id=''){
  const attrs=new Map(),classes=new Set();
  const element={id,open:false,hidden:false,isConnected:true,dataset:{},children:[],parentElement:null,firstChild:{textContent:''},
   classList:{contains:name=>classes.has(name),add:name=>classes.add(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
   setAttribute:(name,value)=>attrs.set(name,value),getAttribute:name=>attrs.get(name),removeAttribute:name=>attrs.delete(name),
   append(...children){for(const child of children){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);this.children.push(child);child.parentElement=this;}},
   prepend(...children){for(const child of [...children].reverse()){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);this.children.unshift(child);child.parentElement=this;}},
   after(){},querySelector:()=>node(),querySelectorAll:()=>[],closest:()=>null,contains(target){return target===this;},
   show(){this.open=true;},close(){if(!this.open)return;this.open=false;closeEvents.push(()=>listeners.get('close')?.({target:this}));},
   focus(){focus.push(id);activeElement=this;},blur(){if(activeElement===this)activeElement=null;},addEventListener(){}};
  nodes.set(id,element);return element;
 }
 const sheets=['voice-sound','voice-room-settings','voice-members','talk-leave','voice-invite-sheet','voice-emoji-picker'].map(node);
 nodes.get('voice-emoji-picker').hidden=true;
 const buttons=['sound','settings','participants','leave','share'].map(action=>{const button=node('trigger-'+action);button.dataset.voice=action;return button;});
 const panel=node('chat-panel'),auxiliary=node('auxiliary');auxiliary.closest=()=>auxiliary;auxiliary.querySelector=()=>auxiliary;
 const form=node('voice-chat-form'),input=node('voice-message');
 input.textContent='입력하던 초안 [aifect:cat_basic_laugh]';
 input.closest=selector=>selector==='#voice-message'?input:selector==='#voice-chat-form'?form:null;
 const host={querySelector:selector=>selector==='.voice-chat-panel'?panel:selector==='.room-header button'?buttons[0]:nodes.get(selector.slice(1))||auxiliary,
  querySelectorAll:selector=>selector==='dialog'?sheets:selector.includes('.room-header')?buttons:[],
  addEventListener:(type,handler)=>listeners.set(type,handler),contains:()=>true};
 const context=vm.createContext({VoiceRoomClient:class{},AbortController,clearTimeout(){},
  $:selector=>nodes.get(selector.slice(1))||auxiliary,
  window:{innerWidth:390},
  document:{querySelector:()=>null,getElementById:id=>nodes.get(id),addEventListener:(type,handler)=>documentEvents.set(type,handler),get activeElement(){return activeElement;},set activeElement(value){activeElement=value;},documentElement:{setAttribute:(key,value)=>rootAttrs.set(key,value),removeAttribute:key=>rootAttrs.delete(key)}},
  positionRoomPopup:client=>client.talkPopup.setAttribute('data-room-anchored',''),
 });
 vm.runInContext(readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8'),context);
 const client=new context.VoiceRoomClient();
 Object.assign(client,{host,roomResizeObserver:{observe:sheet=>observed.add(sheet),unobserve:sheet=>observed.delete(sheet)},
  bindRoomSettings(){},bindRoomShare(){},bindRoomRelease(){}});
 client.bindTalkViews();
 const fire=(type,target,extra={})=>{
  const event={type,target,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
  documentEvents.get(type)?.(event);return event;
 };
 return {client,nodes,observed,focus,rootAttrs,input,context,fire,active:()=>activeElement,open:(id,action)=>client.adoptRoomPopup(nodes.get(id),nodes.get('trigger-'+action)),flush:()=>{while(closeEvents.length)closeEvents.shift()();}};
}

test('rental confirmation retains the underlying settings draft and owns pointer and keyboard events',()=>{
 const f=fixture();f.open('voice-room-settings','settings');const sheet=f.client.talkPopup,ticket=f.client.settingsTicket;
 f.context.document.querySelector=selector=>selector==='dialog.rental-confirm[open]'?{}:null;
 for(const type of ['pointerdown','click','keydown']){
  const event=f.fire(type,f.input,{key:'Escape'});assert.equal(event.defaultPrevented,false);assert.equal(event.stopped,false);assert.equal(sheet.open,true);assert.equal(f.client.settingsTicket,ticket);
 }
});

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

test('one mobile tap dismisses an overlapping room popup and lets the editor receive focus',()=>{
 for(const [id,action] of [['voice-members','participants'],['voice-room-settings','settings']]){
  const f=fixture(),sheet=f.nodes.get(id),draft=f.input.textContent;
  f.open(id,action);
  const down=f.fire('pointerdown',f.input);
  assert.equal(down.defaultPrevented,false,'the first tap must keep its native input focus action');
  assert.equal(down.stopped,false);assert.equal(sheet.open,false);
  if(!down.defaultPrevented)f.input.focus();
  const click=f.fire('click',f.input);
  assert.equal(click.defaultPrevented,false);assert.equal(click.stopped,false);
  const focusCount=f.focus.length;f.flush();
  assert.equal(f.active(),f.input,'a queued dialog close must not return focus to the header');
  assert.equal(f.focus.length,focusCount);assert.equal(f.input.textContent,draft);
  assert.equal(f.client.talkPopup,null);assert.equal(f.rootAttrs.has('data-room-popup'),false);
  assert.equal(f.nodes.get('trigger-'+action).getAttribute('aria-expanded'),'false');
 }
});

test('an accessible mobile input click without pointer events also avoids consuming the input action',()=>{
 const f=fixture();f.open('voice-members','participants');
 const click=f.fire('click',f.input);
 assert.equal(click.defaultPrevented,false);assert.equal(click.stopped,false);
 assert.equal(f.nodes.get('voice-members').open,false);
 f.input.focus();f.flush();assert.equal(f.active(),f.input);
});

test('ordinary room popup dismissal still restores the trigger after an input dismissal',()=>{
 const f=fixture();f.open('voice-members','participants');
 f.fire('pointerdown',f.input);f.input.focus();f.flush();
 f.open('voice-members','participants');
 const escape=f.fire('keydown',f.nodes.get('voice-members'),{key:'Escape'});
 assert.equal(escape.defaultPrevented,true);f.flush();
 assert.equal(f.active(),f.nodes.get('trigger-participants'));
 assert.equal(f.client.talkPopup,null);
});

test('a late input-dismissal close neither steals focus from a newer popup nor suppresses its normal close',()=>{
 const f=fixture(),members=f.nodes.get('voice-members'),settings=f.nodes.get('voice-room-settings');
 f.open('voice-members','participants');
 f.fire('pointerdown',f.input);f.input.focus();
 assert.equal(members.open,false);
 f.open('voice-room-settings','settings');
 const ticket=f.client.settingsTicket,focusCount=f.focus.length;f.flush();
 assert.equal(f.client.talkPopup,settings);assert.equal(settings.open,true);assert.equal(f.active(),settings);
 assert.equal(f.client.settingsTicket,ticket);assert.equal(f.focus.length,focusCount);
 assert.ok(f.observed.has(settings));assert.ok(f.rootAttrs.has('data-room-popup'));
 f.client.closeRoomPopup();f.flush();
 assert.equal(f.active(),f.nodes.get('trigger-settings'));assert.equal(f.client.talkPopup,null);
});

test('reopening the same popup before its old close event restores ordinary focus behavior',()=>{
 const f=fixture(),members=f.nodes.get('voice-members');
 f.open('voice-members','participants');f.fire('pointerdown',f.input);f.input.focus();
 f.open('voice-members','participants');const focusCount=f.focus.length;f.flush();
 assert.equal(members.open,true);assert.equal(f.active(),members);assert.equal(f.focus.length,focusCount);
 f.client.closeRoomPopup();f.flush();
 assert.equal(f.active(),f.nodes.get('trigger-participants'));
});

test('desktop input clicks keep the existing outside-dismissal behavior',()=>{
 const f=fixture();f.context.window.innerWidth=1440;f.open('voice-members','participants');
 const down=f.fire('pointerdown',f.input);
 assert.equal(down.defaultPrevented,true);assert.equal(f.nodes.get('voice-members').open,true);
 const click=f.fire('click',f.input);
 assert.equal(click.defaultPrevented,true);assert.equal(click.stopped,true);f.flush();
 assert.equal(f.active(),f.nodes.get('trigger-participants'));
});
