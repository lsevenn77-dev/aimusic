import test from 'node:test';
import assert from 'node:assert/strict';
import {createScene} from '../dist/crew-fishing/scene.js';
import {animationDeadline} from '../dist/crew-fishing/animation.js';

function sceneFixture(t){
  let callback;
  const gradient={addColorStop(){}};
  const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
    {get:(target,key)=>key in target?target[key]:(()=>{})});
  const canvas=()=>({className:'',setAttribute(){},getContext:kind=>kind==='webgl'?null:context});
  const changes={document:{hidden:false,createElement:canvas},matchMedia:()=>({matches:false}),
    requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame(){},devicePixelRatio:1,
    ResizeObserver:class{observe(){}disconnect(){}}};
  const restore=[];
  for(const [key,value] of Object.entries(changes)){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    restore.push(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  }
  const stage={querySelector:()=>null,prepend(){},classList:{add(){}},getBoundingClientRect:()=>({width:390,height:640})};
  const scene=createScene(stage);t.after(()=>{scene.destroy();restore.forEach(fn=>fn());});
  return {scene,frame:now=>callback(now)};
}

test('a slow or throttled animation frame releases casting after real elapsed time',async t=>{
  const {scene,frame}=sceneFixture(t);let ready=false;
  const cast=scene.cast().then(()=>ready=true);
  frame(performance.now()+3500);
  await Promise.resolve();assert.equal(ready,true);await cast;
});

test('a confirmed escape completes after real time even at very low frame rate',async t=>{
  const {scene,frame}=sceneFixture(t);scene.hooked();let ready=false;
  const result=scene.escape().then(()=>ready=true);
  frame(performance.now()+1500);
  await Promise.resolve();assert.equal(ready,true);await result;
});

test('stalled, rejected or unavailable decorative animations cannot keep controls locked',async()=>{
  let expire,cleared=0;
  const timers={setTimeout:fn=>(expire=fn,1),clearTimeout:()=>cleared++};
  let finished=false;
  const stalled=animationDeadline(()=>new Promise(()=>{}),4000,timers).then(()=>finished=true);
  await Promise.resolve();assert.equal(finished,false);expire();await stalled;assert.equal(cleared,1);
  await animationDeadline(()=>{throw new Error('renderer unavailable');},3000,timers);
  await animationDeadline(()=>Promise.reject(Error('context lost')),3000,timers);
  assert.equal(cleared,3);
});

for(const duration of [1000,15000])test(`cast animation waits for the selected ${duration} ms bite time`,async t=>{
  const {scene,frame}=sceneFixture(t);let ready=false;
  const start=performance.now(),result=scene.cast({duration}).then(()=>ready=true);
  frame(start+duration-100);await Promise.resolve();assert.equal(ready,false);
  frame(start+duration+50);await result;assert.equal(ready,true);
});
test('resuming during the wait keeps the bobber on the water until the remaining delay ends',async t=>{
  const {scene,frame}=sceneFixture(t);let ready=false;
  const start=performance.now(),result=scene.cast({duration:5000,resume:true}).then(()=>ready=true);
  frame(start+4000);await Promise.resolve();assert.equal(ready,false);
  frame(start+5100);await result;assert.equal(ready,true);
});
