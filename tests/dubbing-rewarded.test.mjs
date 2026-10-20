import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {dubbingRewardRoute} from '../server/dubbing-rewarded.js';
import {dubbingRewardUnit,dubbingRewardAvailable} from '../server/dubbing-ad-config.js';
import {dubbingQuota,dubbingDay} from '../server/dubbing-quota.js';
import {playDubbingReward} from '../shared/dubbing-reward-player.js';
const settings={DUBBING_ENABLED:'true',DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'local-only',DUBBING_REWARDED_ADS_ENABLED:'true',DUBBING_REWARDED_AD_UNIT:'/123456789/dubbing_script'};
async function setup(t){
 const f=await fixture(t,settings),env={...settings,DB:f.DB};
 const call=async(action,body,user='owner',country='KR')=>{
  const path='/api/dubbing/ad-sessions'+action,req=new Request('https://aifect.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});Object.defineProperty(req,'cf',{value:{country}});
  try{const r=await dubbingRewardRoute(req,env,path,user?{id:user}:null);return {status:r.status,...await r.json()};}catch(e){return {status:e.status,message:e.message};}
 };
 const start=async()=>{const requestId=crypto.randomUUID();return {requestId,...await call('',{requestId})};};
 return {...f,env,call,start,webCall:f.call};
}
test('only explicit live web inventory and Korea enable rewards',()=>{
 assert.equal(dubbingRewardAvailable({cf:{country:'KR'}},settings),true);
 for(const country of ['US','DE',undefined])assert.equal(dubbingRewardAvailable({cf:{country}},settings),false);
 for(const unit of ['', 'ca-app-pub-5910265378731607/4219283278','/22639388115/rewarded_web_example','/12345/sample','/12345/a?<script>','https://ads.test/12345/ad'])assert.equal(dubbingRewardUnit({...settings,DUBBING_REWARDED_AD_UNIT:unit}),null);
 assert.equal(dubbingRewardUnit({...settings,DUBBING_REWARDED_ADS_ENABLED:'false'}),null);
 assert.equal(dubbingRewardUnit({...settings,DUBBING_AI_ENABLED:'false'}),null);
});
test('authentication, region and session binding reject unrelated claims',async t=>{
 const f=await setup(t),requestId=crypto.randomUUID();
 assert.equal((await f.call('',{requestId},null)).status,401);
 assert.equal((await f.call('',{requestId},'owner','US')).status,503);
 const s=await f.start();assert.equal(s.status,201);
 assert.equal((await f.call('',{requestId:s.requestId})).sessionId,s.sessionId);
 assert.equal((await f.call('/complete',{...s,event:'rewardedSlotGranted'},'other')).status,404);
 assert.equal((await f.call('/complete',{...s,watched:true})).status,400);
 assert.equal((await f.call('/complete',{...s,sessionId:crypto.randomUUID(),event:'rewardedSlotGranted'})).status,404);
 assert.equal((await f.call('/complete',{...s,event:'rewardedSlotVideoCompleted'})).status,400);
 assert.equal((await dubbingQuota(f.env,'owner')).adsEarned,0);
});
test('parallel starts allow one active session; grants are one-use and capped at four',async t=>{
 const f=await setup(t),starts=await Promise.all([f.start(),f.start()]);
 assert.deepEqual(starts.map(s=>s.status).sort(),[201,409]);
 let s=starts.find(s=>s.status===201);
 for(let i=0;i<4;i++){
  if(i)s=await f.start();
  const responses=await Promise.all(Array.from({length:5},()=>f.call('/complete',{...s,event:'rewardedSlotGranted'})));
  assert.ok(responses.every(r=>r.status===200&&r.granted));
  assert.equal((await dubbingQuota(f.env,'owner')).adsEarned,i+1);
 }
 assert.equal((await f.start()).status,429);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM dubbing_ad_sessions WHERE source='web_gpt_client' AND state='granted'").get().n,4);
});
test('cancel, expiry and Korea midnight never grant; completed replay remains safe',async t=>{
 const f=await setup(t),cancelled=await f.start();
 assert.equal((await f.call('/cancel',cancelled)).granted,false);
 assert.equal((await f.call('/complete',{...cancelled,event:'rewardedSlotGranted'})).status,409);
 const expired=await f.start();f.sql.prepare('UPDATE dubbing_ad_sessions SET expires_at=1 WHERE id=?').run(expired.sessionId);
 assert.equal((await f.call('/complete',{...expired,event:'rewardedSlotGranted'})).status,409);
 const yesterday=await f.start();f.sql.prepare("UPDATE dubbing_ad_sessions SET day='2026-01-01' WHERE id=?").run(yesterday.sessionId);
 assert.equal((await f.call('/complete',{...yesterday,event:'rewardedSlotGranted'})).status,409);
 await f.call('/cancel',yesterday);
 const done=await f.start();assert.equal((await f.call('/complete',{...done,event:'rewardedSlotGranted'})).granted,true);
 f.sql.prepare('UPDATE dubbing_ad_sessions SET expires_at=1 WHERE id=?').run(done.sessionId);
 assert.equal((await f.call('/complete',{...done,event:'rewardedSlotGranted'})).granted,true);
 assert.equal((await f.call('/cancel',done)).granted,true);
 assert.equal((await dubbingQuota(f.env,'owner')).adsEarned,1);
 assert.equal((await dubbingQuota(f.env,'owner',dubbingDay().end)).adsEarned,0);
});
test('lost commit acknowledgement can be retried without another reward',async t=>{
 const f=await setup(t),s=await f.start(),batch=f.DB.batch;let lost=true;
 f.DB.batch=async statements=>{const result=await batch(statements);if(lost){lost=false;throw new Error('lost response');}return result;};
 await f.call('/complete',{...s,event:'rewardedSlotGranted'});
 const retry=await f.call('/complete',{...s,event:'rewardedSlotGranted'});
 assert.equal(retry.granted,true);assert.equal(retry.quota.adsEarned,1);
});
test('deletion removes ad records and no legacy watched endpoint is exposed',async t=>{
 const f=await setup(t),s=await f.start();await f.call('/complete',{...s,event:'rewardedSlotGranted'});
 assert.equal((await f.call('/complete',{...s,event:'rewardedSlotGranted'},null)).status,401);
 assert.equal((await f.call('/complete',{...s,event:'rewardedSlotGranted'},'other')).status,404);
 const response=await f.call('',{requestId:'no'});assert.equal(response.status,400);
 assert.equal((await f.call('/bogus',{})).status,404);
 assert.equal((await f.call('/complete',{requestId:crypto.randomUUID(),sessionId:crypto.randomUUID(),watched:true})).status,404);
 assert.equal((await f.webCall('/api/dubbing/rewards','POST',{watched:true})).status,404);
 assert.equal((await f.webCall('/api/account/delete','POST',{confirmation:'DELETE'})).status,200);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM dubbing_ad_sessions WHERE user_id='owner'").get().n,0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM dubbing_script_rewards WHERE user_id='owner'").get().n,0);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
function fakeGPT({unsupported=false}={}){
 const events=new Map(),slot={addService(){return slot;}},state={destroyed:0,enabled:0,displayed:0};
 const service={addEventListener(n,fn){if(!events.has(n))events.set(n,new Set());events.get(n).add(fn);},removeEventListener(n,fn){events.get(n)?.delete(fn);}};
 const gpt={cmd:{push(fn){fn();}},enums:{OutOfPageFormat:{REWARDED:'rewarded'}},defineOutOfPageSlot(){return unsupported?null:slot;},pubads(){return service;},enableServices(){state.enabled++;},display(){state.displayed++;},destroySlots(){state.destroyed++;}};
 return {gpt,slot,state,events,emit(name,data={}){for(const fn of events.get(name)||[])fn({slot,...data});}};
}
test('browser grants once only from rewardedSlotGranted and ignores other slots',async()=>{
 const f=fakeGPT();let grants=0,visible=0;
 const p=playDubbingReward({gpt:f.gpt,adUnit:'/1234/unit',onGranted(){grants++;}});
 f.emit('rewardedSlotReady',{makeRewardedVisible(){visible++;return true;}});
 f.emit('rewardedSlotVideoCompleted');assert.equal(grants,0);
 f.emit('rewardedSlotGranted',{slot:{}});assert.equal(grants,0);
 f.emit('rewardedSlotGranted');f.emit('rewardedSlotGranted');assert.equal(grants,1);
 f.emit('rewardedSlotClosed');assert.equal((await p).granted,true);assert.equal(visible,1);assert.equal(f.state.destroyed,1);
 assert.ok([...f.events.values()].every(s=>s.size===0));
});
test('close before grant gives no reward and clears listeners',async()=>{
 const f=fakeGPT();let grants=0;
 const p=playDubbingReward({gpt:f.gpt,adUnit:'/1234/unit',onGranted(){grants++;}});
 f.emit('rewardedSlotClosed');assert.equal((await p).granted,false);assert.equal(grants,0);
 f.emit('rewardedSlotGranted');assert.equal(grants,0);
});
test('unsupported, no fill, abort and timeout do not issue rewards',async()=>{
 const unsupported=fakeGPT({unsupported:true});await assert.rejects(playDubbingReward({gpt:unsupported.gpt,adUnit:'/1234/u'}),/지원하지/);
 const empty=fakeGPT(),p=playDubbingReward({gpt:empty.gpt,adUnit:'/1234/u'});empty.emit('slotRenderEnded',{isEmpty:true});await assert.rejects(p,/광고가 없어요/);
 const stopped=fakeGPT(),abort=new AbortController(),q=playDubbingReward({gpt:stopped.gpt,adUnit:'/1234/u',signal:abort.signal});abort.abort();await assert.rejects(q,/취소/);
 await assert.rejects(playDubbingReward({gpt:fakeGPT().gpt,adUnit:'/1234/u',timeoutMs:5}),/불러올/);
});
