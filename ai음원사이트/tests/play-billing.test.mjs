import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {verifiedGold,verifiedSubscription,verifyPlay,playAccountId} from '../server/play-billing.js';
import {playProduct} from '../shared/play-products.js';
import {goldBalance} from '../server/gifts.js';
import {generateKeyPair,exportPKCS8} from 'jose';
import {allocateLots} from '../shared/gifts.js';
const gold=playProduct('aifect_gold_500'),sub=playProduct('aifect_premium_monthly');
const receipt=account=>({obfuscatedExternalAccountId:account,orderId:'GPA.test',purchaseStateContext:{purchaseState:'PURCHASED'},productLineItem:[{productId:gold.id,productOfferDetails:{quantity:1,refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]});
test('gold binds account and validates actual nested offer and pending/refunded purchases',async()=>{
 const account=await playAccountId('owner');assert.equal(verifiedGold(receipt(account),gold,account).consumed,false);
 assert.throws(()=>verifiedGold(receipt('wrong'),gold,account));
 const pending=receipt(account);pending.purchaseStateContext.purchaseState='PENDING';assert.throws(()=>verifiedGold(pending,gold,account));
 for(const quantity of [0,2]){const data=receipt(account);data.productLineItem[0].productOfferDetails.quantity=quantity;assert.throws(()=>verifiedGold(data,gold,account));}
 const refund=receipt(account);refund.productLineItem[0].productOfferDetails.refundableQuantity=0;assert.throws(()=>verifiedGold(refund,gold,account));
});
test('subscription respects cancelled prepaid time, grace and account hold',async()=>{
 const account=await playAccountId('owner'),expiry=Math.floor(Date.now()/1000)+3600;
 const data={externalAccountIdentifiers:{obfuscatedExternalAccountId:account},lineItems:[{productId:sub.id,offerDetails:{basePlanId:'monthly'},expiryTime:new Date(expiry*1000).toISOString()}]};
 for(const state of ['ACTIVE','IN_GRACE_PERIOD','CANCELED'])assert.equal(verifiedSubscription({...data,subscriptionState:'SUBSCRIPTION_STATE_'+state},sub,account).expiry,expiry);
 assert.equal(verifiedSubscription({...data,subscriptionState:'SUBSCRIPTION_STATE_ON_HOLD'},sub,account).expiry,0);
 assert.throws(()=>verifiedSubscription(data,sub,'wrong'));
});
test('gold replay credits once, consumes after commit, and freezes refunded remainder',async t=>{
 const f=await fixture(t),{privateKey}=await generateKeyPair('RS256',{extractable:true});
 const env={DB:f.DB,PLAY_SERVICE_ACCOUNT:JSON.stringify({client_email:'billing-test@example.test',private_key:await exportPKCS8(privateKey)})};
 const account=await playAccountId('owner'),original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let consumed=false;
 globalThis.fetch=async url=>{
  if(url.includes('oauth2'))return Response.json({access_token:'test',expires_in:3600});
  if(url.endsWith(':consume')){assert.equal(await goldBalance(env,'owner'),500);consumed=true;return new Response(null,{status:204});}
  const data=receipt(account);if(consumed)data.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';return Response.json(data);
 };
 await verifyPlay(env,{id:'owner'},'purchase-token-test',gold);await verifyPlay(env,{id:'owner'},'purchase-token-test',gold);
 assert.equal(await goldBalance(env,'owner'),500);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM gold_purchases').get().n,1);
 f.sql.exec("UPDATE play_purchases SET state='refunded'");assert.equal(await goldBalance(env,'owner'),0);
 await assert.rejects(()=>verifyPlay(env,{id:'owner'},'purchase-token-test',gold));
});
test('unconfigured checkout and notifications fail closed',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/play/catalog')).body.available,false);
 assert.equal((await f.call('/api/play/verify','POST',{account_id:'owner',product_id:gold.id,purchase_token:'purchase-token-test'})).status,503);
 assert.equal((await f.call('/api/play/notifications','POST',{})).status,503);
});

test('Google test payments credit once with zero settlement value and repair an unused legacy test lot',async t=>{
 const f=await fixture(t),{privateKey}=await generateKeyPair('RS256',{extractable:true});
 const env={DB:f.DB,PLAY_SERVICE_ACCOUNT:JSON.stringify({client_email:'test-payments@example.test',private_key:await exportPKCS8(privateKey)})};
 const account=await playAccountId('owner'),original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 const consumed=new Set();let testPayment=true;
 globalThis.fetch=async url=>{
  if(url.includes('oauth2'))return Response.json({access_token:'test',expires_in:3600});
  const token=url.split('/tokens/')[1].replace(':consume','');
  if(url.endsWith(':consume')){consumed.add(token);return new Response(null,{status:204});}
  const data=receipt(account);data.orderId='GPA.'+token;if(testPayment)data.testPurchaseContext={fopType:'TEST'};
  if(consumed.has(token))data.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
  return Response.json(data);
 };
 await verifyPlay(env,{id:'owner'},'test-gold-receipt',gold);
 await verifyPlay(env,{id:'owner'},'test-gold-receipt',gold);
 assert.equal(await goldBalance(env,'owner'),500);
 const lot=f.sql.prepare('SELECT * FROM gold_purchases').get();
 assert.equal(lot.price_krw,0);assert.equal(lot.fee_krw,0);
 assert.equal(allocateLots([lot],500)[0].net_mw,0);
 f.sql.prepare('UPDATE gold_purchases SET price_krw=5000,fee_krw=750 WHERE id=?').run(lot.id);
 await verifyPlay(env,{id:'owner'},'test-gold-receipt',gold);
 assert.equal(f.sql.prepare('SELECT price_krw FROM gold_purchases WHERE id=?').get(lot.id).price_krw,0);
 assert.equal(await goldBalance(env,'owner'),500);
 testPayment=false;
 await verifyPlay(env,{id:'owner'},'real-gold-receipt',gold);
 const real=f.sql.prepare('SELECT * FROM gold_purchases WHERE price_krw>0').get();
 assert.equal(real.price_krw,5000);assert.equal(real.fee_krw,750);
 assert.equal(allocateLots([real],500)[0].net_mw,4250000);
});
