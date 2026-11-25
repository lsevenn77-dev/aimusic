import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {decorationsFixture} from './decorations-fixture.mjs';

const key=()=>crypto.randomUUID();
const stockGift=(f,quantity)=>f.call('/api/me/gift-inventory/buy','POST',{gift_type:'heart',quantity,request_id:key()});
const send=(f,kind,ids,body={},actor='owner')=>f.call(
 (kind==='gift'?'/api/me/gift-inventory/':'/api/decorations/inventory/')+ids[0]+'/send','POST',
 {profile_id:'friend',request_id:key(),inventory_ids:ids,...body},actor);
const table=(f,name)=>f.sql.prepare('SELECT * FROM '+name+' ORDER BY rowid').all();

test('paid and promotional units in one selection retain their separate ledgers and send only once',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created) VALUES('funds','owner','web',100,1100,30,'paid',0)");
 const paid=(await stockGift(f,2)).body.items;
 const grant={user_id:'owner',gift_type:'heart',quantity:1,request_id:key(),reason:'행사 보상'};
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',grant)).status,200);
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...grant,reason:'다른 요청'})).status,409);
 assert.equal((await f.call('/api/admin/gift-inventory/grant','POST',{...grant,request_id:key(),giftable:false})).status,200);
 const items=(await f.call('/api/me/gift-inventory')).body.items;
 const reward=items.find(i=>i.source==='reward'),locked=items.find(i=>i.source==='reward_locked');
 const audit=JSON.parse(table(f,'admin_audit').at(-1).target);
 assert.deepEqual([audit.source,audit.giftable,audit.reason],['reward_locked',false,grant.reason]);
 assert.deepEqual([paid[0].acquisition,reward.acquisition,locked.giftable],['purchase','admin',false]);
 assert.equal((await send(f,'gift',[paid[0].id,locked.id])).status,409);
 assert.equal(table(f,'gift_inventory').filter(i=>i.used_at).length,0);
 const ids=[reward.id,...paid.map(i=>i.id)],body={request_id:key()};
 const results=await Promise.all([send(f,'gift',ids,body),send(f,'gift',ids,body)]);
 assert.deepEqual(results.map(r=>r.status),[200,200],JSON.stringify(results));
 assert.deepEqual((await send(f,'gift',ids,body)).body.items.map(i=>i.id),[locked.id]);
 assert.equal((await send(f,'gift',ids.slice(0,1),body)).status,409);
 const [gold]=table(f,'gifts'),[silver]=table(f,'free_gifts'),[lot]=table(f,'gift_lots');
 assert.equal(gold.quantity,2);assert.equal(gold.gold,100);assert.equal(silver.quantity,1);assert.equal(silver.silver,0);
 assert.equal(gold.net_mw,lot.net_mw);assert.equal(lot.gold,100);assert.equal(table(f,'gold_purchases')[0].used,100);
 assert.equal(table(f,'activity_notifications').length,2);
 assert.equal(table(f,'gift_inventory').filter(i=>i.used_at).length,3);
 assert.deepEqual((await f.call('/api/me/gift-inventory','GET',null,'other')).body.items,[]);
});

test('multi-unit send rolls back on a notification error or conflicting ownership and rejects duplicate IDs',async t=>{
 const f=await decorationsFixture(t);const ids=(await stockGift(f,3)).body.items.map(i=>i.id);
 assert.equal((await send(f,'gift',[ids[0],ids[0]])).status,400);
 assert.equal((await send(f,'gift',ids,{profile_id:'producer'})).status,400);
 assert.equal((await send(f,'gift',ids,{profile_id:'producer'},'other')).status,404);
 f.sql.exec("CREATE TRIGGER qa_gift_notification BEFORE INSERT ON activity_notifications BEGIN SELECT RAISE(ABORT,'qa_notice_failure'); END");
 const req={request_id:key()};assert.equal((await send(f,'gift',ids,req)).status,500);
 assert.equal(table(f,'gifts').length,0);assert.equal(table(f,'gift_inventory').filter(i=>i.used_at).length,0);
 f.sql.exec('DROP TRIGGER qa_gift_notification');
 const race=await Promise.all([send(f,'gift',ids.slice(0,2),req),send(f,'gift',ids.slice(1))]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 assert.equal(table(f,'gift_inventory').filter(i=>i.used_at).length,2);assert.equal(table(f,'gifts').length,1);
});

test('mixed decoration holdings keep independent origin, eligibility, activation and receipt quantities',async t=>{
 const f=await decorationsFixture(t); const sku='frame_aurora_ring';
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created) VALUES('other-gold','other','web',1000,11000,0,'paid',0)");
 const buyOwn=()=>f.call('/api/decorations/buy','POST',{sku,period:'P7D',request_id:key()},'other');
 const own=(await buyOwn()).body.order.inventory_id;
 const ids=[];for(let n=0;n<2;n++)ids.push((await f.buy()).body.order.inventory_id);
 const first=await send(f,'decoration',ids,{profile_id:'producer'});assert.equal(first.status,400);
 const receivedRequest={request_id:key()};
 const deliveries=await Promise.all([send(f,'decoration',ids,receivedRequest),send(f,'decoration',ids,receivedRequest)]);
 assert.deepEqual(deliveries.map(r=>r.status),[200,200],JSON.stringify(deliveries));
 assert.equal(table(f,'decoration_transfers').length,2);const notices=table(f,'activity_notifications');assert.equal(notices.length,1);assert.equal(notices[0].quantity,2);
 const inventory=(await f.call('/api/decorations','GET',null,'other')).body.inventory;
 assert.equal(inventory.find(i=>i.id===own).giftable,true);
 for(const id of ids){const i=inventory.find(i=>i.id===id);assert.deepEqual([i.acquisition,i.giftable,i.expires_at],['received',false,0]);}
 const back={profile_id:'producer'};
 assert.equal((await send(f,'decoration',[ids[0]],back,'other')).status,409);
 assert.equal((await send(f,'decoration',[own,ids[0]],back,'other')).status,409);
 const req={request_id:key(),equip:true},path='/api/decorations/inventory/'+ids[0]+'/use';
 const activation=await f.call(path,'POST',req,'other');assert.equal(activation.status,200);
 const active=activation.body.receipt.active_inventory_id;
 assert.equal(table(f,'player_equipment').find(i=>i.user_id==='other').frame_inventory_id,active);
 assert.equal(activation.body.inventory.find(i=>i.id===active).acquisition,'received');
 assert.equal((await send(f,'decoration',[active],back,'other')).status,409);
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:null},'other');
 const retry=await f.call(path,'POST',req,'other');assert.equal(retry.body.receipt.expires_at,activation.body.receipt.expires_at);
 assert.equal(table(f,'player_equipment').find(i=>i.user_id==='other').frame_inventory_id,null);
 await f.use(own,'other');assert.equal((await f.call('/api/decorations','GET',null,'other')).body.inventory.find(i=>i.id===active).acquisition,'mixed');
});

test('decoration selection validates policy and duration, preserves unknown legacy provenance and rolls back every unit',async t=>{
 const f=await decorationsFixture(t);const sku='theme_christmas',id=(await f.buy(sku)).body.order.inventory_id,
 other=(await f.buy(sku,'P1M')).body.order.inventory_id;
 f.sql.exec("INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES('unknown','owner','theme_christmas','decoration_stock','lost-record',0)");
 const unknown=(await f.call('/api/decorations')).body.inventory.find(i=>i.id==='unknown');
 assert.equal(unknown.acquisition,'unknown');assert.equal(unknown.giftable,false);
 for(const ids of [[id,other],[id,'unknown']])assert.equal((await send(f,'decoration',ids)).status,409);
 assert.equal((await send(f,'decoration',[id],{track_id:'one'})).status,400);
 f.sql.exec("CREATE TRIGGER qa_notice_failure BEFORE INSERT ON activity_notifications BEGIN SELECT RAISE(ABORT,'qa_simulated_failure'); END");
 const req={request_id:key()};assert.equal((await send(f,'decoration',[id],req)).status,500);
 assert.equal(table(f,'decoration_transfers').length,0);assert.equal(table(f,'player_inventory').find(i=>i.id===id).user_id,'owner');
 f.sql.exec('DROP TRIGGER qa_notice_failure');assert.equal((await send(f,'decoration',[id],req)).status,200);
 assert.equal((await f.use(id,'other')).status,200);
 const active=(await f.call('/api/me/player','GET',null,'other')).body.decorations[0];assert.equal(active.acquisition,'received');assert.equal(active.giftable,false);
});

test('mutual producer and member follows precede ordinary suggestions and blocked members disappear',async t=>{
 const f=await decorationsFixture(t);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','AAA',0);INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','third','AAA',0); INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','other-profile',0),('owner','member','other',0),('other','producer','producer',0)");
 const profiles=(await f.call('/api/decorations/recipients')).body.profiles;assert.deepEqual(profiles.map(p=>p.id),['friend','other-profile']);
 const found=(await f.call('/api/decorations/recipients?q='+profiles[0].public_id)).body.profiles;assert.deepEqual(found.map(p=>p.id),['friend']);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");assert.deepEqual((await f.call('/api/decorations/recipients')).body.profiles.map(p=>p.id),['other-profile']);
});

test('one held-stock request can send more than the instant-checkout quantity limit',async t=>{
 const f=await decorationsFixture(t);
 f.sql.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<128) INSERT INTO gift_inventory(id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created) SELECT 'hold-'||x,'owner','silver-letter','손편지','reward',0,'reward','fixture-held',x,0 FROM n");
 const ids=(await f.call('/api/me/gift-inventory')).body.items.map(i=>i.id);
 const gift=await send(f,'gift',ids);assert.equal(gift.status,200,JSON.stringify(gift.body));assert.deepEqual(gift.body.items,[]);
 assert.equal(table(f,'free_gifts')[0].quantity,128);assert.equal(table(f,'activity_notifications')[0].quantity,128);
});
