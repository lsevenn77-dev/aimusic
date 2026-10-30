import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(count=7,reduced=false){
 const timers=new Map(),events=new Map(),globals=new Map(),audioEvents=new Map();let serial=0;
 const element=()=>({style:{setProperty(k,v){this[k]=v;}},attrs:{},classList:{toggle(k,v){this[k]=v;}},setAttribute(k,v){this.attrs[k]=v;},animate(frames,options){const a={frames,options,playState:'running',pause(){this.playState='paused';},play(){this.playState='running';},cancel(){this.playState='idle';},finish(){this.playState='finished';this.onfinish?.();}};this.animation=a;return a;}});
 const cards=Array.from({length:count},element),washes=Array.from({length:count},element),dots=Array.from({length:count},element),play=element();
 for(const card of cards)card.firstElementChild=element();
 const stage={children:cards},bg={children:washes},copy={querySelector:()=>play};
 const feature={...element(),querySelector:s=>s==='.home-feature-covers'?stage:s==='.home-feature-copy'?copy:bg,querySelectorAll:()=>dots,contains:()=>false,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const root={isConnected:true,addEventListener(){},querySelector:()=>feature};
 const motion={matches:reduced,addEventListener:(n,f)=>globals.set('motion',f),removeEventListener:()=>globals.delete('motion')};
 const document={hidden:false,createElement:()=>({content:{querySelector:()=>({innerHTML:'copy'})}}),addEventListener:(n,f)=>globals.set(n,f),removeEventListener:n=>globals.delete(n)};
 const audio={paused:true,addEventListener:(n,f)=>audioEvents.set(n,f),removeEventListener:n=>audioEvents.delete(n)};
 const c=vm.createContext({document,audio,current:null,getComputedStyle:e=>({transform:e.style.transform||'none',opacity:e.style.opacity??1}),window:{matchMedia:()=>motion,addEventListener:(n,f)=>globals.set(n,f),removeEventListener:n=>globals.delete(n)},setTimeout:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;},clearTimeout:id=>timers.delete(id),esc:String,icon:String});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);c.releaseHTML=t=>t.id;c.homeCover=t=>'<div>'+t.title+'</div>';c.homeArtworkPath=t=>'/media/'+t.id;
 const tracks=Array.from({length:count},(_,i)=>({id:'t'+i,title:'Track '+i}));const cleanup=c.mountFloatingHome(root,tracks);
 const fire=(n,e={})=>events.get(n)?.(e),run=delay=>{const entry=[...timers].find(([,v])=>v.delay===delay);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();};
 const click=selector=>fire('click',{target:{closest:s=>s==='button'?{matches:s=>s===selector,hasAttribute:()=>false,setAttribute(){}}:null}});
 return {c,root,feature,cards,washes,dots,stage,bg,motion,document,audio,audioEvents,timers,events,globals,cleanup,fire,run,click};
}
test('seven stable cards continue through every wrap, with a rear path and 850ms motion',()=>{
 const f=setup(),html=f.stage.innerHTML;
 for(let i=0;i<15;i++){
  f.run(5000);assert.equal(f.cards[0].firstElementChild.style.transform,'rotateY(-0.7deg)');f.run(5500);
  assert.equal(f.stage.innerHTML,html);assert.equal(f.cards.filter(c=>c.attrs['aria-current']==='true').length,1);
  assert.equal(f.cards[(i+1)%7].attrs['aria-current'],'true');
  assert.equal(f.cards.filter(c=>c.animation.frames.length===3).length,1);
  for(const card of f.cards){assert.equal(card.animation.options.duration,850);assert.doesNotMatch(card.style.transform,/undefined|NaN/);}
  assert.equal(f.washes.filter(w=>w.style.opacity===1).length,1);
 }
 f.cleanup();assert.equal(f.timers.size,0);assert.equal(f.events.size,0);assert.equal(f.globals.size,0);assert.equal(f.audioEvents.size,0);
});
test('pause freezes floating and in-flight transitions without controlling audio; resume continues',()=>{
 const f=setup();f.audio.paused=false;f.run(5500);f.click('.home-feature-autoplay');
 assert.equal(f.timers.size,0);assert.equal(f.audio.paused,false);assert.equal(f.feature.classList['is-floating-paused'],true);
 assert.ok(f.cards.every(c=>c.animation.playState==='paused'));
 f.click('.home-feature-autoplay');assert.equal(f.timers.size,2);assert.ok(f.cards.every(c=>c.animation.playState==='running'));f.cleanup();
});
test('reduced motion supports manual selection without floating, rolling or transition animations',()=>{
 const f=setup(7,true);assert.equal(f.timers.size,0);f.click('.home-feature-next');assert.equal(f.cards[1].attrs['aria-current'],'true');assert.ok(f.cards.every(c=>!c.animation));f.cleanup();
});
test('recommendations fill seven unique tracks with public catalog fallback, never invented duplicates',()=>{
 const f=setup(1),rec=[{id:'r1'},{id:'r2'}],fallback=Array.from({length:9},(_,i)=>({id:'r'+i}));
 assert.equal(f.timers.size,0);const result=f.c.homeFeaturedTracks(rec,fallback);assert.equal(result.length,7);assert.equal(result[0].id,'r1');assert.equal(new Set(result.map(t=>t.id)).size,7);
 assert.equal(f.c.homeFeaturedTracks(rec,rec).length,2);f.cleanup();
});
test('hidden pages and changed motion preferences stop work and clean up anticipation',()=>{
 const f=setup();f.run(5000);f.document.hidden=true;f.globals.get('visibilitychange')();assert.equal(f.timers.size,0);assert.equal(f.cards[0].firstElementChild.animation.playState,'paused');
 f.document.hidden=false;f.globals.get('visibilitychange')();f.run(5500);f.motion.matches=true;f.globals.get('motion')();assert.equal(f.timers.size,0);assert.ok(f.cards.every(c=>c.animation.playState==='finished'));f.cleanup();
});
