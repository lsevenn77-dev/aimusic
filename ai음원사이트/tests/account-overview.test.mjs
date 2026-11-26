import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {eventEnd} from '../server/premium-event.js';

const summary='/api/account/summary',history='/api/account/payments';
const premiumProduct='kr.co.aifect.app.premium.monthly';

function web(sql,state,at,end,price=4200){
 sql.prepare(`INSERT INTO billing_subscriptions(id,user_id,state,cancel_requested,anchor_day,
  consent_version,consent_at,price,period_end,created,updated,last_payment_id)
  VALUES('sub','owner',?,?,1,'v',?,?,?,?,?,'pay')`).run(state,Number(state==='cancelled'),at,price,end,at,at);
 sql.prepare(`INSERT INTO billing_payments(id,subscription_id,cycle,amount,status,period_start,
  period_end,entitlement_end,created,updated) VALUES('pay','sub',1,?,'paid',?,?,?,?,?)`).run(price,at,end,end,at,at);
}
function play(sql,state,end){
 sql.prepare(`INSERT INTO play_purchases(token_hash,purchase_token,user_id,product_id,kind,state,expiry,created,updated)
  VALUES('internal-hash','private-token','owner','aifect_premium_monthly','subs',?,?,1,1)`).run(state,end);
}
function apple(sql,id,original,env,at,end,revoked=0){
 sql.prepare(`INSERT INTO apple_transactions(id,environment,transaction_id,original_id,user_id,product_id,
  purchased,expires,revoked,signed_date,created) VALUES(?,?,?,?, 'owner',?,?,?,?,?,?)`)
  .run('apple:'+env+':'+id,env,id,original,premiumProduct,at,end,revoked,at*1000,at);
}
function gold(sql,id,owner,channel,amount,at){
 sql.prepare(`INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,created,paid_at)
  VALUES(?,?,?,100,?,0,0,'paid',?,?)`).run(id,owner,channel,amount,at,at);
}

test('the account summary belongs to the session, reports anonymous errors and uses the enforced quota',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);
 f.sql.prepare("UPDATE tracks SET uploaded_at=? WHERE user_id='owner'").run(at);
 const result=await f.call(summary+'?user_id=other');
 assert.equal(result.status,200);
 assert.deepEqual(result.body.account,{id:'owner',nickname:'QA',email:'owner@example.test',provider:'email',created:eventEnd});
 assert.equal(result.body.plan,'free');
 assert.deepEqual(result.body.passes,[]);
 assert.equal(result.body.web_checkout_available,false);
 assert.equal(result.body.upload_quota.used,4);
 assert.equal(result.body.upload_quota.limit,3);
 assert.equal(result.body.upload_quota.remaining,0);
 assert.equal(result.body.upload_quota.resets_at,(await f.call('/api/membership')).body.membership.upload_quota.resets_at);
 for(const path of [summary,history]){
  assert.equal((await f.call(path,'GET',null,null)).status,401);
  assert.equal((await f.call(path,'POST',{})).status,405);
 }
 assert.equal((await f.call(history+'?kind=bogus')).status,400);
 assert.equal((await f.call(history+'?offset=-1')).status,400);
});

test('event and independently paid or granted passes survive each other at the KST boundary',async t=>{
 let clock=(eventEnd-120)*1000;
 t.mock.method(Date,'now',()=>clock);
 const at=clock/1000,paidEnd=eventEnd+86400,f=await fixture(t,{},at-86400);
 const event=(await f.call(summary)).body;
 assert.equal(event.plan,'premium');
 assert.deepEqual(event.passes,[{source:'event',state:'active',until:eventEnd,amount:0,renewing:null,next_billing_at:null}]);
 assert.deepEqual((await f.call(history)).body.payments,[]);
 assert.equal(event.upload_quota.limit,10);
 web(f.sql,'active',at,paidEnd);
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(paidEnd);
 const grants=eventEnd+3600;
 f.sql.prepare("INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES('audit','operator','premium_grant',?,?)")
  .run(JSON.stringify({user_id:'owner',until:grants}),at);
 const overlapping=(await f.call(summary)).body;
 assert.deepEqual(overlapping.passes.map(p=>p.source),['web','grant','event']);
 assert.equal(overlapping.passes[0].next_billing_at,paidEnd);
 assert.equal(overlapping.passes[0].amount,4200);
 clock=eventEnd*1000;
 const after=(await f.call(summary)).body;
 assert.deepEqual(after.passes.map(p=>p.source),['web','grant']);
 assert.equal(after.plan,'premium');
 f.sql.exec("UPDATE billing_subscriptions SET state='cancelled',cancel_requested=1");
 const cancelled=(await f.call(summary)).body.passes[0];
 assert.equal(cancelled.state,'expiring');
 assert.equal(cancelled.renewing,false);
 assert.equal(cancelled.next_billing_at,null);
});

test('Google and Apple entitlements expose only verified periods, with store-ledger gaps explicit',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000),until=at+3000;
 play(f.sql,'SUBSCRIPTION_STATE_CANCELED',until);
 apple(f.sql,'1','original','Production',at-300,until+500);
 apple(f.sql,'2','original','Production',at-100,until+600,at);
 apple(f.sql,'3','sandbox','Sandbox',at-20,until+10000);
 f.sql.prepare("UPDATE users SET premium_until=?,apple_premium_until=? WHERE id='owner'").run(until,until+500);
 const result=(await f.call(summary)).body;
 assert.deepEqual(result.passes.map(p=>[p.source,p.state,p.until,p.amount,p.renewing]),[
  ['google_play','expiring',until,null,false],['app_store','active',until+500,null,null]
 ]);
 assert.ok(!JSON.stringify(result).includes('private-token'));
 const ledger=(await f.call(history+'?kind=premium')).body;
 assert.deepEqual(ledger.store_history,['google_play','app_store']);
 assert.deepEqual(ledger.payments.map(p=>[p.source,p.state,p.amount]),[['app_store','refunded',null],['app_store','verified',null]]);
 f.sql.exec("UPDATE play_purchases SET state='refunded',expiry=0; UPDATE users SET premium_until=0,apple_premium_until=0; UPDATE apple_transactions SET revoked=2");
 const refunded=(await f.call(summary)).body;
 assert.equal(refunded.plan,'free');
 assert.deepEqual(refunded.passes.map(p=>p.state),['refunded','refunded']);
});

test('payment history excludes gifts, test lots, sandbox, exchanges and other users; filters and pages use real records',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);
 web(f.sql,'failed',at,at);
 f.sql.exec("UPDATE billing_payments SET status='review'");
 for(const [id,owner,channel,amount] of [
  ['test','owner','admin_test',500],['zero','owner','google_play',0],['trade','owner','diamond',500],
  ['other-order','other','nicepay',900],['review','owner','nicepay',100],['play_paid','owner','google_play',2400]
 ])gold(f.sql,id,owner,channel,amount,at);
 f.sql.exec("INSERT INTO play_purchases(token_hash,purchase_token,user_id,product_id,kind,state,created,updated) VALUES('paid','token','owner','gold','inapp_verified','paid',1,1)");
 f.sql.prepare(`INSERT INTO gold_orders(id,user_id,request_id,state,review_only,created,expires,updated)
 VALUES('review','owner','test','paid',1,?,?,?)`).run(at,at,at);
 const result=(await f.call(history)).body;
 assert.deepEqual(result.payments.map(p=>[p.kind,p.amount,p.state]).sort(),[['gold',2400,'paid'],['premium',null,'pending']]);
 assert.deepEqual((await f.call(history+'?kind=gold')).body.payments.map(p=>p.amount),[2400]);
 f.sql.exec("UPDATE play_purchases SET kind='inapp_unpriced' WHERE token_hash='paid'");
 assert.deepEqual((await f.call(history+'?kind=gold')).body.payments.map(p=>p.amount),[null]);
 assert.deepEqual((await f.call(history+'?user_id=owner','GET',null,'other')).body.payments.map(p=>p.amount),[900]);
 assert.equal((await f.call(summary)).body.passes[0].state,'pending');
 for(let i=0;i<34;i++)gold(f.sql,'web'+i,'owner','nicepay',1000+i,at+i+1);
 const first=(await f.call(history+'?kind=gold')).body;
 assert.equal(first.payments.length,30);
 const last=(await f.call(history+'?kind=gold&offset='+first.next_offset)).body;
 assert.equal(last.next_offset,null);
 assert.equal(last.payments.length,5);
 assert.equal(new Set([...first.payments,...last.payments].map(p=>p.amount)).size,35);
});
