import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {encryptCard,sealBillingKey,openBillingKey,digest,nextBillingMonth,verifyNiceSignature} from '../server/nicepay.js';

const CARD={cardNo:'1234567890123456',expYear:'39',expMonth:'12',idNo:'800101',cardPw:'12'};
async function setup(t){
 const calls=[],payments=new Map();let uncertain=false,chargeFailure=false;
 const env={NICEPAY_CLIENT_ID:'test-client',NICEPAY_SECRET_KEY:'2dcc2a0d63bf469490bb19a201be3735',BILLING_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),BILLING_WORKER_TOKEN:'test-worker-secret',BILLING_CHECKOUT_ENABLED:'true'};
 env.NICEPAY_HTTP=async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  assert.equal(options.headers.Authorization,'Basic '+btoa(env.NICEPAY_CLIENT_ID+':'+env.NICEPAY_SECRET_KEY));
  if(path==='/v1/terms')return Response.json({resultCode:'0000',termsTitle:'약관',content:'<p>결제 약관 내용</p>'});
  if(path==='/v1/subscribe/regist')return Response.json({resultCode:'0000',orderId:body.orderId,bid:'private-billing-key',cardName:'테스트 카드'});
  if(path.endsWith('/expire'))return Response.json({resultCode:'0000',bid:'private-billing-key'});
  if(path.endsWith('/payments')){
   const p={resultCode:'0000',orderId:body.orderId,tid:'tid'+body.orderId,amount:body.amount,balanceAmt:body.amount,currency:'KRW',payMethod:'card',status:'paid',paidAt:new Date().toISOString(),ediDate:new Date().toISOString(),mallReserved:body.mallReserved};
   if(chargeFailure)p.status='failed';
   p.signature=await digest(p.tid+p.amount+p.ediDate+env.NICEPAY_SECRET_KEY);payments.set(p.orderId,p);
   if(uncertain)throw new Error('simulated uncertain timeout');
   return Response.json(p);
  }
  if(path.startsWith('/v1/payments/find/'))return Response.json(payments.get(path.split('/').at(-1))||{resultCode:'3010'});
  throw new Error('Unexpected gateway endpoint');
 };
 const f=await fixture(t,env);env.DB=f.DB;
 f.sql.prepare("INSERT INTO billing_worker(id,last_seen) VALUES('runner',?)").run(Math.floor(Date.now()/1000));
 const invoke=async(path,body,authorization)=>{
  const r=await worker.fetch(new Request('https://aifect.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(body||{})}),env,{waitUntil(){}});
  const text=await r.text();return {status:r.status,body:text.startsWith('{')?JSON.parse(text):text};
 };
 const terms=await f.call('/api/billing/terms');assert.equal(terms.status,200);
 const subscribe=()=>f.call('/api/billing/subscribe','POST',{card:CARD,terms_version:terms.body.version,consent:true,price:1,premium_until:9999999999});
 return {...f,env,calls,payments,subscribe,invoke,setUncertain:v=>{uncertain=v;},setChargeFailure:v=>{chargeFailure=v;},tick:()=>invoke('/internal/billing/tick',{},'Bearer '+env.BILLING_WORKER_TOKEN)};
}
test('NICE A2 encryption matches the published test vector and billing keys are owner-bound',async()=>{
 const secret='2dcc2a0d63bf469490bb19a201be3735';
 assert.equal(await encryptCard({...CARD,expYear:'25'},secret),'6ecfe97e521bc67c3053d74a9dbdba53033d343fc9e8e38e730964b22ef2e4a59607171b00a9da977141b3f79fffa1e80a16c08bc58666b479f554a966a363414347e62f2621f8df220c7a4a545592d0');
 const env={BILLING_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64')};
 const sealed=await sealBillingKey(env,'a-private-bid','owner');assert.equal(await openBillingKey(env,sealed,'owner'),'a-private-bid');
 await assert.rejects(openBillingKey(env,sealed,'other'));assert.notEqual(await sealBillingKey(env,'a-private-bid','owner'),sealed);
});
test('monthly billing retains the signup day across February and uses Korean calendar dates',()=>{
 const jan=Date.parse('2028-01-31T00:15:00+09:00')/1000,feb=nextBillingMonth(jan,31);
 assert.equal(new Date(feb*1000).toISOString(),'2028-02-28T15:15:00.000Z');
 assert.equal(new Date(nextBillingMonth(feb,31)*1000).toISOString(),'2028-03-30T15:15:00.000Z');
});
test('concurrent subscription requests charge once at the server price and never store raw card data',async t=>{
 const f=await setup(t);const results=await Promise.all([f.subscribe(),f.subscribe()]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
 const charges=f.calls.filter(c=>c.path.endsWith('/payments'));assert.equal(charges.length,1);assert.equal(charges[0].body.amount,4900);
 const p=f.sql.prepare('SELECT * FROM billing_payments').get(),s=f.sql.prepare('SELECT * FROM billing_subscriptions').get();
 assert.equal(p.status,'paid');assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,p.period_end);
 const stored=JSON.stringify([s,p]);for(const sensitive of [CARD.cardNo,CARD.idNo,'private-billing-key'])assert.equal(stored.includes(sensitive),false);
 assert.equal(f.calls.find(c=>c.path==='/v1/subscribe/regist').body.encMode,'A2');
 assert.equal((await f.call('/api/billing/status','GET',undefined,'other')).body.subscription,null);
});
test('signed and duplicate webhooks re-query payment state; forged signatures cannot grant access',async t=>{
 const f=await setup(t);await f.subscribe();const original=[...f.payments.values()][0],until=f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until;
 assert.equal((await f.invoke('/api/billing/nicepay/webhook',{...original,signature:'invalid'})).status,401);
 // The gateway signature does not cover status; the API remains authoritative.
 const tampered={...original,status:'cancelled',balanceAmt:0};
 assert.equal(await verifyNiceSignature(f.env,tampered),true);
 assert.equal((await f.invoke('/api/billing/nicepay/webhook',tampered)).body,'OK');
 assert.equal((await f.invoke('/api/billing/nicepay/webhook',original)).body,'OK');
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,until);
 assert.equal(f.sql.prepare('SELECT state FROM billing_subscriptions').get().state,'active');
});
test('ambiguous charge is recovered by lookup without submitting another payment',async t=>{
 const f=await setup(t);f.setUncertain(true);const result=await f.subscribe();
 assert.equal(result.status,200);assert.equal(result.body.subscription.payment_pending,true);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,0);
 await f.call('/api/billing/sync','POST',{});assert.equal(f.sql.prepare('SELECT status FROM billing_payments').get().status,'paid');
 await f.tick();assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,1);
});
test('cancellation keeps paid access, prevents renewal, and is idempotent',async t=>{
 const f=await setup(t);await f.subscribe();const before=f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until;
 await f.call('/api/billing/cancel','POST',{});await f.call('/api/billing/cancel','POST',{});
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,before);
 f.sql.prepare('UPDATE billing_subscriptions SET period_end=?').run(Math.floor(Date.now()/1000)-1);
 await Promise.all([f.tick(),f.tick()]);assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,1);
 assert.equal((await f.call('/api/billing/status')).body.subscription.renewing,false);
 assert.equal(f.sql.prepare('SELECT bid_cipher FROM billing_subscriptions').get().bid_cipher,null);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/expire')).length,1);
});
test('verified refund reduces entitlement and disables renewal, including a delayed duplicate',async t=>{
 const f=await setup(t);await f.subscribe();const p=f.sql.prepare('SELECT * FROM billing_payments').get(),gateway=f.payments.get(p.id);
 gateway.status='partialCancelled';gateway.balanceAmt=2450;
 assert.equal((await f.invoke('/api/billing/nicepay/webhook',gateway)).status,200);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,Math.floor(Date.now()/1000));
 gateway.status='cancelled';gateway.balanceAmt=0;await f.invoke('/api/billing/nicepay/webhook',gateway);
 gateway.status='paid';gateway.balanceAmt=4900;await f.invoke('/api/billing/nicepay/webhook',gateway);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,0);
 assert.equal(f.sql.prepare('SELECT cancel_requested FROM billing_subscriptions').get().cancel_requested,1);
});
test('monthly job charges once, and a failed renewal never grants another period',async t=>{
 const f=await setup(t);await f.subscribe();
 f.sql.prepare('UPDATE billing_subscriptions SET period_end=?').run(Math.floor(Date.now()/1000)-1);
 await Promise.all([f.tick(),f.tick()]);assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,2);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM billing_payments').get().n,2);
 const before=f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until;
 f.setChargeFailure(true);f.sql.prepare('UPDATE billing_subscriptions SET period_end=?').run(Math.floor(Date.now()/1000)-1);
 await f.tick();await f.tick();assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,3);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,before);
 assert.equal(f.sql.prepare('SELECT state FROM billing_subscriptions').get().state,'failed');
});
test('checkout requires authentication, consent and a healthy billing worker; worker endpoint is private',async t=>{
 const f=await setup(t);
 assert.equal((await f.call('/api/billing/subscribe','POST',{},null)).status,401);
 assert.equal((await f.call('/api/billing/subscribe','POST',{card:CARD})).status,400);
 assert.equal((await f.invoke('/internal/billing/tick',{},'Bearer wrong')).status,401);
 f.sql.exec('DELETE FROM billing_worker');assert.equal((await f.subscribe()).status,503);
 assert.equal(f.calls.filter(c=>c.path==='/v1/subscribe/regist').length,0);
});

test('mismatched gateway payment identity and amount cannot extend access',async t=>{
 const f=await setup(t);f.setUncertain(true);await f.subscribe();
 const gateway=[...f.payments.values()][0];gateway.mallReserved='different-subscription';
 assert.equal((await f.call('/api/billing/sync','POST',{})).status,502);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,0);
 gateway.mallReserved=f.sql.prepare('SELECT id FROM billing_subscriptions').get().id;gateway.amount=1;
 f.sql.exec('UPDATE billing_payments SET last_checked=0');
 assert.equal((await f.call('/api/billing/sync','POST',{})).status,502);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,0);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,1);
});

test('cancelling an unsent order closes it and blocks the worker from charging it',async t=>{
 const f=await setup(t);await f.subscribe();
 f.sql.exec("UPDATE billing_payments SET status='created',submitted_at=0; UPDATE billing_subscriptions SET state='pending'");
 await f.call('/api/billing/cancel','POST',{});await f.tick();
 assert.equal(f.sql.prepare('SELECT status FROM billing_payments').get().status,'failed');
 assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,1);
});

test('unsigned registration probes and unknown orders are acknowledged without creating payment or access',async t=>{
 const f=await setup(t);
 for(const body of [{},{orderId:'sample-order',amount:4900,status:'paid'}])assert.equal((await f.invoke('/api/billing/nicepay/webhook',body)).body,'OK');
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM billing_payments').get().n,0);
 assert.equal(f.sql.prepare("SELECT premium_until FROM users WHERE id='owner'").get().premium_until,0);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/payments')).length,0);
});
