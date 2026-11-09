import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const unescape=value=>value.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');

function helpers(extra={}){
 const c=vm.createContext({URLSearchParams,AbortController,Date,me:{id:'owner',profile_id:'profile-owner'},apiRevision:0,renderId:0,
  location:{hash:'#profile'},document:{addEventListener(){}},window:{addEventListener(){}},esc:escape,number:String,icon:()=>'',...extra});
 vm.runInContext(source('menu-integration.js'),c);
 vm.runInContext(source('mypage.js'),c);
 return c;
}

const profileData=label=>({profile:{id:'profile-owner',user_id:'owner'},tracks:[{id:label}],covers:[],dubbings:[]});
const libraryData=label=>({html:'<article>LIBRARY '+escape(label)+'</article>',libraryAside:'LIBRARY ASIDE '+label,tracks:[],musicLibrary:{account:'owner',label}});

function fixture(read=async kind=>kind==='works'?profileData('REFRESHED'):kind==='activity'?{label:'FRESH'}:libraryData('FRESH')){
 let now=1000,timerId=0,hash='#profile',headerBinds=0;
 const requests=[],writes=[],asideWrites=[],events=[],hashChanges=[],timers=new Map(),cleanups=new Set(),handlers=new Map(),listeners=new Map();
 class Clock extends Date {static now(){return now;}}
 const element=(name,initial='')=>{
  let html=initial;
  return {name,isConnected:true,dataset:{},style:{},children:[],attributes:new Map(),
   get innerHTML(){return html;},set innerHTML(value){html=value;if(name==='content')writes.push(value);if(name==='aside')asideWrites.push(value);},
   setAttribute(key,value){this.attributes.set(key,String(value));},removeAttribute(key){this.attributes.delete(key);},getAttribute(key){return this.attributes.get(key);},
   append(node){this.children.push(node);},getBoundingClientRect:()=>({top:120,height:640}),focus(){events.push('focus:'+name);}
  };
 };
 const content=element('content','ORIGINAL WORKS'),aside=element('aside','ORIGINAL ASIDE'),targets=element('targets'),banner=element('banner'),copy=element('copy'),header=element('header');
 const tabs=['works','library','activity'].map(tab=>{const node=element(tab);node.dataset.mpTab=tab;return node;});
 const segment={dataset:{active:'works'},querySelectorAll:()=>tabs};
 const page=element('page');page.querySelector=selector=>selector==='.mp-works-banner>span'?copy:selector==='.mp-works-banner'?banner:null;
 const main=element('main');main.dataset={route:'profile',account:'owner'};main.querySelector=selector=>selector==='[data-mypage-route-targets]'?targets:selector==='.mp-dashboard.mp-own'?page:null;
 for(const node of [main,page,header,banner])Object.defineProperty(node,'outerHTML',{set(){throw Error(node.name+' must stay mounted');}});
 Object.defineProperty(main,'innerHTML',{set(){throw Error('tab changes must not rebuild #main');}});
 const nodes={'#main':main,'.mp-dashboard':page,'.mp-segment':segment,'#mp-content':content,'#mp-aside-content':aside};
 tabs.forEach(node=>{nodes['#mp-tab-'+node.dataset.mpTab]=node;});
 const document={
  addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},querySelector:selector=>nodes[selector]||null,
  createElement(tag){
   if(tag!=='template')return element(tag);
   let html='';return {set innerHTML(value){html=value;},content:{querySelector:()=>({innerHTML:html.replace(/^[\s\S]*?<span>/,'').replace(/<\/span><\/div>$/,'')})}};
  }
 };
 const window={scrollY:260,innerHeight:844,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},scrollTo(){throw Error('tabs must retain the viewport');}};
 const location={get hash(){return hash;},set hash(value){hash=value.startsWith('#')?value:'#'+value;let id;try{id=decodeURIComponent(hash.slice(1));}catch{id=hash.slice(1);}hashChanges.push({hash,prepared:targets.children.some(node=>node.id===id)});}};
 const c=helpers({Date:Clock,document,window,location,$:selector=>nodes[selector]||null,accountReady:Promise.resolve(),routeTracks:[],
  setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  registerRouteCleanup:fn=>{const release=()=>{cleanups.delete(release);fn();};cleanups.add(release);return release;},
  icons(){},paintInteractions(){},syncSongCoverPlayback(){},remember:items=>items,render:()=>events.push('rerender')
 });
 const load=(kind,path,details)=>{requests.push({kind,path,details});events.push('read:'+kind);return read(kind,path,details);};
 c.api=async(path,method,body,options)=>load('works',path,{method,body,options});
 c.myActivityData=readApi=>load('activity',location.hash.slice(1),readApi);
 c.myLibraryView=(raw,readApi)=>load('library',raw,readApi);
 c.myWorksHTML=(d,column)=>'<article>WORKS '+column+' '+d.tracks.map(t=>t.id).join(',')+'</article>';
 c.myActivityHTML=result=>'<article>ACTIVITY '+escape(result.label)+'</article>';c.myActivityAside=result=>'ACTIVITY ASIDE '+result.label;
 c.bindProfileWorkJoins=()=>{};c.bindMusicLibrary=()=>events.push('bind-library');c.bindMemberHeader=()=>headerBinds++;
 const s={d:profileData('ORIGINAL'),own:true,account:'owner',tab:'works',pending:false,worksRevision:0,worksUntil:now+30000,loadedTab:'works',loadedRevision:0,libraryRoute:null};
 c.bindMyPage({mypage:s});
 const navigate=(raw,visible=()=>{})=>{
  location.hash='#'+raw;const ticket=++c.renderId,account=c.me?.id,controller=new AbortController();
  const readApi=(...args)=>c.api(...args);readApi.signal=controller.signal;readApi.current=()=>ticket===c.renderId&&account===c.me?.id&&!controller.signal.aborted;
  return c.refreshMyPageRoute(raw,ticket,readApi,visible);
 };
 const fire=delay=>{let count=0;for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();count++;}return count;};
 const cleanup=()=>{for(const release of [...cleanups])release();};
 return {context:c,state:s,main,page,header,banner,copy,content,aside,tabs,segment,targets,window,requests,writes,asideWrites,events,hashChanges,timers,handlers,listeners,navigate,fire,cleanup,advance:ms=>{now+=ms;},get now(){return now;},get headerBinds(){return headerBinds;}};
}

// Model document coordinates so a scroll changes rect.top and exposes layout
// feedback that the fixed rectangles in the navigation-only fixture cannot.
function scrollingLayout(f,{scale=1,contentHeight=600,asideHeight=180}={}){
 const top=650,heights={content:contentHeight,aside:asideHeight};
 for(const key of ['content','aside']){
  const node=f[key];
  Object.defineProperty(node,'offsetHeight',{get:()=>Math.max(heights[key],parseFloat(node.style.minHeight)||0)});
  node.getBoundingClientRect=()=>({top:top-f.window.scrollY,height:node.offsetHeight*scale});
 }
 return {heights,
  scroll(y){f.window.scrollY=y;for(const listener of f.listeners.get('scroll')||[])listener();},
  studioTop:()=>top+f.aside.offsetHeight*scale+24-f.window.scrollY
 };
}

test('My page selection preserves dashboard aliases and excludes separate or legacy screens',()=>{
 const c=helpers();
 for(const [raw,tab] of [
  ['profile','works'],['#profile?view=works','works'],['#/profile?view=activity','activity'],
  ['profile?view=library&section=history&q=music&sort=oldest','library'],['profile?view=invalid','works'],
  ['mypage','works'],['mypage?view=activity','activity'],['library','library'],['library/likes','library'],['library/history','library'],['library/playlists','library']
 ])assert.equal(c.myPageRouteSelection(raw),tab,raw);
 for(const raw of ['','home','profile/edit','profile/works','profile/works?tab=complete','profile/nested','profile-works/profile-owner','profile-gallery/profile-owner','producer/profile-owner?view=activity','producer/other','member/other','relations','gift-inventory','library/artists','library/followers','library/covers','library/originals','profile?view=works&section=covers','profile?view=works&section=originals']){
  assert.equal(c.myPageRouteSelection(raw),null,String(raw));
 }
});

test('retention requires the same owner and a dashboard source, including that owner’s producer entry',()=>{
 let mounted=true;
 const main={dataset:{route:'profile'},querySelector:()=>mounted?{}:null};
 const c=helpers({$:selector=>selector==='#main'?main:null});
 const s={own:true,account:'owner',d:{profile:{id:'profile-owner'}}};c.initialState=s;vm.runInContext('myPageState=initialState',c);
 for(const raw of ['profile','profile?view=activity','profile?view=library&section=playlists','library/history'])assert.equal(c.canRefreshMyPageRoute(raw),true,raw);
 for(const raw of ['profile/edit','profile/works','profile?view=works&section=covers','producer/other'])assert.equal(c.canRefreshMyPageRoute(raw),false,raw);
 for(const previous of ['home','profile/works','profile?section=covers','profile?section=originals','producer/other','producer/profile-owner?section=covers','producer/profile-owner?view=works&section=originals']){main.dataset.route=previous;assert.equal(c.canRefreshMyPageRoute('profile?view=activity'),false,previous);}
 for(const previous of ['producer/profile-owner','producer/profile-owner?view=activity','producer/profile-owner?view=library&section=history']){main.dataset.route=previous;assert.equal(c.canRefreshMyPageRoute('profile?view=library'),true,previous);}
 main.dataset.route='profile';c.me={id:'other'};assert.equal(c.canRefreshMyPageRoute('profile'),false);
 c.me={id:'owner'};s.own=false;assert.equal(c.canRefreshMyPageRoute('profile'),false);
 s.own=true;mounted=false;assert.equal(c.canRefreshMyPageRoute('profile'),false);
});

test('My shell targets include actual tab URLs and add decoded dynamic queries only once',()=>{
 const host={children:[],append(node){this.children.push(node);}},main={querySelector:()=>host};
 const c=helpers({$:selector=>selector==='#main'?main:null,document:{addEventListener(){},createElement:()=>({setAttribute(){}})}});
 const raw='profile?view=library&section=history&q=%ED%95%9C%EA%B8%80&sort=oldest';
 const html=c.myPageRouteTargetsHTML(raw),targets=[...html.matchAll(/data-mypage-route-target id="([^"]+)"/g)].map(match=>unescape(match[1]));
 assert.equal(new Set(targets).size,targets.length);assert.ok(targets.includes(decodeURIComponent(raw)));
 for(const tab of ['works','library','activity'])assert.ok(targets.includes(decodeURIComponent(c.myTabHref(tab,raw).slice(1))),tab);
 for(const value of [raw,'#'+raw])c.rememberMyPageRouteTarget(value);
 assert.deepEqual(host.children.map(node=>node.id),[decodeURIComponent(raw)]);
 c.rememberMyPageRouteTarget('profile/works');assert.equal(host.children.length,1);
 c.rememberMyPageRouteTarget('profile?view=library&q=%E0%A4%A+tag&sort=title');
 assert.equal(host.children[1].id,'profile?view=library&q=�%A+tag&sort=title','malformed UTF-8 follows browser fragment decoding without changing +');
});

test('an active top tab is a no-op and returning to the library prepares its saved URL before navigation',async()=>{
 const f=fixture();
 await f.context.mySelectTab('works');
 assert.equal(f.hashChanges.length,0);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
 const saved='profile?view=library&section=history&q=%ED%95%9C%EA%B8%80&sort=oldest';f.state.libraryRoute=saved;
 await f.context.mySelectTab('library');
 assert.deepEqual(f.hashChanges,[{hash:'#'+saved,prepared:true}]);assert.equal(f.requests.length,0,'the route transaction owns the read');
 assert.equal(f.state.tab,'works','URL navigation does not independently start a second paint');
 for(const source of ['profile','producer/profile-owner'])for(const section of ['covers','originals']){
  const legacy=fixture();legacy.context.location.hash='#'+source+'?section='+section;legacy.hashChanges.length=0;
  await legacy.context.mySelectTab('works');
  assert.deepEqual(legacy.hashChanges,[{hash:'#profile?view=works',prepared:true}],source+'/'+section);
  assert.equal(legacy.requests.length,0);assert.equal(legacy.writes.length,0);
 }
 for(const route of ['', 'producer/profile-owner?view=library&section=history','profile?view=activity','profile?view=library&section=covers','profile/works?view=library']){
  const invalid=fixture();invalid.state.libraryRoute=route;
  await invalid.context.mySelectTab('library');
  assert.deepEqual(invalid.hashChanges,[{hash:'#profile?view=library&section=likes',prepared:true}],route);
 }
 const initial=fixture(),c=initial.context;
 for(const name of ['myProfileHeader','myMoments','myArtists','myStudioBanner'])c[name]=()=>'';
 const view=await c.myPageView('producer','profile-owner','producer/profile-owner'+saved.slice(saved.indexOf('?')),async()=>profileData('INITIAL'));
 assert.equal(view.mypage.libraryRoute,saved,'an initial own-producer library entry stores a canonical dashboard destination');
 initial.state.libraryRoute=view.mypage.libraryRoute;
 await c.mySelectTab('library');
 assert.deepEqual(initial.hashChanges,[{hash:'#'+saved,prepared:true}]);
});

test('tab loading is local and keeps the dashboard, header, banner and panel elements mounted',async()=>{
 const held=deferred(),f=fixture(kind=>kind==='activity'?held.promise:profileData('NEW'));let visible=0;
 const opening=f.navigate('profile?view=activity',()=>{
  visible++;assert.match(f.content.innerHTML,/불러오는/);assert.match(f.aside.innerHTML,/불러오는/);
  assert.equal(f.main.dataset.route,'profile?view=activity');
 });
 assert.equal(visible,1);assert.equal(f.state.pending,true);assert.equal(f.segment.dataset.active,'activity');
 assert.deepEqual(f.tabs.map(tab=>[tab.dataset.mpTab,tab.getAttribute('aria-selected'),tab.tabIndex]),[['works','false',-1],['library','false',-1],['activity','true',0]]);
 assert.equal(f.content.getAttribute('aria-labelledby'),'mp-tab-activity');assert.match(f.copy.innerHTML,/활동과 기록/);
 assert.equal(f.headerBinds,1);assert.equal(f.window.scrollY,260);assert.equal(f.listeners.get('scroll').size,1);
 held.resolve({label:'CURRENT'});assert.equal(await opening,true);
 assert.match(f.content.innerHTML,/ACTIVITY CURRENT/);assert.match(f.aside.innerHTML,/ACTIVITY ASIDE CURRENT/);
 assert.equal(f.state.loadedTab,'activity');assert.equal(f.state.pending,false);assert.equal(f.content.getAttribute('aria-busy'),undefined);assert.equal(f.timers.size,0);
 assert.equal(f.headerBinds,1,'tab completion must not reinstall header listeners');
});

test('same loaded tabs are handled without rebuilding the shell or repeating successful reads',async()=>{
 const f=fixture();let visible=0;
 assert.equal(await f.navigate('profile?view=works',()=>visible++),true);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
 await f.navigate('profile?view=activity');const painted=f.writes.length,reads=f.requests.length;
 assert.equal(await f.navigate('profile?view=activity',()=>visible++),true);
 assert.equal(f.writes.length,painted);assert.equal(f.requests.length,reads);assert.equal(visible,2);assert.equal(f.events.includes('rerender'),false);
});

test('scrolling works and activity brings the studio banner into view without extending either column',async()=>{
 for(const scale of [1,1.25])for(const tab of ['works','activity']){
  const f=fixture();f.window.scrollY=0;f.window.innerHeight=900;
  const layout=scrollingLayout(f,{scale});
  if(tab==='activity')await f.navigate('profile?view=activity');
  const documentHeight=Math.max(f.content.offsetHeight*scale,layout.studioTop()+190-650);
  let previousTop=layout.studioTop();
  for(const y of [100,300,600,900]){
   layout.scroll(y);
   assert.ok(layout.studioTop()<previousTop,`${tab}, scale ${scale}: the banner must move upward when scrolling down`);
   assert.ok(layout.studioTop()<f.window.innerHeight,`${tab}: the banner must be reachable`);
   assert.equal(f.content.offsetHeight,layout.heights.content,'scrolling must not lengthen the main column');
   assert.equal(f.aside.offsetHeight,layout.heights.aside,'scrolling must not lengthen the area before the banner');
   assert.equal(Math.max(f.content.offsetHeight*scale,layout.studioTop()+y+190-650),documentHeight);
   previousTop=layout.studioTop();
  }
 }
});

test('long-to-short tab changes retain the viewport, then scrolling only releases the reserved height',async()=>{
 for(const scale of [1,1.25]){
  const held=deferred(),f=fixture(()=>held.promise);
  f.window.scrollY=600;f.window.innerHeight=900;
  const layout=scrollingLayout(f,{scale,contentHeight:1600,asideHeight:900});
  const opening=f.navigate('profile?view=activity');
  assert.equal(f.content.offsetHeight,1600,'the loader must retain the old content height');
  layout.heights.content=320;layout.heights.aside=180;
  held.resolve({label:'SHORT'});await opening;
  assert.equal(f.window.scrollY,600,'replacing a long tab must not reset the viewport');
  assert.ok(f.content.getBoundingClientRect().top+f.content.offsetHeight*scale>=900,'the shorter tab must support the current viewport');
  const retained=[f.content.style.minHeight,f.aside.style.minHeight];
  layout.scroll(900);
  assert.deepEqual([f.content.style.minHeight,f.aside.style.minHeight],retained,'downward scrolling must not grow a previous height reservation');
  assert.ok(layout.studioTop()<900,'the studio banner must enter the viewport after a tab change');
  layout.scroll(100);
  for(const [index,node] of [f.content,f.aside].entries())assert.ok(parseFloat(node.style.minHeight)<parseFloat(retained[index]),'upward scrolling releases excess space');
  layout.scroll(0);
  assert.equal(f.content.style.minHeight,'');assert.equal(f.aside.style.minHeight,'');
 }
});

test('works reuse their account data before thirty seconds and read afresh at the exact boundary',async()=>{
 const f=fixture();await f.navigate('profile?view=activity');f.advance(29999);
 await f.navigate('profile');assert.match(f.content.innerHTML,/WORKS main ORIGINAL/);assert.equal(f.requests.filter(request=>request.kind==='works').length,0);
 f.advance(1);await f.navigate('profile');
 assert.match(f.content.innerHTML,/WORKS main REFRESHED/);
 const reads=f.requests.filter(request=>request.kind==='works');assert.equal(reads.length,1);assert.equal(reads[0].details.options.fresh,true);
 assert.equal(f.state.worksUntil,f.now+30000);assert.equal(f.state.worksRevision,0);assert.equal(f.headerBinds,1);
});

test('a mutation revision invalidates works without remounting the account shell',async()=>{
 const f=fixture();f.context.apiRevision++;
 assert.equal(await f.navigate('profile'),true);assert.equal(f.requests.length,1);assert.equal(f.requests[0].kind,'works');assert.match(f.content.innerHTML,/REFRESHED/);
 assert.equal(f.state.worksRevision,1);assert.equal(f.state.loadedRevision,1);assert.equal(f.events.includes('rerender'),false);assert.equal(f.headerBinds,1);
 f.context.me={id:'other'};const painted=f.writes.length;
 assert.equal(await f.navigate('profile?view=activity'),false);assert.equal(f.writes.length,painted);assert.equal(f.requests.length,1);
});

test('works resolve a missing profile ID before loading the authenticated dashboard',async()=>{
 const f=fixture((kind,path)=>path==='/api/me/profile'?{profile:{id:'created-profile',user_id:'owner'}}:{...profileData('CREATED'),profile:{id:'created-profile',user_id:'owner'}});
 f.state.d.profile.id=null;f.state.worksUntil=0;
 await f.navigate('profile');
 assert.deepEqual(f.requests.map(request=>request.path),['/api/me/profile','/api/producers/created-profile?dashboard=1&work_list=1']);
 assert.ok(f.requests.every(request=>request.details.options.fresh));assert.match(f.content.innerHTML,/CREATED/);
});

test('a superseded profile-ID lookup cannot start its second dashboard request',async()=>{
 const held=deferred(),f=fixture((kind,path)=>path==='/api/me/profile'?held.promise:{label:'ACTIVE'});
 f.state.d.profile.id=null;f.state.worksUntil=0;
 const obsolete=f.navigate('profile');await flush();await f.navigate('profile?view=activity');
 held.resolve({profile:{id:'OLD PROFILE'}});await obsolete;
 assert.equal(f.requests.filter(request=>request.kind==='works').length,1);assert.match(f.content.innerHTML,/ACTIVITY ACTIVE/);assert.equal(f.timers.size,0);
});

test('rapid top-tab round trips ignore late activity data and keep the saved library search route',async()=>{
 const old=deferred();let activityReads=0;
 const f=fixture(kind=>kind==='activity'?(++activityReads===1?old.promise:{label:'CURRENT'}):kind==='library'?libraryData('LIBRARY'):profileData('WORKS'));
 const obsolete=f.navigate('profile?view=activity');await flush();
 const library='profile?view=library&section=playlists&q=playlist&sort=title';
 await f.navigate(library);await f.navigate('profile');await f.navigate('profile?view=activity');
 const painted=f.writes.length;old.resolve({label:'OBSOLETE'});await obsolete;
 assert.equal(f.writes.length,painted);assert.match(f.content.innerHTML,/ACTIVITY CURRENT/);assert.equal(f.state.libraryRoute,library);assert.equal(f.timers.size,0);
 assert.equal(f.headerBinds,1);assert.equal(f.listeners.get('scroll').size,1);
});

test('late success and failure cannot paint after account, route, root or state identity changes',async()=>{
 for(const change of ['account','route','detach','state'])for(const failed of [false,true]){
  const held=deferred(),f=fixture(()=>held.promise);const opening=f.navigate('profile?view=activity');await flush();
  if(change==='account')f.context.me={id:'another'};
  else if(change==='route'){f.context.location.hash='#home';f.context.renderId++;}
  else if(change==='detach')f.content.isConnected=false;
  else vm.runInContext('myPageState=null',f.context);
  const painted=f.writes.length;
  if(failed)held.reject(Error('OLD ERROR'));else held.resolve({label:'OLD ACCOUNT'});
  await opening;assert.equal(f.writes.length,painted,change+'/'+failed);assert.equal(f.timers.size,0);
 }
});

test('changed revisions restart stale loads while authorization errors remain local and retryable',async()=>{
 for(const outcome of ['success','error',401,403]){
  const held=deferred(),f=fixture(()=>held.promise);const opening=f.navigate('profile?view=activity');await flush();f.context.apiRevision++;
  if(outcome==='success')held.resolve({label:'STALE'});
  else held.reject(Object.assign(Error('<permission changed>'),typeof outcome==='number'?{status:outcome}:{}));
  await opening;
  if(typeof outcome==='number'){
   assert.equal(f.events.includes('rerender'),false);assert.match(f.content.innerHTML,/role="alert"/);assert.match(f.content.innerHTML,/&lt;permission changed&gt;/);assert.match(f.content.innerHTML,/data-mp-tab-retry="activity"/);assert.equal(f.state.loadedTab,null);
  }else{assert.equal(f.events.filter(event=>event==='rerender').length,1);assert.doesNotMatch(f.content.innerHTML,/STALE|permission changed/);}
  assert.equal(f.timers.size,0);
 }
});

test('failed works are not cached and the next same-tab visit retries successfully',async()=>{
 let reads=0;const f=fixture(async()=>{if(++reads===1)throw Error('works unavailable');return profileData('RECOVERED');});f.state.worksUntil=0;
 await f.navigate('profile');assert.match(f.content.innerHTML,/data-mp-tab-retry="works"/);assert.equal(f.state.loadedTab,null);assert.equal(f.state.worksUntil,0);
 await f.navigate('profile');assert.equal(reads,2);assert.match(f.content.innerHTML,/RECOVERED/);assert.equal(f.state.loadedTab,'works');assert.equal(f.state.worksUntil,f.now+30000);
});

test('local timeout settles navigation, exposes retry and ignores its late response',async()=>{
 const held=deferred();let reads=0;
 const f=fixture(()=>++reads===1?held.promise:{label:'RECOVERED'});
 let settled=false;const opening=f.navigate('profile?view=activity').then(result=>{settled=true;return result;});await flush();
 assert.equal(f.fire(20000),1);await flush();assert.equal(settled,true,'a never-ending network request must not keep navigation pending');
 assert.match(f.content.innerHTML,/data-mp-tab-retry="activity"/);assert.equal(f.state.pending,false);assert.equal(f.state.loadedTab,null);
 const button={dataset:{mpTabRetry:'activity'},hasAttribute:()=>false};
 const target={closest:selector=>selector.includes('[data-mp-tab-retry]')?button:null};
 for(const handler of f.handlers.get('click')||[])await handler({target,preventDefault(){}});
 await flush();assert.equal(reads,2);assert.match(f.content.innerHTML,/ACTIVITY RECOVERED/);
 const painted=f.writes.length;held.resolve({label:'TOO LATE'});await opening;await flush();
 assert.equal(f.writes.length,painted);assert.match(f.content.innerHTML,/RECOVERED/);assert.equal(f.timers.size,0);
});

test('dashboard cleanup releases its scroll listener and invalidates pending tab work',async()=>{
 const held=deferred(),f=fixture(()=>held.promise);const opening=f.navigate('profile?view=activity');await flush();
 assert.equal(f.listeners.get('scroll').size,1);f.cleanup();assert.equal(f.listeners.get('scroll').size,0);
 const painted=f.writes.length;held.resolve({label:'OLD ROUTE'});await opening;assert.equal(f.writes.length,painted);assert.equal(f.timers.size,0);
});

test('an explicit profile mutation invalidates tab retention and pending work before rebuilding shared sections',async()=>{
 const held=deferred(),f=fixture(()=>held.promise);const opening=f.navigate('profile?view=activity');await flush();
 const request=f.state.request,painted=f.writes.length;
 f.context.render=()=>{
  assert.equal(vm.runInContext('myPageState',f.context),null,'gallery/artist changes must reach the full profile renderer');
  assert.equal(f.context.canRefreshMyPageRoute('profile?view=activity'),false);
  f.events.push('profile-refresh');return Promise.resolve('FRESH PROFILE');
 };
 assert.equal(await f.context.refreshMyPageProfile(),'FRESH PROFILE');assert.equal(f.state.request,request+1);
 assert.equal(f.events.filter(event=>event==='profile-refresh').length,1);
 held.resolve({label:'PRE-MUTATION ACTIVITY'});await opening;
 assert.equal(f.writes.length,painted,'old tab data cannot overwrite the newly requested profile');assert.equal(f.timers.size,0);
});

test('activity reads all four live account sources on every visit',async()=>{
 const calls=[],c=helpers(),read=async(path,method,body,options)=>{calls.push({path,method,body,options});return {path,visit:calls.length};};
 const expected=['/api/gold/balance','/api/me/player','/api/me/profile?section=activity','/api/me/gift-inventory'];
 const first=await c.myActivityData(read),second=await c.myActivityData(read);
 assert.deepEqual(calls.slice(0,4).map(call=>call.path),expected);assert.deepEqual(calls.slice(4).map(call=>call.path),expected);
 for(const call of calls){assert.equal(call.method,'GET');assert.equal(call.body,undefined);assert.equal(call.options.fresh,true);}
 assert.deepEqual(Object.keys(first),['wallet','player','activity','inventory']);assert.equal(second.wallet.visit,5);
});

test('activity preserves ordinary per-section failures but propagates aborted navigation',async()=>{
 const c=helpers();
 const partial=await c.myActivityData(async path=>{if(path==='/api/gold/balance')throw Error('wallet unavailable');return {ok:true};});
 assert.equal(partial.wallet.error,'wallet unavailable');assert.deepEqual(plain(partial.player),{ok:true});
 const abort=Object.assign(Error('obsolete navigation'),{name:'AbortError'});
 await assert.rejects(c.myActivityData(async path=>{if(path==='/api/me/player')throw abort;return {ok:true};}),error=>error===abort);
});

test('activity propagates authorization failures so callers do not cache or repeatedly retry them',async()=>{
 const c=helpers();
 for(const status of [401,403]){
  const error=Object.assign(Error('permission changed'),{status});
  await assert.rejects(c.myActivityData(async path=>{if(path==='/api/me/gift-inventory')throw error;return {ok:true};}),caught=>caught===error);
 }
});
