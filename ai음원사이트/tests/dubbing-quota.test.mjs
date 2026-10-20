import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import {dubbingDay,dubbingQuota,reserveDubbingGeneration,creditVerifiedDubbingAd} from '../server/dubbing-quota.js';
import {DUBBING_LENGTHS,dubbingOptions} from '../shared/dubbing.js';
const settings={DUBBING_ENABLED:'true',DUBBING_AI_ENABLED:'true',OPENAI_API_KEY:'local-test-only',BUCKET:memoryBucket()};
const response=()=>Response.json({id:'test-response',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(sampleScript())}]}],usage:{}});

test('duration choices support 30 seconds through five minutes in half-minute steps',()=>{
 assert.equal(DUBBING_LENGTHS.length,10);
 for(const minutes of DUBBING_LENGTHS)assert.equal(dubbingOptions({...options,minutes}).minutes,minutes);
 for(const minutes of [0,.25,.75,5.5,'0.5',NaN])assert.throws(()=>dubbingOptions({...options,minutes}));
});
test('daily reset uses Korea midnight, not UTC or a rolling 24-hour timer',()=>{
 const before=Date.parse('2026-10-20T14:59:59Z')/1000,after=before+1;
 assert.equal(dubbingDay(before).day,'2026-10-20');assert.equal(dubbingDay(after).day,'2026-10-21');
 assert.equal(dubbingDay(before).end,after);
});
test('one free generation is reserved atomically and replay never consumes another turn',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return response();});
 const f=await fixture(t,settings),first={requestId:crypto.randomUUID(),options};
 const results=await Promise.all([f.call('/api/dubbing/generations','POST',first),f.call('/api/dubbing/generations','POST',{requestId:crypto.randomUUID(),options})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(calls,1);
 assert.equal((await f.call('/api/dubbing/generations','POST',first)).body.state,'ready');assert.equal(calls,1);
 const config=(await f.call('/api/dubbing/config')).body;
 assert.equal(config.quota.remaining,0);assert.equal(config.quota.adLimit,4);assert.equal(config.goldChargingEnabled,false);
 assert.equal(config.quota.rewardedAdAvailable,false);
});
test('verified ads grant at most four extra turns and reject replay across accounts',async t=>{
 const f=await fixture(t,settings),env={DB:f.DB},at=Date.parse('2026-10-20T04:00:00Z')/1000;
 const grant=id=>creditVerifiedDubbingAd(env,{userId:'owner',transactionId:id,completedAt:at},at);
 await Promise.all(Array.from({length:8},(_,i)=>grant('receipt-'+i)));
 assert.equal((await dubbingQuota(env,'owner',at)).adsEarned,4);
 await grant('receipt-0');assert.equal((await dubbingQuota(env,'owner',at)).adsEarned,4);
 await assert.rejects(creditVerifiedDubbingAd(env,{userId:'other',transactionId:'receipt-0',completedAt:at},at),/이미 처리/);
 for(let i=0;i<5;i++)assert.ok(await reserveDubbingGeneration(env,'owner',crypto.randomUUID(),'script',at));
 assert.equal(await reserveDubbingGeneration(env,'owner',crypto.randomUUID(),'script',at),null);
 assert.equal((await dubbingQuota(env,'owner',at)).remaining,0);
 const next=dubbingDay(at).end;
 assert.equal((await dubbingQuota(env,'owner',next)).remaining,1);assert.equal((await dubbingQuota(env,'owner',next)).adsEarned,0);
 await assert.rejects(creditVerifiedDubbingAd(env,{userId:'owner',transactionId:'yesterday',completedAt:next-1},next),/지난 날짜/);
 assert.equal((await f.call('/api/dubbing/rewards','POST',{watched:true})).status,404,'a browser claim cannot forge ad completion');
});
test('confirmed failure restores a turn while uncertain requests remain reserved',async t=>{
 const f=await fixture(t,settings),env={DB:f.DB},at=Date.parse('2026-10-20T04:00:00Z')/1000,id=crypto.randomUUID();
 await reserveDubbingGeneration(env,'owner',id,'script',at);
 f.sql.prepare("UPDATE dubbing_generations SET state='failed' WHERE id=?").run(id);
 assert.equal((await dubbingQuota(env,'owner',at)).remaining,1);
 const next=crypto.randomUUID();await reserveDubbingGeneration(env,'owner',next,'script',at);
 f.sql.prepare("UPDATE dubbing_generations SET state='unknown' WHERE id=?").run(next);
 assert.equal((await dubbingQuota(env,'owner',at)).remaining,0);
 f.sql.prepare("INSERT INTO dubbing_generations(id,user_id,input_hash,state,created,updated) VALUES('sound-only','other','sound-plan:test','sound_ready',?,?)").run(at,at);
 assert.equal((await dubbingQuota(env,'other',at)).remaining,1);
});
test('sound creation requires the 50G price acknowledgement without charging development wallets',async t=>{
 const f=await fixture(t,{...settings,DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',PIKA_API_KEY:'test-only',TRANSCODER_TOKEN:'test-worker'});
 const p=(await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()})).body.project;
 const body={requestId:crypto.randomUUID(),mode:'ai',revision:p.revision};
 assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/sound','POST',body)).status,409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,0);
 assert.equal((await f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{...body,acceptedGold:50,acceptedChargeGold:0})).status,202);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,0);
});
