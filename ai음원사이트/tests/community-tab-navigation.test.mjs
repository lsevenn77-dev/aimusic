import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const unescape=value=>value.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function helpers(extra={}){
 const context=vm.createContext({URLSearchParams,AbortController,esc:escape,me:{id:'owner'},apiRevision:0,renderId:0,...extra});
 const rankings=source('community-v3.js');
 vm.runInContext(rankings.slice(rankings.indexOf('function communityRankingOptions('),rankings.indexOf('function communityRankingImage(')),context);
 vm.runInContext(source('community.js'),context);
 return context;
}

const content=label=>({html:'<article>'+escape(label)+'</article>',tracks:[{id:label}]});

function fixture(read=async(tab,raw)=>content(tab+':'+raw),{retained=true}={}){
 let serial=0,navInstalled=retained;
 const requests=[],paints=[],events=[],lifecycle=[],writes=[],scrolls=[],timers=new Map(),cleanups=new Set(),listeners=new Map(),nav={};
 const main={
  isConnected:true,_communityView:null,dataset:{route:retained?'live':'home',account:'owner',...(retained?{communityShell:'true'}:{})},style:{minHeight:''},
  classList:{remove(){}},
  querySelector:selector=>selector.includes('.music-community-tabs')&&navInstalled?nav:null,
  set innerHTML(html){writes.push(html);navInstalled=html.includes('music-community-tabs');},
  get innerHTML(){return writes.at(-1)||'';}
 };
 const window={
  scrollX:13,scrollY:170,innerHeight:900,
  scrollTo(options){this.scrollY=options.top??this.scrollY;this.scrollX=options.left??this.scrollX;scrolls.push(options);},
  addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
  removeEventListener(type,listener){listeners.get(type)?.delete(listener);}
 };
 const cleanup=()=>{for(const release of [...cleanups])release();};
 const c=helpers({
  location:{hash:'#'+main.dataset.route},document:{querySelector:selector=>selector==='#main'?main:null},window,
  accountReady:Promise.resolve(),api:async()=>({}),socialTimer:null,socialCleanup:()=>lifecycle.push('social'),
  clearInterval(){},cleanupLyricsEditor:()=>lifecycle.push('lyrics'),cleanupSing:()=>lifecycle.push('sing'),cleanupHome:()=>lifecycle.push('home'),
  cleanupVoiceRoute:(base,param)=>lifecycle.push(['voice',base,param]),
  cleanupRouteBindings:()=>{lifecycle.push('bindings');cleanup();},updateBrowseNavigation:(base,param)=>lifecycle.push(['navigation',base,param]),
  setTimeout:(callback,delay)=>{const id=++serial;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
  registerRouteCleanup:fn=>{const release=()=>{cleanups.delete(release);fn();};cleanups.add(release);return release;},
  render:()=>events.push('rerender')
 });
 const load=(tab,raw,readApi,base,param)=>{requests.push({tab,raw,readApi,base,param});events.push('read');return read(tab,raw,readApi);};
 c.voiceView=(base,param,signal)=>load('live',c.location.hash.slice(1),{signal},base,param);
 c.improvementsView=(base,param,raw,readApi)=>load('crews',raw,readApi,base,param);
 c.communityRankingV3=(raw,readApi)=>load('rankings',raw,readApi,'community','rankings');
 // Browser QA covers real DOM replacement. Keep the production transaction,
 // lifecycle, account, deadline and stale-response checks without a synthetic DOM.
 c.paintCommunityRoute=(view,raw)=>{main._communityView=view;main.dataset.route=raw;paints.push({view,raw});events.push(view.pending?'pending':view.error?'error':'paint');return main;};
 const navigate=(raw,visible=()=>{})=>{
  c.location.hash='#'+raw;const ticket=++c.renderId;
  const readApi=(...args)=>c.api(...args);readApi.signal=new AbortController().signal;readApi.ticket=ticket;
  return c.refreshCommunityRoute(raw,ticket,readApi,visible);
 };
 const fire=delay=>{let count=0;for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.callback();count++;}return count;};
 return {context:c,main,nav,window,requests,paints,events,lifecycle,writes,scrolls,timers,listeners,navigate,cleanup,fire};
}

test('community tabs recognize existing list aliases and leave rooms, crew details and Play routes alone',()=>{
 const c=helpers();
 const cases=[
  ['live','live','live'],['#voice?mode=talk','live','voice'],['#/community','live','community'],
  ['community/voice?mode=all','live','community','voice'],['live?mode=karaoke','live','live'],
  ['crew','crews','crew'],['crew?q=music','crews','crew'],
  ['community/crews?browse=1&q=%ED%81%AC%EB%A3%A8','crews','community','crews'],
  ['community/rankings','rankings','community','rankings'],
  ['community/rankings?category=work&period=week&workKind=duet','rankings','community','rankings']
 ];
 for(const [raw,tab,base,param] of cases){
  const selected=c.communityTabSelection(raw);
  assert.ok(selected,raw);assert.equal(selected.tab,tab,raw);assert.equal(selected.base,base,raw);assert.equal(selected.param,param,raw);
  assert.equal(selected.raw,raw.replace(/^#\/?/,''),raw);
 }
 for(const raw of ['',null,'home','community/live','live/room','voice/room?mode=talk','crew/id','crew/id?tab=chat','crew-jump/id','dm/crew/id','community/rankings/nested','community/crews/nested','community/originals','community/covers','community/latest','community/duets?open=1','community/following?people=followers','karaoke']){
  assert.equal(c.communityTabSelection(raw),null,String(raw));
 }
});

test('community fragment markers cover stable navigation, ranking categories and arbitrary direct queries',()=>{
 const c=helpers(),direct='community/crews?browse=1&q=rock%20%26%20pop';
 const html=c.communityRouteTargetsHTML(direct);
 const targets=[...html.matchAll(/data-community-route-target id="([^"]+)"/g)].map(match=>unescape(match[1]));
 assert.equal(new Set(targets).size,targets.length,'fragment IDs remain unique');
 assert.ok(targets.includes(decodeURIComponent(direct)),'fragment IDs match the browser-decoded query');
 for(const [,href] of c.communityNavigation('live').matchAll(/href="(#[^"]+)"/g))assert.ok(targets.includes(unescape(href).slice(1)),href);
 for(const raw of ['live','voice','community','community/voice','crew','community/crews','community/crews?browse=1'])assert.ok(targets.includes(raw),raw);
 for(const route of ['live','voice','community','community/voice'])for(const mode of ['all','karaoke','talk'])assert.ok(targets.includes(route+'?mode='+mode),route+' mode '+mode);
 for(const category of ['aiArtist','crew','cover','dubbing'])for(const workKind of category==='cover'?['all','solo','duet']:['solo']){
  const href=c.communityRankingHref({category,period:'week',workKind});
  assert.ok(targets.includes(href.slice(1)),href+' needs a target before hashchange');
 }
});

test('retention requires a mounted community shell belonging to the same account',()=>{
 const f=fixture(),c=f.context;
 for(const raw of ['live','community/voice','crew','community/crews?browse=1','community/rankings?category=crew&period=week'])assert.equal(c.canRefreshCommunityRoute(raw),true,raw);
 assert.equal(c.canRefreshCommunityRoute('live/room'),false);
 f.main.dataset.route='home';assert.equal(c.canRefreshCommunityRoute('crew'),false);
 f.main.dataset.route='live';f.main.dataset.account='another';assert.equal(c.canRefreshCommunityRoute('crew'),false);
 f.main.dataset.account='owner';delete f.main.dataset.communityShell;assert.equal(c.canRefreshCommunityRoute('crew'),false);
});

test('retained tabs show local loading before any await and preserve the existing shell and scroll',async()=>{
 const held=deferred(),f=fixture(()=>held.promise);
 const opening=f.navigate('community/rankings',()=>f.events.push('visible'));
 assert.deepEqual(f.events,['pending','visible']);assert.equal(f.main._communityView.pending,true);
 assert.match(f.main._communityView.html,/data-community-content[^>]*aria-busy="true"/);
 assert.equal(f.main.dataset.route,'community/rankings');assert.equal(f.writes.length,0);assert.equal(f.scrolls.length,0);
 await flush();assert.deepEqual(f.events,['pending','visible','read']);
 held.resolve(content('RANKINGS'));assert.equal(await opening,true);
 assert.equal(f.main._communityView.tracks[0].id,'RANKINGS');assert.equal(f.timers.size,0);
 assert.equal(f.main.querySelector('.music-community-tabs'),f.nav);assert.equal(f.window.scrollY,170);
 assert.ok(f.lifecycle.includes('bindings'));assert.equal(f.listeners.get('scroll').size,1);
});

test('initial community entry creates its shell before waiting for data',async()=>{
 const held=deferred(),f=fixture(()=>held.promise,{retained:false});
 const opening=f.navigate('crew',()=>f.events.push('visible'));
 assert.deepEqual(f.events,['pending','visible']);assert.equal(f.writes.length,1);
 assert.match(f.main.innerHTML,/data-community-title/);assert.match(f.main.innerHTML,/data-community-route-targets/);assert.match(f.main.innerHTML,/music-community-tabs/);
 assert.equal(f.main.dataset.communityShell,'true');assert.equal(f.main.dataset.account,'owner');assert.equal(f.window.scrollY,0);
 await flush();held.resolve(content('CREW'));await opening;assert.equal(f.main._communityView.tracks[0].id,'CREW');assert.equal(f.writes.length,1);
});

test('non-community destinations keep their existing room, editor and detail lifecycle',async()=>{
 const f=fixture();
 for(const raw of ['live/room','voice/room','crew/id?tab=members','karaoke','dm/crew/id'])assert.equal(await f.navigate(raw),false,raw);
 assert.equal(f.paints.length,0);assert.equal(f.requests.length,0);assert.equal(f.lifecycle.length,0);assert.equal(f.timers.size,0);
});

test('rapid tab round trips ignore an old response and supply the current read function to every load',async()=>{
 const old=deferred();let ranks=0;
 const f=fixture((tab,raw)=>tab==='rankings'&&++ranks===1?old.promise:content(tab==='rankings'?'CURRENT RANKINGS':'CURRENT CREW'));
 const obsolete=f.navigate('community/rankings');await flush();
 await f.navigate('crew');await f.navigate('community/rankings');
 assert.equal(f.main._communityView.tracks[0].id,'CURRENT RANKINGS');
 assert.notEqual(f.requests[0].readApi,f.requests[2].readApi);assert.equal(f.requests[2].readApi.ticket,f.context.renderId);
 const painted=f.paints.length;old.resolve(content('OBSOLETE RANKINGS'));await obsolete;
 assert.equal(f.paints.length,painted);assert.equal(f.main._communityView.tracks[0].id,'CURRENT RANKINGS');assert.equal(f.timers.size,0);
 assert.equal(f.listeners.get('scroll').size,1,'only the current content keeps a scroll listener');
});

test('late failures cannot replace a superseded, detached or different-account tab',async()=>{
 for(const change of ['route','detach','account','view']){
  const held=deferred(),f=fixture(tab=>tab==='rankings'?held.promise:content('ACTIVE'));
  const opening=f.navigate('community/rankings');await flush();
  if(change==='route')await f.navigate('crew');
  else if(change==='detach')f.main.isConnected=false;
  else if(change==='account')f.context.me={id:'another'};
  else f.main._communityView=content('REPLACEMENT');
  const painted=f.paints.length;held.reject(Error('OBSOLETE ERROR'));await opening;
  assert.equal(f.paints.length,painted,change);assert.equal(f.timers.size,0,change);
 }
});

test('errors stay in the content region and expose an escaped retry message',async()=>{
 const f=fixture(async()=>{throw Error('<offline>');});
 assert.equal(await f.navigate('crew',()=>f.events.push('visible')),true);
 assert.deepEqual(f.events,['pending','visible','read','error']);assert.equal(f.main._communityView.error,'<offline>');
 assert.match(f.main._communityView.html,/role="alert"/);assert.match(f.main._communityView.html,/&lt;offline&gt;/);assert.match(f.main._communityView.html,/data-community-retry/);
 assert.equal(f.writes.length,0);assert.equal(f.scrolls.length,0);assert.equal(f.timers.size,0);
});

test('startup waits for account readiness before deciding which crew or live data to load',async()=>{
 for(const raw of ['crew','live','community/rankings']){
  const account=deferred(),f=fixture();f.context.accountReady=account.promise;f.context.me=null;f.main.dataset.account='guest';
  const opening=f.navigate(raw,()=>f.events.push('visible'));
  assert.deepEqual(f.events,['pending','visible']);await flush();assert.equal(f.requests.length,0,raw);
  f.context.me={id:'owner'};f.context.apiRevision++;account.resolve();await opening;
  assert.deepEqual(f.events,['pending','visible','rerender'],raw);assert.equal(f.requests.length,0);assert.equal(f.timers.size,0);
 }
});

test('same-account returns still await startup and recheck the API revision before loading',async()=>{
 for(const changed of [false,true]){
  const account=deferred(),f=fixture();f.context.accountReady=account.promise;
  const opening=f.navigate('community/rankings',()=>f.events.push('visible'));await flush();
  assert.deepEqual(f.events,['pending','visible']);assert.equal(f.requests.length,0);
  if(changed)f.context.apiRevision++;
  account.resolve();await opening;
  assert.deepEqual(f.events,changed?['pending','visible','rerender']:['pending','visible','read','paint']);assert.equal(f.timers.size,0);
 }
});

test('startup work superseded by another tab or a detached main never begins its read',async()=>{
 for(const change of ['route','detach']){
  const account=deferred(),f=fixture();f.context.accountReady=account.promise;
  const obsolete=f.navigate('community/rankings');let active;
  if(change==='route')active=f.navigate('crew');else f.main.isConnected=false;
  account.resolve();await obsolete;if(active)await active;
  assert.equal(f.requests.length,change==='route'?1:0,change);
  if(change==='route')assert.equal(f.requests[0].tab,'crews');
  assert.equal(f.events.includes('rerender'),false);assert.equal(f.timers.size,0);
 }
});

test('a changed data revision retries instead of painting an obsolete response or failure',async()=>{
 for(const outcome of ['success','error']){
  const held=deferred(),f=fixture(()=>held.promise);
  const opening=f.navigate('crew');await flush();f.context.apiRevision++;
  if(outcome==='success')held.resolve(content('STALE MEMBERSHIP'));else held.reject(Error('STALE FAILURE'));
  await opening;assert.deepEqual(f.events,['pending','read','rerender'],outcome);
  assert.equal(f.main._communityView.pending,true);assert.equal(f.timers.size,0);
 }
});

test('an authorization failure remains local when the API invalidates its revision',async()=>{
 for(const status of [401,403]){
  const held=deferred(),f=fixture(()=>held.promise);const opening=f.navigate('crew');await flush();f.context.apiRevision++;
  held.reject(Object.assign(Error('가입 상태를 확인해주세요.'),{status}));await opening;
  assert.deepEqual(f.events,['pending','read','error']);assert.equal(f.main._communityView.error,'가입 상태를 확인해주세요.');assert.equal(f.timers.size,0);
 }
});

test('a local timeout shows retry UI and late startup or data cannot replace it',async()=>{
 for(const phase of ['startup','request']){
  const held=deferred(),f=fixture(()=>held.promise);
  if(phase==='startup')f.context.accountReady=held.promise;
  const opening=f.navigate('crew',()=>f.events.push('visible'));await flush();
  assert.equal(f.fire(20000),1,phase);assert.ok(f.main._communityView.error);assert.match(f.main._communityView.html,/data-community-retry/);
  const painted=f.paints.length;held.resolve(content('TOO LATE'));await opening;
  assert.equal(f.paints.length,painted,phase);assert.equal(f.requests.length,phase==='startup'?0:1);assert.equal(f.timers.size,0);
 }
});

test('leaving the community cancels its deadline and listener before a late request settles',async()=>{
 const held=deferred(),f=fixture(()=>held.promise);const opening=f.navigate('crew');await flush();
 f.main.style.minHeight='900px';f.context.location.hash='#home';f.context.renderId++;f.cleanup();
 assert.equal(f.timers.size,0);assert.equal(f.listeners.get('scroll').size,0);assert.equal(f.main.style.minHeight,'');assert.equal(f.main.dataset.communityShell,undefined);
 const painted=f.paints.length;held.resolve(content('OLD CREW'));await opening;assert.equal(f.paints.length,painted);
});

test('ranking URL normalization retains legacy shared links and validated category state',()=>{
 const c=helpers();
 for(const [raw,category,workKind] of [
  ['community/rankings?period=month','aiArtist','solo'],
  ['community/rankings?category=crew&period=all','crew','solo'],
  ['community/rankings?category=work&workKind=duet','cover','duet'],
  ['community/rankings?category=work&workKind=dubbing','dubbing','solo'],
  ['community/rankings?kind=singers&original_id=track','cover','solo'],
  ['community/rankings?category=invalid&workKind=invalid','aiArtist','solo']
 ]){
  const state=c.communityRankingOptions(raw);
  assert.deepEqual(plain(state),{category,period:'week',workKind});
  const expected='#community/rankings?category='+category+'&period=week'+(category==='cover'?'&workKind='+workKind:'');
  assert.equal(c.communityRankingHref(state),expected);
 }
});

test('ranking API reads can reuse the short cache while crew membership and room state stay live',()=>{
 const definition=source('app.js').match(/^function canCacheApiRead\(path\)\{[^\n]+\}/m);
 assert.ok(definition,'the real API cache policy must be available');
 const c=vm.createContext({});vm.runInContext(definition[0],c);
 for(const path of ['/api/community/rankings','/api/community/rankings?category=crew&period=week&limit=20','/api/community/rankings?category=work&period=week&workKind=duet&offset=20'])assert.equal(c.canCacheApiRead(path),true,path);
 for(const path of ['/api/crews','/api/crews?summary=1&home=1','/api/crews/mine','/api/crews/mine/notices','/api/voice/public-rooms','/api/community/rankings/unknown'])assert.equal(c.canCacheApiRead(path),false,path);
});
