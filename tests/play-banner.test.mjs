import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(reduced=false){
 let now=0,serial=0,page;
 const timers=new Map(),globalEvents=new Map(),routeCleanups=[];
 class Element {}
 class HTMLAnchorElement extends Element {}
 class HTMLButtonElement extends Element {}
 class HTMLImageElement extends Element {}
 const eventTarget=()=>({events:new Map(),addEventListener(n,f){const list=this.events.get(n)||new Set();list.add(f);this.events.set(n,list);},removeEventListener(n,f){this.events.get(n)?.delete(f);},fire(n,e={}){for(const f of [...(this.events.get(n)||[])])f(e);}});
 const document=Object.assign(eventTarget(),{hidden:false,querySelector:()=>page,createElement:()=>({setAttribute(){},addEventListener(){},remove(){this.parent?.outgoing.splice(this.parent.outgoing.indexOf(this),1);}})});
 const window=Object.assign(eventTarget(),{matchMedia:()=>({matches:reduced,addEventListener:(n,f)=>globalEvents.set(n,f),removeEventListener:n=>globalEvents.delete(n)})});
 const location={hash:'#home'};
 const context=vm.createContext({document,window,location,URLSearchParams,Element,HTMLAnchorElement,HTMLButtonElement,HTMLImageElement,esc:String,icon:String,dubbingCastingKinds:[['original','Original']],bindDubbingCasting(){},registerRouteCleanup:fn=>routeCleanups.push(fn),setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:now+delay,delay});return id;},clearTimeout:id=>timers.delete(id)});
 for(const file of ['home.js','play-page.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 function root(){
  const stage={innerHTML:'',outgoing:[],querySelectorAll(){return this.outgoing.slice();},append(el){el.parent=this;this.outgoing.push(el);},contains(el){return this.outgoing.includes(el);},setAttribute(){},removeAttribute(){}};
  const feature=Object.assign(eventTarget(),{hovered:false,querySelectorAll:()=>banner.dots,contains:target=>target===feature,matches:selector=>selector===':hover'&&feature.hovered});
  const banner={isConnected:true,dots:[],stage,feature,addEventListener(){},querySelector:s=>s==='.home-feature'?feature:stage,
   set innerHTML(html){this.html=html;stage.innerHTML=html.split('<div class="home-feature-stage">')[1].split('<button class="home-feature-arrow home-feature-next"')[0];this.dots=[...html.matchAll(/data-home-slide="(\d+)"[^>]*aria-pressed="(true|false)"/g)].map(m=>({index:Number(m[1]),pressed:m[2],setAttribute(k,v){if(k==='aria-pressed')this.pressed=v;}}));},
   replaceWith(other){this.isConnected=false;page.banner=other;other.isConnected=true;}
  };
  return Object.assign(eventTarget(),{isConnected:true,banner,dataset:{},querySelector:s=>s==='#play-banner'?page.banner:null,querySelectorAll:()=>[]});
 }
 function bind(mode,pending=false){
  const play={...context.playRouteSelection(location.hash),mode};
  context.bindPlay({play,raw:location.hash.slice(1),pending,items:[],tracks:[],nextOffset:null});
 }
 function cleanup(){
  routeCleanups.splice(0).forEach(fn=>fn());
  vm.runInContext('playBannerCleanup?.()',context);
 }
 function open(mode){
  cleanup();
  if(page){page.isConnected=false;page.banner.isConnected=false;}
  location.hash=mode==='song'?'#karaoke':'#karaoke/'+mode;
  page=root();bind(mode,true);return page.banner;
 }
 function resolveList(mode){
  page.isConnected=false;page.banner.isConnected=false;page=root();bind(mode);return page.banner;
 }
 function tick(ms){
  const end=now+ms;
  while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;const [id,timer]=next;now=timer.at;timers.delete(id);timer.fn();}
  now=end;
 }
 const current=()=>page.banner.stage.innerHTML.match(/data-play-banner="([^"]+)"/)[1];
 const pressed=()=>page.banner.dots.filter(d=>d.pressed==='true').map(d=>d.index);
 const rolling=()=>[...timers.values()].filter(t=>t.delay===4000);
 const navigate=hash=>{
  location.hash=hash;window.fire('hashchange');
  const play=context.playRouteSelection(hash);
  if(play)bind(play.mode,true);else cleanup();
 };
 const clickTab=(mode,properties={},main=true)=>{
  const link=new HTMLAnchorElement(),target=new Element();
  link.getAttribute=name=>name==='href'?context.playHref(mode):null;
  target.closest=selector=>main&&selector==='.play-main-tabs a[role="tab"]'?link:null;
  const event={target,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...properties};
  page.fire('click',event);return event;
 };
 return {context,window,document,timers,globalEvents,open,bind,resolveList,navigate,clickTab,tick,current,pressed,rolling,get banner(){return page.banner;},get page(){return page;}};
}

for(const [mode,sequence] of Object.entries({song:['song','dubbing','browse','song'],dubbing:['dubbing','browse','song','dubbing'],browse:['browse','song','dubbing','browse']})){
 test(mode+' starts by data ID and rolls every four seconds without changing the selected tab',()=>{
  const f=setup(),selection={mode},banner=f.open(mode);
  for(const id of sequence){
   assert.equal(f.current(),id);assert.deepEqual(f.pressed(),[['song','dubbing','browse'].indexOf(id)]);assert.equal(f.rolling().length,1);
   f.tick(3999);assert.equal(f.current(),id);f.tick(1);
  }
  assert.equal(selection.mode,mode);assert.equal(f.page._playView.play.mode,mode);assert.equal(f.banner,banner);
 });
}

test('pending tab shells select the matching tab and resolving a list keeps banner, dots and deadline',()=>{
 const f=setup();
 for(const mode of ['song','dubbing','browse']){
  const pending=f.context.playPendingView('karaoke',mode==='song'?undefined:mode,'karaoke/'+mode);
  assert.equal(pending.play.mode,mode);assert.match(pending.html,new RegExp('data-play-mode="'+mode+'"'));assert.match(pending.html,/불러오는 중/);
  const banner=f.open(mode);f.tick(3500);assert.equal(f.resolveList(mode),banner);f.tick(499);assert.equal(f.current(),mode);f.tick(1);assert.notEqual(f.current(),mode);
  const rolled=f.current();assert.equal(f.resolveList(mode),banner);assert.equal(f.current(),rolled,'a slow response must not rewind an already rolled banner');
 }
 assert.equal(f.context.playPendingView('home',null,'home'),null);assert.equal(f.context.playPendingView('karaoke','chart','karaoke/chart'),null);
});

test('explicit page remounts dispose previous clocks and transition layers, including near a deadline',()=>{
 const f=setup();f.open('song');f.tick(3999);
 for(let i=0;i<30;i++){
  const mode=['dubbing','browse','song'][i%3],old=f.banner;f.open(mode);assert.equal(f.current(),mode);assert.equal(f.rolling().length,1);assert.equal(old.feature.events.get('pointerup')?.size||0,0);f.tick(1);assert.equal(f.current(),mode);
 }
 f.tick(3998);assert.equal(f.current(),'song');f.tick(1);assert.equal(f.current(),'dubbing');
 f.navigate('#home');assert.equal(f.timers.size,0);assert.equal(f.banner.stage.outgoing.length,0);assert.equal(f.globalEvents.size,0);
 vm.runInContext('playBannerCleanup?.()',f.context);assert.equal(vm.runInContext('playBannerElement',f.context),null);
});

test('Play subtab history retains the live banner, handlers and original roll deadline until leaving Play',()=>{
 const f=setup(),banner=f.open('song');f.tick(3500);
 // Initial pending/complete rendering may move this same banner to a new shell.
 assert.equal(f.resolveList('song'),banner);
 const timers=[...f.timers],handlers=[...banner.feature.events].map(([name,list])=>[name,[...list]]);
 for(const hash of ['#karaoke/duets','#karaoke/latest','#karaoke/drafts','#karaoke']){
  f.navigate(hash);
  assert.equal(f.banner,banner);assert.equal(f.current(),'song');assert.deepEqual(f.pressed(),[0]);
  assert.deepEqual([...f.timers],timers,'tab history must not replace the running timer');
  assert.deepEqual([...banner.feature.events].map(([name,list])=>[name,[...list]]),handlers);
 }
 f.tick(499);assert.equal(f.current(),'song');f.tick(1);assert.equal(f.current(),'dubbing');
 const transitionTimers=[...f.timers],outgoing=banner.stage.outgoing[0];
 f.navigate('#karaoke/duets');
 assert.deepEqual([...f.timers],transitionTimers);assert.equal(banner.stage.outgoing[0],outgoing);
 f.tick(3999);assert.equal(f.current(),'dubbing');f.tick(1);assert.equal(f.current(),'browse');
 f.navigate('#home');
 assert.equal(f.timers.size,0);assert.equal(banner.stage.outgoing.length,0);assert.equal(f.globalEvents.size,0);
 assert.equal(f.window.events.get('hashchange')?.size||0,0);
 assert.equal(f.document.events.get('visibilitychange')?.size||0,0);
 for(const listeners of banner.feature.events.values())assert.equal(listeners.size,0);
});

test('top tab clicks select the matching banner immediately and start a full interval before list loading',()=>{
 const f=setup(),banner=f.open('song');
 const handlers=[...banner.feature.events].map(([name,list])=>[name,[...list]]);
 f.tick(3999);
 for(const [mode,next] of [['dubbing','browse'],['browse','song'],['song','dubbing']]){
  const event=f.clickTab(mode);
  assert.equal(event.defaultPrevented,false,'native tab navigation remains available');
  assert.equal(f.current(),mode);assert.deepEqual(f.pressed(),[['song','dubbing','browse'].indexOf(mode)]);
  const deadline=f.rolling()[0];
  f.navigate(f.context.playHref(mode));
  assert.equal(f.rolling()[0],deadline,'route binding must not restart the click deadline');
  f.tick(3500);f.bind(mode);
  assert.equal(f.rolling()[0],deadline,'settling the list must not restart the click deadline');
  f.tick(499);assert.equal(f.current(),mode);f.tick(1);assert.equal(f.current(),next);
  assert.equal(f.page._playView.play.mode,mode,'automatic rolling cannot switch the content tab');
  assert.equal(f.banner,banner);assert.equal(f.rolling().length,1);
  assert.deepEqual([...banner.feature.events].map(([name,list])=>[name,[...list]]),handlers);
 }
});

test('reselecting the active top tab rewinds a rolled banner without needing a hash change',()=>{
 const f=setup();f.open('song');f.tick(7999);assert.equal(f.current(),'dubbing');
 const route=f.context.location.hash;
 f.clickTab('song',{detail:0});assert.equal(f.current(),'song');assert.equal(f.context.location.hash,route);
 f.tick(3999);assert.equal(f.current(),'song');
 f.clickTab('song');f.tick(3999);assert.equal(f.current(),'song');f.tick(1);assert.equal(f.current(),'dubbing');
 const deadline=f.rolling()[0];f.bind('song');assert.equal(f.current(),'dubbing');assert.equal(f.rolling()[0],deadline);
});

test('a top tab click releases an abandoned banner gesture and rolls from the requested slide',()=>{
 const f=setup();f.open('song');f.tick(3999);
 f.banner.feature.fire('pointerdown',{pointerId:1,pointerType:'touch',clientX:180,clientY:30});
 assert.equal(f.rolling().length,0);
 // The original target can disappear before pointerup/cancel reaches it.
 // A later external tab click is a new interaction, not that unfinished swipe.
 f.clickTab('dubbing');f.navigate(f.context.playHref('dubbing'));
 assert.equal(f.current(),'dubbing');assert.equal(f.rolling().length,1);
 f.tick(3999);assert.equal(f.current(),'dubbing');f.tick(1);assert.equal(f.current(),'browse');
});

test('active top-tab reselection reconciles stale banner hover and focus with the current DOM',()=>{
 for(const reason of ['hover','focus','both']){
  const f=setup();f.open('song');f.tick(3999);
  if(reason!=='focus')f.banner.feature.fire('pointerenter',{pointerType:'mouse'});
  if(reason!=='hover')f.banner.feature.fire('focusin');
  assert.equal(f.rolling().length,0);
  // No pointerleave/focusout was delivered, but the pointer and active element
  // are now outside the carousel. Selecting its existing ID must recover too.
  assert.equal(f.banner.feature.matches(':hover'),false);
  assert.equal(f.banner.feature.contains(f.document.activeElement),false);
  f.clickTab('song');assert.equal(f.current(),'song');assert.equal(f.rolling().length,1,reason);
  f.tick(3999);assert.equal(f.current(),'song');f.tick(1);assert.equal(f.current(),'dubbing');
 }
});

test('mode history and rapid top-tab changes reuse one carousel and leave only one live clock',()=>{
 const f=setup(),banner=f.open('song');f.tick(3999);
 // Back/forward and direct route changes have no preceding top-tab click.
 f.navigate('#karaoke/browse?tab=latest&type=duet');assert.equal(f.current(),'browse');
 f.tick(3999);assert.equal(f.current(),'browse');f.tick(1);assert.equal(f.current(),'song');
 const deadline=f.rolling()[0];f.navigate('#karaoke/browse?tab=popular&type=solo');
 assert.equal(f.current(),'song');assert.equal(f.rolling()[0],deadline);
 for(let i=0;i<30;i++){
  const mode=['dubbing','browse','song'][i%3];
  f.clickTab(mode);f.navigate(f.context.playHref(mode));f.bind(mode);
  assert.equal(f.current(),mode);assert.equal(f.banner,banner);assert.equal(f.rolling().length,1);
  assert.ok(banner.stage.outgoing.length<=1);assert.ok(f.timers.size<=2);
  f.tick(1);
 }
 f.tick(3998);assert.equal(f.current(),'song');f.tick(1);assert.equal(f.current(),'dubbing');
 f.navigate('#home');assert.equal(f.timers.size,0);assert.equal(banner.stage.outgoing.length,0);
 assert.equal(vm.runInContext('playBannerMode',f.context),null);
});

test('modified or prevented clicks and lower-level tabs cannot reset the banner or its deadline',()=>{
 const f=setup();f.open('song');f.tick(3500);const deadline=f.rolling()[0];
 for(const properties of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}]){
  f.clickTab('dubbing',properties);assert.equal(f.current(),'song');assert.equal(f.rolling()[0],deadline);
 }
 f.clickTab('dubbing',{},false);assert.equal(f.current(),'song');assert.equal(f.rolling()[0],deadline);
 f.tick(499);assert.equal(f.current(),'song');f.tick(1);assert.equal(f.current(),'dubbing');
});

test('top tab selection preserves manual pause, reduced motion and hidden-page suspension',()=>{
 for(const reason of ['manual','reduced','hidden']){
  const f=setup(reason==='reduced');f.open('song');
  const toggle={matches:s=>s==='.home-feature-autoplay',hasAttribute:()=>false,setAttribute(k,v){this[k]=v;}};
  if(reason==='manual')f.banner.feature.fire('click',{target:{closest:()=>toggle}});
  if(reason==='hidden'){f.document.hidden=true;f.document.fire('visibilitychange');}
  f.clickTab('dubbing');f.navigate(f.context.playHref('dubbing'));
  assert.equal(f.current(),'dubbing');assert.deepEqual(f.pressed(),[1]);assert.equal(f.rolling().length,0,reason);
  f.tick(8000);assert.equal(f.current(),'dubbing',reason);
  if(reason==='manual'){
   assert.equal(toggle['aria-label'],'자동 롤링 재개');
   f.banner.feature.fire('click',{target:{closest:()=>toggle}});
  }else if(reason==='hidden'){f.document.hidden=false;f.document.fire('visibilitychange');}
  else continue;
  f.tick(3999);assert.equal(f.current(),'dubbing');f.tick(1);assert.equal(f.current(),'browse');
 }
});

test('swipes and dots agree with actual banner IDs and restart a complete four-second interval',()=>{
 const f=setup();f.open('dubbing');f.tick(3999);
 const fire=(n,e)=>f.banner.feature.fire(n,e);
 fire('pointerdown',{pointerId:1,pointerType:'touch',clientX:200,clientY:30});assert.equal(f.rolling().length,0);f.tick(1000);assert.equal(f.current(),'dubbing');
 fire('pointermove',{pointerId:1,clientX:80,clientY:34});fire('pointerup',{pointerId:1,clientX:80,clientY:34});assert.equal(f.current(),'browse');assert.deepEqual(f.pressed(),[2]);
 let blocked=0;fire('click',{detail:1,preventDefault(){blocked++;},stopPropagation(){blocked++;}});assert.equal(blocked,2);
 f.tick(3999);assert.equal(f.current(),'browse');f.tick(1);assert.equal(f.current(),'song');
 const dot={matches:()=>false,hasAttribute:n=>n==='data-home-slide',dataset:{homeSlide:'1'}};
 fire('click',{target:{closest:()=>dot}});assert.equal(f.current(),'dubbing');assert.deepEqual(f.pressed(),[1]);
 f.tick(3999);assert.equal(f.current(),'dubbing');f.tick(1);assert.equal(f.current(),'browse');
 fire('pointerdown',{pointerId:2,clientX:80,clientY:30});fire('pointerup',{pointerId:2,clientX:200,clientY:34});assert.equal(f.current(),'dubbing');assert.deepEqual(f.pressed(),[1]);assert.equal(f.rolling().length,1);
});

test('initial ID is resolved from the data rather than a fixed position',()=>{
 const f=setup();vm.runInContext('playBanners.unshift(playBanners.pop())',f.context);
 f.open('dubbing');assert.equal(f.current(),'dubbing');assert.deepEqual(f.pressed(),[2]);f.tick(4000);assert.equal(f.current(),'browse');
});

test('dubbing discovery keeps the shared carousel visible above its main tabs',()=>{
 const f=setup(),page=f.context.playPendingView('karaoke','dubbing','karaoke/dubbing?tab=discover');
 assert.match(page.html,/id="play-banner"[^>]*><\/div>\s*<nav[^>]*play-main-tabs/);
 const css=readFileSync(new URL('../dist/dub-discovery.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/(?:#play-banner|\.play-banner)\b[^{]*\{[^}]*display\s*:\s*none\b/);
});
