import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as core from '../shared/audio-ads.js';
import {audioAdsRoute,audioAdTag} from '../server/audio-ads.js';

const tag='https://pubads.g.doubleclick.net/gampad/ads?iu=/123456/unit_audio'; // Fixture, never requested.
const source=readFileSync(new URL('../dist/audio-ads.js',import.meta.url),'utf8');
const completed=session=>({session,duration:120,listened:120,preview:false});
test('qualified listening sessions count once; exactly five trigger a break',()=>{
 const changes=[],c=core.createAudioAdCadence(0,n=>changes.push(n));
 assert.equal(c.complete({...completed('preview'),preview:true}),false);
 assert.equal(c.complete({...completed('seek'),listened:5}),false);
 assert.equal(c.complete({...completed('bad'),duration:NaN}),false);
 for(let i=1;i<=4;i++){c.complete(completed(String(i)));assert.equal(c.due,false);}
 assert.equal(c.complete(completed('4')),false);
 c.complete(completed('5'));assert.equal(c.due,true);assert.equal(c.count,5);
 c.attempted();assert.equal(c.due,false);assert.equal(c.count,0);
 assert.equal(core.createAudioAdCadence(5).due,true);
 assert.equal(core.playedSeconds({length:2,start:i=>[0,60][i],end:i=>[20,70][i]}),30);
 assert.deepEqual(changes,[1,2,3,4,5,0]);
});
test('60% qualifies, just under 60% and seeking alone do not',()=>{
 const c=core.createAudioAdCadence();
 assert.equal(c.complete({session:'listen',duration:180,listened:107.999}),false);
 assert.equal(c.complete({session:'listen',duration:180,listened:108}),true);
 assert.equal(c.complete({session:'listen',duration:180,listened:180}),false,'end cannot recount a qualified skip or pause');
 const jumped={length:2,start:i=>[0,170][i],end:i=>[20,180][i]};
 assert.equal(c.complete({session:'seek',duration:180,listened:core.playedSeconds(jumped)}),false);
 assert.equal(c.count,1);
});
test('manual song selection records the old listen before checking the ad boundary',async()=>{
 const cadence=core.createAudioAdCadence(4),checks=[];
 const context=vm.createContext({document:{querySelector(){}},Audio:class{constructor(){this.duration=180;this.played={length:1,start:()=>0,end:()=>108};}pause(){}},sessionStorage:{getItem:()=>null},window:{AifectAudioAds:{active:false,completed:value=>cadence.complete(value),beforeTrack(){checks.push(cadence.count);throw Error('boundary reached');}}},AifectAudioAdsCore:core,AifectGenres:{GENRES:[]}});
 vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),context);
 vm.runInContext("current={id:'old-song'};playSession='old-session';",context);
 await assert.rejects(vm.runInContext("play('new-song')",context),/boundary reached/);
 assert.deepEqual(checks,[5]);
 await assert.rejects(vm.runInContext("play('another-song')",context),/boundary reached/);
 assert.deepEqual(checks,[5,5]);
});
test('server requires real audio inventory, a free account and supported region',async()=>{
 const request={method:'GET',cf:{country:'KR'}},env={WEB_AUDIO_AD_TAG_URL:tag};
 for(const value of ['',undefined,'https://example.com/vast',tag.replace('/gampad/ads','/display'),tag.replace('/123456/unit_audio','/21775744923/external/single_ad_samples'),tag+'&adtest=on'])assert.equal(audioAdTag(value),null);
 const result=new URL(audioAdTag(tag));assert.equal(result.searchParams.get('ad_type'),'audio');assert.equal(result.searchParams.get('vpmute'),'0');
 for(const [req,settings,user] of [[request,env,null],[request,env,{premium_until:Date.now()/1000+100}],[request,{},{}],[{method:'GET'},env,{}],[{method:'GET',cf:{country:'DE'}},env,{}]]){
  assert.deepEqual(await audioAdsRoute(req,settings,'/api/ads/audio',user).json(),{enabled:false});
 }
 assert.equal((await audioAdsRoute(request,env,'/api/ads/audio',{premium_until:0}).json()).enabled,true);
});

function player({enabled=true}={}){
 const elements=new Map(),scripts=[],events={},timeouts=new Map(),intervals=new Map(),requests=[],managers=[],store=new Map();
 let timerId=0,serverEnabled=enabled,loader,paused=0,fetches=0;
 const element=()=>({innerHTML:'song',textContent:'music',disabled:false,hidden:false,classList:{add(){},remove(){}},setAttribute(){}});
 const $=key=>{if(!elements.has(key))elements.set(key,element());return elements.get(key);};
 class Emitter{constructor(){this.listeners={};}addEventListener(n,fn){(this.listeners[n]??=[]).push(fn);}emit(n,data={}){for(const fn of this.listeners[n]||[])fn(data);}}
 class Manager extends Emitter{constructor(){super();managers.push(this);this.remaining=20;this.skippable=false;}destroy(){this.destroyed=true;}init(){}start(){this.started=true;this.emit('STARTED');}setVolume(v){this.volume=v;}pause(){this.emit('PAUSED');}resume(){this.emit('RESUMED');}getRemainingTime(){return this.remaining;}getAdSkippableState(){return this.skippable;}skip(){this.skipped=true;this.emit('CONTENT_RESUME_REQUESTED');}}
 class Loader extends Emitter{constructor(){super();loader=this;}requestAds(req,ctx){requests.push({req,ctx});}contentComplete(){}}
 const audio={volume:.75,muted:false,pause(){paused++;}},window={addEventListener(){},dispatchEvent(){},google:{ima:{AdDisplayContainer:class{initialize(){}},AdsLoader:Loader,AdsRenderingSettings:class{},AdsRequest:class{setAdWillAutoPlay(v){this.auto=v;}setAdWillPlayMuted(v){this.muted=v;}},AdsManagerLoadedEvent:{Type:{ADS_MANAGER_LOADED:'loaded'}},AdErrorEvent:{Type:{AD_ERROR:'error'}},AdEvent:{Type:Object.fromEntries(['CONTENT_RESUME_REQUESTED','ALL_ADS_COMPLETED','CONTENT_PAUSE_REQUESTED','STARTED','PAUSED','RESUMED','AD_PROGRESS','SKIPPABLE_STATE_CHANGED'].map(n=>[n,n]))},ViewMode:{NORMAL:'normal'}}}};
 const document={createElement:()=>({}),head:{append:s=>scripts.push(s)},body:{append(){}},addEventListener:(n,fn)=>events[n]=fn};
 vm.runInNewContext(source,{$,window,document,audio,inApp:false,AifectAudioAdsCore:core,icon:()=>'',setPlayerVisible(){},navigator:{},Event:class{},URL,Date,AbortSignal,fetch:async()=>{fetches++;return {ok:true,json:async()=>({enabled:serverEnabled,tag})};},sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},setTimeout:fn=>{timeouts.set(++timerId,fn);return timerId;},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.set(++timerId,fn);return timerId;},clearInterval:id=>intervals.delete(id)});
 const api=window.AifectAudioAds;
 return {api,$,scripts,events,requests,managers,store,timeouts,audio,get fetches(){return fetches;},async ready(){api.setMembership({plan:'free'},'user');await flush();if(scripts.length){scripts[0].onload();events.click({isTrusted:true});}},five(){for(let i=0;i<5;i++)api.completed(completed('s'+i));},load(index=0){const manager=new Manager();loader.emit('loaded',{getUserRequestContext:()=>requests[index].ctx,getAdsManager:()=>manager});return manager;},error(){loader.emit('error',{getUserRequestContext:()=>requests.at(-1).ctx});},disable(){serverEnabled=false;},get paused(){return paused;}};
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('missing supply and Premium load no ad SDK or ads',async()=>{
 const p=player({enabled:false});await p.ready();p.five();await p.api.beforeTrack();assert.equal(p.scripts.length,0);assert.equal(p.requests.length,0);
 const q=player();q.api.setMembership({plan:'premium'},'paid');await flush();assert.equal(q.fetches,0);assert.equal(q.scripts.length,0);
});
test('fifth completion gates the next song, never requests a banner; no fill resumes',async()=>{
 const p=player();await p.ready();
 for(let i=0;i<4;i++){p.api.completed(completed('s'+i));await p.api.beforeTrack();}
 assert.equal(p.requests.length,0);p.api.completed(completed('s4'));
 let resumed=false;const waiting=p.api.beforeTrack().then(()=>resumed=true);await flush();
 assert.equal(resumed,false);assert.equal(p.api.active,true);assert.equal(p.requests.length,1);
 assert.equal(p.$('#seek').disabled,true);p.error();await waiting;
 assert.equal(resumed,true);assert.equal(p.api.active,false);assert.equal(p.$('#seek').disabled,false);
 await p.api.beforeTrack();assert.equal(p.requests.length,1,'no-fill does not retry on each next track');
 assert.ok(p.scripts[0].src.includes('ima3.js'));assert.equal(p.scripts.some(s=>s.src.includes('adsbygoogle')),false);
});
test('ad progress, volume, pause, allowed skip and completion use IMA controls',async()=>{
 const p=player();await p.ready();p.five();const waiting=p.api.beforeTrack();await flush();const manager=p.load();
 assert.equal(manager.started,true);assert.equal(manager.volume,.75);
 manager.remaining=9.5;manager.emit('AD_PROGRESS');assert.match(p.$('#audio-ad-status').textContent,/10초/);
 p.api.volume(.2);assert.equal(manager.volume,.2);p.api.toggle();p.api.toggle();
 p.$('#audio-ad-skip').onclick();assert.equal(manager.skipped,undefined);
 manager.skippable=true;manager.emit('SKIPPABLE_STATE_CHANGED');assert.equal(p.$('#audio-ad-skip').hidden,false);
 p.$('#audio-ad-skip').onclick();await waiting;assert.equal(manager.destroyed,true);assert.equal(p.api.active,false);
});
test('concurrent next clicks share one break; cancellation and late callbacks do not restart playback',async()=>{
 const p=player();await p.ready();p.five();const a=p.api.beforeTrack(),b=p.api.beforeTrack();await flush();
 assert.equal(p.requests.length,1);p.api.cancel();await Promise.all([a,b]);const late=p.load();assert.equal(late.destroyed,true);assert.equal(late.started,undefined);assert.equal(p.api.active,false);
});
test('Premium purchase cancels an active break; muted and uninitialized playback do not request ads',async()=>{
 const p=player();await p.ready();p.five();const waiting=p.api.beforeTrack();await flush();const manager=p.load();
 p.api.setMembership({plan:'premium'},'user');await waiting;assert.equal(manager.destroyed,true);assert.equal(p.api.active,false);
 const q=player();await q.ready();q.five();q.audio.volume=0;await q.api.beforeTrack();assert.equal(q.requests.length,0);
});
test('timeout releases the queue; server membership recheck can stop the request',async()=>{
 const p=player();await p.ready();p.five();const waiting=p.api.beforeTrack();await flush();
 for(const fn of [...p.timeouts.values()])fn();await waiting;assert.equal(p.api.active,false);
 const q=player();await q.ready();q.five();q.disable();await q.api.beforeTrack();assert.equal(q.requests.length,0);
});
