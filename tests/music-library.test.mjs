import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
const source=readFileSync(new URL('../dist/music-library.js',import.meta.url),'utf8');

test('private library requires authentication, validates categories and does not invent saved or downloaded records',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/me/music-library','GET',null,null)).status,401);
 assert.equal((await f.call('/api/me/music-library?section=uploads')).status,400);
 assert.equal((await f.call('/api/me/music-library','POST')).status,405);
 const r=await f.call('/api/me/music-library');assert.equal(r.status,200);
 assert.deepEqual(r.body.capabilities,{saved:false,downloads:false});assert.equal(r.body.counts.saved,null);assert.deepEqual(r.body.items,[]);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('track_saves','download_history')").get().n,0);
});
test('counts are unfiltered totals; paging, search and liked dates use the existing account records',async t=>{
 const f=await fixture(t);
 for(let i=0;i<18;i++){
  f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES(?,'owner','artist','producer',?,'Rock','QA',1,'wav',128,0,'published')").run('track'+i,'음악 '+String(i).padStart(2,'0'));
  f.sql.prepare("INSERT INTO likes(user_id,track_id,created) VALUES('owner',?,?)").run('track'+i,100+i);
 }
 f.sql.exec("INSERT INTO likes(user_id,track_id,created) VALUES('owner','hidden',1000),('other','one',1001)");
 const first=(await f.call('/api/me/music-library?section=likes')).body;
 assert.equal(first.counts.likes,18);assert.equal(first.total,18);assert.equal(first.items.length,12);assert.equal(first.nextOffset,12);assert.equal(first.items[0].id,'track17');assert.equal(first.items[0].library_at,117);assert.ok(first.items.every(t=>t.liked));
 const last=(await f.call('/api/me/music-library?section=likes&offset=12')).body;assert.equal(last.items.length,6);assert.equal(last.nextOffset,null);assert.equal(new Set([...first.items,...last.items].map(x=>x.id)).size,18);
 const search=(await f.call('/api/me/music-library?section=likes&q=音楽')).body;assert.equal(search.total,0);assert.equal(search.counts.likes,18);
 const oldest=(await f.call('/api/me/music-library?section=likes&sort=oldest&limit=1')).body;assert.equal(oldest.items[0].id,'track0');
 const other=(await f.call('/api/me/music-library?section=likes','GET',null,'other')).body;assert.equal(other.counts.likes,1);assert.equal(other.items[0].id,'one');
 await f.call('/api/tracks/track17/like','DELETE');assert.equal((await f.call('/api/me/music-library?section=likes')).body.counts.likes,17);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM tracks').get().n,22);
});
test('history is unique per visible song and sorted by actual last listen, with no cross-account leakage',async t=>{
 const f=await fixture(t);
 for(const [id,uid,tid,started] of [['a','owner','one',10],['b','owner','one',50],['c','owner','two',20],['d','other','three',99],['e','owner','hidden',100]])f.sql.prepare('INSERT INTO listens(id,listener,user_id,track_id,started,day) VALUES(?,?,?,?,?,?)').run(id,uid,uid,tid,started,'2026-10-26');
 const r=(await f.call('/api/me/music-library?section=history')).body;assert.equal(r.counts.history,2);assert.deepEqual(r.items.map(t=>[t.id,t.library_at]),[['one',50],['two',20]]);assert.equal(r.items[0].liked,false);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM listens').get().n,5);
});
test('owned playlists retain editing and visibility; historical saved lists are excluded',async t=>{
 const f=await fixture(t);
 const mine=(await f.call('/api/playlists','POST',{name:'내 목록',is_public:false,track_ids:['one','two']})).body;
 const publicList=(await f.call('/api/playlists','POST',{name:'친구 공개',is_public:true,track_ids:['three']},'other')).body;
 const privateList=(await f.call('/api/playlists','POST',{name:'친구 비공개',is_public:false},'other')).body;
 const id=mine.id,publicId=publicList.id;
 assert.ok(id&&publicId,JSON.stringify([mine,publicList]));
 f.sql.prepare("INSERT INTO playlist_saves VALUES('owner',?,0)").run(publicId);
 assert.equal((await f.call('/api/playlists/'+privateList.id+'/save','PUT')).status,404);
 const all=(await f.call('/api/me/music-library?section=playlists')).body;assert.equal(all.counts.playlists,1);assert.equal(all.items.length,1);
 assert.equal((await f.call('/api/me/music-library?section=playlists&filter=mine')).body.total,1);
 assert.equal((await f.call('/api/me/music-library?section=playlists&filter=saved&q=친구')).body.total,0);
 assert.equal((await f.call('/api/playlists/'+id)).body.tracks.length,2);
 assert.equal((await f.call('/api/playlists/'+id,'PATCH',{name:'수정한 목록',is_public:true})).status,200);
 assert.equal((await f.call('/api/me/music-library?section=playlists&q=수정한&sort=title')).body.items[0].is_public,1);
 assert.equal((await f.call('/api/playlists/'+publicId+'/save','DELETE')).status,404);
 assert.equal((await f.call('/api/playlists/'+id,'DELETE')).status,200);
 assert.equal((await f.call('/api/me/music-library?section=playlists')).body.total,0);
 assert.equal((await f.call('/api/playlists/'+publicId,'GET',null,'other')).status,200);
});
test('swipes reject vertical/diagonal/slow/edge/multitouch gestures and clamp to three categories',()=>{
 const c=nicknameContext({URLSearchParams});vm.runInContext(source,c);
 const start={x:200,y:200,time:0,width:390};
 const swipe=(end,index=1,patch={})=>c.musicLibrarySwipe({...start,...patch},{time:300,y:205,...end},index);
 assert.equal(swipe({x:100}),2);assert.equal(swipe({x:280}),0);
 assert.equal(swipe({x:150}),1);assert.equal(swipe({x:100,y:300}),1);assert.equal(swipe({x:100,time:800}),1);
 assert.equal(swipe({x:100},1,{x:10}),1);assert.equal(swipe({x:100},1,{x:380}),1);assert.equal(swipe({x:100},1,{cancelled:true}),1);
 assert.equal(swipe({x:100},2),2);assert.equal(swipe({x:280},0),0);
});
test('legacy query state stays bounded and likes is the initial category',()=>{
 const c=nicknameContext({URLSearchParams});vm.runInContext(source,c);
 assert.equal(c.musicLibraryOptions('profile?view=library').section,'likes');assert.equal(c.musicLibraryOptions('profile?view=library&section=uploads').section,'likes');
 assert.equal(c.musicLibraryOptions('profile?view=library&section=playlists&sort=name').sort,'title');
 assert.equal(c.musicLibraryOptions('profile?view=library&q='+'a'.repeat(200)).q.length,100);
});

const libraryPage=(section='likes',suffix='first',nextOffset=null)=>({items:[{id:section+'-'+suffix,title:section+' '+suffix,producer:'회원',producer_id:'producer',liked:section==='likes'}],counts:{likes:3,history:5,playlists:1},total:1,nextOffset});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

// Run the real library handlers against persistent shell/tab/panel nodes. Only
// the panel's HTML descendants are recreated, as they would be in the browser.
function libraryClient({response=async params=>libraryPage(params.get('section')),now=100000}={}){
 let responder=response,focused=null;
 const nodes=new Map(),requests=[],events=[],toasts=[],timers=new Map();let timerSerial=0;
 class Element extends EventTarget {
  constructor(){super();this.dataset={};this.attributes=new Map();this.style={};this.isConnected=true;this.offsetHeight=500;this.offsetLeft=0;this.offsetWidth=130;this.clientWidth=390;this.textContent='';this._html='';this.listeners=new Map();const classes=new Set();this.classList={add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),contains:name=>classes.has(name)};}
  setAttribute(key,value){this.attributes.set(key,String(value));}removeAttribute(key){this.attributes.delete(key);}
  getAttribute(key){return this.attributes.get(key)??null;}
  get innerHTML(){return this._html;}set innerHTML(value){this._html=value;this.onHTML?.(value);}
  getBoundingClientRect(){return {top:80,height:500,bottom:580};}
  focus(){focused=this;}scrollTo(options){this.lastScroll=options;}
  addEventListener(name,handler,options){this.listeners.set(name,(this.listeners.get(name)||0)+1);super.addEventListener(name,handler,options);}
  querySelector(){return null;}querySelectorAll(){return [];}
 }
 const main=new Element(),root=new Element(),strip=new Element(),panel=new Element(),status=new Element();
 for(const [key,value] of [['#main',main],['#music-library',root],['#music-library .ml-tabs',strip],['#ml-panel',panel]])nodes.set(key,value);
 status.classList.add('sr-only');
 const tabs=['likes','history','playlists'].map((section,index)=>{const tab=new Element(),count=new Element();tab.dataset.libraryTab=section;tab.offsetLeft=index*130;tab.querySelector=key=>key==='span'?count:null;nodes.set('#ml-tab-'+section,tab);return tab;});
 root.querySelector=key=>key==='.ml-tabs'?strip:key==='.ml-status'?status:null;root.querySelectorAll=key=>key==='[data-library-tab]'?tabs:[];
 strip.querySelector=()=>tabs.find(tab=>tab.getAttribute('aria-selected')==='true');
 panel.onHTML=html=>{
  for(const key of ['#ml-search','#ml-more','#ml-items','#new-playlist','#ml-retry']){if(nodes.has(key))nodes.get(key).isConnected=false;nodes.delete(key);}
  for(const id of ['ml-search','ml-more','ml-items','new-playlist','ml-retry'])if(html.includes('id="'+id+'"'))nodes.set('#'+id,new Element());
  const form=nodes.get('#ml-search');if(form){form.values=[['q',''],['sort','recent']];form.querySelectorAll=()=>[];}
 };
 const location={_hash:'#profile?view=library&section=likes',get hash(){return this._hash;},set hash(value){events.push(['hash',value]);this._hash=value;}};
 class Clock extends Date {static now(){return now;}}
 class FormValues {constructor(form){this.values=form.values;}[Symbol.iterator](){return this.values[Symbol.iterator]();}}
 const c=nicknameContext({
  me:{id:'owner'},apiRevision:0,renderId:1,myPageState:{tab:'library'},URLSearchParams,Date:Clock,structuredClone,FormData:FormValues,location,
  document:{querySelector:selector=>nodes.get(selector)||null},window:{scrollY:120,innerHeight:900},matchMedia:()=>({matches:true}),innerWidth:390,
  $:selector=>nodes.get(selector)||null,esc:value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])),number:String,icon:()=>'',cover:()=>'',
  myEmpty:text=>'<p>'+text+'</p>',mySection:(_title,html)=>html,myAll:()=>'',collectionCard:item=>'<article>'+item.id+'</article>',
  remember:tracks=>tracks,routeTracks:[],library:{likes:[]},paintInteractions(){},toast:message=>toasts.push(message),playlistDialog:async()=>{},
  rememberMyPageRouteTarget:raw=>events.push(['target',raw]),
  setTimeout:(fn,ms)=>{const id=++timerSerial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  api:async(path,_method,_body,options)=>{if(path==='/api/discovery')return {tracks:[]};const params=new URLSearchParams(path.split('?')[1]);requests.push({params,options});return responder(params);}
 });
 const menuSource=readFileSync(new URL('../dist/menu-integration.js',import.meta.url),'utf8');
 vm.runInContext(menuSource.slice(menuSource.indexOf('function menuHref('),menuSource.indexOf('function menuAlias('))+source,c);
 return {context:c,nodes,root,main,panel,strip,tabs,status,requests,events,toasts,timers,focused:()=>focused,
  fireTimeout:ms=>{for(const [id,timer] of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}},
  state:()=>vm.runInContext('musicLibraryState',c),advance:ms=>{now+=ms;},setResponse:fn=>{responder=fn;},
  async mount(){const raw=location.hash.slice(1),view=await c.musicLibraryView(raw);main.dataset.route=raw;panel.innerHTML=c.musicLibraryPanel(view.musicLibrary);c.paintMusicLibraryTabs(root,view.musicLibrary);c.bindMusicLibrary(view.musicLibrary);return view;},
  navigate(section,{force=false,readApi=c.api,visible=()=>{}}={}){const raw=section.startsWith('profile?')?section:'profile?view=library&section='+section;location.hash='#'+raw;return c.refreshMusicLibraryRoute(raw,++c.renderId,force,readApi,visible);}
 };
}

test('library result cache is bounded, isolated by account and mutation revision, and fresh only for ten seconds',async()=>{
 const h=libraryClient(),o=h.context.musicLibraryOptions('profile?view=library');
 const first=await h.context.musicLibraryRead(o);first.items.push({id:'not-cached'});
 assert.equal((await h.context.musicLibraryRead(o)).items.length,1);assert.equal(h.requests.length,1);
 h.advance(9999);await h.context.musicLibraryRead(o);assert.equal(h.requests.length,1);
 h.advance(1);await h.context.musicLibraryRead(o);assert.equal(h.requests.length,2);
 h.context.apiRevision++;await h.context.musicLibraryRead(o);assert.equal(h.requests.length,3);
 h.context.me={id:'another'};await h.context.musicLibraryRead(o);assert.equal(h.requests.length,4);
 await h.context.musicLibraryRead(o,0,h.context.api,{fresh:true});assert.equal(h.requests.length,5);
 for(let i=0;i<40;i++)await h.context.musicLibraryRead({...o,q:String(i)});
 assert.equal(vm.runInContext('musicLibraryReads.size',h.context),36);
});

test('failed, aborted and superseded account reads never populate the library cache',async()=>{
 for(const change of ['failure','abort','account','revision','route']){
  const h=libraryClient(),pending=deferred();h.setResponse(()=>pending.promise);
  const read=h.context.api;read.signal={aborted:false};const o=h.context.musicLibraryOptions('profile?view=library'),work=h.context.musicLibraryRead(o,0,read);
  if(change==='abort')read.signal.aborted=true;else if(change==='account')h.context.me={id:'other'};else if(change==='revision')h.context.apiRevision++;else if(change==='route')read.current=()=>false;
  if(change==='failure')pending.reject(Error('offline'));else pending.resolve(libraryPage());
  await assert.rejects(work);assert.equal(vm.runInContext('musicLibraryReads.size',h.context),0,change);
 }
});

test('nested category loading and browser-style revisits keep the root, category buttons and panel mounted',async()=>{
 const h=libraryClient();await h.mount();await h.context.musicLibraryView('profile?view=library&section=likes');assert.equal(h.requests.length,1,'an upper-tab return reuses the completed private read');const originalTabs=[...h.tabs],pending=deferred();h.setResponse(()=>pending.promise);
 let visible=0;const work=h.navigate('history',{visible:()=>{visible++;}});
 assert.equal(visible,1);assert.equal(h.main.dataset.route,'profile?view=library&section=history');assert.match(h.panel.innerHTML,/불러오는 중/);
 assert.equal(h.tabs[1].getAttribute('aria-selected'),'true');assert.equal(h.panel.getAttribute('aria-busy'),'true');assert.equal(h.panel.style.minHeight,'820px');
 pending.resolve(libraryPage('history'));await work;
 assert.equal(h.nodes.get('#music-library'),h.root);assert.equal(h.nodes.get('#ml-panel'),h.panel);assert.deepEqual(h.tabs,originalTabs);assert.match(h.panel.innerHTML,/history first/);assert.equal(h.panel.getAttribute('aria-busy'),null);
 const reads=h.requests.length;await h.navigate('likes');await h.navigate('history');
 assert.equal(h.requests.length,reads);assert.equal(h.panel.listeners.get('touchend'),1);assert.equal(h.tabs[1].getAttribute('aria-selected'),'true');assert.equal(h.status.classList.contains('sr-only'),true);
});

test('a slower category and late pagination cannot overwrite the newer library selection',async()=>{
 const h=libraryClient({response:async()=>libraryPage('likes','first',12)});await h.mount();const more=deferred(),history=deferred(),playlists=deferred();
 h.setResponse(params=>params.get('offset')==='12'?more.promise:params.get('section')==='history'?history.promise:playlists.promise);
 const olderPage=h.nodes.get('#ml-more').onclick(),olderTab=h.navigate('history'),latestTab=h.navigate('playlists');
 playlists.resolve(libraryPage('playlists'));await latestTab;history.resolve(libraryPage('history','late'));await olderTab;more.resolve(libraryPage('likes','late'));await olderPage;
 assert.equal(h.state().options.section,'playlists');assert.deepEqual(Array.from(h.state().data.items,item=>item.id),['playlists-first']);assert.match(h.panel.innerHTML,/playlists-first/);assert.doesNotMatch(h.panel.innerHTML,/late/);
});

test('library errors stay in the content panel and retry does not remount navigation or cache the failure',async()=>{
 const h=libraryClient();await h.mount();h.setResponse(async()=>{throw Error('로컬 연결 오류');});await h.navigate('history');
 assert.match(h.panel.innerHTML,/role="alert"/);assert.match(h.panel.innerHTML,/로컬 연결 오류/);assert.equal(h.panel.getAttribute('aria-busy'),null);assert.equal(h.tabs[1].getAttribute('aria-selected'),'true');
 assert.equal(h.context.cachedMusicLibraryRead(h.context.musicLibraryOptions('profile?view=library&section=history')),null);
 h.setResponse(async params=>libraryPage(params.get('section')));await h.nodes.get('#ml-retry').onclick();
 assert.match(h.panel.innerHTML,/history first/);assert.equal(h.nodes.get('#ml-panel'),h.panel);assert.equal(h.panel.listeners.get('touchend'),1);
});

test('keyboard category and search navigation register the target before changing the hash',async()=>{
 const h=libraryClient();await h.mount();h.events.length=0;
 h.strip.onkeydown({key:'ArrowRight',preventDefault(){}});
 assert.equal(h.events[0][0],'target');assert.deepEqual(h.events[1],['hash','#'+h.events[0][1]]);
 await h.navigate(h.events[0][1]);assert.equal(h.focused(),h.tabs[1]);
 h.events.length=0;const form=h.nodes.get('#ml-search');form.values=[['q','노래 검색'],['sort','title']];form.onsubmit({preventDefault(){}});
 assert.equal(h.events[0][0],'target');assert.deepEqual(h.events[1],['hash','#'+h.events[0][1]]);assert.equal(new URLSearchParams(h.events[0][1].split('?')[1]).get('q'),'노래 검색');
});

test('mutation during a library read rechecks once; an authentication failure stays local without retrying forever',async()=>{
 const h=libraryClient();await h.mount();const pending=deferred();let calls=0;
 h.setResponse(params=>++calls===1?pending.promise:Promise.resolve(libraryPage(params.get('section'),'current')));
 const work=h.navigate('history');h.context.apiRevision++;pending.resolve(libraryPage('history','outdated'));await work;
 assert.equal(calls,2);assert.match(h.panel.innerHTML,/history current/);assert.doesNotMatch(h.panel.innerHTML,/outdated/);
 calls=0;h.setResponse(async()=>{calls++;h.context.apiRevision++;throw Object.assign(Error('다시 로그인해주세요.'),{status:401});});await h.navigate('playlists');
 assert.equal(calls,1);assert.match(h.panel.innerHTML,/다시 로그인해주세요/);assert.equal(h.panel.getAttribute('aria-busy'),null);
});

test('a completed like action cannot refresh a different upper tab after navigation',async()=>{
 const h=libraryClient();await h.mount();const pending=deferred();h.context.toggleLike=()=>pending.promise;
 const like={dataset:{like:'likes-first'}},event={target:{closest:selector=>selector==='[data-like]'?like:null},stopPropagation(){}};
 const work=h.root.onclick(event),reads=h.requests.length;h.context.location.hash='#profile?view=works';h.context.myPageState.tab='works';h.context.apiRevision++;
 pending.resolve();await work;assert.equal(h.requests.length,reads);assert.equal(h.context.location.hash,'#profile?view=works');
});

test('a stalled library read times out locally and its late response cannot overwrite a retry or the read cache',async()=>{
 const h=libraryClient();await h.mount();const pending=deferred();h.setResponse(()=>pending.promise);
 const work=h.navigate('history');assert.equal(h.timers.size,1);h.fireTimeout(20000);assert.equal(await work,true);
 assert.match(h.panel.innerHTML,/role="alert"/);assert.match(h.panel.innerHTML,/연결이 지연/);assert.ok(h.nodes.get('#ml-retry'));assert.equal(h.panel.getAttribute('aria-busy'),null);assert.equal(h.state().pending,false);assert.equal(h.tabs[1].getAttribute('aria-selected'),'true');assert.equal(h.timers.size,0);
 h.setResponse(async()=>libraryPage('history','retried'));await h.nodes.get('#ml-retry').onclick();pending.resolve(libraryPage('history','too-late'));for(let i=0;i<6;i++)await Promise.resolve();
 assert.match(h.panel.innerHTML,/history retried/);assert.doesNotMatch(h.panel.innerHTML,/too-late/);assert.equal(h.nodes.get('#ml-panel'),h.panel);assert.equal(h.timers.size,0);
 assert.equal(h.context.cachedMusicLibraryRead(h.context.musicLibraryOptions('profile?view=library&section=history')).items[0].id,'history-retried');
});
