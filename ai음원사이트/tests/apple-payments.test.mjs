import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {fulfillApple,verifyApple} from '../server/apple-payments.js';
const premium='kr.co.aifect.app.premium.monthly',gold='kr.co.aifect.app.gold.500';
async function setup(t){
 const f=await fixture(t),r=await f.call('/api/apple/account','POST',{});
 assert.equal(r.status,200);
 const transaction={bundleId:'kr.co.aifect.app',environment:'Production',transactionId:'12345',originalTransactionId:'12345',productId:gold,type:'Consumable',appAccountToken:r.body.app_account_token,inAppOwnershipType:'PURCHASED',quantity:1,currency:'KRW',price:5000000,purchaseDate:Date.now()-1000,signedDate:Date.now()};
 return {...f,transaction,fulfill:payload=>fulfillApple({DB:f.DB},payload,{id:'owner'})};
}
test('account binding stable and transactions cannot be forged from JSON',async t=>{
 const f=await setup(t);assert.equal((await f.call('/api/apple/account','POST',{})).body.app_account_token,f.transaction.appAccountToken);
 assert.equal((await f.call('/api/apple/account','POST',{},null)).status,401);
 const forged=Buffer.from(JSON.stringify(f.transaction)).toString('base64url');
 assert.equal((await f.call('/api/apple/transactions','POST',{signed_transaction:'eyJhbGciOiJub25lIn0.'+forged+'.'})).status,400);
 assert.equal((await f.call('/api/gold')).body.balance,0);
 await assert.rejects(verifyApple('invalid'));
 await assert.rejects(fulfillApple({DB:f.DB},f.transaction,{id:'other'}),e=>e.status===409);
});
test('duplicate and concurrent verified deliveries credit gold once; sandbox has no real balance',async t=>{
 const f=await setup(t);await Promise.all([f.fulfill(f.transaction),f.fulfill(f.transaction)]);
 assert.equal((await f.call('/api/gold')).body.balance,500);
 await f.fulfill({...f.transaction,environment:'Sandbox',transactionId:'999'});
 assert.equal((await f.call('/api/gold')).body.balance,500);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gold_purchases').get().n,1);
 const lot=f.sql.prepare('SELECT tax_krw,fee_krw FROM gold_purchases').get();assert.equal(lot.tax_krw,455);assert.equal(lot.fee_krw,682,'Apple fee is calculated after the sales tax reserve');
});
test('refund removes remaining gold and stale delivery cannot restore it',async t=>{
 const f=await setup(t);await f.fulfill(f.transaction);
 f.sql.exec('UPDATE gold_purchases SET used=20');
 await f.fulfill({...f.transaction,revocationDate:Date.now(),signedDate:Date.now()});
 await f.fulfill(f.transaction);
 assert.equal((await f.call('/api/gold')).body.balance,0);
 assert.equal(f.sql.prepare('SELECT refund_review FROM apple_transactions').get().refund_review,1);
});
test('Apple premium respects server limits and refund preserves independent web entitlement',async t=>{
 const f=await setup(t),end=Date.now()+86400000;
 const tx={...f.transaction,productId:premium,type:'Auto-Renewable Subscription',expiresDate:end};
 await f.fulfill(tx);assert.equal((await f.call('/api/membership')).body.membership.playlist_limit,10);
 for(let i=0;i<3;i++)assert.equal((await f.call('/api/playlists','POST',{name:'Apple '+i})).status,201);
 f.sql.exec('UPDATE users SET premium_until=unixepoch()+3600 WHERE id=\'owner\'');
 await f.fulfill({...tx,revocationDate:Date.now(),signedDate:Date.now()});
 assert.equal((await f.call('/api/membership')).body.membership.plan,'premium');
 f.sql.exec('UPDATE users SET premium_until=0 WHERE id=\'owner\'');
 assert.equal((await f.call('/api/membership')).body.membership.playlist_limit,2);
 assert.equal((await f.call('/api/playlists','POST',{name:'Blocked'})).status,409);
});
test('new renewal survives older revocation and sandbox premium never unlocks production',async t=>{
 const f=await setup(t),tx={...f.transaction,productId:premium,type:'Auto-Renewable Subscription',expiresDate:Date.now()+86400000};
 await f.fulfill({...tx,environment:'Sandbox'});assert.equal((await f.call('/api/membership')).body.membership.plan,'free');
 await f.fulfill(tx);await f.fulfill({...tx,transactionId:'12346',expiresDate:Date.now()+172800000});
 await f.fulfill({...tx,revocationDate:Date.now(),signedDate:Date.now()});
 assert.equal((await f.call('/api/membership')).body.membership.plan,'premium');
});
test('verified refund reversal restores only unspent gold; duplicate and older refunds are harmless',async t=>{
 const f=await setup(t),base=Date.now()-10000,tx={...f.transaction,purchaseDate:base-1000,signedDate:base};
 await f.fulfill(tx);f.sql.exec('UPDATE gold_purchases SET used=20');
 const refund={...tx,revocationDate:base+1000,signedDate:base+2000};await f.fulfill(refund);
 await fulfillApple({DB:f.DB},{...tx,signedDate:base+3000},null,{refundReversed:true});
 assert.equal((await f.call('/api/gold')).body.balance,480);
 await f.fulfill(refund);
 assert.equal((await f.call('/api/gold')).body.balance,480);
 assert.equal(f.sql.prepare('SELECT refund_review FROM apple_transactions').get().refund_review,0);
});
