import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/play-page.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;');
const unescape=value=>value.replaceAll('&quot;','"').replaceAll('&amp;','&');
const track=id=>({id,title:id,producer:'Creator',participants:0});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(read=async()=>({tracks:[],nextOffset:null})){
 let now=1000,serial=0,draftReads=0;
 const requests=[],paints=[],events=[],timers=new Map();
 class Clock extends Date {static now(){return now;}}
 const root={isConnected:true,_playView:null};
 const main={dataset:{route:'karaoke',account:'owner'},querySelector:selector=>selector==='.play-page [data-play-tools]'?{}:selector==='.play-page'?root:null};
 const context=vm.createContext({
  Date:Clock,URLSearchParams,AbortController,location:{hash:'#karaoke'},me:{id:'owner'},apiRevision:0,renderId:0,returnRoute:'',accountReady:Promise.resolve(),
  esc:escape,icon:()=>'',cover:()=>'',trackNickname:()=>'',userNickname:()=>'',time:String,
  card:item=>'<article>'+escape(item.title)+'</article>',
  dubbingCastingKinds:[['original','내 작품'],['joined','참여 작품']],
  dubbingCastingHTML:()=>'<section>CASTING</section>',castingMineTabs:kind=>'<nav>'+kind+'</nav>',
  AifectDubbing:{dubbingGenreArtwork:()=>''},gate:()=>'<div>SIGN_IN</div>',
  document:{querySelector:selector=>selector==='#main'?main:null},
  listSingDrafts:async()=>{draftReads++;return [];},
  api:async(...args)=>{requests.push(args);events.push('read');return read(...args);},
  setTimeout:(callback,delay)=>{const id=++serial;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
  render:()=>events.push('rerender')
 });
 vm.runInContext(source,context);
 // Rendering itself is covered by browser QA. This seam retains the real
 // selection, caching and async navigation logic without emulating a browser DOM.
 context.paintPlayRoute=(view,raw)=>{root._playView=view;main.dataset.route=raw;paints.push({view,raw});events.push(view.pending?'pending':'paint');return root;};
 const view=raw=>{context.location.hash='#'+raw;return context.playView('karaoke',raw.split('/')[1]?.split('?')[0],raw);};
 const navigate=(raw,visible=()=>{})=>{context.location.hash='#'+raw;return context.refreshPlayRoute(raw,++context.renderId,context.api,visible);};
 return {context,root,main,requests,paints,events,timers,view,navigate,advance:ms=>{now+=ms;},get draftReads(){return draftReads;}};
}

test('Play route selection preserves canonical tabs, aliases and recording boundaries',()=>{
 const {context:c}=fixture();
 const cases=[
  ['karaoke','song','recommended'],['#karaoke/duets','song','duets'],['#/karaoke/latest','song','latest'],
  ['karaoke/drafts','song','drafts'],['karaoke/dubbing?tab=join','dubbing','join'],
  ['karaoke/dubbing?tab=mine&kind=joined','dubbing','mine','all','joined'],
  ['karaoke/browse?tab=popular&type=duet','browse','popular','duet'],
  ['play','song','recommended'],['karaoke/songs','song','recommended'],
  ['dubbing?tab=complete','browse','recommended','dubbing'],['dubbing?tab=mine','dubbing','mine'],
  ['community/covers?mode=solo','browse','recommended','solo'],['community/latest','browse','latest'],
  ['community/following?type=duet','browse','following','duet'],['community/duets?open=1','song','duets']
 ];
 for(const [raw,mode,tab,type='all',kind='original'] of cases)assert.deepEqual(plain(c.playRouteSelection(raw)),{mode,tab,type,kind},raw);
 for(const raw of ['home','karaoke/chart','sing/one?duet=half','dubbing/new','dubbing/project?record=1','song/one','community/following?people=followers','karaoke/browse/nested'])assert.equal(c.playRouteSelection(raw),null,raw);
});

test('the stable shell supplies a fragment target for every internal tab and direct query',()=>{
 const {context:c}=fixture(),direct='karaoke/dubbing?tab=discover&project=project-1&target=combo-1';
 const html=c.playRouteTargetsHTML(direct),targets=[...html.matchAll(/data-play-route-target id="([^"]+)"/g)].map(match=>unescape(match[1]));
 assert.equal(new Set(targets).size,targets.length,'fragment IDs stay unique');
 assert.ok(targets.includes(direct),'project/target query is preserved');
 for(const mode of ['song','dubbing','browse'])for(const [tab] of vm.runInContext('playSections.'+mode,c)){
  for(const type of mode==='browse'?['all','solo','duet','dubbing']:['all']){
   const state={mode,tab,type,kind:'original'},shell=c.playShell(state,'CONTENT',direct);
   for(const [,encoded] of shell.matchAll(/href="(#[^"]+)"/g)){
    const href=unescape(encoded);
    if(href==='#dubbing/new')continue;
    assert.ok(targets.includes(href.slice(1)),href+' needs a stable target before hashchange');
   }
   assert.equal((shell.match(/aria-selected="true"/g)||[]).length,2,'one selected tab at each level');
  }
 }
});

test('tab data is reused during the 30-second window and expires at its boundary',async()=>{
 let sequence=0;const f=fixture(async()=>({tracks:[track('read-'+ ++sequence)],nextOffset:20}));
 const first=await f.view('karaoke/latest');f.advance(29999);
 const cached=await f.view('karaoke/latest');
 assert.equal(f.requests.length,1);assert.equal(cached.items[0].id,first.items[0].id);assert.equal(cached.nextOffset,20);
 cached.items.push(track('local-only'));
 assert.equal((await f.view('karaoke/latest')).items.length,1,'a returned array cannot extend the stored snapshot');
 f.advance(1);const refreshed=await f.view('karaoke/latest');
 assert.equal(f.requests.length,2);assert.equal(refreshed.items[0].id,'read-2');
});

test('tab caches are separated by account, data revision, subtype and direct-link query',async()=>{
 const f=fixture(async()=>({tracks:[],projects:[],works:[],nextOffset:null}));
 await f.view('karaoke/latest');await f.view('karaoke/latest');assert.equal(f.requests.length,1);
 f.context.me={id:'another'};await f.view('karaoke/latest');assert.equal(f.requests.length,2);
 f.context.apiRevision++;await f.view('karaoke/latest');assert.equal(f.requests.length,3);
 f.context.me={id:'owner'};await f.view('karaoke/latest');assert.equal(f.requests.length,4,'a previous account snapshot has the old revision');
 for(const route of ['karaoke/browse?tab=latest&type=solo','karaoke/browse?tab=latest&type=duet','karaoke/dubbing?tab=discover&project=one','karaoke/dubbing?tab=discover&project=two'])await f.view(route);
 assert.equal(f.requests.length,8);
 await f.view('karaoke/dubbing?tab=discover&project=one');assert.equal(f.requests.length,8);
 assert.match(f.requests[4][0],/type=solo/);assert.match(f.requests[5][0],/type=duet/);
});

test('failed loads remain retryable and local drafts are always read again',async()=>{
 let fail=true;const f=fixture(async()=>{if(fail){fail=false;throw Error('OFFLINE');}return {tracks:[],nextOffset:null};});
 const failed=await f.view('karaoke/latest');assert.equal(failed.error,'OFFLINE');assert.match(failed.html,/data-play-retry/);
 const retry=await f.view('karaoke/latest');assert.equal(retry.error,undefined);assert.equal(f.requests.length,2);
 await f.view('karaoke/latest');assert.equal(f.requests.length,2);
 await f.view('karaoke/drafts');await f.view('karaoke/drafts');
 assert.equal(f.draftReads,2);assert.equal(f.requests.length,2);
});

test('private tabs gate guests without fetching or caching another account data',async()=>{
 const f=fixture();f.context.me=null;
 for(const route of ['karaoke/drafts','karaoke/dubbing?tab=mine','karaoke/browse?tab=following&type=all']){
  const view=await f.view(route);assert.equal(view.gated,true);assert.match(view.html,/SIGN_IN/);assert.equal(f.context.returnRoute,'#'+route);
 }
 assert.equal(f.requests.length,0);assert.equal(f.draftReads,0);
 f.context.me={id:'owner'};const view=await f.view('karaoke/browse?tab=following&type=all');
 assert.equal(view.gated,undefined);assert.equal(f.requests.length,1);
});

test('a response received after account or data revision changes cannot populate the cache',async()=>{
 for(const changed of ['account','revision']){
  const held=deferred();let calls=0;const f=fixture(async()=>++calls===1?held.promise:{tracks:[],nextOffset:null});
  const opening=f.view('karaoke/latest');
  if(changed==='account')f.context.me={id:'another'};else f.context.apiRevision++;
  held.resolve({tracks:[track('OLD')],nextOffset:null});await opening;
  f.context.me={id:'owner'};
  await f.view('karaoke/latest');assert.equal(calls,2,changed);
 }
});

test('local loading makes the shell ready before awaiting the list and cached returns skip loading',async()=>{
 const held=deferred(),f=fixture(()=>held.promise);
 const pending=f.navigate('karaoke/latest',()=>f.events.push('visible'));
 assert.deepEqual(f.events,['pending','visible']);
 await flush();
 assert.deepEqual(f.events,['pending','visible','read']);
 assert.equal(f.root._playView.pending,true);assert.equal(f.main.dataset.route,'karaoke/latest');
 held.resolve({tracks:[track('LATEST')],nextOffset:null});assert.equal(await pending,true);
 assert.equal(f.root._playView.pending,undefined);assert.equal(f.root._playView.items[0].id,'LATEST');assert.equal(f.timers.size,0);
 f.events.length=0;
 assert.equal(await f.navigate('karaoke/latest',()=>f.events.push('visible')),true);
 assert.deepEqual(f.events,['paint','visible']);assert.equal(f.requests.length,1);
});

test('rapid tab round trips ignore a superseded result even when its request does not abort',async()=>{
 const old=deferred();let latestReads=0;
 const f=fixture(path=>path.includes('tab=latest')&&++latestReads===1?old.promise:Promise.resolve({tracks:[track(path.includes('tab=duets')?'DUETS':'CURRENT LATEST')],nextOffset:null}));
 const obsolete=f.navigate('karaoke/latest');await flush();
 await f.navigate('karaoke/duets');await f.navigate('karaoke/latest');
 assert.equal(f.root._playView.items[0].id,'CURRENT LATEST');
 const painted=f.paints.length;old.resolve({tracks:[track('OBSOLETE LATEST')],nextOffset:null});await obsolete;
 assert.equal(f.paints.length,painted);assert.equal(f.root._playView.items[0].id,'CURRENT LATEST');assert.equal(f.timers.size,0);
});

test('obsolete errors, detached pages and account changes cannot replace the active list',async()=>{
 for(const change of ['route','detach','account']){
  const old=deferred();const f=fixture(path=>path.includes('tab=latest')?old.promise:Promise.resolve({tracks:[track('ACTIVE')],nextOffset:null}));
  const pending=f.navigate('karaoke/latest');await flush();
  if(change==='route')await f.navigate('karaoke/duets');
  else if(change==='detach')f.root.isConnected=false;
  else f.context.me={id:'another'};
  const painted=f.paints.length;old.reject(Error('LATE ERROR'));await pending;
  assert.equal(f.paints.length,painted,change);assert.equal(f.timers.size,0);
 }
});

test('a tab clicked during account startup waits before applying a guest gate and rerenders after login resolves',async()=>{
 const account=deferred(),f=fixture();f.context.me=null;f.main.dataset.account='guest';f.context.accountReady=account.promise;
 const pending=f.navigate('karaoke/drafts',()=>f.events.push('visible'));
 assert.deepEqual(f.events,['pending','visible']);assert.equal(f.root._playView.gated,undefined);
 await flush();assert.equal(f.paints.length,1);assert.equal(f.draftReads,0);assert.equal(f.requests.length,0);
 f.context.me={id:'owner'};f.context.apiRevision++;account.resolve();await pending;
 assert.deepEqual(f.events,['pending','visible','rerender']);assert.equal(f.root._playView.gated,undefined);assert.equal(f.timers.size,0);
});

test('cached tab returns wait for account readiness and recheck identity and data revision',async()=>{
 for(const change of ['none','account','revision']){
  const account=deferred(),f=fixture();await f.view('karaoke/latest');f.events.length=0;f.context.accountReady=account.promise;
  let settled=false;const pending=f.navigate('karaoke/latest',()=>f.events.push('visible')).then(()=>{settled=true;});
  await flush();assert.equal(settled,false);assert.deepEqual(f.events,['paint','visible']);
  if(change==='account')f.context.me={id:'another'};else if(change==='revision')f.context.apiRevision++;
  account.resolve();await pending;
  assert.deepEqual(f.events,change==='none'?['paint','visible']:['paint','visible','rerender']);
  assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);
 }
});

test('tabs superseded or detached during account startup do not request data or rerender later',async()=>{
 for(const change of ['route','detach']){
  const account=deferred(),f=fixture();f.context.accountReady=account.promise;
  const first=f.navigate('karaoke/latest');
  let current;
  if(change==='route')current=f.navigate('karaoke/duets');else f.root.isConnected=false;
  account.resolve();await first;if(current)await current;
  assert.equal(f.events.includes('rerender'),false);
  assert.equal(f.requests.length,change==='route'?1:0);
  if(change==='route')assert.match(f.requests[0][0],/tab=duets/);
  assert.equal(f.timers.size,0);
 }
});
