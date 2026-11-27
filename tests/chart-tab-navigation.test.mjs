import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectCoverPick from '../shared/cover-pick-ui.js';

const source=readFileSync(new URL('../dist/browse.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const chartData=(name='song')=>({chart:{comparison:{available:true}},tracks:[{id:name,title:name,kind:'original',duration:180,chart_rank:1,chart_plays:10,chart_covers:2,likes:1,comments:0}]});

function helpers(extra={}){
 const c=vm.createContext({URLSearchParams,AbortController,Date,structuredClone,Map,Set,me:{id:'owner'},apiRevision:0,renderId:0,
  location:{hash:'#charts'},document:{addEventListener(){}},window:{addEventListener(){}},
  esc:escape,number:String,icon:()=>'',cover:()=>'',credits:()=>'',liked:()=>false,remember:tracks=>tracks,
  empty:(title,description,href,label)=>'<p>'+escape(title)+'</p><a href="'+href+'">'+escape(label)+'</a>',
  AifectGenres:{GENRES:['Rock','Pop']},AifectCoverPick,
  AifectPlaylist:{isPlaylistEligibleTrack:track=>track.kind==='original'},...extra});
 vm.runInContext(source,c);
 return c;
}

// Persistent shell nodes deliberately reject replacement. The mutable content
// host recreates only its descendants, matching the browser route boundary.
function fixture(response=async params=>chartData(params.get('chart')+'-'+params.get('period'))){
 let now=1000,timerSerial=0,hash='#charts',responder=response,controller=null;
 const requests=[],writes=[],hashChanges=[],events=[],timers=new Map(),cleanups=new Set(),listeners=new Map(),documentListeners=new Map();
 const record=(map,type,handler)=>{if(!map.has(type))map.set(type,new Set());map.get(type).add(handler);};
 class Element {
  constructor(name){this.name=name;this.dataset={};this.attributes=new Map();this.children=[];this.style={};this.isConnected=true;this.offsetHeight=640;this._html='';const classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>{if(on??!classes.has(x))classes.add(x);else classes.delete(x);}};}
  get innerHTML(){return this._html;}set innerHTML(value){this._html=value;this.onHTML?.(value);}
  setAttribute(key,value){this.attributes.set(key,String(value));}getAttribute(key){return this.attributes.get(key)??null;}removeAttribute(key){this.attributes.delete(key);}
  append(node){this.children.push(node);node.parentNode=this;}appendChild(node){this.append(node);return node;}
  getBoundingClientRect(){return {top:120,height:640,bottom:760};}
  querySelector(){return null;}querySelectorAll(){return [];}
  addEventListener(type,handler){record(this.handlers||(this.handlers=new Map()),type,handler);}removeEventListener(type,handler){this.handlers?.get(type)?.delete(handler);}
  focus(){events.push('focus:'+this.name);}contains(node){return node===this||this.children.includes(node);}
 }
 const main=new Element('main'),root=new Element('root'),strip=new Element('strip'),panel=new Element('content'),targets=new Element('targets');
 main.dataset={route:'charts',account:'owner'};
 const tabLinks=['','covers','releases'].map(kind=>{const link=new Element('tab-'+(kind||'popular'));link.dataset={chartKind:kind,chartTab:kind};link.setAttribute('href','#charts'+(kind?'/'+kind:'')+'?period=week');return link;});
 const nodes=new Map([['#main',main],['.charts-final',root],['.chart-tabs',strip],['#chart-content',panel],['[data-chart-route-targets]',targets]]);
 main.querySelector=selector=>nodes.get(selector)||null;
 root.querySelector=selector=>nodes.get(selector)||null;
 root.querySelectorAll=selector=>selector.includes('chart-tabs')||selector.includes('chart-tab')?tabLinks:[];
 strip.querySelectorAll=()=>tabLinks;strip.querySelector=()=>tabLinks.find(link=>link.getAttribute('aria-current'))||null;
 targets.querySelectorAll=()=>targets.children;
 for(const node of [main,root,strip]){
  Object.defineProperty(node,'innerHTML',{get(){return '';},set(){throw Error(node.name+' must stay mounted');}});
  Object.defineProperty(node,'outerHTML',{set(){throw Error(node.name+' must stay mounted');}});
 }
 panel.onHTML=html=>{
  writes.push(html);
  for(const key of ['.chart-toolbar','[data-browse-shuffle]','[data-chart-retry]'])nodes.delete(key);
  if(html.includes('data-chart-retry'))nodes.set('[data-chart-retry]',new Element('retry'));
  if(html.includes('chart-toolbar')){
   const toolbar=new Element('toolbar'),details=new Element('details'),summary=new Element('summary'),label=new Element('period-label'),create=new Element('create'),shuffle=new Element('shuffle'),playAll=new Element('play-all');
   const periodLinks=['week','month','all'].map(period=>{const link=new Element('period-'+period);link.setAttribute('href','#charts?period='+period);link.textContent=period;return link;});
   details.querySelector=selector=>selector==='summary span'?label:selector==='summary'?summary:null;
   details.querySelectorAll=()=>periodLinks;details.children=[summary,...periodLinks];
   toolbar.querySelector=selector=>({
    '.chart-period':details,'[data-chart-playlist]':create,'[data-chart-play-all]':playAll,'[data-chart-shuffle]':shuffle
   })[selector]||null;
   toolbar.querySelectorAll=selector=>selector.includes('period')?periodLinks:[];
   nodes.set('.chart-toolbar',toolbar);nodes.set('[data-browse-shuffle]',shuffle);
  }
 };
 panel.querySelector=selector=>nodes.get(selector)||null;panel.querySelectorAll=()=>[];
 const document={
  addEventListener:(type,handler)=>record(documentListeners,type,handler),removeEventListener:(type,handler)=>documentListeners.get(type)?.delete(handler),
  querySelector:selector=>nodes.get(selector)||null,querySelectorAll:selector=>selector.includes('chart-tabs')||selector.includes('chart-tab')?tabLinks:[],
  getElementById:id=>targets.children.find(node=>node.id===id)||null,createElement:tag=>new Element(tag)
 };
 const window={scrollY:240,innerHeight:900,getSelection:()=>null,
  addEventListener:(type,handler)=>record(listeners,type,handler),removeEventListener:(type,handler)=>listeners.get(type)?.delete(handler),
  scrollTo(){throw Error('chart tabs must preserve viewport position');}
 };
 const location={get hash(){return hash;},set hash(value){hash=value.startsWith('#')?value:'#'+value;let id;try{id=decodeURIComponent(hash.slice(1));}catch{id=hash.slice(1);}hashChanges.push({hash,prepared:targets.children.some(node=>node.id===id)});}};
 class Clock extends Date {static now(){return now;}}
 const c=helpers({Date:Clock,document,window,location,$:selector=>nodes.get(selector)||null,routeTracks:[],accountReady:Promise.resolve(),
  setTimeout:(fn,delay)=>{const id=++timerSerial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  registerRouteCleanup:fn=>{const cleanup=()=>{cleanups.delete(cleanup);fn();};cleanups.add(cleanup);return cleanup;},
  render:()=>events.push('render'),icons(){},paintInteractions(){},bindCommunity(){},toast:message=>events.push('toast:'+message)
 });
 c.api=async(path,method,body,options)=>{const params=new URLSearchParams(path.split('?')[1]);requests.push({path,method,body,options,params});return responder(params);};
 const readApi=()=>{
  controller?.abort();controller=new AbortController();const localController=controller,ticket=c.renderId,account=c.me?.id||'guest';
  const read=(...args)=>c.api(...args);read.signal=localController.signal;read.current=()=>ticket===c.renderId&&!localController.signal.aborted&&account===(c.me?.id||'guest');return read;
 };
 return {context:c,main,root,strip,panel,targets,tabs:tabLinks,nodes,requests,writes,hashChanges,events,timers,listeners,documentListeners,window,
  get state(){return root._chartRouteState;},get now(){return now;},advance:ms=>{now+=ms;},setResponse:fn=>{responder=fn;},
  async mount(raw='charts'){
   hash='#'+raw;main.dataset.route=raw;const selected=c.chartRouteSelection(raw),view=await c.popularChartView(raw,selected.kind);
   panel.innerHTML=view.contentHtml;c.bindBrowse(view);writes.length=0;return view;
  },
  navigate(raw,visible=()=>{},force=false){location.hash='#'+raw;return c.refreshChartRoute(raw,++c.renderId,readApi(),visible,force);},
  fire(delay){for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}},
  cleanup(){for(const cleanup of [...cleanups])cleanup();},abort(){controller?.abort();}
 };
}

test('chart routing keeps canonical kinds, periods and existing popular aliases separate from karaoke charts',()=>{
 const c=helpers();
 for(const [raw,kind,period] of [
  ['charts','','week'],['#charts?period=month','','month'],['#/charts/covers?period=all','covers','all'],
  ['charts/releases?period=week','releases','week'],['charts/covers?period=invalid','covers','week'],
  ['charts/top?period=month','','month'],['charts/rising','','week'],['charts/newcomers','','week'],['charts/old-link','','week']
 ]){
  const selected=c.chartRouteSelection(raw);assert.ok(selected,raw);assert.equal(selected.kind,kind,raw);assert.equal(selected.period,period,raw);
 }
 for(const raw of ['', 'home','profile','charts/karaoke','charts/karaoke?period=month','karaoke/chart','chart','charts-other'])assert.equal(c.chartRouteSelection(raw),null,raw);
});

test('genre remains part of the chart URL, cache key, request and period links',async()=>{
 const h=fixture();
 await h.mount('charts/covers?period=month&genre=Rock');
 assert.equal(h.requests[0].params.get('genre'),'Rock');
 assert.equal(h.requests[0].params.get('full'),'1');
 assert.match(h.tabs[2].getAttribute('href'),/period=month&genre=Rock/);
 assert.match(h.panel.innerHTML,/period=all&amp;genre=Rock/);
 await h.navigate('charts/covers?period=month&genre=Pop');
 assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].params.get('genre'),'Pop');
 await h.navigate('charts/covers?period=month&genre=Rock');
 assert.equal(h.requests.length,2);
});

test('popular, cover and release data reuse a short cache scoped by period, account and mutation revision',async()=>{
 let now=1000;const calls=[];class Clock extends Date {static now(){return now;}}
 const c=helpers({Date:Clock,api:async(path,method,body,options)=>{calls.push({path,method,body,options});return chartData('result-'+calls.length);}});
 const first=await c.popularChartView('charts','');assert.equal(first.chartKind,'');assert.equal(first.chartPeriod,'week');
 first.tracks.push({id:'not-in-cache',kind:'original'});
 assert.equal((await c.popularChartView('charts?period=week','')).tracks.length,1);assert.equal(calls.length,1);
 now+=29999;await c.popularChartView('charts','');assert.equal(calls.length,1);
 now++;await c.popularChartView('charts','');assert.equal(calls.length,2,'expiry is inclusive at thirty seconds');
 await c.popularChartView('charts/covers','covers');await c.popularChartView('charts/releases','releases');
 await c.popularChartView('charts?period=month','');await c.popularChartView('charts?period=all','');
 assert.equal(calls.length,6);assert.match(calls[2].path,/chart=covers&period=week/);assert.match(calls[3].path,/chart=new&period=week/);
 c.apiRevision++;await c.popularChartView('charts','');assert.equal(calls.length,7);
 c.me={id:'another'};await c.popularChartView('charts','');assert.equal(calls.length,8);
 c.me=null;await c.popularChartView('charts','');assert.equal(calls.length,9);
 assert.ok(calls.every(call=>call.options?.fresh),'chart TTL must not be extended by the generic API cache');
});

test('failed or superseded chart reads never populate the reusable result cache',async()=>{
 for(const change of ['failure','abort','account','revision','route']){
  const held=deferred(),controller=new AbortController(),c=helpers({api:()=>held.promise});
  const read=c.api;read.signal=controller.signal;read.current=()=>true;
  const pending=c.popularChartView('charts/covers','covers',read);
  if(change==='abort')controller.abort();else if(change==='account')c.me={id:'other'};else if(change==='revision')c.apiRevision++;else if(change==='route')read.current=()=>false;
  if(change==='failure')held.reject(Error('offline'));else held.resolve(chartData('obsolete'));
  await assert.rejects(pending);assert.equal(vm.runInContext('chartDataCache.size',c),0,change);
 }
});

test('chart loading changes only the content host and immediately updates the selected tab and URL',async()=>{
 const f=fixture();await f.mount();const held=deferred();f.setResponse(()=>held.promise);let visible=0;
 const pending=f.navigate('charts/covers?period=month',()=>{
  visible++;assert.equal(f.main.dataset.route,'charts/covers?period=month');assert.match(f.panel.innerHTML,/불러오는/);
 });
 assert.equal(visible,1);assert.equal(f.panel.getAttribute('aria-busy'),'true');assert.equal(f.tabs[1].getAttribute('aria-current'),'page');assert.equal(f.tabs[0].getAttribute('aria-current'),null);
 assert.ok(Number.parseFloat(f.panel.style.minHeight)>0,'the old content height remains reserved during loading');assert.equal(f.main.getAttribute('aria-busy'),null);assert.equal(f.window.scrollY,240);
 held.resolve(chartData('COVER MONTH'));assert.equal(await pending,true);
 assert.match(f.panel.innerHTML,/COVER MONTH/);assert.equal(f.panel.getAttribute('aria-busy'),null);assert.equal(f.timers.size,0);assert.equal(f.events.includes('render'),false);assert.equal(f.window.scrollY,240);
});

test('top-tab and period round trips reuse completed reads without replacing navigation or shared nodes',async()=>{
 const f=fixture();await f.mount();
 for(const raw of ['charts/covers?period=month','charts/releases?period=month','charts?period=month','charts/covers?period=month','charts?period=week'])assert.equal(await f.navigate(raw),true);
 assert.equal(f.requests.length,4);assert.equal(f.nodes.get('.charts-final'),f.root);assert.equal(f.nodes.get('.chart-tabs'),f.strip);assert.equal(f.nodes.get('#chart-content'),f.panel);
 assert.equal(f.tabs[0].getAttribute('aria-current'),'page');assert.ok(f.tabs.every(tab=>tab.getAttribute('href').endsWith('period=week')));
 const reads=f.requests.length,writes=f.writes.length;let visible=0;assert.equal(await f.navigate('charts?period=week',()=>visible++),true);
 assert.equal(f.requests.length,reads);assert.equal(f.writes.length,writes);assert.equal(visible,1);assert.equal(f.events.includes('render'),false);
});

test('a slower tab success or failure cannot overwrite the most recent chart selection',async()=>{
 for(const failed of [false,true]){
  const f=fixture();await f.mount();const held=deferred();f.setResponse(params=>params.get('chart')==='covers'?held.promise:chartData('LATEST RELEASE'));
  const obsolete=f.navigate('charts/covers');await flush();assert.equal(await f.navigate('charts/releases'),true);
  const painted=f.writes.length;if(failed)held.reject(Error('OBSOLETE ERROR'));else held.resolve(chartData('OBSOLETE COVER'));
  await obsolete;assert.equal(f.writes.length,painted);assert.match(f.panel.innerHTML,/LATEST RELEASE/);assert.doesNotMatch(f.panel.innerHTML,/OBSOLETE/);assert.equal(f.tabs[2].getAttribute('aria-current'),'page');assert.equal(f.timers.size,0);
 }
});

test('late chart data cannot paint after account changes, route exits, shell detachment or cleanup',async()=>{
 for(const change of ['account','route','detach','cleanup'])for(const failed of [false,true]){
  const f=fixture();await f.mount();const held=deferred();f.setResponse(()=>held.promise);const pending=f.navigate('charts/covers');await flush();
  if(change==='account')f.context.me={id:'another'};else if(change==='route'){f.context.location.hash='#home';f.context.renderId++;}else if(change==='detach')f.root.isConnected=false;else f.cleanup();
  const painted=f.writes.length;if(failed)held.reject(Error('OBSOLETE ERROR'));else held.resolve(chartData('OBSOLETE ACCOUNT'));
  await pending;assert.equal(f.writes.length,painted,change+'/'+failed);assert.equal(f.timers.size,0);
 }
});

test('chart errors and retries remain local and do not cache failures',async()=>{
 const f=fixture();await f.mount();f.setResponse(async()=>{throw Error('<offline>');});assert.equal(await f.navigate('charts/covers'),true);
 assert.match(f.panel.innerHTML,/role="alert"/);assert.match(f.panel.innerHTML,/&lt;offline&gt;/);assert.match(f.panel.innerHTML,/data-chart-retry/);assert.equal(f.panel.getAttribute('aria-busy'),null);assert.equal(f.tabs[1].getAttribute('aria-current'),'page');assert.equal(f.events.includes('render'),false);
 f.setResponse(async()=>chartData('RETRIED COVER'));assert.equal(await f.navigate('charts/covers'),true);assert.match(f.panel.innerHTML,/RETRIED COVER/);assert.equal(f.requests.length,3);assert.equal(f.timers.size,0);
});

test('a stalled chart request times out locally and cannot overwrite a successful retry',async()=>{
 const f=fixture();await f.mount();const held=deferred();f.setResponse(()=>held.promise);const pending=f.navigate('charts/covers');assert.equal(f.timers.size,1);
 f.fire(20000);assert.equal(await pending,true);assert.match(f.panel.innerHTML,/role="alert"/);assert.match(f.panel.innerHTML,/연결이 지연/);assert.equal(f.panel.getAttribute('aria-busy'),null);
 f.setResponse(async()=>chartData('RECOVERED COVER'));await f.navigate('charts/covers');const writes=f.writes.length;
 held.resolve(chartData('TOO LATE'));await flush();assert.equal(f.writes.length,writes);assert.match(f.panel.innerHTML,/RECOVERED COVER/);assert.equal(f.timers.size,0);
 await f.navigate('charts');await f.navigate('charts/covers');assert.equal(f.requests.length,3,'the obsolete result cannot poison the retry cache');assert.match(f.panel.innerHTML,/RECOVERED COVER/);
});

test('tab clicks prepare native hash targets, current choices do nothing and modified clicks keep browser behavior',async()=>{
 const f=fixture();await f.mount();const click=[...f.root.handlers.get('click')][0];
 const event=(link,patch={})=>({target:{closest:()=>link},button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...patch});
 const current=event(f.tabs[0]);click(current);assert.equal(current.defaultPrevented,true);assert.equal(f.hashChanges.length,0);assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);
 const target=f.tabs[1];target.setAttribute('href','#charts/covers?period=month&from=%EB%85%B8%EB%9E%98');
 const next=event(target);click(next);
 assert.deepEqual(f.hashChanges,[{hash:'#charts/covers?period=month&from=%EB%85%B8%EB%9E%98',prepared:true}]);
 assert.ok(f.targets.children.some(node=>node.id==='charts/covers?period=month&from=노래'));assert.equal(f.requests.length,1,'the hash route transaction owns the read');
 for(const patch of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){
  const before=f.hashChanges.length,e=event(f.tabs[2],patch);click(e);assert.equal(f.hashChanges.length,before);assert.equal(e.defaultPrevented,!!patch.defaultPrevented);
 }
 target.target='_blank';const blank=event(target);click(blank);assert.equal(blank.defaultPrevented,false);
 assert.equal(f.root.handlers.get('click').size,1);await f.navigate('charts/releases');await f.navigate('charts');assert.equal(f.root.handlers.get('click').size,1);assert.equal(f.listeners.get('scroll').size,1);
 f.cleanup();assert.equal(f.root.handlers.get('click').size,0);assert.equal(f.listeners.get('scroll').size,0);assert.equal(f.context.canRefreshChartRoute('charts/covers'),false);
});

test('chart retention excludes account changes, unmounted content and the separate karaoke chart',async()=>{
 const f=fixture();await f.mount();
 for(const raw of ['charts','charts/covers?period=month','charts/releases?period=all','charts/top'])assert.equal(f.context.canRefreshChartRoute(raw),true,raw);
 for(const raw of ['home','charts/karaoke','karaoke/chart','charts/covers/nested'])assert.equal(f.context.canRefreshChartRoute(raw),false,raw);
 const original=f.main.dataset.route;f.main.dataset.route='charts/karaoke';assert.equal(f.context.canRefreshChartRoute('charts'),false);f.main.dataset.route=original;
 f.context.me={id:'another'};assert.equal(f.context.canRefreshChartRoute('charts'),false);f.context.me={id:'owner'};
 f.nodes.delete('#chart-content');assert.equal(f.context.canRefreshChartRoute('charts'),false);
});

test('mutation during a chart load retries fresh data while authorization errors remain locally retryable',async()=>{
 const f=fixture();await f.mount();const held=deferred();let calls=0;f.setResponse(()=>++calls===1?held.promise:chartData('CURRENT REVISION'));
 const pending=f.navigate('charts/covers');f.context.apiRevision++;held.resolve(chartData('STALE REVISION'));assert.equal(await pending,true);
 assert.equal(calls,2);assert.match(f.panel.innerHTML,/CURRENT REVISION/);assert.doesNotMatch(f.panel.innerHTML,/STALE REVISION/);assert.equal(f.timers.size,0);
 for(const status of [401,403]){
  let failed=0;f.setResponse(async()=>{failed++;f.context.apiRevision++;throw Object.assign(Error('permission changed'),{status});});
  assert.equal(await f.navigate('charts/releases',()=>{},true),true);assert.equal(failed,1);assert.match(f.panel.innerHTML,/permission changed/);assert.match(f.panel.innerHTML,/role="alert"/);assert.equal(f.events.includes('render'),false);
 }
});

test('empty charts retain the same toolbar with unavailable actions disabled',async()=>{
 const f=fixture(async()=>({chart:{comparison:{available:false}},tracks:[]}));await f.mount();
 assert.match(f.panel.innerHTML,/아직 집계된 곡/);assert.match(f.panel.innerHTML,/chart-period-menu/);assert.match(f.panel.innerHTML,/data-chart-playlist disabled/);
 await f.navigate('charts/covers?period=all');assert.match(f.panel.innerHTML,/아직 집계된 곡/);assert.ok(f.tabs.every(tab=>tab.getAttribute('href').endsWith('period=all')));assert.equal(f.context.routeTracks.length,0);
});

test('a restored chart snapshot binds from the current URL before the outgoing route dataset is updated',async()=>{
 const f=fixture(),raw='charts/covers?period=month',view=await f.context.popularChartView(raw,'covers');
 f.main.dataset.route='song/outgoing';f.context.location.hash='#'+raw;f.panel.innerHTML=view.contentHtml;f.context.bindBrowse(view);
 assert.ok(f.state);assert.equal(f.state.key,'covers:month');assert.equal(f.tabs[1].getAttribute('aria-current'),'page');assert.ok(f.tabs.every(tab=>tab.getAttribute('href').endsWith('period=month')));
 f.main.dataset.route=raw;assert.equal(f.context.canRefreshChartRoute('charts/releases'),true);
 assert.equal(await f.navigate('charts/releases?period=month'),true);assert.equal(f.root.handlers.get('click').size,1);assert.equal(f.listeners.get('scroll').size,1);
});

test('a native hash update blocks old chart completion before the hashchange ticket advances',async()=>{
 for(const failed of [false,true]){
  const f=fixture();await f.mount();const held=deferred();f.setResponse(()=>held.promise);const pending=f.navigate('charts/covers');await flush();
  const ticket=f.context.renderId,painted=f.writes.length;f.context.location.hash='#charts/releases';
  if(failed)held.reject(Error('BETWEEN HASH AND RENDER'));else held.resolve(chartData('BETWEEN HASH AND RENDER'));
  await pending;assert.equal(f.context.renderId,ticket);assert.equal(f.writes.length,painted);assert.doesNotMatch(f.panel.innerHTML,/BETWEEN HASH AND RENDER/);assert.equal(f.timers.size,0);
  assert.equal(vm.runInContext('chartDataCache.size',f.context),1,'an old URL must not publish its completed read to the cache');
 }
});
