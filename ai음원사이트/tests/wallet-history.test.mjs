import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('wallet receipts require the account and never accept another user scope',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/gold/history?currency=silver','GET',undefined,null)).status,401);
 assert.equal((await f.call('/api/gold/history?currency=diamonds')).status,400);
 assert.equal((await f.call('/api/gold/history?currency=gold','POST',{})).status,405);
 for(let i=1;i<=25;i++)f.sql.prepare('INSERT INTO free_gift_claims(user_id,day,kind,amount,created) VALUES(?,?,?,?,?)').run('owner',`2026-09-${String(i).padStart(2,'0')}`,'checkin',10,i);
 f.sql.exec("INSERT INTO free_gift_claims(user_id,day,kind,amount,created) VALUES('other','2026-10-25','cover',999,100)");
 const r=await f.call('/api/gold/history?currency=silver&user_id=other');
 assert.equal(r.status,200);assert.equal(r.body.earned.length,20);assert.equal(r.body.earned[0].created,25);assert.equal(r.body.earned.at(-1).created,6);assert.ok(r.body.earned.every(x=>x.amount===10));assert.deepEqual(r.body.spent,[]);
});

test('gold receipts show charges and refunds separately without changing money',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('own','owner','web',100,1000,'paid',1,2),('secret','other','web',999,9990,'paid',3,4),('pending','owner','web',777,7770,'pending',5,0)");
 f.sql.exec("INSERT INTO dubbing_gold_orders(job_id,user_id,project_id,gold,state,created,updated) VALUES('job','owner','project',20,'refunded',10,15),('secret-job','other','project',99,'charged',30,30)");
 f.sql.exec("INSERT INTO dubbing_gold_lots(job_id,purchase_id,gold,refunded_gold) VALUES('job','own',20,20)");
 const before=f.sql.prepare('SELECT * FROM gold_purchases ORDER BY id').all();
 const r=await f.call('/api/gold/history?currency=gold');
 assert.equal(r.status,200);assert.deepEqual(r.body.earned.map(x=>[x.kind,x.amount]),[['dubbing_refund',20],['purchase',100]]);assert.deepEqual(r.body.spent.map(x=>[x.kind,x.amount]),[['dubbing',20]]);
 assert.deepEqual(f.sql.prepare('SELECT * FROM gold_purchases ORDER BY id').all(),before);
});


test('inventory purchases count once when a stored gift is later sent',async t=>{
 const f=await fixture(t);
 const {GIFT_CATALOG,SILVER_GIFT_CATALOG}=await import('../shared/gifts.js');
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,status,created,paid_at) VALUES('funds','owner','web',10000,100000,'paid',1,1)");
 f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('owner',10000)");
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('recipient','other','Other',0)");
 for(const [currency,gift] of [['gold',GIFT_CATALOG[0]],['silver',SILVER_GIFT_CATALOG[0]]]){
  const buy=await f.call('/api/me/gift-inventory/buy','POST',{gift_type:gift.id,quantity:2,request_id:`purchase-${currency}-receipt-test`});assert.equal(buy.status,201,JSON.stringify(buy.body));
  const item=buy.body.items.find(x=>x.currency===currency);
  const sent=await f.call(`/api/me/gift-inventory/${item.id}/send`,'POST',{profile_id:'recipient',request_id:`send-${currency}-receipt-test`});assert.equal(sent.status,200,JSON.stringify(sent.body));
  const history=await f.call(`/api/gold/history?currency=${currency}`);assert.equal(history.status,200);
  assert.deepEqual(history.body.spent.map(x=>[x.kind,x.amount]),[['inventory',2*(gift.gold||gift.silver)]]);
 }
});
