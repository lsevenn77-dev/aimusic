import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Exercise the real directory event handlers, including composition listeners.
function directory({hash='#community',saved=null,viewer='viewer',revision=0,now=Date.now(),response=async()=>({enabled:true,rooms:[],next_cursor:null})}={}){
 let focused=null,responder=response;
 class Clock extends Date {static now(){return now;}}
 class Element extends EventTarget {
  constructor(){super();this.dataset={};this.attributes=new Map();this.value='';this.hidden=false;this.scrollTop=0;this.children=[];this.isConnected=true;this._text='';this.writes=0;this.style={setProperty(){},removeProperty(){}};}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  getAttribute(k){return this.attributes.get(k)??null;}
  focus(){focused=this;} blur(){if(focused===this)focused=null;}
  get textContent(){return this._text;} set textContent(text){this._text=text;this.writes++;}
  get innerHTML(){return this.children.map(el=>typeof el==='string'?el:'<a data-talk-id="'+el.dataset.talkId+'">'+el.innerHTML+'</a>').join('');}
  get firstElementChild(){return this.children[0]??null;}
  get childNodes(){return this.children;}
  get nextElementSibling(){const siblings=this.parent?.children||[];return siblings[siblings.indexOf(this)+1]??null;}
  remove(){if(this.parent){const list=this.parent.children;list.splice(list.indexOf(this),1);this.parent=null;}}
  insertBefore(el,ref){el.remove();el.parent=this;this.children.splice(ref?this.children.indexOf(ref):this.children.length,0,el);this.writes++;}
  append(el){this.insertBefore(el,null);}
  replaceChildren(...nodes){this.children=nodes;this.writes++;}
  contains(el){return el===this||!!el&&this.children.includes(el);} closest(){return null;} querySelectorAll(){return [];}
  getBoundingClientRect(){return {top:0,bottom:500,height:500};}
  scrollTo({top}){this.scrollTop=top;}
 }
 const nodes=new Map(),get=key=>{if(!nodes.has(key))nodes.set(key,new Element());return nodes.get(key);};
 const filters=['all','karaoke','talk'].map(value=>{const el=new Element();el.dataset.roomFilter=value;return el;});
 const root=new Element();root.querySelector=key=>key==='dialog[open]'?null:get(key);root.querySelectorAll=()=>filters;
 const main=new Element(),navigation=new Element();main.querySelector=key=>key===':scope > .music-community-tabs'?navigation:null;root.closest=key=>key==='#main'?main:null;
 get('.talk-status').querySelector=get;
 const timers=new Map(),frames=new Map(),intervals=new Map(),requests=[],cleanups=[],observed=[],windowScrolls=[];let seq=0;
 const window=new EventTarget();window.scrollTo=options=>windowScrolls.push(options);
 const document=new EventTarget();document.hidden=false;document.querySelector=()=>null;Object.defineProperty(document,'activeElement',{get:()=>focused});
 document.createElement=tag=>{
  assert.equal(tag,'template');
  return {content:{},set innerHTML(html){
   const [,id,text]=html.match(/^<a data-talk-id="([^"]+)">(.*)<\/a>$/);
   const card=new Element();card.dataset.talkId=id;card.children=[text];this.content.firstElementChild=card;
  }};
 };
 const c=nicknameContext({
  me:viewer?{id:viewer}:null,apiRevision:revision,location:{hash},talkingRoomReturn:saved,talkingRoomCard:room=>`<a data-talk-id="${room.id}">${room.followed_profiles?.length||0}</a>`,liveRoomLabels:{karaoke:'노래방',talk:'토킹룸'},
  URLSearchParams,AbortController,Date:Clock,Map,requestAnimationFrame:fn=>{const id=++seq;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(node){observed.push(node);}disconnect(){}},IntersectionObserver:class{observe(){}unobserve(){}disconnect(){}},
  document,window,innerHeight:900,
  setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{const id=++seq;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),
  registerRouteCleanup:fn=>cleanups.push(fn),voiceRequest:async(path,_body,_method,signal)=>{const params=new URLSearchParams(path.split('?')[1]);requests.push(params);return responder(params,signal);}
 });
 const source=readFileSync(new URL('../dist/community-v3.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('function liveDirectoryAlias('),source.indexOf('function bindVoiceLobby(')),c);
 c.bindTalkingDirectory(root);
 const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
 const flush=async()=>{await settle();for(const [id,timer] of [...timers])if(timer.ms===220){timers.delete(id);await timer.fn();}for(const [id,fn] of [...frames]){frames.delete(id);fn();}await settle();};
 return {root,get,filters,requests,flush,navigation,observed,windowScrolls,context:c,focused:()=>focused,snapshot:()=>c.talkingRoomReturn,
  advance:ms=>{now+=ms;},setResponse:fn=>{responder=fn;},poll:()=>[...intervals.values()].find(timer=>timer.ms===20000)?.fn(),
  fireTimeout:ms=>{for(const [id,timer] of timers)if(timer.ms===ms){timers.delete(id);timer.fn();}},
  clickRoom:()=>{const event=new Event('click');Object.assign(event,{button:0});Object.defineProperty(event,'target',{value:{closest:()=>({})}});get('.v3-room-grid').dispatchEvent(event);},
  dispose:()=>{cleanups.splice(0).forEach(fn=>fn());root.isConnected=false;}};
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

test('banner room links select only validated types without locking later filter changes',async()=>{
 for(const [hash,mode] of [['#live?mode=karaoke','karaoke'],['#voice?mode=talk','talk'],['#live?mode=all','all'],['#live?mode=invalid','all'],['#voice?mode=toString','all']]){
  const d=directory({hash});await d.flush();
  assert.equal(d.root.dataset.filter,mode,hash);assert.equal(d.requests[0].get('mode'),mode,hash);
  assert.equal(d.requests[0].has('q'),false);assert.equal(d.requests[0].has('cursor'),false);
  for(const filter of d.filters)assert.equal(filter.attributes.get('aria-pressed'),String(filter.dataset.roomFilter===mode));
  d.filters.find(filter=>filter.dataset.roomFilter==='talk').onclick();await d.flush();
  assert.equal(d.root.dataset.filter,'talk');assert.equal(d.requests.at(-1).get('mode'),'talk');d.dispose();
 }
});

test('a banner type discards conflicting saved search, results and pagination together',async()=>{
 const hash='#voice?mode=talk';
 const saved={route:hash,viewer:'viewer',until:Date.now()+60000,mode:'karaoke',query:'이전 노래방',searchOpen:true,items:[['old-room',{id:'old-room',mode:'karaoke'}]],cursor:'old-cursor',done:true,scroll:300};
 const d=directory({hash,saved});await d.flush();
 assert.equal(d.root.dataset.filter,'talk');assert.equal(d.get('#v3-room-search').value,'');
 assert.equal(d.get('.live-tools').dataset.searchOpen,'false');assert.equal(d.requests.length,1);
 assert.equal(d.requests[0].get('mode'),'talk');assert.equal(d.requests[0].has('q'),false);assert.equal(d.requests[0].has('cursor'),false);d.dispose();
});

test('matching banner snapshots and ordinary routes retain the existing search restoration',async()=>{
 for(const hash of ['#voice?mode=talk','#live','#live?mode=invalid']){
  const saved={route:hash,viewer:'viewer',until:Date.now()+60000,mode:'talk',query:'책 이야기',searchOpen:true,items:[],cursor:'next-page',done:false,scroll:120};
  const d=directory({hash,saved});await d.flush();const input=d.get('#v3-room-search');
  assert.equal(d.root.dataset.filter,'talk',hash);assert.equal(input.value,'책 이야기',hash);assert.equal(d.get('.live-tools').dataset.searchOpen,'true');
  input.value='새 이야기';input.oninput({});await d.flush();
  assert.equal(d.requests.at(-1).get('mode'),'talk');assert.equal(d.requests.at(-1).get('q'),'새 이야기');assert.equal(d.requests.at(-1).has('cursor'),false);d.dispose();
 }
});

const roomPage=()=>({enabled:true,rooms:[{id:'room-one',mode:'talk',followed_profiles:[{profile_id:'friend'}]}],next_cursor:null});
const emptyPage=()=>({enabled:true,rooms:[],next_cursor:null});
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

test('initial loading settles once and repeated, failed and resumed empty reads leave the view intact',async()=>{
 const initial=deferred(),d=directory({response:()=>initial.promise});
 const status=d.get('.talk-status'),caption=d.get('span'),art=d.get('.live-empty-art'),grid=d.get('.v3-room-grid');
 d.fireTimeout(450);assert.equal(status.dataset.state,'loading');assert.equal(art.getAttribute('src'),null);
 initial.resolve(emptyPage());await d.flush();
 const expected=[caption.textContent,caption.writes,grid.writes,art.getAttribute('src')];
 assert.equal(expected[0],'아직 열린 공개방이 없어요.');assert.equal(expected[3],'/assets/aifect-empty-all.webp');
 const check=()=>{
  assert.equal(status.hidden,false);assert.equal(status.dataset.state,'empty');
  assert.deepEqual([caption.textContent,caption.writes,grid.writes,art.getAttribute('src')],expected);
 };
 for(const fail of [false,true,false]){
  const channel=deferred();d.setResponse(()=>channel.promise);
  const pending=d.poll();check();await d.poll(); // coalesce while in flight
  if(fail)channel.reject(Error('offline'));else channel.resolve(emptyPage());
  await pending;check();
 }
 const count=d.requests.length;d.context.document.hidden=true;
 d.context.document.dispatchEvent(new Event('visibilitychange'));await d.poll();
 assert.equal(d.requests.length,count);
 const resumed=deferred();d.setResponse(()=>resumed.promise);d.context.document.hidden=false;
 d.context.document.dispatchEvent(new Event('visibilitychange'));assert.equal(d.requests.length,count+1);check();
 resumed.resolve(roomPage());await d.flush();
 assert.equal(status.hidden,true);assert.equal(grid.firstElementChild.dataset.talkId,'room-one');d.dispose();
});

test('room arrivals, changes and closures update only the affected cards after a confirmed read',async()=>{
 const d=directory({response:async()=>emptyPage()});await d.flush();
 const grid=d.get('.v3-room-grid'),status=d.get('.talk-status');
 d.setResponse(async()=>roomPage());await d.poll();
 const first=grid.firstElementChild,writes=grid.writes;assert.equal(status.hidden,true);
 d.setResponse(async()=>roomPage());await d.poll();
 assert.equal(grid.firstElementChild,first);assert.equal(grid.writes,writes);assert.equal(first.writes,0);
 const added={id:'new',mode:'talk',followed_profiles:[]};
 d.setResponse(async()=>({...roomPage(),rooms:[added,...roomPage().rooms]}));await d.poll();
 assert.equal(grid.children[1],first);
 d.setResponse(async()=>({...roomPage(),rooms:[{...roomPage().rooms[0],followed_profiles:[]}]}));await d.poll();
 assert.equal(grid.firstElementChild,first);assert.equal(first.innerHTML,'0');
 // The last focused card disappeared from its ID lookup, but a full lookup may still find another room.
 first.focus();const confirm=deferred();d.setResponse(p=>p.has('ids')?emptyPage():confirm.promise);
 const closing=d.poll();await d.flush();assert.equal(grid.firstElementChild,first);assert.equal(status.hidden,true);
 confirm.resolve(emptyPage());await closing;
 assert.equal(grid.children.length,0);assert.equal(status.dataset.state,'empty');d.dispose();
});

test('an intermediate empty cursor page cannot hide an existing room or announce an empty list',async()=>{
 const d=directory({response:async()=>roomPage()});await d.flush();
 const grid=d.get('.v3-room-grid'),first=grid.firstElementChild,second=deferred();
 d.setResponse(p=>p.has('cursor')?second.promise:{...emptyPage(),next_cursor:'next'});
 const changing=d.poll();await d.flush();assert.equal(grid.firstElementChild,first);
 assert.equal(d.get('.talk-status').hidden,true);second.resolve(roomPage());await changing;
 assert.equal(grid.firstElementChild,first);d.dispose();
});

test('tab cleanup captures the mounted route and restores directory aliases without a fresh request or window scroll',async()=>{
 const d=directory({hash:'#community',now:100000,response:async()=>({...roomPage(),next_cursor:'next-page'})});await d.flush();
 d.filters[2].onclick();await d.flush();
 const input=d.get('#v3-room-search');input.value='책 이야기';input.oninput({});await d.flush();d.get('.talk-scroll').scrollTop=180;
 d.context.location.hash='#crew';d.dispose();const saved=d.snapshot();
 assert.equal(saved.route,'#community');assert.equal(saved.mode,'talk');assert.equal(saved.query,'책 이야기');assert.equal(saved.cursor,'next-page');assert.equal(saved.done,false);assert.equal(saved.scroll,180);assert.equal(saved.searchOpen,true);assert.equal(saved.fromRoom,false);
 for(const hash of ['#live','#voice','#community/voice','#live?mode=talk']){
  const back=directory({hash,saved,now:101000});await back.flush();
  assert.equal(back.requests.length,0,hash);assert.equal(back.root.dataset.filter,'talk');assert.equal(back.get('#v3-room-search').value,'책 이야기');assert.equal(back.get('.talk-scroll').scrollTop,180);
  assert.match(back.get('.v3-room-grid').innerHTML,/room-one/);assert.ok(back.observed.includes(back.navigation));assert.deepEqual(back.windowScrolls,[]);
  back.dispose();assert.equal(back.snapshot().route,hash);
 }
 const changed=directory({hash:'#live?mode=karaoke',saved,now:101000});await changed.flush();
 assert.equal(changed.requests.length,1);assert.equal(changed.root.dataset.filter,'karaoke');assert.equal(changed.get('#v3-room-search').value,'');assert.equal(changed.requests[0].has('cursor'),false);changed.dispose();
});

test('live reads become stale at twenty seconds and expire after two minutes without crossing account or API revision',async()=>{
 const first=directory({hash:'#live',now:100000,response:async()=>roomPage()});await first.flush();
 first.filters[2].onclick();await first.flush();first.get('#v3-room-search').value='이야기';first.get('#v3-room-search').oninput({});await first.flush();first.dispose();
 const saved=first.snapshot();assert.equal(saved.fetchedAt,100000);assert.equal(saved.until,220000);
 for(const [delta,requests,query] of [[19999,0,'이야기'],[20000,1,'이야기'],[120000,1,'']]){
  const back=directory({hash:'#live',saved,now:100000+delta});await back.flush();
  assert.equal(back.requests.length,requests,String(delta));assert.equal(back.get('#v3-room-search').value,query);back.dispose();
 }
 for(const scope of [{viewer:'other'},{viewer:null},{revision:1}]){
  const other=directory({hash:'#live',saved,now:101000,...scope});await other.flush();
  assert.equal(other.requests.length,1);assert.equal(other.root.dataset.filter,'all');assert.equal(other.get('#v3-room-search').value,'');other.dispose();
 }
});

test('cached disabled and empty directories restore their exact status and retain the twenty-second poll',async()=>{
 for(const enabled of [false,true]){
  const response=async()=>({enabled,rooms:[],next_cursor:null});
  const first=directory({hash:'#live',now:100000,response});await first.flush();
  const text=first.get('span').textContent,state=first.get('.talk-status').dataset.state;first.dispose();
  const back=directory({hash:'#live',saved:first.snapshot(),now:101000,response});await back.flush();
  assert.equal(back.requests.length,0);assert.equal(back.root.dataset.enabled,String(enabled));assert.equal(back.get('#v3-create-room').disabled,!enabled);
  assert.equal(back.get('span').textContent,text);assert.equal(back.get('.talk-status').dataset.state,state);assert.equal(back.get('.talk-status').hidden,false);assert.equal(back.get('.talk-sentinel').hidden,true);
  back.advance(20000);await back.poll();await back.flush();assert.equal(back.requests.length,1);back.dispose();
 }
});

test('failed and uncompleted queries never become successful snapshots; a failed refresh preserves only the old success time',async()=>{
 const failed=directory({now:100000,response:async()=>{throw Error('offline');}});await failed.flush();
 assert.equal(failed.get('.talk-status').dataset.state,'error');failed.dispose();assert.equal(failed.snapshot(),null);
 const changed=directory({now:100000,response:async()=>roomPage()});await changed.flush();
 changed.get('#v3-room-search').value='아직 조회하지 않은 검색';changed.get('#v3-room-search').oninput({});changed.dispose();assert.equal(changed.snapshot(),null);
 const first=directory({hash:'#live',now:100000,response:async()=>roomPage()});await first.flush();first.advance(5000);first.setResponse(async()=>{throw Error('offline');});await first.poll();await first.flush();first.dispose();
 const saved=first.snapshot();assert.equal(saved.fetchedAt,100000);assert.equal(saved.until,220000);assert.equal(saved.readFailed,true);assert.equal(saved.items[0][0],'room-one');assert.equal(saved.items[0][1].followed_profiles.length,0);
 const back=directory({hash:'#live',saved,now:106000,response:async()=>roomPage()});await back.flush();assert.equal(back.requests.length,1);back.dispose();assert.equal(back.snapshot().fetchedAt,106000);
});

test('room return refreshes inside the freshness window and clears stale followed-member badges before that read',async()=>{
 const first=directory({hash:'#live',now:100000,response:async()=>roomPage()});await first.flush();first.clickRoom();
 first.context.location.hash='#voice/room-one';first.dispose();const saved=first.snapshot();assert.equal(saved.fromRoom,true);assert.equal(saved.route,'#live');
 const back=directory({hash:'#live',saved,now:101000,response:async()=>roomPage()});
 assert.match(back.get('.v3-room-grid').innerHTML,/>0<\/a>/);await back.flush();assert.equal(back.requests.length,1);assert.match(back.get('.v3-room-grid').innerHTML,/>1<\/a>/);back.dispose();
});

test('late reads cannot populate a snapshot after leaving, changing account or invalidating the API revision',async()=>{
 for(const change of ['leave','account','revision']){
  let resolve;const d=directory({now:100000,response:()=>new Promise(done=>{resolve=done;})});
  if(change==='leave')d.dispose();else if(change==='account')d.context.me={id:'other'};else d.context.apiRevision++;
  resolve(roomPage());await d.flush();if(change!=='leave')d.dispose();assert.equal(d.snapshot(),null,change);assert.equal(d.get('.v3-room-grid').innerHTML,'',change);
 }
});
