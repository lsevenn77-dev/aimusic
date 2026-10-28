import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(reduced=false){
 const events=new Map(),globalEvents=new Map(),timers=new Map();let serial=0;
 const dots=Array.from({length:3},()=>({setAttribute(k,v){this[k]=v;}}));
 const stage={innerHTML:'one',querySelectorAll:()=>[],append(){}};
 const feature={querySelectorAll:()=>dots,contains:target=>target===feature,addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 const root={isConnected:true,innerHTML:'',addEventListener(){},querySelector:s=>s==='.home-feature'?feature:stage};
 const motion={matches:reduced,addEventListener:(n,f)=>globalEvents.set('motion',f),removeEventListener:()=>globalEvents.delete('motion')};
 const document={hidden:false,addEventListener:(n,f)=>globalEvents.set(n,f),removeEventListener:n=>globalEvents.delete(n),createElement:()=>({setAttribute(){},addEventListener(){},remove(){}})};
 const c=vm.createContext({document,window:{matchMedia:()=>motion,addEventListener:(n,f)=>globalEvents.set(n,f),removeEventListener:n=>globalEvents.delete(n)},setTimeout:(f,delay)=>{assert.equal(delay,5500);timers.set(++serial,f);return serial;},clearTimeout:id=>timers.delete(id),esc:String,icon:()=>''});
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);c.releaseHTML=t=>t.id;
 const tracks=['one','two','three'].map(id=>({id,title:id}));
 const mount=list=>c.mountHomeCarousel(root,list||tracks);
 const fire=(name,e={})=>events.get(name)?.(e);
 const advance=()=>{const f=[...timers.values()][0];timers.clear();f?.();};
 return {c,root,stage,feature,dots,motion,document,events,globalEvents,timers,mount,fire,advance};
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
