import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const layout=readFileSync(new URL('../dist/room-layout.js',import.meta.url),'utf8');
const controls=readFileSync(new URL('../dist/voice-room-controls.js',import.meta.url),'utf8');
function node(){
 const attrs=new Set(),values=new Map(),events=new Map();
 return {attrs,values,events,isConnected:true,
  style:{getPropertyValue:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)},
  addEventListener(type,fn){events.set(type,fn);},toggleAttribute(k,on){if(on)attrs.add(k);else attrs.delete(k);},
  hasAttribute:k=>attrs.has(k),getBoundingClientRect:()=>({height:44,top:0,width:390})};
}
function viewportFixture(){
 const frames=[],main=node(),room=node(),root=node(),transcript=node(),composer=node(),header=node(),picker={open:false,hidden:true};
 const input={closest:selector=>selector==='#voice-chat-form'?composer:null};
 Object.assign(transcript,{scrollHeight:1000,clientHeight:240,_scrollTop:760});
 Object.defineProperty(transcript,'scrollTop',{get(){return this._scrollTop;},set(v){this._scrollTop=Math.min(Math.max(0,v),this.scrollHeight-this.clientHeight);}});
 const nodes={'#voice-chat-form':composer,'#voice-chat':transcript,'#voice-emoji-picker':picker,'.room-header':header};
 room.querySelector=s=>nodes[s];room.querySelectorAll=()=>[];room.getBoundingClientRect=()=>({top:57,width:390});
 const bar={hidden:false,matches:()=>true,getBoundingClientRect:()=>({top:0,bottom:57,height:57})};
 const vv={height:844,offsetTop:0,addEventListener(){}},document={activeElement:null,documentElement:root,querySelector:()=>main,querySelectorAll:()=>[bar],addEventListener(){}};
 let keyboard=false;
 const window={visualViewport:vv,addEventListener(){},AifectMobileInput:{measure:()=>({keyboard})}};
 const context=vm.createContext({AbortController,URL,innerWidth:390,innerHeight:844,window,document,getComputedStyle:()=>({display:'block',visibility:'visible'}),setVoiceFocus(){},
  requestAnimationFrame:fn=>(frames.push(fn),frames.length),ResizeObserver:class{observe(){}disconnect(){}}});
 vm.runInContext(layout,context);const client={host:room,joined:true};context.bindRoomViewport(client);
 const resize=()=>{client.onViewport();while(frames.length)frames.shift()();};
 return {context,client,room,main,transcript,composer,header,picker,input,document,vv,resize,setKeyboard(value){keyboard=value;}};
}

test('short mobile sheets retain their bottom anchor while leaving the header controls exposed',()=>{
 const f=viewportFixture();
 f.header.getBoundingClientRect=()=>({top:57,bottom:132,height:75});
 let composerTop=790;
 f.composer.getBoundingClientRect=()=>({top:composerTop,height:46});
 f.resize();
 assert.equal(f.room.values.get('--room-popup-available'),'642px');
 assert.equal(Math.min(560,parseFloat(f.room.values.get('--room-popup-available'))),560,'ordinary mobile settings keep the existing height');
 f.context.innerWidth=320;f.context.innerHeight=700;f.vv.height=700;composerTop=646;f.resize();
 const available=parseFloat(f.room.values.get('--room-popup-available')),popupBottom=composerTop-8;
 assert.equal(available,498);
 assert.equal(popupBottom-available,140,'the lower anchor remains in place and the sheet begins 8px below the header');
 assert.equal(f.room.values.get('--voice-viewport'),'643px','the popup cap does not resize the room');
 f.context.innerWidth=1440;f.resize();
 assert.equal(f.room.values.get('--room-popup-available'),'573px','desktop keeps its existing room-start calculation');
});

test('mobile typing follows the visible keyboard viewport and keeps latest room messages above the composer',()=>{
 const f=viewportFixture();assert.equal(f.transcript.scrollTop,760);
 f.document.activeElement=f.input;f.setKeyboard(true);f.vv.offsetTop=64;f.vv.height=420;f.transcript.clientHeight=96;f.resize();
 assert.equal(f.main.values.get('--voice-top'),'64px');assert.equal(f.room.values.get('--voice-viewport'),'420px');
 assert.equal(f.room.hasAttribute('data-room-chat-active'),true);assert.equal(f.room.hasAttribute('data-room-keyboard'),true);
 assert.equal(f.transcript.scrollTop,904);
 f.setKeyboard(false);f.document.activeElement=null;f.vv.offsetTop=0;f.vv.height=844;f.transcript.clientHeight=240;f.resize();
 assert.equal(f.room.hasAttribute('data-room-chat-active'),false);assert.equal(f.transcript.scrollTop,760);
});

test('keyboard and sticker tray changes preserve a reader position in room chat history',()=>{
 const f=viewportFixture();f.transcript.scrollTop=200;f.transcript.events.get('scroll')();
 f.document.activeElement=f.input;f.setKeyboard(true);f.vv.height=420;f.transcript.clientHeight=96;f.resize();
 assert.equal(f.transcript.scrollTop,200);
 f.document.activeElement=null;f.setKeyboard(false);f.picker.open=true;f.picker.hidden=false;f.vv.height=844;f.resize();
 assert.equal(f.room.hasAttribute('data-room-chat-active'),false,'the floating picker must not resize the stage');assert.equal(f.room.hasAttribute('data-room-stickers'),true);
 assert.equal(f.room.hasAttribute('data-room-keyboard'),false);assert.equal(f.transcript.scrollTop,200);
 f.context.innerWidth=1440;f.resize();assert.equal(f.room.hasAttribute('data-room-chat-active'),false);assert.equal(f.transcript.scrollTop,200);
});

test('mobile back closes the independent sticker tray before it can leave the room',()=>{
 const f=viewportFixture();let leaves=0,closes=0;
 f.client.safe=fn=>fn();f.client.action=action=>{assert.equal(action,'leave');leaves++;};
 f.client.toggleEmojiPicker=(open,focus)=>{assert.equal(open,false);assert.equal(focus,true);f.picker.open=open;f.picker.hidden=!open;closes++;};
 f.picker.open=true;f.picker.hidden=false;
 assert.equal(f.context.window.aifectRoomBack(),true);assert.equal(closes,1);assert.equal(leaves,0);
 assert.equal(f.context.window.aifectRoomBack(),true);assert.equal(leaves,1);
 f.client.closed=true;assert.equal(f.context.window.aifectRoomBack(),false);assert.equal(leaves,1);
});

test('the shared room editor exposes only committed text and rejects active IME composition',()=>{
 const listeners=new Map(),text={nodeType:3,nodeName:'#text',textContent:'안녕'},element={
  closest:()=>null,childNodes:[text],firstChild:text,querySelectorAll:()=>[],
  addEventListener(type,fn){listeners.set(type,fn);},contains:()=>false
 };
 const context=vm.createContext({AbortController,Node:{ELEMENT_NODE:1,TEXT_NODE:3},document:{activeElement:element,addEventListener(){}},window:{getSelection:()=>({rangeCount:0})},element});
 const source=readFileSync(new URL('../shared/chat-sticker-editor.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'').replace('export function createStickerEditor','function createStickerEditor');
 vm.runInContext(source+'\nthis.editor=createStickerEditor(element,{limit:500});',context);
 listeners.get('input')();assert.equal(context.editor.get(),'안녕');assert.equal(context.editor.canSend(),true);
 listeners.get('compositionstart')();text.textContent='안녕ㅎ';listeners.get('input')();
 assert.equal(context.editor.isComposing(),true);assert.equal(context.editor.canSend(),false);assert.equal(context.editor.get(),'안녕');assert.equal(text.textContent,'안녕ㅎ');
 text.textContent='안녕하세요';listeners.get('compositionend')();
 assert.equal(context.editor.isComposing(),false);assert.equal(context.editor.canSend(),true);assert.equal(context.editor.get(),'안녕하세요');
});

test('successful mobile sends dismiss input only when no newer draft has been typed',()=>{
 let draft='',blurs=0,closed=0;
 const context=vm.createContext({VoiceRoomClient:class{},window:{innerWidth:390},$:()=>({blur(){blurs++;}})});
 vm.runInContext(controls,context);const client=vm.runInContext('new VoiceRoomClient()',context);
 Object.assign(client,{chatEditor:{get:()=>draft},toggleEmojiPicker(){closed++;}});
 draft='전송 대기 중 쓴 다음 초안';client.finishChatInteraction();assert.equal(blurs,0);assert.equal(closed,0);
 draft='';client.finishChatInteraction();assert.equal(blurs,1);assert.equal(closed,1);
 context.window.innerWidth=1440;client.finishChatInteraction();assert.equal(blurs,1,'desktop Enter retains focus for the next message');
});

test('room sticker dock closes on input focus without consuming or clearing the draft',()=>{
 const input=node(),form=node(),picker=node(),button=node(),host=node(),document={activeElement:input};
 let draft='입력 중 [aifect:cat_basic_laugh]',remembered=0;
 input.blur=()=>{document.activeElement=null;};
 picker.hidden=true;picker.open=false;picker.show=()=>{picker.open=true;};picker.close=()=>{picker.open=false;picker.events.get('close')?.();};picker.querySelector=()=>null;
 button.setAttribute=(k,v)=>button.values.set(k,v);host.querySelector=()=>button;
 const context=vm.createContext({VoiceRoomClient:class{},window:{innerWidth:390},document,$:id=>id==='#voice-message'?input:picker});
 vm.runInContext(controls,context);const client=vm.runInContext('new VoiceRoomClient()',context);
 Object.assign(client,{host,chatEditor:{get:()=>draft,remember(){remembered++;}}});
 client.bindChatInteraction(form,input,picker,{});client.toggleEmojiPicker(true);
 assert.equal(remembered,1);assert.equal(document.activeElement,null);assert.equal(picker.open,true);assert.equal(host.hasAttribute('data-room-stickers'),true);
 document.activeElement=input;input.events.get('focus')();
 assert.equal(picker.open,false);assert.equal(button.values.get('aria-expanded'),'false');assert.equal(draft,'입력 중 [aifect:cat_basic_laugh]');
 assert.equal(document.activeElement,input);
});


test('sticker picker stays above its composer and within the visual viewport',()=>{
 const f=viewportFixture();f.picker.open=true;f.picker.hidden=false;
 f.header.getBoundingClientRect=()=>({top:57,bottom:132,height:75});
 f.composer.getBoundingClientRect=()=>({left:16,top:790,width:358,height:44});f.resize();
 const value=name=>parseFloat(f.room.values.get(name));
 assert.equal(value('--room-emoji-top')+value('--room-emoji-height'),782);
 assert.equal(value('--room-emoji-left'),16);assert.equal(value('--room-emoji-width'),358);
 f.vv.height=420;f.composer.getBoundingClientRect=()=>({left:16,top:366,width:358,height:44});f.resize();
 assert.ok(value('--room-emoji-top')>=140);
 assert.equal(value('--room-emoji-top')+value('--room-emoji-height'),358);
});
