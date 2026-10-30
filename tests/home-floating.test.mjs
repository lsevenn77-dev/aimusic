import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function setup(count=7,reduced=false){
 const timers=new Map(),events=new Map(),globals=new Map(),audioEvents=new Map();let serial=0;
 const element=()=>({style:{setProperty(k,v){this[k]=v;}},attrs:{},classList:{toggle(k,v){this[k]=v;},add(k){this[k]=true;}},querySelector:()=>null,replaceChildren(){},append(){},setAttribute(k,v){this.attrs[k]=v;},animate(frames,options){const a={frames,options,playState:'running',pause(){this.playState='paused';},play(){this.playState='running';},cancel(){this.playState='idle';},finish(){if(this.playState==='finished')return;this.playState='finished';this.onfinish?.();}};this.animation=a;return a;}});
 const cards=Array.from({length:count},element),washes=Array.from({length:2},element),dots=Array.from({length:count},element),play=element();
 for(const card of cards)card.firstElementChild=element();
 const stage={...element(),clientWidth:600,children:cards,insertAdjacentHTML(){}},bg={children:washes,querySelector:()=>({children:washes})},copy={...element(),querySelector:()=>play};
 const feature={...element(),querySelector:s=>s==='.home-feature-covers'?stage:s==='.home-feature-copy'?copy:bg,querySelectorAll:()=>dots,contains:()=>false,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const root={isConnected:true,addEventListener(){},querySelector:()=>feature};
 const motion={matches:reduced,addEventListener:(n,f)=>globals.set('motion',f),removeEventListener:()=>globals.delete('motion')};
 const document={hidden:false,createElement:()=>({content:{querySelector:()=>({innerHTML:'copy'})}}),addEventListener:(n,f)=>globals.set(n,f),removeEventListener:n=>globals.delete(n)};
 const audio={paused:true,addEventListener:(n,f)=>audioEvents.set(n,f),removeEventListener:n=>audioEvents.delete(n)};
 const c=vm.createContext({ResizeObserver:class{observe(){} disconnect(){}},document,audio,current:null,getComputedStyle:e=>({transform:e.style.transform||'none',opacity:e.style.opacity??1,filter:e.style.filter||'brightness(1)'}),window:{matchMedia:()=>motion,addEventListener:(n,f)=>globals.set(n,f),removeEventListener:n=>globals.delete(n)},setTimeout:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;},clearTimeout:id=>timers.delete(id),esc:String,icon:String});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);c.releaseHTML=t=>t.id;c.homeCover=t=>'<div>'+t.title+'</div>';c.homeArtworkPath=t=>'/media/'+t.id;
 const tracks=Array.from({length:count},(_,i)=>({id:'t'+i,title:'Track '+i}));const cleanup=c.mountFloatingHome(root,tracks);await new Promise(resolve=>setImmediate(resolve));
 const fire=(n,e={})=>events.get(n)?.(e),run=delay=>{const entry=[...timers].find(([,v])=>v.delay===delay);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();};
 const click=selector=>fire('click',{target:{closest:s=>s==='button'?{matches:s=>s===selector,hasAttribute:()=>false,setAttribute(){}}:null}});
 const settle=()=>{for(const el of [...washes,...cards.map(c=>c.firstElementChild),...cards,copy])el.animation?.finish();};
 return {settle,c,root,feature,cards,washes,dots,stage,bg,motion,document,audio,audioEvents,play,timers,events,globals,cleanup,fire,run,click};
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('seven stable cards wrap only while invisible outside the row',async()=>{
 const f=await setup(),html=f.stage.innerHTML;
 for(let i=0;i<15;i++){
  f.run(7000);await tick();
  assert.equal(f.stage.innerHTML,html);assert.equal(f.cards.filter(c=>c.attrs['aria-current']==='true').length,1);
  assert.equal(f.cards[(i+1)%7].attrs['aria-current'],'true');
  const wrapping=f.cards.filter(c=>c.animation.frames.length===4);assert.equal(wrapping.length,1);
  assert.equal(wrapping[0].animation.frames[1].opacity,0);assert.equal(wrapping[0].animation.frames[2].opacity,0);
  for(const card of f.cards){assert.equal(card.animation.options.duration,750);assert.doesNotMatch(card.style.transform,/undefined|NaN/);}
  f.settle();assert.equal(f.washes.filter(w=>w.style.opacity===1).length,1);
 }
 f.cleanup();assert.equal(f.timers.size,0);assert.equal(f.events.size,0);assert.equal(f.globals.size,0);assert.equal(f.audioEvents.size,0);
});
test('pause freezes in-flight transitions but never audio',async()=>{
 const f=await setup();f.audio.paused=false;f.run(7000);await tick();f.click('.home-feature-autoplay');
 assert.equal(f.timers.size,0);assert.equal(f.audio.paused,false);assert.equal(f.feature.classList['is-floating-paused'],true);
 assert.ok(f.cards.every(c=>c.animation.playState==='paused'));
 f.click('.home-feature-autoplay');assert.ok(f.cards.every(c=>c.animation.playState==='running'));f.settle();assert.equal(f.timers.size,1);f.cleanup();
});
test('reduced motion retains keyboard/manual selection without animations',async()=>{
 const f=await setup(7,true);assert.equal(f.timers.size,0);f.fire('keydown',{key:'ArrowRight',preventDefault(){}});await tick();assert.equal(f.cards[1].attrs['aria-current'],'true');assert.ok(f.cards.every(c=>!c.animation));f.cleanup();
});
test('selection and order stay unchanged, no duplicate filler tracks',async()=>{
 const f=await setup(1),rec=[{id:'r1'},{id:'r2'}],fallback=Array.from({length:9},(_,i)=>({id:'r'+i}));
 assert.equal(f.timers.size,0);const result=f.c.homeFeaturedTracks(rec,fallback);assert.equal(result.length,7);assert.equal(result[0].id,'r1');assert.equal(new Set(result.map(t=>t.id)).size,7);
 assert.equal(f.c.homeFeaturedTracks(rec,rec).length,2);f.cleanup();
});
test('hidden tabs and reduced-motion changes finish cleanly',async()=>{
 const f=await setup();f.run(7000);await tick();f.document.hidden=true;f.globals.get('visibilitychange')();assert.equal(f.timers.size,0);assert.equal(f.cards[0].animation.playState,'paused');
 f.document.hidden=false;f.globals.get('visibilitychange')();f.run(7000);await tick();f.motion.matches=true;f.globals.get('motion')();assert.equal(f.timers.size,0);assert.ok(f.cards.every(c=>c.animation.playState==='finished'));f.cleanup();
});
test('geometry fits seven/five/three projected covers symmetrically with 12% overlap',async()=>{
 const f=await setup();for(const [width,radius] of [[900,3],[540,3],[500,2],[360,2],[300,1],[220,1]]){
  const g=f.c.homeFloatGeometry(width,7);assert.equal(g.radius,radius);
  const projected=i=>g.scales[i]*Math.cos(g.angles[i]*Math.PI/180)*1000/(1000-g.depth[i]);
  assert.ok((2*g.positions[radius]+projected(radius))*g.size<=width);
  for(let i=1;i<=radius;i++)assert.ok(Math.abs((g.positions[i]-g.positions[i-1])/(.5*(projected(i)+projected(i-1)))-.88)<1e-10);
 }f.cleanup();
});
test('rapid inputs serialize transitions and keep only the last requested destination',async()=>{
 const f=await setup();const key=()=>f.fire('keydown',{key:'ArrowRight',preventDefault(){}});
 key();await tick();key();key();assert.equal(f.cards[1].attrs['aria-current'],'true');f.settle();await tick();assert.equal(f.cards[2].attrs['aria-current'],'true');f.settle();assert.equal(f.timers.size,1);f.cleanup();
});
test('more than seven supplied tracks stay available, while only seven are visible',async()=>{
 const f=await setup(11);assert.equal(f.cards.filter(c=>c.attrs['aria-hidden']==='false').length,7);assert.equal(f.cards.length,11);f.cleanup();
});


test('touch hold, cancellation and capture loss resume exactly one fresh countdown',async()=>{
 const f=await setup();f.fire('pointerenter',{pointerType:'touch'});assert.equal(f.timers.size,1);
 f.fire('pointerdown',{clientX:180,clientY:30});assert.equal(f.timers.size,0);
 f.document.hidden=true;f.globals.get('visibilitychange')();f.document.hidden=false;f.globals.get('visibilitychange')();assert.equal(f.timers.size,0,'visibility cannot restart while a finger is held');
 f.fire('pointercancel');assert.deepEqual([...f.timers.values()].map(t=>t.delay),[7000]);
 f.fire('pointerdown',{clientX:180,clientY:30});f.fire('lostpointercapture');assert.equal(f.timers.size,1);
 f.fire('pointerdown',{clientX:180,clientY:30});f.fire('pointerup',{clientX:70,clientY:30});await tick();f.settle();assert.equal(f.cards[1].attrs['aria-current'],'true');assert.equal(f.timers.size,1);f.cleanup();
});

test('the artwork crossfade owns serialization until 900ms without moving the copy',async()=>{
 const f=await setup();f.run(7000);await tick();
 assert.equal(f.washes[1].animation.options.duration,900);
 assert.ok(f.washes[1].animation.frames.every(frame=>!('transform' in frame)));
 assert.equal(f.cards[1].animation.options.easing,'cubic-bezier(0.22, 1, 0.36, 1)');
 for(const card of f.cards)card.animation.finish();
 f.fire('keydown',{key:'ArrowRight',preventDefault(){}});await tick();assert.equal(f.cards[1].attrs['aria-current'],'true','750ms cards cannot interrupt the longer background fade');
 f.washes[1].animation.finish();await tick();assert.equal(f.cards[2].attrs['aria-current'],'true');f.cleanup();
});

test('new arrows wrap and playback status follows selected track without starting audio',async()=>{
 const f=await setup(7,true);
 f.c.current={id:'t0'};f.audio.paused=false;f.audioEvents.get('play')();assert.equal(f.play.attrs['aria-pressed'],'true');
 f.click('.home-feature-next');await tick();assert.equal(f.cards[1].attrs['aria-current'],'true');assert.equal(f.play.attrs['aria-pressed'],'false');assert.equal(f.audio.paused,false);
 f.click('.home-feature-prev');await tick();assert.equal(f.cards[0].attrs['aria-current'],'true');assert.equal(f.play.attrs['aria-pressed'],'true');
 f.audio.paused=true;f.audioEvents.get('pause')();assert.equal(f.play.innerHTML,'ui-play-action');
 f.click('.home-feature-prev');await tick();assert.equal(f.cards[6].attrs['aria-current'],'true');assert.equal(f.audio.paused,true);f.cleanup();
});
