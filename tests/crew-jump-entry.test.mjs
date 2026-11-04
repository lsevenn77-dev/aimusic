import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as core from '../shared/crew-jump.js';
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
const lobby=remaining=>({remaining,open:true,seed:'entry-test',version:core.VERSION,ranking:[],individualRanking:[],best:null,team:0,participated:false});
function setup(handler,{wide=false}={}){
 let detached=false;
 class Node extends EventTarget{
  constructor(){super();this.nodes=new Map();this.dataset={};this.classList={add(){},remove(){}};this.innerHTML='';this.textContent='';this.hidden=false;}
  querySelector(key){if(this===root&&detached&&key==='[data-game-mode]')return null;if(!this.nodes.has(key))this.nodes.set(key,new Node());return this.nodes.get(key)}
  querySelectorAll(key){return key==='b'?[0,1,2].map(i=>this.querySelector('b'+i)):[]}
  getContext(){return {clearRect(){}}}before(){}after(){}append(){}prepend(){}remove(){}focus(){}showModal(){this.open=true}close(){this.open=false}
 }
 const root=new Node(),document=new Node(),calls=[];document.body=new Node();document.createComment=()=>new Node();
 document.body.append=()=>{detached=true};
 let scheduled=0,rendered=0;
 const context=vm.createContext({...core,document,window:new Node(),AbortController,performance,crypto,
  sessionStorage:{getItem(){return null}},matchMedia:query=>({matches:wide&&query.startsWith('(max-width: 1100px)')}),
  requestAnimationFrame(){return ++scheduled},cancelAnimationFrame(){},fetch:async()=>({ok:true}),
  gameSounds:()=>({unlock(){},quiet(){}}),stageRenderer:()=>({async ready(){},draw(){rendered++}}),
  mountOutfitShop:()=>({busy:false,async refresh(){return {equipped:'default'}},destroy(){}})
 });
 const source=readFileSync(new URL('../dist/crew-jump-view.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mount','function mount');
 vm.runInContext(source+'\nthis.mount=mount;',context);
 const clear=context.mount(root,{crew:'preview',viewer:'owner',esc:s=>s,api:async(path,method,body,options)=>{calls.push({path,method,body,options});return handler(path,method,body)}});
 const click=action=>{const event=new Event('click');Object.defineProperty(event,'target',{value:{closest:selector=>selector==='[data-do]'?{dataset:{do:action}}:null}});root.dispatchEvent(event)};
 return {root,calls,clear,click,node:selector=>root.querySelector(selector),scheduled:()=>scheduled,rendered:()=>rendered};
}
test('exhausted or closed official entry stays disabled; only explicit practice starts an unranked game',async()=>{
 for(const info of [lobby(0),{...lobby(3),open:false}]){
  const f=setup(async()=>info);await flush();
  assert.match(f.node('.jump-start-actions').innerHTML,/data-do="official" disabled/);
  assert.doesNotMatch(f.node('.jump-start-actions').innerHTML,/data-do="practice"/);
  assert.match(f.node('.jump-brief').innerHTML,/연습하기 · 랭킹 미반영/);
  f.click('official');await flush();assert.equal(f.scheduled(),0);
  f.click('practice');await flush();assert.equal(f.scheduled(),1);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
  assert.equal(f.node('[data-game-mode]').textContent,'연습 · 랭킹 미반영');f.clear();
 }
});
test('an official start rejected after another tab uses the last slot refreshes quota and never falls back to practice',async()=>{
 let remaining=1;
 const f=setup(async(path,method)=>{
  if(method==='POST'){remaining=0;throw Object.assign(Error('오늘 공식 도전 3회를 모두 사용했어요.'),{status:409})}
  return lobby(remaining);
 });
 await flush();assert.doesNotMatch(f.node('.jump-start-actions').innerHTML,/ disabled/);
 f.click('official');await flush();
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.scheduled(),0);assert.equal(f.rendered(),0);
 assert.match(f.node('.jump-start-actions').innerHTML,/data-do="official" disabled/);
 assert.match(f.node('.jump-summary').textContent,/3회를 모두 사용/);
 assert.ok(f.calls.filter(c=>c.method==='GET').every(c=>c.options.fresh));f.clear();
});
test('available official entry calls the server and visibly identifies ranked play',async()=>{
 const f=setup(async(path,method)=>method==='POST'?{id:'official',seed:'entry-test',version:core.VERSION,starts:3000,serverNow:0}:lobby(3));
 await flush();f.click('official');await flush();
 assert.equal(f.calls.filter(c=>c.path.endsWith('/start')).length,1);assert.equal(f.scheduled(),1);
 assert.equal(f.node('[data-game-mode]').textContent,'공식 도전 · 랭킹 반영');
 f.clear();
});

test('mobile wide stage begins after moving outside the route root',async()=>{
 const f=setup(async()=>lobby(3),{wide:true});await flush();const label=f.node('[data-game-mode]');
 f.click('practice');await flush();assert.equal(f.node('[data-game-mode]'),null);
 assert.equal(label.textContent,'연습 · 랭킹 미반영');assert.equal(f.scheduled(),1);assert.equal(f.rendered(),1);f.clear();
});
