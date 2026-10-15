import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {SILVER_GIFT_CATALOG} from '../shared/gifts.js';

async function setup(t){
 const f=await fixture(t);
 f.sql.exec("INSERT INTO free_gift_wallets(user_id,balance) VALUES('other',10000); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('paid','other','web',10000,110000,4400,'paid',1,1)");
 return f;
}
test('silver catalog matches the approved nine gifts and historical receipts retain one unit',async t=>{
 const f=await setup(t),catalog=(await f.call('/api/gifts/catalog')).body;
 assert.deepEqual(catalog.silver_gifts.map(g=>[g.name,g.silver]),[['손편지',2],['반짝 스티커',5],['은종',10],['리본 배지',20],['작은 부케',50],['포토액자',100],['응원 등불',200],['미니 트로피',500],['달빛 오르골',1000]]);
 f.sql.exec("INSERT INTO free_gifts(id,sender_id,track_id,request_id,created) VALUES('legacy','other','one','legacy-request-12345',1)");
 assert.deepEqual({...f.sql.prepare('SELECT silver,quantity,gift_type FROM free_gifts').get()},{silver:1,quantity:1,gift_type:'star'});
 assert.equal((await f.call('/api/tracks/one/gifts')).body.free_count,1);
});
test('silver quantity spends once, freezes the receipt and contributes total silver to rankings',async t=>{
 const f=await setup(t),body={gift_type:'silver-bouquet',quantity:5,silver:250,request_id:'silver-request-12345'};
 const [a,b]=await Promise.all([f.call('/api/tracks/one/gifts','POST',body,'other'),f.call('/api/tracks/one/gifts','POST',body,'other')]);
 assert.equal(a.body.gift.id,b.body.gift.id);assert.equal(a.body.free_balance,9750);assert.equal(a.body.gift.quantity,5);
 assert.equal((await f.call('/api/tracks/one/gifts')).body.ranking[0].score,250);
 assert.equal((await f.call('/api/producers/producer/gifts')).body.free_count,250);
 const wallet=(await f.call('/api/gold','GET',undefined,'other')).body;
 assert.equal(wallet.balance,10000);assert.equal(wallet.free_sent[0].gift_name,'작은 부케');assert.equal(wallet.free_sent[0].silver,250);assert.equal(wallet.free_sent[0].quantity,5);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gifts').get().n,0);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{...body,quantity:2,silver:100},'other')).status,409);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{...body,silver:1},'other')).status,400);
});
test('silver concurrent sends cannot overdraw and personal recipients receive the same quantity semantics',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE free_gift_wallets SET balance=3 WHERE user_id='other'");
 const results=await Promise.all(['a','b'].map(x=>f.call('/api/producers/producer/gifts','POST',{gift_type:'silver-letter',quantity:1,request_id:'silver-concurrent-'+x},'other')));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 assert.equal(f.sql.prepare("SELECT balance FROM free_gift_wallets WHERE user_id='other'").get().balance,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM free_gifts').get().n,1);
 assert.equal((await f.call('/api/producers/producer/gifts')).body.free_count,2);
});
test('gold quantity charges total price, allocates only that total and retries are idempotent',async t=>{
 const f=await setup(t),body={gift_type:'crown',quantity:3,gold:2331,request_id:'gold-quantity-12345'};
 const result=await f.call('/api/tracks/one/gifts','POST',body,'other');assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(result.body.balance,7669);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',body,'other')).body.gift.id,result.body.gift.id);
 const receipt=f.sql.prepare('SELECT gold,quantity,net_mw FROM gifts').get();assert.equal(receipt.gold,2331);assert.equal(receipt.quantity,3);assert.equal(receipt.net_mw,24615360);
 assert.equal(f.sql.prepare('SELECT sum(gold) n FROM gift_lots').get().n,2331);
 assert.equal((await f.call('/api/gold','GET',undefined,'other')).body.sent[0].quantity,3);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{...body,quantity:2,gold:1554},'other')).status,409);
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{...body,gold:777},'other')).status,400);
});
test('both currencies reject invalid quantities before modifying any wallet',async t=>{
 const f=await setup(t);
 for(const gift_type of ['silver-letter','heart'])for(const quantity of [0,-1,1.5,101,'2',null]){
  const r=await f.call('/api/tracks/one/gifts','POST',{gift_type,quantity,request_id:'bad-quantity-12345'},'other');
  assert.equal(r.status,400,JSON.stringify({gift_type,quantity,r}));
 }
 assert.equal((await f.call('/api/tracks/one/gifts','POST',{gift_type:'moon',quantity:100,request_id:'too-many-gold-12345'},'other')).status,400);
});
