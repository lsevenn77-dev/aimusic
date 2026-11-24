import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(reduced=false){
 const events=new Map(),globalEvents=new Map(),timers=new Map(),fades=new Map();let serial=0;
 const dots=Array.from({length:3},()=>({setAttribute(k,v){this[k]=v;}}));
 const playButton={setAttribute(k,v){this[k]=v;}};
 const outgoing=[];
 const stageAttributes=new Map();
 const stage={innerHTML:'one',querySelectorAll:()=>outgoing,querySelector:s=>s==='.home-feature-background'?{outerHTML:'<div class="home-feature-background">old-art</div>'}:playButton,append(el){outgoing.push(el);},contains:el=>outgoing.includes(el),setAttribute:(k,v)=>stageAttributes.set(k,v),getAttribute:k=>stageAttributes.get(k),removeAttribute:k=>stageAttributes.delete(k)};
 const feature={querySelectorAll:()=>dots,contains:target=>target===feature,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const root={isConnected:true,innerHTML:'',addEventListener(){},querySelector:s=>s==='.home-feature'?feature:stage};
 const motion={matches:reduced,addEventListener:(n,f)=>globalEvents.set('motion',f),removeEventListener:()=>globalEvents.delete('motion')};
 const document={hidden:false,addEventListener:(n,f)=>globalEvents.set(n,f),removeEventListener:n=>globalEvents.delete(n),createElement:()=>({setAttribute(){},addEventListener(name,fn){this[name]=fn;},remove(){const i=outgoing.indexOf(this);if(i>=0)outgoing.splice(i,1);}})};
 const audioEvents=new Map(),audio={paused:true,ended:false,addEventListener:(n,f)=>audioEvents.set(n,f),removeEventListener:n=>audioEvents.delete(n)};
 const c=nicknameContext({document,audio,current:null,window:{matchMedia:()=>motion,addEventListener:(n,f)=>globalEvents.set(n,f),removeEventListener:n=>globalEvents.delete(n)},setTimeout:(f,delay)=>{assert.ok([5500,850,500].includes(delay));(delay===5500?timers:fades).set(++serial,f);return serial;},clearTimeout:id=>{timers.delete(id);fades.delete(id);},esc:String,icon:n=>n});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);c.releaseHTML=t=>t.id;
 const tracks=['one','two','three'].map(id=>({id,title:id}));
 const mount=list=>c.mountFeatureCarousel(root,list||tracks,{coverflow:true});
 const fire=(name,e={})=>events.get(name)?.(e);
 const advance=()=>{const f=[...timers.values()][0];timers.clear();f?.();};
 return {c,root,stage,feature,dots,motion,document,events,globalEvents,timers,fades,outgoing,mount,fire,advance,audio,audioEvents,playButton};
}
function buttonTarget(button){
 return {closest:selector=>selector==='button'||(selector==='[data-home-app-choose]'&&button.hasAttribute?.('data-home-app-choose'))?button:null};
}

test('carousel rolls at 5.5s, pauses on hover and focus, and cleans up on navigation',()=>{
 const f=setup();f.mount();assert.equal(f.timers.size,1);f.advance();assert.equal(f.stage.innerHTML,'two');assert.equal(f.dots[1]['aria-pressed'],'true');
 f.fire('pointerenter');assert.equal(f.timers.size,0);f.fire('pointerleave');assert.equal(f.timers.size,1);
 f.fire('focusin');assert.equal(f.timers.size,0);f.fire('focusout',{relatedTarget:f.feature});assert.equal(f.timers.size,0);f.fire('focusout',{relatedTarget:null});assert.equal(f.timers.size,1);
 f.globalEvents.get('hashchange')();assert.equal(f.timers.size,0);assert.equal(f.events.size,0);assert.equal(f.globalEvents.size,0);
});

test('swipe wraps slides and reduced motion or a single track never auto-rolls',()=>{
 const f=setup(true);f.mount();assert.equal(f.timers.size,0);
 f.fire('pointerdown',{clientX:180,clientY:20});f.fire('pointerup',{clientX:100,clientY:25});assert.equal(f.stage.innerHTML,'two');
 f.fire('keydown',{key:'ArrowLeft',preventDefault(){}});assert.equal(f.stage.innerHTML,'one');
 f.fire('keydown',{key:'ArrowLeft',preventDefault(){}});assert.equal(f.stage.innerHTML,'three');
 f.mount([{id:'only',title:'Only'}]);assert.equal(f.timers.size,0);assert.doesNotMatch(f.root.innerHTML,/home-feature-arrow|home-feature-pagination/);
});

test('banner playback follows the shared player independently of carousel pause and cleans up',()=>{
 const f=setup();f.mount();f.c.current={id:'one'};f.audio.paused=false;f.audioEvents.get('play')();
 assert.equal(f.playButton.innerHTML,'ui-pause-action');assert.equal(f.playButton['aria-pressed'],'true');assert.equal(f.timers.size,1);
 const toggle={matches:s=>s==='.home-feature-autoplay',hasAttribute:()=>false,setAttribute(){}};
 f.fire('click',{target:buttonTarget(toggle)});assert.equal(f.timers.size,0);assert.equal(f.audio.paused,false);
 f.audio.paused=true;f.audioEvents.get('pause')();assert.equal(f.playButton.innerHTML,'ui-play-action');assert.equal(f.timers.size,0);
 f.audio.paused=false;f.c.current={id:'other'};f.audioEvents.get('play')();assert.equal(f.playButton['aria-pressed'],'false');
 f.globalEvents.get('hashchange')();assert.equal(f.audioEvents.size,0);
});

test('editorial carousel reuses controls and timing without subscribing to or changing music',()=>{
 const f=setup();f.audio.paused=false;f.c.current={id:'music'};
 const cleanup=f.c.mountFeatureCarousel(f.root,[{id:'song',title:'Song'},{id:'dubbing',title:'Dubbing'},{id:'browse',title:'Browse'}],{renderSlide:b=>'tab:'+b.id,label:'Play',previousLabel:'Previous banner',nextLabel:'Next banner',dotsLabel:'Banners',syncAudio:false});
 assert.match(f.root.innerHTML,/aria-label="Play"/);assert.match(f.root.innerHTML,/aria-label="Next banner"/);
 assert.equal(f.audioEvents.size,0);assert.equal(f.timers.size,1);
 f.advance();assert.equal(f.stage.innerHTML,'tab:dubbing');assert.equal(f.audio.paused,false);
 const next={matches:s=>s==='.home-feature-next,[data-home-next]',hasAttribute:()=>false};
 f.fire('click',{target:buttonTarget(next)});assert.equal(f.stage.innerHTML,'tab:browse');
 const dot={matches:()=>false,hasAttribute:n=>n==='data-home-slide',dataset:{homeSlide:'0'}};
 f.fire('click',{target:buttonTarget(dot)});assert.equal(f.stage.innerHTML,'tab:song');
 cleanup();assert.equal(f.timers.size,0);assert.equal(f.audioEvents.size,0);assert.equal(f.audio.paused,false);
});

test('explicit resume starts the timer with pointer and focus still on the rolling control',()=>{
 const f=setup();
 f.c.mountFeatureCarousel(f.root,[{id:'one',title:'One'},{id:'two',title:'Two'}]);
 f.fire('pointerenter',{pointerType:'touch'});assert.equal(f.timers.size,1);
 f.fire('pointerenter',{pointerType:'mouse'});f.fire('focusin');
 const toggle={matches:s=>s==='.home-feature-autoplay',hasAttribute:()=>false,setAttribute(k,v){this[k]=v;}};
 const click=()=>f.fire('click',{target:buttonTarget(toggle)});
 click();assert.equal(f.timers.size,0);assert.equal(toggle['aria-label'],'자동 롤링 재개');
 click();assert.equal(f.timers.size,1);assert.equal(toggle['aria-label'],'자동 롤링 일시정지');
 f.advance();assert.equal(f.stage.innerHTML,'two');
});

test('rapid home changes retain only one inert background and dispose the fallback timer',()=>{
 const f=setup();f.mount();f.advance();assert.equal(f.outgoing.length,1);
 assert.equal(f.outgoing[0].inert,true);assert.equal(f.outgoing[0].innerHTML,'<div class="home-feature-background">old-art</div>');
 f.advance();assert.equal(f.stage.innerHTML,'three');assert.equal(f.outgoing.length,1);assert.equal(f.fades.size,1);
 const fade=[...f.fades.values()][0];f.fades.clear();fade();assert.equal(f.outgoing.length,0);
 f.advance();f.globalEvents.get('hashchange')();assert.equal(f.fades.size,0);assert.equal(f.timers.size,0);
});

test('home touch swipe suppresses the trailing link click and touch entry allows automatic resume',()=>{
 const f=setup();f.mount();f.fire('pointerenter',{pointerType:'touch'});assert.equal(f.timers.size,1);
 f.fire('pointerdown',{clientX:180,clientY:20});f.fire('pointerup',{clientX:100,clientY:20});
 let prevented=false,stopped=false;f.fire('click',{preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(f.stage.innerHTML,'two');
});

test('home and Play banners pause while swiping and block the following link click without coverflow',()=>{
 for(const syncAudio of [true,false]){
  const f=setup();f.c.mountFeatureCarousel(f.root,[{id:'one',title:'One'},{id:'two',title:'Two'}],{syncAudio});
  f.feature.setPointerCapture=pointerId=>f.fire('lostpointercapture',{pointerId,target:{tagName:'A'}});
  f.fire('pointerdown',{pointerId:1,pointerType:'touch',clientX:180,clientY:20});assert.equal(f.timers.size,0);
  f.globalEvents.get('visibilitychange')();assert.equal(f.timers.size,0);
  f.fire('focusin');f.fire('pointermove',{pointerId:1,clientX:100,clientY:25});
  f.fire('pointerup',{pointerId:1,clientX:100,clientY:25});assert.equal(f.stage.innerHTML,'two');assert.equal(f.timers.size,1);
  let prevented=false,stopped=false;
  f.fire('click',{detail:1,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);
  f.fire('pointerdown',{pointerId:2,clientX:100,clientY:20});f.fire('pointerup',{pointerId:2,clientX:180,clientY:20});assert.equal(f.stage.innerHTML,'one');
  f.fire('pointerdown',{pointerId:3,clientX:180,clientY:20});f.fire('pointerup',{pointerId:3,clientX:182,clientY:21});
  f.fire('click',{target:{closest:()=>null},preventDefault(){assert.fail('A normal tap must remain usable');}});
 }
});

test('vertical movement, short gestures, secondary touches and another pointer cannot change a banner',()=>{
 const f=setup();f.c.mountFeatureCarousel(f.root,[{id:'one',title:'One'},{id:'two',title:'Two'}]);
 f.fire('pointerdown',{pointerId:1,clientX:180,clientY:20});
 f.fire('pointermove',{pointerId:1,clientX:175,clientY:50});
 f.fire('pointerup',{pointerId:1,clientX:100,clientY:55});assert.equal(f.stage.innerHTML,'one');
 f.fire('pointerdown',{pointerId:1,clientX:180,clientY:20});f.fire('pointerup',{pointerId:1,clientX:150,clientY:22});assert.equal(f.stage.innerHTML,'one');
 f.fire('pointerdown',{pointerId:1,clientX:180,clientY:20});
 f.fire('pointerup',{pointerId:2,clientX:100,clientY:20});f.fire('pointercancel',{pointerId:2});assert.equal(f.timers.size,0);
 f.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:100,clientY:20});
 f.fire('pointerup',{pointerId:1,clientX:100,clientY:20});assert.equal(f.stage.innerHTML,'one');assert.equal(f.timers.size,1);
});

test('cancelled swipes restart a full interval without overriding manual pause or reduced motion',()=>{
 for(const reduced of [false,true]){
  const f=setup(reduced);f.c.mountFeatureCarousel(f.root,[{id:'one',title:'One'},{id:'two',title:'Two'}]);
  f.fire('pointerdown',{pointerId:1,clientX:180,clientY:20});assert.equal(f.timers.size,0);
  f.fire('pointercancel',{pointerId:1});assert.equal(f.timers.size,reduced?0:1);assert.equal(f.stage.innerHTML,'one');
  f.fire('pointerdown',{pointerId:1,clientX:180,clientY:20});
  f.fire('lostpointercapture',{pointerId:1,target:f.feature});assert.equal(f.timers.size,reduced?0:1);
  const toggle={matches:s=>s==='.home-feature-autoplay',hasAttribute:()=>false,setAttribute(){}};
  f.fire('click',{target:buttonTarget(toggle)});
  f.fire('pointerdown',{pointerId:1,clientX:180,clientY:20});f.fire('pointerup',{pointerId:1,clientX:100,clientY:20});
  assert.equal(f.stage.innerHTML,'two');assert.equal(f.timers.size,0);
  f.globalEvents.get('hashchange')();assert.equal(f.events.size,0);assert.equal(f.globalEvents.size,0);
 }
});

test('banner slide direction follows next/previous through wraparound and dots select the matching banner',()=>{
 const f=setup(),tracks=['one','two','three'].map(id=>({id,title:id}));
 f.c.mountFeatureCarousel(f.root,tracks);
 const next={matches:s=>s==='.home-feature-next,[data-home-next]',hasAttribute:()=>false};
 const previous={matches:s=>s==='.home-feature-prev',hasAttribute:()=>false};
 const select=button=>f.fire('click',{target:buttonTarget(button)});
 for(const id of ['two','three','one']){select(next);assert.equal(f.stage.innerHTML,id);assert.equal(f.stage.getAttribute('data-home-direction'),'next');assert.equal(f.outgoing.length,1);}
 select(previous);assert.equal(f.stage.innerHTML,'three');assert.equal(f.stage.getAttribute('data-home-direction'),'previous');
 const dot={matches:()=>false,hasAttribute:n=>n==='data-home-slide',dataset:{homeSlide:'1'}};
 select(dot);assert.equal(f.stage.innerHTML,'two');assert.equal(f.dots[1]['aria-pressed'],'true');assert.equal(f.stage.getAttribute('data-home-direction'),'previous');
 const outgoing=f.outgoing[0];select(dot);assert.equal(f.outgoing[0],outgoing);assert.equal(f.outgoing.length,1);
});

test('rapid banner transitions ignore stale and child animation completions and clear after the latest transition',()=>{
 const f=setup();f.c.mountFeatureCarousel(f.root,['one','two','three'].map(id=>({id,title:id})),{syncAudio:false});
 f.advance();const stale=f.outgoing[0],staleFallback=[...f.fades.values()][0];assert.equal(stale.innerHTML,'one');assert.equal(stale.inert,true);
 f.advance();const latest=f.outgoing[0];assert.equal(latest.innerHTML,'two');assert.equal(f.stage.innerHTML,'three');assert.equal(f.outgoing.length,1);
 stale.animationend({target:stale});staleFallback();latest.animationend({target:{}});
 assert.equal(f.outgoing.length,1);assert.equal(f.stage.getAttribute('data-home-direction'),'next');assert.equal(f.fades.size,1);
 latest.animationend({target:latest});assert.equal(f.outgoing.length,0);assert.equal(f.stage.getAttribute('data-home-direction'),undefined);assert.equal(f.fades.size,0);
 f.advance();const fallback=[...f.fades.values()][0];fallback();assert.equal(f.outgoing.length,0);assert.equal(f.fades.size,0);
});

test('motion reduction and navigation dispose an active sliding banner without leaving an old scene',()=>{
 const f=setup();f.c.mountFeatureCarousel(f.root,[{id:'one',title:'One'},{id:'two',title:'Two'}]);
 f.advance();assert.equal(f.outgoing.length,1);
 f.motion.matches=true;f.globalEvents.get('motion')();assert.equal(f.outgoing.length,0);assert.equal(f.fades.size,0);assert.equal(f.timers.size,0);assert.equal(f.stage.getAttribute('data-home-direction'),undefined);
 f.motion.matches=false;f.globalEvents.get('motion')();f.advance();assert.equal(f.outgoing.length,1);
 f.globalEvents.get('hashchange')();assert.equal(f.outgoing.length,0);assert.equal(f.fades.size,0);assert.equal(f.timers.size,0);assert.equal(f.events.size,0);
});

test('the app-store chooser opens on a normal click and preserves the current music playback',()=>{
 const f=setup(),opened=[];f.c.dialog=html=>opened.push(html);f.audio.paused=false;
 const chooser={hasAttribute:name=>name==='data-home-app-choose',matches:()=>false};
 f.c.mountFeatureCarousel(f.root,[{id:'app-download',title:'앱 다운로드'},{id:'studio',title:'스튜디오'}],{syncAudio:false});
 f.fire('click',{target:buttonTarget(chooser),detail:1,preventDefault(){},stopPropagation(){}});
 assert.equal(opened.length,1);assert.match(opened[0],/apps\.apple\.com\/kr\/app\/id6819654764/);
 assert.match(opened[0],/play\.google\.com\/store\/apps\/details\?id=kr\.co\.aifect\.app/);
 assert.equal(f.audio.paused,false);assert.equal(f.audioEvents.size,0);
});

test('swiping across the app campaign suppresses the trailing chooser click but keyboard activation still works',()=>{
 for(const detail of [1,0]){
  const f=setup(),opened=[];f.c.dialog=html=>opened.push(html);
  const chooser={hasAttribute:name=>name==='data-home-app-choose',matches:()=>false};
  f.c.mountFeatureCarousel(f.root,[{id:'app-download',title:'앱 다운로드'},{id:'studio',title:'스튜디오'}],{syncAudio:false});
  f.fire('pointerdown',{pointerId:1,pointerType:'touch',clientX:220,clientY:30});
  f.fire('pointermove',{pointerId:1,pointerType:'touch',clientX:120,clientY:32});
  f.fire('pointerup',{pointerId:1,pointerType:'touch',clientX:120,clientY:32});
  let stopped=false;
  f.fire('click',{target:buttonTarget(chooser),detail,preventDefault(){},stopPropagation(){stopped=true;}});
  assert.equal(opened.length,detail===0?1:0,'only a fresh keyboard activation may bypass swipe-click suppression');
  if(detail===1)assert.equal(stopped,true);
  assert.equal(f.stage.innerHTML,'studio');
 }
});

test('a normal explicit store-link click is left to browser navigation while a trailing swipe click is blocked',()=>{
 const f=setup();f.c.dialog=()=>assert.fail('an explicit store link must not open the platform chooser');
 f.c.mountFeatureCarousel(f.root,[{id:'app-download',title:'앱 다운로드'},{id:'studio',title:'스튜디오'}],{syncAudio:false});
 const target={closest:()=>null};let prevented=false;
 f.fire('click',{target,detail:1,preventDefault(){prevented=true;}});
 assert.equal(prevented,false,'the native HTTPS anchor action must remain available');
 f.fire('pointerdown',{pointerId:1,pointerType:'touch',clientX:220,clientY:30});
 f.fire('pointermove',{pointerId:1,pointerType:'touch',clientX:120,clientY:32});
 f.fire('pointerup',{pointerId:1,pointerType:'touch',clientX:120,clientY:32});
 f.fire('click',{target,detail:1,preventDefault(){prevented=true;},stopPropagation(){}});
 assert.equal(prevented,true,'a swipe must never leave the site via its trailing click');
});
