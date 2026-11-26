import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
const count=(f,t)=>f.sql.prepare('SELECT count(*) n FROM '+t).get().n;
const checkout=(f,body)=>f.call('/api/gifts/checkout','POST',{gift_type:'heart',quantity:2,profile_id:'friend',request_id:crypto.randomUUID(),...body});
const gift=(f,body)=>f.call('/api/decorations/gift','POST',{sku:'frame_aurora_ring',period:'P1M',profile_id:'friend',request_id:crypto.randomUUID(),...body});

test('nickname substring and exact existing public number distinguish duplicate names without new IDs',async t=>{
 const f=await decorationsFixture(t);
 f.sql.exec("UPDATE users SET name='같은 이름' WHERE id='other'; UPDATE producers SET name='같은 이름' WHERE id='friend'; INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','같은 이름',0); INSERT INTO producers(id,user_id,name,created) VALUES('duplicate','third','같은 이름',0)");
 const before=count(f,'public_member_ids'),number=f.sql.prepare("SELECT number FROM public_member_ids WHERE user_id='other'").get().number;
 let r=await f.call('/api/decorations/recipients?q='+encodeURIComponent('같은'));
 assert.equal(r.status,200);assert.equal(r.body.profiles.length,2);assert.equal(new Set(r.body.profiles.map(p=>p.public_number)).size,2);
 r=await f.call('/api/decorations/recipients?q='+number);assert.equal(r.body.profiles[0].id,'friend');assert.equal(r.body.profiles[0].public_number,number);assert.equal(count(f,'public_member_ids'),before);
});
test('gold and silver checkout preserve server prices, ledgers and existing gift notifications; note is atomic and idempotent',async t=>{
 const f=await decorationsFixture(t);f.sql.exec("INSERT INTO free_gift_wallets VALUES('owner',100)");
 for(const gift_type of ['heart','silver-letter']){
  const request_id=crypto.randomUUID(),body={gift_type,request_id,message:'좋은 음악 고마워요'};
  const rs=await Promise.all([checkout(f,body),checkout(f,body),checkout(f,body)]);
  assert.ok(rs.every(r=>r.status<300),JSON.stringify(rs));
  assert.equal((await checkout(f,{...body,message:'다른 메시지'})).status,409);
 }
 assert.equal(count(f,'gifts'),1);assert.equal(count(f,'free_gifts'),1);assert.equal(count(f,'direct_messages'),2);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,100);assert.equal(f.sql.prepare('SELECT balance FROM free_gift_wallets').get().balance,96);
 const notices=await f.call('/api/notifications?filter=gifts','GET',null,'other');assert.equal(notices.body.items.length,2);assert.equal(count(f,'push_outbox'),4);
});
test('gift, message or notification failure rolls back gold debit and all side effects',async t=>{
 const f=await decorationsFixture(t);f.sql.exec("CREATE TRIGGER qa_note_failure BEFORE INSERT ON direct_messages BEGIN SELECT RAISE(ABORT,'qa_note_failure'); END");
 assert.equal((await checkout(f,{message:'실패 테스트'})).status,500);assert.equal(count(f,'gifts'),0);assert.equal(count(f,'activity_notifications'),0);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
 assert.equal((await gift(f,{message:'실패 테스트'})).status,500);assert.equal(count(f,'player_inventory'),0);assert.equal(count(f,'decoration_orders'),0);assert.equal(count(f,'decoration_transfers'),0);assert.equal(count(f,'push_outbox'),0);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
});
test('atomic decoration checkout delivers stored full duration, spends once and emits one notification on repeated/concurrent sends',async t=>{
 const f=await decorationsFixture(t),request_id=crypto.randomUUID();
 const rs=await Promise.all([gift(f,{request_id,message:'감사해요'}),gift(f,{request_id,message:'감사해요'})]);assert.ok(rs.every(r=>r.status===201),JSON.stringify(rs));
 const i=f.sql.prepare('SELECT * FROM player_inventory').get();assert.equal(i.user_id,'other');assert.equal(i.expires_at,0);assert.equal(count(f,'decoration_orders'),1);assert.equal(count(f,'decoration_transfers'),1);assert.equal(count(f,'activity_notifications'),1);assert.equal(count(f,'direct_messages'),1);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,150);
 assert.equal((await f.use(i.id,'other')).status,200);assert.ok(f.sql.prepare("SELECT expires_at FROM player_inventory WHERE source='decoration'").get().expires_at>0);
 assert.equal((await gift(f,{request_id,period:'P7D'})).status,409);
 assert.equal((await gift(f,{request_id,message:'다른 메시지'})).status,409);
});
test('unknown/self/blocked/bot recipients, insufficient balances and excessive messages cannot charge',async t=>{
 const f=await decorationsFixture(t,{gold:1});
 for(const profile_id of ['missing','producer']){assert.equal((await checkout(f,{profile_id})).status,400);assert.equal((await gift(f,{profile_id})).status,400);}
 assert.equal((await checkout(f,{})).status,409);assert.equal((await gift(f,{})).status,409);
 assert.equal((await checkout(f,{message:'x'.repeat(2001)})).status,400);assert.equal((await gift(f,{message:'x'.repeat(2001)})).status,400);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");assert.equal((await checkout(f,{})).status,403);assert.equal((await gift(f,{})).status,403);
 f.sql.exec("INSERT INTO users(id,email,name,provider,account_type,created) VALUES('ai_99999','bot@example.test','테스트 봇','ai_service','ai_bot',0); INSERT INTO producers(id,user_id,name,created) VALUES('bot-profile','ai_99999','테스트 봇',0)");assert.equal((await checkout(f,{profile_id:'bot-profile'})).status,400);assert.equal((await gift(f,{profile_id:'bot-profile'})).status,400);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);assert.equal(count(f,'gifts'),0);assert.equal(count(f,'player_inventory'),0);
});

test('notification failure also rolls back both checkout paths without a charge',async t=>{
 const f=await decorationsFixture(t);f.sql.exec("CREATE TRIGGER qa_notice_failure BEFORE INSERT ON activity_notifications BEGIN SELECT RAISE(ABORT,'qa_notice_failure'); END");
 assert.equal((await checkout(f,{})).status,500);assert.equal((await gift(f,{})).status,500);
 for(const table of ['gifts','decoration_orders','decoration_transfers','player_inventory','activity_notifications','push_outbox'])assert.equal(count(f,table),0);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
});
