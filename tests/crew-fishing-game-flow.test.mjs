import test from 'node:test';
import {profileNickname} from '../dist/nickname-profile-host.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fishingLobby} from '../dist/crew-fishing/lobby.js';
import {FISH} from '../dist/crew-fishing/catalog.js';
import {TIERS,position,formatLength} from '../dist/crew-fishing/rules.js';
import {createReel} from '../dist/crew-fishing/reel.js';
import {clockSample} from '../dist/crew-fishing/timing.js';
import {bindMobileReelInput} from '../dist/crew-fishing/mobile-input.js';

// Exercise the real page/controller with a deterministic clock and no canvas.
// This verifies gameplay timers even when animations are unavailable or complete immediately.
function page({delay=15000,renderer='missing'}={}){
  let ms=0,nextTimer=0,html='',stage;
  const timers=new Map(),listeners={},requests=[],paints=[],buzz=[];
  const classes=(initial='')=>{const set=new Set(initial.split(' '));return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle(x,on){if(on)set.add(x);else set.delete(x)}}};
  const node=()=>({classList:classes(),style:{},dataset:{},textContent:'',toggleAttribute(){},addEventListener(){}});
  const heading=node(),feedback=node(),needle=node(),surface=new EventTarget();
  surface.closest=()=>surface;
  const app={...node(),addEventListener:(name,fn)=>listeners[name]=fn,
    querySelector(selector){if(selector==='.stage')return stage;if(selector==='.stage.casting')return stage?.classList.contains('casting')?stage:null;return node()},
    get innerHTML(){return html},set innerHTML(value){
      if(stage)stage.isConnected=false;stage=null;html=value;paints.push(value);
      const match=value.match(/<section class="(stage[^"]*)"/);
      if(match){stage={isConnected:true,classList:classes(match[1]),querySelector:s=>s==='h2'?heading:surface};}
    }};
  const elements={'#app':app,'#error':node(),'#rules':{...node(),open:false},'#rulesOpen':node(),'#back':node(),'#pullfeedback':feedback,'.needle':needle};
  const timer=(fn,wait=0)=>{const id=++nextTimer;timers.set(id,{at:ms+Math.max(0,wait),fn});return id};
  let state={id:'qa',start:delay,expiresAt:delay+3000,cycle:1600,target:0,width:100,goal:3,progress:0,warnings:0,seq:0,lastPass:-1,status:'active'};
  const context=vm.createContext({fishingLobby,FISH,TIERS,position,formatLength,createReel,clockSample,bindMobileReelInput,
    profileNickname,renderGameRankings(){},createRequestId:()=> 'qa-request-id-0001',
    createScene(){if(renderer==='missing')throw Error('canvas unavailable');return {cast:async()=>{},hooked(){},destroy(){},pull(){},escape:async()=>{}}},
    animationDeadline:async play=>play(),
    document:{body:node(),querySelector:s=>elements[s],hidden:false,addEventListener(){}},
    window:{scrollTo(){},addEventListener(){},PointerEvent:class{}},location:{search:''},
    matchMedia:()=>({matches:true,addEventListener(){}}),performance:{now:()=>ms},
    setTimeout:timer,clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>timer(fn,16),cancelAnimationFrame:id=>timers.delete(id),
    URLSearchParams,AbortController,console,navigator:{vibrate(){buzz.push(ms);return true;}},
    async fetch(url,options){
      const action=url.split('/').at(-1),body=options.body?JSON.parse(options.body):undefined;requests.push({action,body,at:ms});
      let result;
      if(action==='lobby')result={crew:'qa',name:'QA',open:true,remaining:10,mine:0,ours:0,weeklyRemaining:50,individual:[],crews:[],cast:null};
      else if(action==='cast')result={cast:{...state}};
      else if(action==='pull'){
        if(body.timeout)state={...state,status:'escaped',fish:FISH[0].id,length:120000,grade:'B',value:0};
        else {const f=body.batch?.at(-1)??body;state={...state,seq:f.seq,lastPass:Math.floor(f.elapsed/800),progress:1,expiresAt:state.start+f.elapsed+3000};}
        result={cast:{...state}};
      }else if(action==='book')result={name:'QA',records:[{fish:FISH[0].id,length:125000,grade:'B',nickname:'최대어 기록자',end_ms:1,count:99}]};
      return {ok:true,json:async()=>({...result,receivedTime:ms,serverTime:ms})};
    }});
  vm.runInContext(readFileSync(new URL('../dist/crew-fishing/game.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
  return {requests,paints,buzz,get stage(){return stage},get html(){return html},feedback,
    async ready(){await flush()},
    async action(name){listeners.click({target:{closest:selector=>selector==='button'?{dataset:{act:name}}:null}});await flush()},
    async advance(to){
      while(true){const next=[...timers].filter(([,t])=>t.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
        timers.delete(next[0]);ms=next[1].at;next[1].fn();await flush();}
      ms=to;await flush();
    },
    async touch(){const event=new Event('pointerdown',{cancelable:true});Object.assign(event,{pointerType:'touch',pointerId:1,button:0});surface.dispatchEvent(event);await flush()}
  };
}
for(const renderer of ['missing','instant'])test(`page honors waiting and automatic escape with ${renderer} animations`,async()=>{
  const p=page({renderer});await p.ready();await p.action('start');
  assert.equal(p.stage.classList.contains('casting'),true);
  assert.doesNotMatch(p.html,/포획 진행도|도주 경고|id="warnings"|class="dots"/);
  await p.advance(14999);await p.touch();assert.equal(p.requests.filter(r=>r.action==='pull').length,0);
  assert.deepEqual(p.buzz,[]);
  await p.advance(15000);assert.equal(p.stage.classList.contains('casting'),false);assert.deepEqual(p.buzz,[15000]);
  await p.advance(17999);assert.ok(p.stage);
  await p.advance(18000);assert.equal(p.requests.at(-1).body.timeout,true);
  assert.match(p.html,/물고기가 도망갔어요/);assert.equal(p.stage,null);assert.deepEqual(p.buzz,[15000]);
});
test('page touch resets the timer immediately, and leaving cancels its pending callbacks',async()=>{
  const p=page({delay:1000});await p.ready();await p.action('start');
  await p.advance(1400);await p.touch();assert.match(p.feedback.textContent,/성공/);
  await p.advance(4000);assert.ok(p.stage);assert.equal(p.requests.filter(r=>r.body?.timeout).length,0);
  await p.action('lobby');await p.advance(6000);assert.equal(p.requests.filter(r=>r.body?.timeout).length,0);
});
test('collection keeps the largest catcher attribution without capture date or cumulative count',async()=>{
  const p=page();await p.ready();await p.action('book');
  assert.match(p.html,/최고 12.5cm · B등급<br>최대어 기록자/);
  assert.doesNotMatch(p.html,/누적|1970/);
});
