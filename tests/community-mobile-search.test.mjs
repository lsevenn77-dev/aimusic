import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Exercise the real directory event handlers, including composition listeners.
function directory(){
 let focused=null;
 class Element extends EventTarget {
  constructor(){super();this.dataset={};this.attributes=new Map();this.value='';this.hidden=false;this.style={};this.scrollTop=0;this.children=[];}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  focus(){focused=this;} blur(){if(focused===this)focused=null;}
  replaceChildren(){} insertAdjacentHTML(){} contains(){return false;}
 }
 const nodes=new Map(),get=key=>{if(!nodes.has(key))nodes.set(key,new Element());return nodes.get(key);};
 const filters=['all','karaoke','talk'].map(value=>{const el=new Element();el.dataset.roomFilter=value;return el;});
 const root=new Element();root.querySelector=key=>key==='dialog[open]'?null:get(key);root.querySelectorAll=()=>filters;
 get('.talk-status').querySelector=get;
 const timers=new Map(),requests=[],cleanups=[];let seq=0;
 const c=nicknameContext({
  me:{id:'viewer'},location:{hash:'#community'},talkingRoomReturn:null,liveRoomLabels:{karaoke:'노래방',talk:'토킹룸'},
  URLSearchParams,AbortController,Date,Map,IntersectionObserver:class{observe(){}unobserve(){}disconnect(){}},
  document:{hidden:false,addEventListener(){},removeEventListener(){},get activeElement(){return focused;}},
  window:{addEventListener(){},removeEventListener(){}},
  setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){},
  registerRouteCleanup:fn=>cleanups.push(fn),voiceRequest:async path=>{requests.push(new URLSearchParams(path.split('?')[1]));return {enabled:true,rooms:[],next_cursor:null};}
 });
 const source=readFileSync(new URL('../dist/community-v3.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('function bindTalkingDirectory('),source.indexOf('function bindVoiceLobby(')),c);
 c.bindTalkingDirectory(root);
 const flush=async()=>{await Promise.resolve();await Promise.resolve();for(const [id,timer] of [...timers])if(timer.ms===220){timers.delete(id);await timer.fn();}await Promise.resolve();};
 return {root,get,filters,requests,flush,focused:()=>focused,dispose:()=>cleanups.forEach(fn=>fn())};
}

test('mobile search retains scope, ignores IME Enter, keeps the same input, clears and closes explicitly',async()=>{
 const d=directory();await d.flush();
 const input=d.get('#v3-room-search'),open=d.get('[data-live-search-open]'),clear=d.get('[data-live-search-clear]'),close=d.get('[data-live-search-close]');
 d.filters[1].onclick();await d.flush();open.onclick();
 assert.equal(d.root.dataset.filter,'karaoke');assert.equal(input.placeholder,'노래방 제목·방장 검색');assert.equal(d.focused(),input);
 const count=d.requests.length;
 input.dispatchEvent(new Event('compositionstart'));input.value='노래';input.oninput({isComposing:true});
 let prevented=false;input.onkeydown({key:'Enter',isComposing:true,keyCode:229,preventDefault(){prevented=true;}});
 await d.flush();assert.equal(d.requests.length,count);assert.equal(prevented,false);assert.equal(d.focused(),input);
 input.dispatchEvent(new Event('compositionend'));await d.flush();
 assert.equal(d.requests.at(-1).get('q'),'노래');assert.equal(d.requests.at(-1).get('mode'),'karaoke');
 input.onkeydown({key:'Enter',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(d.focused(),null);assert.equal(input.value,'노래');assert.equal(d.get('.live-tools').dataset.searchOpen,'true');
 clear.onclick();await d.flush();assert.equal(input.value,'');assert.equal(d.root.dataset.filter,'karaoke');assert.equal(d.focused(),input);assert.equal(clear.hidden,true);
 input.value='방장';input.oninput({});await d.flush();close.onclick();await d.flush();
 assert.equal(d.requests.at(-1).has('q'),false);assert.equal(d.requests.at(-1).get('mode'),'karaoke');assert.equal(d.focused(),open);
 assert.equal(d.get('.live-tools').dataset.searchOpen,'false');assert.equal(d.get('#v3-room-search'),input);d.dispose();
});

test('desktop queries remain discoverable when resizing into the mobile toolbar',async()=>{
 const d=directory();await d.flush();const input=d.get('#v3-room-search');
 input.value='방장';input.oninput({});await d.flush();
 assert.equal(d.get('.live-tools').dataset.searchOpen,'true');assert.equal(d.requests.at(-1).get('q'),'방장');d.dispose();
});
