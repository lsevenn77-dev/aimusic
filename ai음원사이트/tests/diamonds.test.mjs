import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';
import {splitGift} from '../shared/gifts.js';
async function setup(t){const f=await fixture(t,{ADMIN_USER_IDS:'admin'});f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('admin','admin@test.test','admin',0)");f.sql.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,'admin',?)").run(await hash('admin'),Math.floor(Date.now()/1000)+3600);return f;}
function credit(f,user,mw,key='seed'){f.sql.prepare("INSERT INTO diamond_ledger(id,user_id,kind,source_key,amount_mw,eligible_mw,period,detail,created) VALUES(?,?,'stream',?,?,?,'2020-01','verified fixture',0)").run(key,user,key,mw,mw);}
test('general originals 60%, partners 70%, covers only pay singer 70%',()=>{
 assert.deepEqual(splitGift('original',1000000),{singer:0,creator:600000,platform:400000});
 assert.deepEqual(splitGift('original',1000000,true),{singer:0,creator:700000,platform:300000});
 assert.deepEqual(splitGift('cover',1000000),{singer:700000,creator:0,platform:300000});
});
test('500 diamonds becomes 5000 spendable gold once; pennies retained; no new fee or tax',async t=>{
 const f=await setup(t);credit(f,'owner',50000001);
 assert.equal((await f.call('/api/diamonds','GET',undefined,null)).status,401);
 const b={diamonds:500,request_id:'diamond-request-001'};
 const [a,c]=await Promise.all([f.call('/api/diamonds/exchange','POST',b),f.call('/api/diamonds/exchange','POST',b)]);
 assert.equal(a.status,201,JSON.stringify(a));assert.equal(c.body.id,a.body.id);assert.equal(a.body.gold,5000);
 const lot=f.sql.prepare("SELECT * FROM gold_purchases WHERE channel='diamond'").get();
 assert.deepEqual([lot.gold,lot.price_krw,lot.tax_krw,lot.fee_krw],[5000,50000,0,0]);
 const w=(await f.call('/api/diamonds')).body;assert.equal(w.balance_mw,1);assert.equal(w.balance,0.00001);assert.equal(w.partner.eligible_krw,50000);
 assert.equal((await f.call('/api/diamonds/exchange','POST',{...b,diamonds:1})).status,409);
 assert.equal((await f.call('/api/diamonds/exchange','POST',{diamonds:1.1,request_id:'diamond-request-003'})).status,400);
 assert.equal((await f.call('/api/gold')).body.balance,5000);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('otherp','other','Other',0)");
 assert.equal((await f.call('/api/producers/otherp/gifts','POST',{gold:100})).status,201);
 assert.equal(f.sql.prepare('SELECT creator_mw FROM gifts').get().creator_mw,600000);
});
test('different concurrent requests cannot overspend or credit gold after failure',async t=>{
 const f=await setup(t);credit(f,'owner',50000000);
 const r=await Promise.all([1,2].map(i=>f.call('/api/diamonds/exchange','POST',{diamonds:400,request_id:'concurrent-exchange-'+i})));
 assert.deepEqual(r.map(x=>x.status).sort(),[201,409]);assert.equal((await f.call('/api/gold')).body.balance,4000);assert.equal((await f.call('/api/diamonds')).body.balance,100);
});
test('partner needs verified final million; exclusion removes qualification, spend does not',async t=>{
 const f=await setup(t),body={user_id:'owner',basis:'earned',reason:'증빙 검토 완료',verified:true};
 assert.equal((await f.call('/api/admin/diamonds/partner','POST',body,'other')).status,404);
 assert.equal((await f.call('/api/admin/diamonds/partner','POST',body,'admin')).status,409);
 credit(f,'owner',1000000000);
 assert.equal((await f.call('/api/diamonds')).body.partner.tier,'general');
 assert.equal((await f.call('/api/admin/diamonds/partner','POST',body,'admin')).body.tier,'partner');
 await f.call('/api/diamonds/exchange','POST',{diamonds:500,request_id:'partner-exchange-0001'});
 assert.equal((await f.call('/api/diamonds')).body.partner.tier,'partner');
 assert.equal((await f.call('/api/admin/diamonds/reverse','POST',{id:'seed',reason:'부정 수익 확인'},'admin')).status,200);
 const w=(await f.call('/api/diamonds')).body;assert.equal(w.partner.tier,'general');assert.equal(w.balance,-500);
 assert.equal((await f.call('/api/diamonds/exchange','POST',{diamonds:1,request_id:'excluded-exchange-001'})).status,409);
 assert.equal((await f.call('/api/admin/diamonds/partner','POST',{...body,basis:'special'},'admin')).body.tier,'partner');
});
test('cash reserves only diamonds, no extra 10%, one monthly request, same-request retry',async t=>{
 const f=await setup(t);credit(f,'owner',50000000);
 f.sql.exec("INSERT INTO payout_accounts(user_id,holder,bank,account_last4,account_cipher,resident_hint,resident_cipher,consent_at,updated) VALUES('owner','홍길동','신한','1234','test','test','test',0,0)");
 const b={diamonds:500,request_id:'cash-request-00001'},r=await f.call('/api/diamonds/payout','POST',b);
 assert.equal(r.status,201,JSON.stringify(r));assert.equal((await f.call('/api/diamonds/payout','POST',b)).body.id,r.body.id);
 const st=f.sql.prepare('SELECT * FROM payout_statements').get();assert.equal(st.gross_krw,50000);assert.equal(st.net_krw,48350);assert.equal((await f.call('/api/diamonds')).body.balance,0);
 assert.equal((await f.call('/api/diamonds')).body.partner.eligible_krw,50000,'cash reservation is not counted twice toward partner');
 assert.equal((await f.call('/api/diamonds/exchange','POST',{diamonds:1,request_id:'spent-cash-request-01'})).status,409);
});
test('monthly close credits cover singer only and never silently makes a cash transfer',async t=>{
 const f=await setup(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('singer','other','Singer',0); INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,singer_profile_id,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created) VALUES('g','owner','one',1000,10000000,'singer','producer',7000000,0,3000000,'2020-01',0)");
 const r=await f.call('/api/admin/payouts/close','POST',{period:'2020-01'},'admin');assert.equal(r.status,201,JSON.stringify(r));assert.equal(r.body.credited,1);
 assert.equal((await f.call('/api/diamonds','GET',undefined,'other')).body.balance,70);assert.equal((await f.call('/api/diamonds')).body.balance,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM payout_statements').get().n,0);
 assert.equal((await f.call('/api/admin/payouts/close','POST',{period:'2020-01'},'admin')).status,409);
});
test('verified subscription pool stays 50/50 and cover listens accrue to original owner',async t=>{
 const f=await setup(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('singer','other','Singer',0); INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES('cover','other','artist','singer','Cover','Rock','',1,'wav',1,0,'published','cover','one'); INSERT INTO listens(id,track_id,listener,user_id,started,seconds,day,qualified) VALUES('l','cover','visitor',NULL,1,150,'2020-01-03',1)");
 const b={period:'2020-01',paidKRW:10000,refundedKRW:0,paymentFeeKRW:1500,taxKRW:900,evidence:'provider settlement 2020-01',verified:true};
 assert.equal((await f.call('/api/admin/diamonds/streams','POST',{...b,verified:false},'admin')).status,400);
 const r=await f.call('/api/admin/diamonds/streams','POST',b,'admin');assert.equal(r.status,201,JSON.stringify(r));assert.equal(r.body.allocated_mw,3800000);
 assert.equal((await f.call('/api/diamonds')).body.balance,38);assert.equal((await f.call('/api/diamonds','GET',undefined,'other')).body.balance,0);
 assert.equal((await f.call('/api/admin/diamonds/streams','POST',b,'admin')).status,409);
});
