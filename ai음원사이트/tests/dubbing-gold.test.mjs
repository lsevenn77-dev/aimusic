import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {options,sampleScript,memoryBucket} from './dubbing-fixtures.mjs';
import {goldBalance} from '../server/gifts.js';
import {refundDubbingGold,reconcileDubbingGold} from '../server/dubbing-gold.js';
import worker from '../server/index.js';

async function setup(t,charge=true){
 const settings={DUBBING_ENABLED:'true',DUBBING_SOUND_ENABLED:'true',DUBBING_PAID_API_ENABLED:'true',DUBBING_GOLD_ENABLED:String(charge),
  TRANSCODER_TOKEN:'local-test',PIKA_API_KEY:'mock-only',BUCKET:memoryBucket()};
 const f=await fixture(t,settings),env={...settings,DB:f.DB};
 const create=async()=>{const r=await f.call('/api/dubbing/projects','POST',{id:crypto.randomUUID(),options,script:sampleScript()});assert.equal(r.status,201);return r.body.project;};
 const queue=(p,id=crypto.randomUUID(),amount=charge?50:0)=>f.call('/api/dubbing/projects/'+p.id+'/sound','POST',{requestId:id,mode:'ai',revision:p.revision,acceptedGold:50,acceptedChargeGold:amount});
 const seed=(id,gold,used=0)=>f.sql.prepare("INSERT INTO gold_purchases(id,user_id,channel,gold,used,price_krw,status,created,paid_at) VALUES(?,'owner','test',?,?,1000,'paid',0,0)").run(id,gold,used);
 const internal=async(path,body={},job=null,method='POST')=>{
  const binary=body instanceof Uint8Array;
  const r=await worker.fetch(new Request('https://aifect.test/internal/dubbing/'+path,{method,headers:{authorization:'Bearer local-test',...(job?{'x-job-token':job.lease_token}:{}),
   'content-type':binary?'audio/mp4':'application/json',...(binary?{'content-length':String(body.length)}:{})},body:binary?body:JSON.stringify(body)}),env,{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,body:await r.json()};
 };
 return {...f,env,create,queue,seed,internal,balance:()=>goldBalance(env,'owner')};
}

test('development gate charges zero; explicit consent binds to the final charge, not just list price',async t=>{
 const f=await setup(t,false),p=await f.create();f.seed('lot',100);
 assert.equal((await f.queue(p,crypto.randomUUID(),50)).status,409);
 assert.equal((await f.queue(p)).status,202);assert.equal(await f.balance(),100);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,0);
});
test('50G is spent oldest first atomically with job; concurrent repeats only charge once',async t=>{
 const f=await setup(t),p=await f.create();f.seed('a',30);f.seed('b',70);
 assert.equal((await f.queue(p,crypto.randomUUID(),0)).status,409);
 const results=await Promise.all([f.queue(p),f.queue(p)]);
 assert.ok(results.every(r=>[200,202].includes(r.status)),JSON.stringify(results));assert.equal(await f.balance(),50);
 assert.deepEqual(f.sql.prepare('SELECT used FROM gold_purchases ORDER BY id').all().map(r=>r.used),[30,20]);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,1);
 const replay=await f.queue(p);assert.equal(replay.body.sound.chargeGold,50);assert.equal(replay.body.sound.paymentState,'charged');assert.equal(await f.balance(),50);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gifts').get().n,0,'dubbing creates no music royalties');
});
test('competing jobs cannot overspend and the losing batch leaves no job or ledger',async t=>{
 const f=await setup(t),a=await f.create(),b=await f.create();f.seed('lot',60);
 const results=await Promise.all([f.queue(a),f.queue(b)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);assert.equal(await f.balance(),10);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,1);
});
test('insufficient balance and a reused job ID cannot create or modify another job',async t=>{
 const f=await setup(t),a=await f.create(),b=await f.create();
 assert.equal((await f.queue(a)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,0);
 f.seed('lot',100);const id=crypto.randomUUID();assert.equal((await f.queue(a,id)).status,202);
 assert.equal((await f.queue(b,id)).status,409);assert.equal(await f.balance(),50);
 assert.equal(f.sql.prepare('SELECT project_id FROM dubbing_sound_jobs').get().project_id,a.id);
});
test('a store refund racing the charge rolls back the whole batch',async t=>{
 const f=await setup(t),p=await f.create();f.seed('lot',100);
 const batch=f.DB.batch;f.DB.batch=async statements=>{f.sql.prepare("UPDATE gold_purchases SET status='refunded' WHERE id='lot'").run();return batch(statements);};
 assert.equal((await f.queue(p)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_sound_jobs').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM dubbing_gold_orders').get().n,0);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
});
test('worker failure refunds original lots once across repeated and concurrent reconciliation',async t=>{
 const f=await setup(t),p=await f.create();f.seed('a',30);f.seed('b',70);await f.queue(p);
 const job=(await f.internal('claim')).body.job;assert.equal((await f.internal(job.id+'/fail',{},job)).status,200);
 await Promise.all([reconcileDubbingGold(f.env),refundDubbingGold(f.env,job.id),refundDubbingGold(f.env,job.id)]);
 assert.equal(await f.balance(),100);const status=(await f.call('/api/dubbing/projects/'+p.id+'/sound')).body.sound;
 assert.equal(status.paymentState,'refunded');assert.equal(status.refundedGold,50);assert.equal(status.state,'failed');
});
test('unknown provider response refunds customer without sending another paid request',async t=>{
 const f=await setup(t),p=await f.create();f.seed('lot',100);await f.queue(p);const job=(await f.internal('claim')).body.job;
 const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('lost response');};
 assert.equal((await f.internal(job.id+'/step',{},job)).body.state,'unknown');assert.equal(await f.balance(),100);
 assert.equal((await f.queue(p)).body.sound.paymentState,'refunded');assert.equal((await f.internal('claim')).body.job,null);assert.equal(calls,1);
});
test('revoked purchase is not restored by refund; remaining valid lots are refunded and flagged for review',async t=>{
 const f=await setup(t),p=await f.create();f.seed('a',30);f.seed('b',70);await f.queue(p);
 const job=(await f.internal('claim')).body.job;f.sql.prepare("UPDATE gold_purchases SET status='refunded',used=0 WHERE id='a'").run();
 await f.internal(job.id+'/fail',{},job);await reconcileDubbingGold(f.env);
 assert.equal(await f.balance(),70);const order=f.sql.prepare('SELECT * FROM dubbing_gold_orders').get();assert.equal(order.state,'refund_review');
 const lots=f.sql.prepare('SELECT refunded_gold FROM dubbing_gold_lots ORDER BY purchase_id').all();assert.deepEqual(lots.map(l=>l.refunded_gold),[0,20]);
});
test('editing supersedes unfinished work and refunds it; deleting a job preserves financial history',async t=>{
 const f=await setup(t),p=await f.create();f.seed('lot',100);await f.queue(p);const job=(await f.internal('claim')).body.job;
 const script=sampleScript();script.title='새 대본';assert.equal((await f.call('/api/dubbing/projects/'+p.id,'PUT',{revision:1,options,script})).status,200);
 assert.equal(await f.balance(),100);assert.equal((await f.internal(job.id+'/step',{},job)).status,409);
 f.sql.prepare('DELETE FROM dubbing_projects WHERE id=?').run(p.id);await reconcileDubbingGold(f.env);
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_gold_orders').get().state,'refunded');assert.equal(await f.balance(),100);
});
test('successful output fulfills payment atomically and later project deletion does not refund consumed service',async t=>{
 const f=await setup(t),p=await f.create();f.seed('lot',100);await f.queue(p);const job=(await f.internal('claim')).body.job;
 f.sql.prepare("UPDATE dubbing_sound_jobs SET state='mixing' WHERE id=?").run(job.id);
 const bytes=new Uint8Array(32);bytes.set(new TextEncoder().encode('ftyp'),4);
 assert.equal((await f.internal(job.id+'/output',bytes,job,'PUT')).status,200);
 assert.equal((await f.internal(job.id+'/finish',{duration:p.duration,sampleRate:48000,peakDb:-3},job)).status,200);
 assert.equal(f.sql.prepare('SELECT state FROM dubbing_gold_orders').get().state,'fulfilled');
 f.sql.prepare('DELETE FROM dubbing_projects WHERE id=?').run(p.id);await reconcileDubbingGold(f.env);
 assert.equal(await f.balance(),50);assert.equal(f.sql.prepare('SELECT state FROM dubbing_gold_orders').get().state,'fulfilled');
});
test('payment history is scoped to its owner and survives deletion without exposing purchase identifiers',async t=>{
 const f=await setup(t),p=await f.create();f.seed('private-purchase',100);await f.queue(p);
 assert.equal((await f.call('/api/dubbing/payments','GET',null,null)).status,401);
 assert.deepEqual((await f.call('/api/dubbing/payments','GET',null,'other')).body.payments,[]);
 const own=(await f.call('/api/dubbing/payments')).body;assert.equal(own.payments.length,1);assert.equal(own.payments[0].gold,50);
 assert.doesNotMatch(JSON.stringify(own),/private-purchase|PIKA|owner/);
 f.sql.prepare('DELETE FROM dubbing_projects WHERE id=?').run(p.id);await reconcileDubbingGold(f.env);
 const history=(await f.call('/api/dubbing/payments')).body.payments[0];assert.equal(history.title,'삭제된 작품');assert.equal(history.state,'refunded');
});
test('lost batch acknowledgement returns the original charged job on retry without another charge',async t=>{
 const f=await setup(t),p=await f.create();f.seed('lot',100);
 const batch=f.DB.batch;let lost=true;f.DB.batch=async writes=>{const result=await batch(writes);if(lost){lost=false;throw Error('lost acknowledgement');}return result;};
 const id=crypto.randomUUID();assert.equal((await f.queue(p,id)).status,500);
 const retried=await f.queue(p,id);assert.equal(retried.status,200);assert.equal(retried.body.sound.id,id);assert.equal(await f.balance(),50);
});
