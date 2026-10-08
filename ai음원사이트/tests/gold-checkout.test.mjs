import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {digest} from '../server/nicepay.js';
import {allocateLots,splitGift} from '../shared/gifts.js';
const SECRET='test-gold-secret';
async function setup(t,overrides={}){
 const payments=new Map(),calls=[];let timeout=false;
 const env={NICEPAY_CLIENT_ID:'client',NICEPAY_SECRET_KEY:SECRET,GOLD_CHECKOUT_ENABLED:'true',GOLD_WEB_FEE_BP:'350',...overrides};
 env.NICEPAY_HTTP=async(url,options)=>{
  const path=new URL(url).pathname,b=options.body?JSON.parse(options.body):null;calls.push({path,b});
  if(path.startsWith('/v1/payments/find/'))return Response.json(payments.get(path.split('/').at(-1))||{resultCode:'3010'});
  if(path==='/v1/payments/netcancel'){const p=payments.get(b.orderId);if(p){p.status='cancelled';p.balanceAmt=0;}return Response.json(p||{resultCode:'3010'});}
  if(path.startsWith('/v1/payments/')){const oid=path.split('/').at(-1).slice(4),p={resultCode:'0000',tid:'tid_'+oid,orderId:oid,amount:b.amount,balanceAmt:b.amount,currency:'KRW',payMethod:'card',status:'paid'};payments.set(oid,p);if(timeout)throw Error('timeout');return Response.json(p);}
  throw Error('Unexpected gateway call');
 };
 const f=await fixture(t,env);env.DB=f.DB;
 const create=(gold=500,request_id=crypto.randomUUID(),user='owner')=>f.call('/api/gold/checkout','POST',{gold,request_id,consent:true,price:1},user);
 const callback=async(checkout,extra={},queryOverride)=>{
  const p=checkout.body.payment,b={authResultCode:'0000',clientId:'client',orderId:p.orderId,amount:String(p.amount),mallReserved:p.orderId,tid:'tid_'+p.orderId,authToken:'auth',signature:await digest('authclient'+p.amount+SECRET),...extra};
  return worker.fetch(new Request(queryOverride||p.returnUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(b)}),env,{waitUntil(){}});
 };
 return {...f,env,create,callback,payments,calls,timeout:()=>{timeout=true;}};
}
test('gold uses the four server prices, explicit one-time consent, and idempotent orders',async t=>{
 const f=await setup(t),rid=crypto.randomUUID();const [a,b]=await Promise.all([f.create(500,rid),f.create(500,rid)]);
 assert.equal(a.status,201);assert.equal(b.status,201);assert.equal(a.body.order.id,b.body.order.id);assert.equal(a.body.payment.amount,5000);assert.equal(a.body.payment.method,'card');assert.equal(a.body.order.gold,525);assert.match(a.body.payment.goodsName,/525G/);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gold_purchases').get().n,1);assert.equal((await f.call('/api/gold')).body.balance,0);
 assert.equal((await f.create(1000,rid)).status,409);assert.equal((await f.create(100)).status,400);assert.equal((await f.create(500,crypto.randomUUID(),null)).status,401);
 assert.equal((await f.call('/api/gold/checkout','POST',{gold:500,request_id:crypto.randomUUID()})).status,400);
 for(const [gold,amount,total] of [[1000,10000,1050],[5000,50000,5250],[10000,100000,10500]]){const o=await f.create(gold);assert.equal(o.body.payment.amount,amount);assert.equal(o.body.order.gold,total);}
 const wallet=(await f.call('/api/gold')).body;assert.equal(wallet.web_bonus_percent,5);
 assert.deepEqual(wallet.packs.map(p=>p.gold),[500,1000,5000,10000],'existing native consumers retain base packs');
 assert.deepEqual(wallet.web_packs.map(p=>[p.gold,p.bonus_gold,p.total_gold,p.price]),[[500,25,525,5000],[1000,50,1050,10000],[5000,250,5250,50000],[10000,500,10500,100000]]);
 const forged=await f.call('/api/gold/checkout','POST',{gold:500,bonus_gold:999,total_gold:1499,price:1,request_id:crypto.randomUUID(),consent:true});assert.equal(forged.body.order.gold,525);assert.equal(forged.body.payment.amount,5000);
 assert.equal((await f.create(525)).status,400,'checkout accepts base pack ID, not client-supplied delivered quantity');
});
test('forged callbacks cannot charge; verified duplicate callbacks credit exactly once and never create a subscription',async t=>{
 const f=await setup(t),o=await f.create();assert.equal((await f.callback(o,{amount:'1'})).status,403);assert.equal((await f.callback(o,{signature:'bad'})).status,403);assert.equal((await f.callback(o,{},o.body.payment.returnUrl.replace(/state=.*/, 'state=wrong'))).status,403);assert.equal(f.calls.length,0);
 await Promise.all([f.callback(o),f.callback(o)]);await f.callback(o);
 assert.equal(f.calls.filter(x=>x.path==='/v1/payments/tid_'+o.body.order.id).length,1);assert.equal((await f.call('/api/gold')).body.balance,525);
 const lot=f.sql.prepare('SELECT * FROM gold_purchases').get();assert.equal(lot.price_krw,5000);assert.equal(lot.fee_krw,175);assert.equal(lot.tax_krw,455);assert.equal(lot.status,'paid');assert.equal(f.sql.prepare('SELECT count(*) n FROM billing_subscriptions').get().n,0);
 assert.equal((await f.call('/api/gold/orders/'+o.body.order.id,'GET',undefined,'other')).status,404);
});
test('review login can open the real hosted window without any approval or gold credit',async t=>{
 const f=await setup(t,{GOLD_CHECKOUT_ENABLED:'false',BILLING_REVIEW_USER_IDS:'owner',BILLING_REVIEW_UNTIL:'2000000000'}),o=await f.create();
 assert.equal(o.status,201);assert.equal(o.body.order.review_only,true);assert.equal((await f.callback(o)).status,303);assert.equal(f.calls.length,0);assert.equal((await f.call('/api/gold')).body.balance,0);
 f.env.GOLD_CHECKOUT_ENABLED='true';assert.equal((await f.callback(o)).status,303);assert.equal(f.calls.length,0);
 assert.equal((await f.call('/api/billing/subscribe','POST',{})).status,403);
});
test('ambiguous approval triggers network cancel and does not credit the returned canceled payment',async t=>{
 const f=await setup(t),o=await f.create();f.timeout();assert.equal((await f.callback(o)).status,303);assert.equal(f.calls.filter(x=>x.path==='/v1/payments/netcancel').length,1);assert.equal((await f.call('/api/gold')).body.balance,0);assert.equal(f.sql.prepare('SELECT state FROM gold_orders').get().state,'cancelled');await f.callback(o);assert.equal(f.calls.filter(x=>x.path.startsWith('/v1/payments/tid_')).length,1);
});
test('refund verification freezes spent lots and prevents races with gifts and settlement',async t=>{
 const f=await setup(t),o=await f.create();await f.callback(o);f.sql.exec('UPDATE gold_purchases SET used=1');const p=f.payments.get(o.body.order.id);p.status='partialCancelled';p.balanceAmt=4000;f.sql.exec('UPDATE gold_orders SET last_checked=0');
 assert.equal((await f.call('/api/gold/orders/'+o.body.order.id,'POST',{})).status,200);assert.equal((await f.call('/api/gold')).body.balance,0);assert.equal(f.sql.prepare('SELECT state FROM gold_orders').get().state,'refund_review');assert.throws(()=>f.sql.exec('UPDATE gold_purchases SET used=used+1'),/CHECK constraint/);
 p.status='paid';p.balanceAmt=5000;f.sql.exec('UPDATE gold_orders SET last_checked=0');await f.call('/api/gold/orders/'+o.body.order.id,'POST',{});assert.equal((await f.call('/api/gold')).body.balance,0);
});
test('production checkout remains off without an explicit contract fee, even with the sales flag on',async t=>{
 const f=await setup(t,{GOLD_WEB_FEE_BP:''});assert.equal((await f.create()).status,409);assert.equal(f.calls.length,0);
});


test('full refund removes the entire web bonus lot and delayed success cannot re-credit it',async t=>{
 const f=await setup(t),o=await f.create();await f.callback(o);assert.equal((await f.call('/api/gold')).body.balance,525);
 const p=f.payments.get(o.body.order.id);p.status='cancelled';p.balanceAmt=0;f.sql.exec('UPDATE gold_orders SET last_checked=0');
 await f.call('/api/gold/orders/'+o.body.order.id,'POST',{});
 assert.equal((await f.call('/api/gold')).body.balance,0);assert.equal(f.sql.prepare('SELECT status FROM gold_purchases').get().status,'refunded');
 p.status='paid';p.balanceAmt=5000;f.sql.exec('UPDATE gold_orders SET last_checked=0');await f.call('/api/gold/orders/'+o.body.order.id,'POST',{});await f.callback(o);
 assert.equal((await f.call('/api/gold')).body.balance,0);
});

test('legacy pending order retries preserve the original quantity and new orders receive the bonus',async t=>{
 const f=await setup(t),rid=crypto.randomUUID(),o=await f.create(500,rid);
 f.sql.prepare('UPDATE gold_purchases SET gold=500 WHERE id=?').run(o.body.order.id);
 const retry=await f.create(500,rid);assert.equal(retry.body.order.id,o.body.order.id);assert.equal(retry.body.order.gold,500);
 await f.callback(retry);assert.equal((await f.call('/api/gold')).body.balance,500);
 const next=await f.create();await f.callback(next);assert.equal((await f.call('/api/gold')).body.balance,1025);
});

test('web bonus gold shares one recorded purchase value; tax and fees are not deducted again',async t=>{
 const f=await setup(t),o=await f.create();await f.callback(o);
 const lot=f.sql.prepare('SELECT * FROM gold_purchases').get();assert.equal(lot.gold,525);
 const all=allocateLots([lot],525);assert.equal(all[0].net_mw,(5000-175-455)*1000);
 const first=allocateLots([lot],500),last=allocateLots([{...lot,used:500}],25);
 assert.equal(first[0].net_mw+last[0].net_mw,all[0].net_mw);
 const shares=splitGift('original',all[0].net_mw);assert.equal(shares.creator,3059000);assert.equal(shares.platform,1311000);
});
