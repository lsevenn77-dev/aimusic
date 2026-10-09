import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
const track=title=>({id:title,title,genre:'Rock',duration:30});

function client(fetch){
 let now=1_790_000_000_000;
 class Clock extends Date {static now(){return now;}}
 const context=vm.createContext({fetch,structuredClone,URL,URLSearchParams,Map,Date:Clock,console,AifectGenres:{GENRES:[]},window:{},Audio:class{},sessionStorage:{getItem:()=>null},document:{querySelectorAll:()=>[]}});
 vm.runInContext(source('app.js'),context);
 vm.runInContext("toast=()=>{};me={id:'owner'};",context);
 return {context,run:code=>vm.runInContext(code,context),advance:ms=>{now+=ms;}};
}

function renderer(fetch){
 const c=client(fetch),writes=[],scrolls=[],listeners=new Map();
 const dispatch=event=>{for(const listener of listeners.get(event.type)||[])listener(event);};
 const document={activeElement:null,addEventListener(type,listener){const list=listeners.get(type)||[];listeners.set(type,[...list,listener]);},removeEventListener(type,listener){listeners.set(type,(listeners.get(type)||[]).filter(item=>item!==listener));},querySelector:selector=>selector==='#main'?main:selector==='#reload-page'?retry:null,querySelectorAll:()=>[]};
 const retry={onclick:null};
 const main={dataset:{},fields:[],attributes:new Map(),classList:{add(){},remove(){}},addEventListener:document.addEventListener,removeEventListener:document.removeEventListener,
  setAttribute(name,value){this.attributes.set(name,value);},getAttribute(name){return this.attributes.get(name);},removeAttribute(name){this.attributes.delete(name);},contains(node){return node===this||this.fields.includes(node);},
  querySelectorAll(selector){return /input|textarea|select/.test(selector)?this.fields:[];},querySelector(selector){return this.querySelectorAll(selector)[0]||null;},matches(selector){return selector===':focus-within'&&this.contains(document.activeElement);},focus(){document.activeElement=this;},scrollTop:0,
  get innerHTML(){return this.html||'';},set innerHTML(html){this.html=html;writes.push(html);this.fields=[];for(const match of html.matchAll(/<input\b[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/g)){const input={tagName:'INPUT',nodeName:'INPUT',name:match[1],value:match[2],type:'text',checked:false,isContentEditable:false,dataset:{},focus(){document.activeElement=this;},matches:selector=>/input|textarea|select|contenteditable/i.test(selector),closest:()=>main,dispatchEvent:event=>{event.target=input;dispatch(event);return true;}};this.fields.push(input);}}
 };
 const window={scrollX:0,scrollY:0,addEventListener:document.addEventListener,removeEventListener:document.removeEventListener,scrollTo(options,y){const top=typeof options==='number'?y:options.top;this.scrollY=top||0;scrolls.push(top||0);},dispatchEvent:dispatch};
 Object.assign(c.context,{document,window,location:{hash:'#history'},clearInterval(){},setTimeout,clearTimeout,requestAnimationFrame:callback=>callback(),sing:null,socialTimer:null,socialCleanup:null,icon:()=>'',setMobileMenu(){},cleanupLyricsEditor(){},cleanupSing(){},updateBrowseNavigation(){},improvementsView:async()=>null,browseView:async()=>null,explorerView:async()=>null,bindForms(){},bindGiftClaims(){},bindExplorer(){},bindBrowse(){},bindImprovements(){},listenNav:()=>'',libraryProfileHTML:async()=>''});
 c.run("list=tracks=>tracks.map(track=>'<article>'+esc(track.title)+'</article>').join('');");
 vm.runInContext(source('views.js'),c.context);
 return {...c,main,document,window,writes,scrolls,navigate(route){c.context.location.hash='#'+route;return c.run('render()');},input(value){const field=main.fields[0];assert.ok(field,'the route must contain an editable control');field.focus();field.value=value;field.dispatchEvent({type:'input'});return field;},scroll(top){window.scrollY=top;window.dispatchEvent({type:'scroll'});}};
}

function homeRenderer(fetch){
 const c=renderer(fetch),sections=new Map(),oldHTML=Object.getOwnPropertyDescriptor(c.main,'innerHTML'),select=c.document.querySelector;
 Object.defineProperty(c.main,'innerHTML',{get:oldHTML.get,set(html){
  oldHTML.set.call(c.main,html);for(const node of sections.values())node.isConnected=false;sections.clear();
  for(const match of html.matchAll(/id="(home-[^"]+)"/g)){const node={innerHTML:'HOME_LOADING',hidden:false,isConnected:true,attributes:new Map(),setAttribute(name,value){this.attributes.set(name,value);},removeAttribute(name){this.attributes.delete(name);},querySelector:()=>({onclick:null})};sections.set(match[1],node);}
 }});
 c.document.querySelector=selector=>sections.get(selector.slice(1))||select(selector);
 Object.assign(c.context,{homeBrowseObserver:null,musicListeningShortcuts:()=>'',playlistSaveButton:()=>'',musicTrackCard:t=>'<article>'+t.title+'</article>',collectionGrid:items=>items.map(item=>item.name).join(','),playlistArt:()=>''});
 vm.runInContext(source('home.js'),c.context);
 c.run("icons=()=>{};updateAccount=()=>{};setMembership=()=>{};refreshLibrary=async()=>{};");
 const boot=source('actions.js').match(/async function boot\(\)\{[\s\S]*?\n\}\n/);
 assert.ok(boot,'the startup function must remain independently testable');vm.runInContext(boot[0],c.context);
 return {...c,section:id=>sections.get(id)};
}

test('readonly history, followers and public detail reads expose isolated cache snapshots',async()=>{
 const calls=[];
 const c=client(async path=>{calls.push(path);return response({path,items:[{name:'original'}]});});
 for(const path of ['/api/history','/api/me/profile','/api/followers/listener','/api/producers/singer','/api/artists/voice','/api/duets']){
  await c.run(`api(${JSON.stringify(path)})`);
  const peek=c.run(`peekApiRead(${JSON.stringify(path)})`);
  assert.equal(peek.path,path);
  peek.items[0].name='modified outside the cache';
  assert.equal(c.run(`peekApiRead(${JSON.stringify(path)}).items[0].name`),'original');
  const before=calls.length;await c.run(`api(${JSON.stringify(path)})`);assert.equal(calls.length,before,path+' should reuse its completed read');
 }
 assert.equal(c.run("peekApiRead('/api/history?limit=20')"),null,'query-specific reads must not reuse another query');
 c.run("me={id:'other'};");assert.equal(c.run("peekApiRead('/api/history')"),null);
 await c.run("api('/api/history')");assert.equal(calls.filter(path=>path==='/api/history').length,2);
 c.run('me=null;');assert.equal(c.run("peekApiRead('/api/history')"),null);
});

test('chat delivery and read receipts preserve browse caches, while account and crew changes invalidate them',async()=>{
 const c=client(async()=>response({tracks:[track('Saved community')]}));
 await c.run("api('/api/community')");const revision=c.run('apiRevision');
 for(const [path,method] of [['/api/dm/peer','POST'],['/api/dm/peer','PATCH'],['/api/crews/crew/messages','POST']]){
  await c.run(`api(${JSON.stringify(path)},${JSON.stringify(method)},{body:'message'})`);
  assert.equal(c.run('apiRevision'),revision);assert.equal(c.run("peekApiRead('/api/community',{display:true}).tracks[0].title"),'Saved community');
 }
 for(const [path,method] of [['/api/auth/logout','POST'],['/api/crews/crew/leave','POST'],['/api/crews/crew/members/peer','PATCH'],['/api/dm/peer','DELETE']]){
  await c.run("api('/api/community')");await c.run(`api(${JSON.stringify(path)},${JSON.stringify(method)})`);
  assert.equal(c.run("peekApiRead('/api/community',{display:true})"),null,path);
 }
});

test('a mutation finishing during navigation retries the current route instead of leaving it loading',{timeout:3000},async()=>{
 const write=deferred(),read=deferred(),started=deferred();let reads=0;
 const c=renderer(async(path,options)=>{if(options.method!=='GET')return write.promise;if(path==='/api/history'){if(++reads===1){started.resolve();return read.promise;}return response({tracks:[track('Current history')]});}return response({tracks:[]});});
 const saving=c.run("api('/api/me/profile','PUT',{name:'changed'})"),opening=c.navigate('history');
 await started.promise;write.resolve(response({ok:true}));await saving;
 read.resolve(response({tracks:[track('Superseded history')]}));await opening;
 assert.equal(reads,2);assert.match(c.main.innerHTML,/Current history/);assert.doesNotMatch(c.main.innerHTML,/Superseded history|불러오는 중/);assert.equal(c.main.getAttribute('aria-busy'),undefined);
});

test('community tabs paint before account initialization and cached API feeds warm first visits',{timeout:3000},async()=>{
 const held=deferred();const c=renderer(async()=>held.promise);
 Object.assign(c.context,{coverCollectionHTML:tracks=>tracks.map(t=>t.title).join(','),communityFeed:tracks=>tracks.map(t=>t.title).join(','),musicIsOpenDuet:()=>false});
 vm.runInContext(source('community.js'),c.context);c.run('browseView=(base,param,raw)=>base===\'community\'?communityView(base,param,raw):null;');
 const account=deferred();c.context.accountReady=account.promise;
 const opening=c.navigate('community');assert.match(c.main.innerHTML,/music-community-tabs/);assert.match(c.main.innerHTML,/#community\/crews/);
 account.resolve();held.resolve(response({tracks:[track('Fresh community')]}));await opening;
 assert.match(c.main.innerHTML,/Fresh community/);
 // No HTML snapshot for this route: reuse only its safely scoped API data.
 c.run('navigationSnapshots.clear();');c.context.location.hash='#history';c.advance(10001);
 let release;c.context.fetch=async()=>new Promise(resolve=>release=resolve);
 const reopening=c.navigate('community');assert.match(c.main.innerHTML,/Fresh community/);await Promise.resolve();await Promise.resolve();
 for(let n=0;n<10&&!release;n++)await Promise.resolve();assert.ok(release);
 release(response({tracks:[track('Updated community')]}));await reopening;assert.match(c.main.innerHTML,/Updated community/);
});

test('money, membership, permissions, recording, editors and private chat never expose completed navigation caches',async()=>{
 let calls=0;const c=client(async()=>response({value:++calls}));
 for(const path of ['/api/gold','/api/gifts/free/claim','/api/membership','/api/studio','/api/studio/earnings','/api/studio/tracks/song','/api/auth/google/nonce','/api/me?state=1','/api/account/nickname','/api/tracks/song','/api/playlists/mix','/api/karaoke/song','/api/duets/cover','/api/dm','/api/dm/singer','/api/chat/events','/api/crews/crew','/api/crews/crew/messages']){
  const before=calls;await c.run(`api(${JSON.stringify(path)})`);
  assert.equal(c.run(`peekApiRead(${JSON.stringify(path)})`),null,path+' must stay live');
  await c.run(`api(${JSON.stringify(path)})`);assert.equal(calls,before+2,path+' must refetch');
 }
});

test('pending and failed reads cannot be presented as cached content',async()=>{
 const held=deferred();const c=client(async()=>{await held.promise;return response({error:'offline'},503);});
 const loading=c.run("api('/api/history')");assert.equal(c.run("peekApiRead('/api/history')"),null);
 held.resolve();await assert.rejects(loading,/offline/);assert.equal(c.run("peekApiRead('/api/history')"),null);
});

test('writes invalidate completed and pending snapshots without resurrecting a late response',async()=>{
 let reads=0;const held=deferred();
 const c=client(async(path,options)=>{if(options.method==='GET'){if(++reads===2)await held.promise;return response({read:reads});}return response({ok:true});});
 await c.run("api('/api/history')");assert.equal(c.run("peekApiRead('/api/history').read"),1);
 const pending=c.run("api('/api/followers/listener')");
 await c.run("api('/api/producers/singer/follow','PUT')");
 assert.equal(c.run("peekApiRead('/api/history')"),null);
 held.resolve();await pending;assert.equal(c.run("peekApiRead('/api/followers/listener')"),null);
 await c.run("api('/api/history')");assert.equal(reads,3);
});

test('cached navigation reads remain bounded and expire before an hour-old response can be shown',async()=>{
 const c=client(async path=>response({path}));
 for(let i=0;i<100;i++)await c.run(`api('/api/history?offset=${i}')`);
 assert.equal(c.run("peekApiRead('/api/history?offset=0')"),null,'old entries must be evicted');
 assert.equal(c.run("peekApiRead('/api/history?offset=99').path"),'/api/history?offset=99');
 c.advance(60*60*1000);assert.equal(c.run("peekApiRead('/api/history?offset=99')"),null,'expired data cannot become a visible snapshot');
});

test('API snapshots stop being visible at the ten-second freshness boundary',async()=>{
 let calls=0;const c=client(async()=>response({value:++calls}));
 await c.run("api('/api/history')");c.advance(9999);assert.equal(c.run("peekApiRead('/api/history').value"),1);
 c.advance(1);assert.equal(c.run("peekApiRead('/api/history')"),null);
 await c.run("api('/api/history')");assert.equal(calls,2);
});

test('display-only read snapshots last sixty seconds without extending network freshness',async()=>{
 let calls=0;const c=client(async()=>response({value:++calls,items:[{title:'Saved'}]}));
 await c.run("api('/api/catalog?section=tracks')");c.advance(10000);
 assert.equal(c.run("peekApiRead('/api/catalog?section=tracks')"),null);
 const displayed=c.run("peekApiRead('/api/catalog?section=tracks',{display:true})");assert.equal(displayed.value,1);
 displayed.items[0].title='Changed outside';assert.equal(c.run("peekApiRead('/api/catalog?section=tracks',{display:true}).items[0].title"),'Saved');
 c.run("me={id:'other'};");assert.equal(c.run("peekApiRead('/api/catalog?section=tracks',{display:true})"),null);
 c.run("me={id:'owner'};");c.advance(50000);assert.equal(c.run("peekApiRead('/api/catalog?section=tracks',{display:true})"),null);
 await c.run("api('/api/catalog?section=tracks')");assert.equal(calls,2,'the sixty-second display window must never make an expired GET reusable');
 await c.run("api('/api/tracks/song/like','PUT')");assert.equal(c.run("peekApiRead('/api/catalog?section=tracks',{display:true})"),null);
});

for(const status of [401,403])test('HTTP '+status+' invalidates cached API data and removes a restored private page',{timeout:3000},async()=>{
 let historyCalls=0;const held=deferred(),started=deferred();
 const c=renderer(async path=>{if(path==='/api/history'){if(++historyCalls===2){started.resolve();return held.promise;}return response({tracks:[track('Private cached history')]});}return response({tracks:[track('Public browse')]});});
 await c.navigate('history');await c.navigate('search/away');c.advance(10001);
 const reopening=c.navigate('history');assert.match(c.main.innerHTML,/Private cached history/);
 try{
  await started.promise;held.resolve(response({error:'Permission denied'},status));await reopening;
  assert.doesNotMatch(c.main.innerHTML,/Private cached history/,'a permission failure must hide personal content already restored from cache');
  assert.equal(c.run("peekApiRead('/api/catalog?q=away&section=tracks',{display:true})"),null);
  assert.equal(c.run("navigationSnapshots.has('owner:history')"),false,'unauthorized HTML cannot be restored on another visit');
 }finally{held.resolve(response({tracks:[]}));await reopening;}
});

test('only browse routes can restore whole-page snapshots',()=>{
 const c=renderer(async()=>response({tracks:[]}));
 for(const route of ['charts?period=month','discover/genres?g=Rock','search/hello','collections?sort=recent','artists','producers','artist/voice','following','history','library/likes','library/playlists','library/artists','library/producers','library/following','library/followers','community','community/covers','community/latest','community/duets','community/following'])assert.equal(c.run(`canCacheRoute(${JSON.stringify(route)})`),true,route);
 for(const route of ['gold','gifts','membership','account','profile','profile/edit','producer/singer','playlist/mix','song/song','karaoke','sing/song','studio','manage/song','upload','admin','payouts','rewards','library/covers','library/originals','dm','dm/singer','crew/crew','community/crews','community/rankings'])assert.equal(c.run(`canCacheRoute(${JSON.stringify(route)})`),false,route);
});

test('an exact cached route paints synchronously and then updates without resetting scroll',{timeout:3000},async()=>{
 const held=deferred(),started=deferred();let historyCalls=0;
 const c=renderer(async path=>{if(path==='/api/history'){if(++historyCalls===2){started.resolve();return held.promise;}return response({tracks:[track('Cached history')]});}return response({tracks:[track('Other route')]});});
 await c.navigate('history');const cached=c.main.innerHTML;c.scroll(280);
 await c.navigate('search/away');c.advance(10001);
 const reopening=c.navigate('history');
 assert.equal(c.main.innerHTML,cached,'revisiting paints before render awaits the network');
 try{
  await started.promise;assert.equal(c.main.innerHTML,cached);
  assert.equal(c.window.scrollY,280,'revisiting restores the saved reading position');
  held.resolve(response({tracks:[track('Fresh history')]}));await reopening;
  assert.match(c.main.innerHTML,/Fresh history/);assert.equal(historyCalls,2);
  assert.equal(c.window.scrollY,280,'background replacement must preserve the current scroll position');
 }finally{held.resolve(response({tracks:[]}));await reopening;}
});

test('typing after a cached route opens preserves the live field while the next visit gets refreshed data',{timeout:3000},async()=>{
 const held=deferred(),started=deferred();let searchCalls=0;
 const c=renderer(async path=>{if(path.startsWith('/api/catalog?q=hello&')){if(++searchCalls===2){started.resolve();return held.promise;}return response({tracks:[track('Cached search')]});}return response({tracks:[track('Other route')]});});
 await c.navigate('search/hello');const cached=c.main.innerHTML;
 await c.navigate('history');c.advance(10001);
 const reopening=c.navigate('search/hello');assert.equal(c.main.innerHTML,cached);
 try{
  await started.promise;const field=c.input('unsent search text'),writes=c.writes.length;
  held.resolve(response({tracks:[track('Fresh search')]}));await reopening;
  assert.equal(c.main.fields[0],field,'refresh must retain the actual edited DOM node');assert.equal(field.value,'unsent search text');assert.equal(c.writes.length,writes);
  c.document.activeElement=null;await c.navigate('history');
  const revisit=c.navigate('search/hello');assert.match(c.main.innerHTML,/Fresh search/);await revisit;
 }finally{held.resolve(response({tracks:[]}));await reopening;}
});

test('scrolling after cache restore prevents background replacement and preserves the viewport',{timeout:3000},async()=>{
 const held=deferred(),started=deferred();let historyCalls=0;
 const c=renderer(async path=>{if(path==='/api/history'){if(++historyCalls===2){started.resolve();return held.promise;}return response({tracks:[track('Cached history')]});}return response({tracks:[]});});
 await c.navigate('history');await c.navigate('search/away');c.advance(10001);
 const reopening=c.navigate('history');
 try{
  await started.promise;c.scroll(420);const writes=c.writes.length,scrolls=c.scrolls.length;
  held.resolve(response({tracks:[track('Fresh history')]}));await reopening;
  assert.equal(c.window.scrollY,420);assert.equal(c.writes.length,writes);assert.equal(c.scrolls.length,scrolls);assert.match(c.main.innerHTML,/Cached history/);
  await c.navigate('search/away');const revisit=c.navigate('history');assert.match(c.main.innerHTML,/Fresh history/);await revisit;
 }finally{held.resolve(response({tracks:[]}));await reopening;}
});

test('a failed refresh keeps an already shown browse snapshot usable',{timeout:3000},async()=>{
 let historyCalls=0;const held=deferred(),started=deferred();
 const c=renderer(async path=>{if(path==='/api/history'){if(++historyCalls===2){started.resolve();return held.promise;}return response({tracks:[track('Cached history')]});}return response({tracks:[]});});
 await c.navigate('history');const cached=c.main.innerHTML;await c.navigate('search/away');c.advance(10001);
 const reopening=c.navigate('history');
 try{await started.promise;held.resolve(response({error:'offline'},503));await reopening;assert.equal(c.main.innerHTML,cached);assert.equal(c.main.getAttribute('aria-busy'),undefined);}
 finally{held.resolve(response({tracks:[]}));await reopening;}
});

test('late responses cannot overwrite another route or restore a snapshot invalidated by mutation',{timeout:3000},async()=>{
 let historyCalls=0;const held=deferred(),started=deferred();
 const c=renderer(async(path,options)=>{if(options.method!=='GET')return response({ok:true});if(path==='/api/history'){if(++historyCalls===2){started.resolve();return held.promise;}return response({tracks:[track('Cached history')]});}return response({tracks:[track('Current route')]});});
 await c.navigate('history');await c.navigate('search/away');c.advance(10001);
 const reopening=c.navigate('history');
 try{
  await started.promise;await c.navigate('search/away');const current=c.main.innerHTML;
  await c.run("api('/api/tracks/song/like','PUT')");
  held.resolve(response({tracks:[track('Late invalid history')]}));await reopening;
  assert.equal(c.main.innerHTML,current,'a late old-route response cannot replace the selected route');
  const revisit=c.navigate('history');assert.doesNotMatch(c.main.innerHTML,/Late invalid history/);assert.match(c.main.innerHTML,/route-loading/);await revisit;
 }finally{held.resolve(response({tracks:[]}));await reopening;}
});

test('account changes cannot show or commit another account\'s personal route',{timeout:3000},async()=>{
 const ownerHeld=deferred(),ownerStarted=deferred(),otherHeld=deferred(),otherStarted=deferred();let ownerReads=0;
 const c=renderer(async path=>{
  if(path!=='/api/history')return response({tracks:[]});
  if(c.run('me.id')==='other'){otherStarted.resolve();return otherHeld.promise;}
  if(++ownerReads===2){ownerStarted.resolve();return ownerHeld.promise;}
  return response({tracks:[track('Owner private history')]});
 });
 await c.navigate('history');await c.navigate('search/away');c.advance(10001);
 const ownerRefresh=c.navigate('history');let otherRender;
 try{
  await ownerStarted.promise;c.run("me={id:'other'};");otherRender=c.navigate('history');
  assert.doesNotMatch(c.main.innerHTML,/Owner private history/,'switching accounts must synchronously hide the old personal DOM');
  await otherStarted.promise;otherHeld.resolve(response({tracks:[track('Other private history')]}));await otherRender;
  ownerHeld.resolve(response({tracks:[track('Late owner private history')]}));await ownerRefresh;
  assert.match(c.main.innerHTML,/Other private history/);assert.doesNotMatch(c.main.innerHTML,/Owner private history|Late owner private history/);
 }finally{ownerHeld.resolve(response({tracks:[]}));otherHeld.resolve(response({tracks:[]}));await ownerRefresh;if(otherRender)await otherRender;}
});

test('a late permission error from the previous account cannot strand the new account\'s route',{timeout:3000},async()=>{
 const ownerHeld=deferred(),ownerStarted=deferred(),otherHeld=deferred(),otherStarted=deferred();
 const c=renderer(async()=>{if(c.run('me.id')==='owner'){ownerStarted.resolve();return ownerHeld.promise;}otherStarted.resolve();return otherHeld.promise;});
 const ownerRender=c.navigate('history');let otherRender;
 try{
  await ownerStarted.promise;c.run("me={id:'other'};");otherRender=c.navigate('history');await otherStarted.promise;
  ownerHeld.resolve(response({error:'Old account no longer has access'},403));await ownerRender;
  otherHeld.resolve(response({tracks:[track('Current account history')]}));await otherRender;
  assert.match(c.main.innerHTML,/Current account history/,'an unrelated old permission failure must not invalidate the new account render');assert.doesNotMatch(c.main.innerHTML,/route-loading/);
 }finally{ownerHeld.resolve(response({tracks:[]}));otherHeld.resolve(response({tracks:[]}));await ownerRender;if(otherRender)await otherRender;}
});

test('route snapshots evict old pages and expire after sixty seconds',async()=>{
 const c=renderer(async path=>response({tracks:[track(path)]}));
 for(let i=0;i<30;i++)await c.navigate('search/query'+i);
 assert.ok(c.run('navigationSnapshots.size')<=24,'route HTML storage must stay bounded');
 const old=c.navigate('search/query0');assert.match(c.main.innerHTML,/route-loading/,'an evicted route cannot restore old HTML');await old;
 await c.navigate('search/query29');c.advance(60001);
 const expired=c.navigate('search/query0');assert.match(c.main.innerHTML,/route-loading/,'expired HTML must not be presented as current');await expired;
});

test('home hydrates playable shelves from display snapshots while expired reads refresh',{timeout:3000},async()=>{
 const paths=new Map([
  ['/api/catalog?section=tracks&limit=12',{tracks:[track('Cached release')]}],
  ['/api/karaoke',{tracks:[track('Cached sing')]}],
  ['/api/community?kind=cover',{tracks:[track('Cached cover')]}],
  ['/api/playlists?sort=popular',{playlists:[{id:'selection',name:'Cached selection',tracks:1}]}]
 ]),held=new Map([...paths.keys()].map(path=>[path,deferred()]));let refreshing=false;
 const calls=[];const c=homeRenderer(async path=>{calls.push(path);assert.ok(paths.has(path),path);return refreshing?held.get(path).promise:response(paths.get(path));});
 for(const path of paths.keys())await c.run(`api(${JSON.stringify(path)})`);
 c.advance(10001);refreshing=true;
 const opening=c.navigate('home');
 try{
  for(const [id,title] of [['home-release','Cached release'],['home-sing','Cached sing'],['home-conversations','Cached cover'],['home-curations','Cached selection']])assert.match(c.section(id).innerHTML,new RegExp(title),'the '+id+' shelf should render synchronously from its display cache');
  assert.equal(calls.length,8,'every expired shelf must refresh despite being displayed from cache');
  held.get('/api/catalog?section=tracks&limit=12').resolve(response({error:'offline'},503));
  held.get('/api/karaoke').resolve(response({tracks:[track('Fresh sing')]}));
  held.get('/api/community?kind=cover').resolve(response({tracks:[track('Fresh cover')]}));
  held.get('/api/playlists?sort=popular').resolve(response({error:'offline'},503));
  await opening;await new Promise(resolve=>setImmediate(resolve));
  assert.match(c.section('home-release').innerHTML,/Cached release/);assert.match(c.section('home-curations').innerHTML,/Cached selection/);
  assert.match(c.section('home-sing').innerHTML,/Fresh sing/);assert.match(c.section('home-conversations').innerHTML,/Fresh cover/);
 }finally{for(const control of held.values())control.resolve(response({tracks:[],playlists:[]}));await opening;}
});

test('home startup remains playable when the account resolves before the guest catalog',{timeout:3000},async()=>{
 const account=deferred(),guestCatalog=deferred();let ownerCatalogCalls=0;
 const c=homeRenderer(async path=>{
  if(path==='/api/me?state=1')return account.promise;
  if(path==='/api/catalog?section=tracks&limit=12'){
   if(!c.run('me'))return guestCatalog.promise;
   ownerCatalogCalls++;return response({tracks:[track('Owner playable song')]});
  }
  if(path==='/api/playlists?sort=popular')return response({playlists:[]});
  return response({tracks:[]});
 });
 c.run('me=null;');c.context.location.hash='#home';const startup=c.run('boot()');
 try{
  account.resolve(response({user:{id:'owner'},interaction_state:{likes:[{id:'liked'}],follows:[]},membership:{}}));
  await new Promise(resolve=>setImmediate(resolve));
  guestCatalog.resolve(response({tracks:[track('Late guest catalog')]}));await startup;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.run('me.id'),'owner');assert.ok(ownerCatalogCalls>0,'resolving the account must restart the account-scoped home reads');
  assert.match(c.section('home-release').innerHTML,/Owner playable song/);assert.doesNotMatch(c.section('home-release').innerHTML,/Late guest catalog/);
  assert.equal(c.section('home-personal'),undefined,'private library shortcuts now belong to My, not the listening home');
  assert.match(c.main.innerHTML,/#community\/covers|home-conversations/);
 }finally{account.resolve(response({user:null}));guestCatalog.resolve(response({tracks:[]}));await startup;}
});
