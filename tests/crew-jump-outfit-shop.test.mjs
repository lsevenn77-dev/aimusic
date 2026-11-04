import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mountOutfitShop} from '../dist/crew-jump-art/outfit-shop.js';
import {JUMP_OUTFITS,DEFAULT_OUTFIT} from '../dist/crew-jump-art/outfits.js';
import {HZ,NIGHT_START,start} from '../shared/crew-jump.js';
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve()};
const initial=()=>({owned:['default'],blocked:[],equipped:'default',balance:{G:350,S:1000},outfits:JUMP_OUTFITS});
function setup(handler){
 const nodes=new Map(),dialog=new EventTarget(),calls=[];
 dialog.querySelector=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',innerHTML:'',style:{},dataset:{},disabled:false,hidden:false});return nodes.get(key)};
 dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
 const store=mountOutfitShop(dialog,{url:'/jump',esc:s=>s,api:async(path,method,body)=>{calls.push({path,method,body});return handler(path,method,body)}});
 const click=(selector,id)=>{
  const event=new Event('click');Object.defineProperty(event,'target',{value:{closest:query=>query===selector?{dataset:{look:id}}:null}});dialog.dispatchEvent(event);
 };
 return {store,dialog,calls,click,node:key=>dialog.querySelector(key)};
}
test('shop loads balance and owned state, previews without charging, buys once and immediately shows worn state',async()=>{
 let current=initial(),release;
 const f=setup(async(path,method,body)=>{
  if(method==='POST'){await new Promise(resolve=>release=resolve);current={...current,owned:[...current.owned,body.outfit],equipped:body.outfit,balance:{G:300,S:1000}};}
  return current;
 });
 f.store.open();await flush();assert.match(f.node('[data-shop-balance]').textContent,/350 G/);
 assert.equal(f.node('[data-look-action]').textContent,'착용 중');assert.equal(f.node('[data-look-action]').disabled,true);
 f.click('[data-look]','idol');assert.equal(f.calls.length,1);assert.match(f.node('.arc-run-model').style.backgroundImage,/idol-run.webp/);
 assert.equal(f.node('[data-look-action]').textContent,'50 G · 구매하고 착용');
 f.click('[data-look-action]');f.click('[data-look-action]');assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.store.busy,true);
 release();await flush();assert.equal(f.node('[data-look-action]').textContent,'착용 중');assert.match(f.node('[data-shop-balance]').textContent,/300 G/);
 assert.match(f.node('[data-shop-status]').textContent,/구매하고 착용/);
 f.store.destroy();
});
test('lost purchase response refreshes ownership and never repeats the charge automatically',async()=>{
 let current=initial();const f=setup(async(path,method,body)=>{
  if(method==='POST'){current={...current,owned:['default',body.outfit],equipped:body.outfit};throw Error('연결 지연');}return current;
 });
 f.store.open();await flush();f.click('[data-look]','idol');f.click('[data-look-action]');await flush();
 assert.equal(f.node('[data-look-action]').textContent,'착용 중');assert.equal(f.node('[data-look-action]').disabled,true);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.method==='GET').length,2);
 f.store.destroy();
});
test('insufficient funds, unavailable ownership and failed loading disable purchase and allow refresh',async()=>{
 let reject=true,current={...initial(),balance:{G:0,S:0},blocked:['princess']};
 const f=setup(async()=>{if(reject)throw Error('연결 확인');return current});
 f.store.open();await flush();assert.equal(f.node('[data-look-action]').disabled,true);assert.equal(f.node('[data-shop-retry]').hidden,false);
 reject=false;f.click('[data-shop-retry]');await flush();f.click('[data-look]','runner');
 assert.equal(f.node('[data-look-action]').textContent,'실버 부족');assert.equal(f.node('[data-look-action]').disabled,true);
 f.click('[data-look]','princess');assert.equal(f.node('[data-look-action]').textContent,'사용할 수 없는 의상');
 f.click('[data-look-action]');assert.equal(f.calls.filter(c=>c.method==='POST').length,0);f.store.destroy();
});
test('owned outfit switches and default outfit restoration use equip without any purchase',async()=>{
 let current={...initial(),owned:['default','suit'],equipped:'suit'};
 const f=setup(async(path,method,body)=>{if(method==='POST')current={...current,equipped:body.outfit};return current});
 f.store.open();await flush();assert.equal(f.node('[data-look-name]').textContent,'정장룩');
 f.click('[data-look]','default');assert.equal(f.node('[data-look-price]').textContent,'기본 제공');
 assert.equal(f.node('[data-look-action]').textContent,'착용하기');f.click('[data-look-action]');await flush();
 assert.equal(f.calls.at(-1).path,'/jump/outfits/equip');assert.equal(f.node('.arc-run-model').dataset.outfit,'default');
 f.store.destroy();
});
test('closing the route ignores a late shop response',async()=>{
 let resolve;const f=setup(()=>new Promise(r=>resolve=r));f.store.open();f.store.destroy();
 const text=f.node('[data-shop-balance]').textContent;resolve(initial());await flush();
 assert.equal(f.node('[data-shop-balance]').textContent,text);assert.equal(f.dialog.open,false);
});

test('every equipped sprite renders during running/jumping without changing score, hitboxes or physics state',async()=>{
 const draws=[],images=[];let rejectSprite='';
 class Image{set src(value){this.url=value;images.push(value);this.onload?.()}decode(){return this.url===rejectSprite?Promise.reject(Error('missing')):Promise.resolve()}}
 const gradient={addColorStop(){}};
 const ctx=new Proxy({drawImage:(...args)=>draws.push(args),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(object,key)=>key in object?object[key]:(()=>{})});
 const context=vm.createContext({Image,HZ,NIGHT_START,JUMP_OUTFITS,DEFAULT_OUTFIT});
 const source=readFileSync(new URL('../dist/crew-jump-art/stage.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function stageRenderer','function stageRenderer');
 vm.runInContext(source+'\nthis.renderer=stageRenderer;',context);
 const renderer=context.renderer(ctx),game=start('outfit-qa');
 for(const outfit of JUMP_OUTFITS){
  await renderer.ready(outfit.id);
  for(const jumps of [0,1,2]){
   game.jumps=jumps;game.y=jumps?30:0;const before=JSON.stringify(game);draws.length=0;renderer.draw(game);
   assert.equal(JSON.stringify(game),before);assert.ok(draws.length);
   assert.ok(draws.every(([image])=>image.url===(outfit.sprite||'/crew-jump-art/crew-runner.webp')));
   if(outfit.sprite)for(const draw of draws){assert.equal(draw[3],192);assert.equal(draw[4],184);assert.ok(draw[1]>=0&&draw[1]<=960);}
  }
 }
 await renderer.ready('default');draws.length=0;renderer.draw(game);assert.ok(draws.every(([image])=>image.url.endsWith('/crew-runner.webp')));
 await assert.rejects(renderer.ready('not-an-outfit'));
 rejectSprite=JUMP_OUTFITS.find(i=>i.id==='idol').sprite;await assert.rejects(renderer.ready('idol'),/의상 이미지/);
});
