import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
 let now=0,serial=0,page;
 const timers=new Map(),globalEvents=new Map();
 const eventTarget=()=>({events:new Map(),addEventListener(n,f){const list=this.events.get(n)||new Set();list.add(f);this.events.set(n,list);},removeEventListener(n,f){this.events.get(n)?.delete(f);},fire(n,e={}){for(const f of [...(this.events.get(n)||[])])f(e);}});
 const document=Object.assign(eventTarget(),{hidden:false,querySelector:()=>page,createElement:()=>({setAttribute(){},addEventListener(){},remove(){this.parent?.outgoing.splice(this.parent.outgoing.indexOf(this),1);}})});
 const window=Object.assign(eventTarget(),{matchMedia:()=>({matches:false,addEventListener:(n,f)=>globalEvents.set(n,f),removeEventListener:n=>globalEvents.delete(n)})});
 const location={hash:'#home'};
 const context=vm.createContext({document,window,location,URLSearchParams,esc:String,icon:String,dubbingCastingKinds:[['original','Original']],setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:now+delay,delay});return id;},clearTimeout:id=>timers.delete(id)});
 for(const file of ['home.js','play-page.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),context);
 function root(){
  const stage={innerHTML:'',outgoing:[],querySelectorAll(){return this.outgoing.slice();},append(el){el.parent=this;this.outgoing.push(el);},contains(el){return this.outgoing.includes(el);},setAttribute(){},removeAttribute(){}};
  const feature=Object.assign(eventTarget(),{querySelectorAll:()=>banner.dots,contains:()=>false});
  const banner={isConnected:true,dots:[],stage,feature,addEventListener(){},querySelector:s=>s==='.home-feature'?feature:stage,
   set innerHTML(html){this.html=html;stage.innerHTML=html.split('<div class="home-feature-stage">')[1].split('<button class="home-feature-arrow home-feature-next"')[0];this.dots=[...html.matchAll(/data-home-slide="(\d+)"[^>]*aria-pressed="(true|false)"/g)].map(m=>({index:Number(m[1]),pressed:m[2],setAttribute(k,v){if(k==='aria-pressed')this.pressed=v;}}));},
   replaceWith(other){this.isConnected=false;page.banner=other;other.isConnected=true;}
  };
  return {isConnected:true,banner,querySelector:()=>page.banner};
 }
 function open(mode){
  vm.runInContext('playBannerCleanup?.()',context);
  if(page){page.isConnected=false;page.banner.isConnected=false;}
  location.hash=mode==='song'?'#karaoke':'#karaoke/'+mode;
  page=root();context.bindPlayBanner({mode},page);return page.banner;
 }
 function resolveList(mode){
  page.isConnected=false;page.banner.isConnected=false;page=root();context.bindPlayBanner({mode},page);return page.banner;
 }
 function tick(ms){
  const end=now+ms;
  while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;const [id,timer]=next;now=timer.at;timers.delete(id);timer.fn();}
  now=end;
 }
 const current=()=>page.banner.stage.innerHTML.match(/data-play-banner="([^"]+)"/)[1];
 const pressed=()=>page.banner.dots.filter(d=>d.pressed==='true').map(d=>d.index);
 const rolling=()=>[...timers.values()].filter(t=>t.delay===4000);
 const navigate=hash=>{location.hash=hash;window.fire('hashchange');};
 return {context,window,document,timers,globalEvents,open,resolveList,navigate,tick,current,pressed,rolling,get banner(){return page.banner;}};
}

for(const [mode,sequence] of Object.entries({song:['song','dubbing','browse','song'],dubbing:['dubbing','browse','song','dubbing'],browse:['browse','song','dubbing','browse']})){
 test(mode+' starts by data ID and rolls every four seconds without changing the selected tab',()=>{
  const f=setup(),selection={mode},banner=f.open(mode);
  for(const id of sequence){
   assert.equal(f.current(),id);assert.deepEqual(f.pressed(),[['song','dubbing','browse'].indexOf(id)]);assert.equal(f.rolling().length,1);
   f.tick(3999);assert.equal(f.current(),id);f.tick(1);
  }
  assert.equal(selection.mode,mode);assert.equal(f.banner,banner);
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

test('Play tab history retains the live banner, handlers and original roll deadline until leaving Play',()=>{
 const f=setup(),banner=f.open('song');f.tick(3500);
 // Initial pending/complete rendering may move this same banner to a new shell.
 assert.equal(f.resolveList('song'),banner);
 const timers=[...f.timers],handlers=[...banner.feature.events].map(([name,list])=>[name,[...list]]);
 for(const hash of ['#karaoke/duets','#karaoke/latest','#karaoke/drafts','#karaoke/dubbing?tab=discover','#karaoke/dubbing?tab=join','#karaoke/browse?tab=recommended&type=all','#karaoke']){
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
