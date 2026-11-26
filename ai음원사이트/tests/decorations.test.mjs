import test from 'node:test';
import assert from 'node:assert/strict';
import {DECORATIONS,decorationExpiry,quoteDecoration} from '../shared/decorations.js';
import {decorationsFixture} from './decorations-fixture.mjs';
const count=(f,table)=>f.sql.prepare('SELECT count(*) n FROM '+table).get().n;
test('calendar periods: exact 168 hours, KST month-end, leap-year and 3-month clamp',()=>{
 const end=(s,p)=>new Date(decorationExpiry(Date.parse(s)/1000,p)*1000).toISOString();
 assert.equal(end('2028-01-31T14:30:00Z','P1M'),'2028-02-29T14:30:00.000Z');
 assert.equal(end('2027-01-31T14:30:00Z','P1M'),'2027-02-28T14:30:00.000Z');
 assert.equal(end('2026-10-31T15:30:00Z','P3M'),'2027-01-31T15:30:00.000Z');
 assert.equal(decorationExpiry(0,'P7D'),604800);
 assert.throws(()=>quoteDecoration('__proto__','P7D'));assert.throws(()=>quoteDecoration('frame_aurora_ring','forever'));
});
test('server quotes every registered SKU and three periods; spoofed client price is ignored',async t=>{
 const f=await decorationsFixture(t);let total=0;
 for(const p of Object.values(DECORATIONS))for(const period of ['P7D','P1M','P3M']){
  const r=await f.buy(p.sku,period,{gold:1});assert.equal(r.status,201,JSON.stringify(r.body));total+=p.periodPrices[period];
  assert.equal(r.body.order.gold,p.periodPrices[period]);assert.equal(r.body.inventory.find(i=>i.item_key===p.sku).available,true);
 }
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,total);
 const orders=Object.keys(DECORATIONS).length*3;
 assert.equal(count(f,'decoration_orders'),orders);assert.equal(count(f,'player_inventory'),orders);assert.equal(count(f,'gifts'),0);assert.equal(count(f,'diamond_ledger'),0);
 // Wallet history returns the 20 most recent entries, independently of the number of orders.
 const h=await f.call('/api/gold/history?currency=gold');assert.equal(h.status,200);assert.equal(h.body.spent.filter(r=>r.kind==='decoration').length,20);assert.ok((await f.call('/api/decorations')).body.inventory.every(i=>i.stored&&i.expires_at===0));
});
test('same request replay and concurrent duplicates spend and grant exactly once; mismatched replay rejects',async t=>{
 const f=await decorationsFixture(t),request_id=crypto.randomUUID();
 const results=await Promise.all(Array.from({length:4},()=>f.buy('frame_aurora_ring','P7D',{request_id})));
 assert.ok(results.every(r=>r.status===201),JSON.stringify(results));assert.equal(count(f,'decoration_orders'),1);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,50);
 assert.equal((await f.buy('theme_starlight_lounge','P7D',{request_id})).status,409);
 assert.equal((await f.buy('frame_aurora_ring','P7D',{request_id,profile_id:'friend'})).status,400);
});
test('simultaneous distinct purchases extend from the latest expiry without lost duration',async t=>{
 const f=await decorationsFixture(t);const bought=await Promise.all([f.buy(),f.buy(),f.buy()]);const r=await Promise.all(bought.map(b=>f.use(b.body.order.inventory_id)));assert.ok(r.every(r=>r.status===200),JSON.stringify(r));
 const item=f.sql.prepare("SELECT * FROM player_inventory WHERE source='decoration'").get();assert.equal(item.expires_at-item.granted_at,21*86400);assert.equal(count(f,'decoration_orders'),3);
});
test('insufficient funds, concurrent overspend and grant failure leave no partial order or charge',async t=>{
 const f=await decorationsFixture(t,{gold:50});assert.equal((await f.buy('theme_starlight_lounge')).status,409);const r=await Promise.all([f.buy(),f.buy()]);assert.deepEqual(r.map(x=>x.status).sort(),[201,409]);
 assert.equal(count(f,'decoration_orders'),1);assert.equal(count(f,'player_inventory'),1);
 f.sql.exec("UPDATE gold_purchases SET gold=500; CREATE TRIGGER qa_grant_failure BEFORE INSERT ON decoration_order_lots BEGIN SELECT RAISE(ABORT,'qa_grant_failed'); END;");
 assert.equal((await f.buy()).status,500);assert.equal(count(f,'decoration_orders'),1);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,50);
});
test('gift ownership belongs to recipient; equip/unequip and expiry are enforced across profile reads',async t=>{
 const f=await decorationsFixture(t),r=await f.gift('frame_aurora_ring','P7D','friend');assert.equal(r.status,201,JSON.stringify(r.body));
 const stored=r.body.order.inventory_id;assert.equal(f.sql.prepare('SELECT user_id FROM player_inventory WHERE id=?').get(stored).user_id,'other');assert.equal((await f.use(stored,'other')).status,200);
 const item=f.sql.prepare("SELECT * FROM player_inventory WHERE source='decoration'").get();assert.equal(item.user_id,'other');
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id})).status,409);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id},'other')).body.profile.profile_frame,'frame_aurora_ring');
 assert.equal((await f.call('/api/decorations/avatars?profiles=friend','GET',null,null)).body.avatars[0].artwork,DECORATIONS.frame_aurora_ring.assetPaths.overlay);
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:null},'other');assert.equal((await f.call('/api/me/player','GET',null,'other')).body.profile.profile_frame,null);
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id},'other');f.sql.exec("UPDATE player_inventory SET expires_at=unixepoch()-1");
 assert.equal((await f.call('/api/decorations/avatars?profiles=friend')).body.avatars[0].artwork,null);
 assert.equal((await f.call('/api/me/player','GET',null,'other')).body.inventory.length,0,'expired ownership is retained in DB, excluded from holdings');
 await f.buyUse('frame_aurora_ring','P7D',{profile_id:'friend'});assert.equal(f.sql.prepare('SELECT frame_inventory_id FROM player_equipment').get().frame_inventory_id,null);
});
test('revocation and funding refund review disable equipped items; unknown SKU, duration and recipient reject',async t=>{
 const f=await decorationsFixture(t),r=await f.buyUse();assert.equal(r.status,200);
 const item=r.body.inventory.find(i=>!i.stored);await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id});
 f.sql.exec("UPDATE player_inventory SET revoked=1");assert.equal((await f.call('/api/me/player')).body.profile.profile_frame,null);
 f.sql.exec("UPDATE player_inventory SET revoked=0;INSERT INTO gold_orders(id,user_id,request_id,state,created,expires,updated) VALUES('funds','owner','refund','refund_review',0,1,0)");
 assert.equal((await f.call('/api/me/player')).body.profile.profile_frame,null);assert.equal((await f.buyUse()).status,409);
 for(const body of [{sku:'fake'},{period:'P1Y'},{profile_id:'missing'}])assert.equal((await f.buy('frame_aurora_ring','P7D',body)).status,400);
 assert.equal((await f.call('/api/decorations/buy','POST',{sku:'frame_aurora_ring',period:'P7D',request_id:crypto.randomUUID()},null)).status,401);
});
test('all paid themes persist in create/settings; list/card/desktop/mobile resolve one SKU and fall back together',async t=>{
 // Both responses include the current server second as well as the theme.
 const snapshotTime=Date.now();
 t.mock.method(Date,'now',()=>snapshotTime);
 const f=await decorationsFixture(t,{voice:true});for(const p of Object.values(DECORATIONS).filter(p=>p.kind==='TALKING_ROOM_THEME'))assert.equal((await f.buyUse(p.sku)).status,200);
 const request_id=crypto.randomUUID(),created=await f.call('/api/voice/rooms','POST',{request_id,title:'테마 테스트',visibility:'public',background:'theme_starlight_lounge'});
 assert.equal(created.status,201,JSON.stringify(created.body));const rid=created.body.room.id;
 assert.equal(created.body.room.mic_seats,8);
 for(const [n,sku] of ['theme_starlight_lounge','theme_cherry_blossom','theme_aurora_night'].entries()){
  if(n){const saved=await f.call('/api/voice/rooms/'+rid+'/settings','POST',{background:sku,revision:n-1});assert.equal(saved.status,200,JSON.stringify(saved.body));}
  const state=await f.call('/api/voice/rooms/'+rid+'/theme'),list=await f.call('/api/voice/public-rooms','GET',null,null);
  assert.equal(state.body.theme.sku,sku);assert.deepEqual(state.body.theme.assets,DECORATIONS[sku].assetPaths);assert.deepEqual(list.body.rooms[0].theme,state.body.theme);
 }
 f.sql.exec("UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE item_key='theme_aurora_night'");
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/theme')).body.theme.sku,'basic_dark');assert.equal((await f.call('/api/voice/public-rooms','GET',null,null)).body.rooms[0].theme.sku,'basic_dark');
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/settings','POST',{background:'theme_aurora_night',revision:2})).status,403);
});
test('only host with own active theme can create/update; unknown SKU and stale settings reject; free themes remain',async t=>{
 const f=await decorationsFixture(t,{voice:true});await f.buyUse('theme_starlight_lounge','P7D',{profile_id:'friend'});
 assert.equal((await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'x',background:'theme_starlight_lounge'})).status,403);
 const r=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'x',background:'basic_dark'}),rid=r.body.room.id;
 await f.call('/api/voice/rooms/'+rid+'/join','POST',{request_id:crypto.randomUUID()},'other');
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/settings','POST',{background:'theme_starlight_lounge'},'other')).status,403);
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/settings','POST',{background:'fake'})).status,400);
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/settings','POST',{background:'basic_light',revision:0})).status,200);
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/settings','POST',{background:'basic_dark',revision:0})).status,409);
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/theme')).body.theme.sku,'basic_light');
 const options=await f.call('/api/voice/options');assert.deepEqual(options.body.themes.map(t=>t.sku),['basic_dark','basic_light']);assert.ok(options.body.themes.every(theme=>theme.selectable&&!theme.paid));
});
test('stored item never expires before use; transfer retains the full period without a second gold charge',async t=>{
 const f=await decorationsFixture(t),b=await f.buy('frame_aurora_ring','P1M'),iid=b.body.order.inventory_id,key=crypto.randomUUID();
 assert.equal(b.body.inventory[0].expires_at,0);assert.equal((await f.call('/api/me/player')).body.stored_decorations.length,1);
 const send=()=>f.call('/api/decorations/inventory/'+iid+'/send','POST',{request_id:key,profile_id:'friend'});
 const rs=await Promise.all([send(),send()]);assert.ok(rs.every(r=>r.status===200));assert.equal(count(f,'decoration_transfers'),1);
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,150);
 assert.equal((await f.call('/api/me/player')).body.stored_decorations.length,0);
 const stored=(await f.call('/api/me/player','GET',null,'other')).body.stored_decorations[0];assert.equal(stored.expires_at,0);assert.equal(stored.period_code,'P1M');
 assert.equal((await f.use(iid)).status,409);
 const used=await f.use(iid,'other');assert.equal(used.status,200);assert.equal(used.body.receipt.expires_at,decorationExpiry(used.body.receipt.created,'P1M'));
 assert.equal((await f.call('/api/decorations/inventory/'+iid+'/send','POST',{request_id:crypto.randomUUID(),profile_id:'producer'},'other')).status,409);
});
test('use is idempotent and a simultaneous use/transfer can consume the stored item only once',async t=>{
 const f=await decorationsFixture(t),b=await f.buy(),iid=b.body.order.inventory_id,key=crypto.randomUUID();
 const used=await Promise.all([f.use(iid,'owner',key),f.use(iid,'owner',key)]);assert.ok(used.every(r=>r.status===200));assert.equal(count(f,'decoration_redemptions'),1);
 const second=(await f.buy()).body.order.inventory_id;
 const race=await Promise.all([f.use(second),f.call('/api/decorations/inventory/'+second+'/send','POST',{profile_id:'friend',request_id:crypto.randomUUID()})]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(count(f,'decoration_redemptions')+count(f,'decoration_transfers'),2);
});
test('recipient write failure rolls back transfer receipt and preserves sender stock',async t=>{
 const f=await decorationsFixture(t),iid=(await f.buy()).body.order.inventory_id;
 f.sql.exec("CREATE TRIGGER qa_transfer_failure BEFORE UPDATE OF user_id ON player_inventory BEGIN SELECT RAISE(ABORT,'qa_transfer_failed'); END;");
 assert.equal((await f.call('/api/decorations/inventory/'+iid+'/send','POST',{profile_id:'friend',request_id:crypto.randomUUID()})).status,500);
 assert.equal(count(f,'decoration_transfers'),0);assert.equal(f.sql.prepare('SELECT user_id FROM player_inventory WHERE id=?').get(iid).user_id,'owner');
});
test('stored themes are selectable without activation; revocation reverts card and room and renewal does not re-equip',async t=>{
 const f=await decorationsFixture(t,{voice:true}),b=await f.buy('theme_cherry_blossom');
 assert.equal((await f.call('/api/voice/options')).body.themes.find(t=>t.sku==='theme_cherry_blossom').status,'UNUSED');
 await f.use(b.body.order.inventory_id);
 const r=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'취소 테스트',background:'theme_cherry_blossom'}),rid=r.body.room.id;
 assert.equal(r.status,201);f.sql.exec("UPDATE player_inventory SET revoked=1 WHERE source='decoration'");
 assert.equal((await f.call('/api/voice/rooms/'+rid+'/theme')).body.theme.sku,'basic_dark');assert.equal((await f.call('/api/voice/public-rooms','GET',null,null)).body.rooms[0].theme.sku,'basic_dark');
 await f.buyUse('theme_cherry_blossom');assert.equal((await f.call('/api/voice/rooms/'+rid+'/theme')).body.theme.sku,'basic_dark');
});

test('FIFO purchase spans existing gold lots and reports the canonical product name',async t=>{
 const f=await decorationsFixture(t,{gold:20});
 f.sql.exec("INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('second','owner','web',100,10000,0,'paid',0,2)");
 const r=await f.buy();assert.equal(r.status,201);
 assert.deepEqual(f.sql.prepare('SELECT id,used FROM gold_purchases ORDER BY paid_at').all().map(x=>[x.id,x.used]),[['funds',20],['second',30]]);
 assert.equal(f.sql.prepare('SELECT SUM(gold) total FROM decoration_order_lots').get().total,50);
 assert.equal((await f.call('/api/gold/history?currency=gold')).body.spent[0].title,'오로라 링 · 7일 구매');
});

test('recipient blocking in either direction and deleted accounts prevent stocked gifts; direct gifting stays disabled',async t=>{
 const f=await decorationsFixture(t),iid=(await f.buy()).body.order.inventory_id;
 for(const [actor,target] of [['owner','other'],['other','owner']]){
  assert.equal((await f.call('/api/blocks/'+target,'PUT',{},actor)).status,200);
  assert.equal((await f.buy('frame_aurora_ring','P7D',{profile_id:'friend'})).status,400);
  assert.equal((await f.call('/api/decorations/inventory/'+iid+'/send','POST',{profile_id:'friend',request_id:crypto.randomUUID()})).status,403);
  assert.equal((await f.call('/api/blocks/'+target,'DELETE',{},actor)).status,200);
 }
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='other'");
 assert.equal((await f.buy('frame_aurora_ring','P7D',{profile_id:'friend'})).status,400);
 assert.equal(count(f,'decoration_orders'),1);assert.equal(count(f,'decoration_transfers'),0);
});

test('buy cannot bypass personal storage by specifying a gift recipient',async t=>{
 const f=await decorationsFixture(t);assert.equal((await f.buy('frame_aurora_ring','P7D',{profile_id:'friend'})).status,400);
 assert.equal(count(f,'decoration_orders'),0);assert.equal(count(f,'player_inventory'),0);assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
});

test('member picker uses public names and excludes self, blocks, deleted and bot accounts',async t=>{
 const f=await decorationsFixture(t);
 assert.equal((await f.call('/api/decorations/recipients','GET',null,null)).status,401);
 assert.deepEqual((await f.call('/api/decorations/recipients')).body.profiles,[]);
 f.sql.exec("INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','friend',0)");
 const suggested=await f.call('/api/decorations/recipients');assert.deepEqual(suggested.body.profiles.map(p=>p.id),['friend']);
 const result=await f.call('/api/decorations/recipients?q='+encodeURIComponent('테스트'));
 assert.equal(result.status,200);assert.equal(result.body.profiles[0].name,'테스트 친구');assert.deepEqual(Object.keys(result.body.profiles[0]).sort(),['id','image_version','name','premium_default_frame','premium_style_until','public_id','public_number']);
 assert.deepEqual((await f.call('/api/decorations/recipients?q=QA')).body.profiles,[]);
 assert.deepEqual((await f.call('/api/decorations/recipients?q=%25')).body.profiles,[]);
 for(const [actor,target] of [['owner','other'],['other','owner']]){
  await f.call('/api/blocks/'+target,'PUT',{},actor);assert.deepEqual((await f.call('/api/decorations/recipients?q='+encodeURIComponent('친구'))).body.profiles,[]);await f.call('/api/blocks/'+target,'DELETE',{},actor);
 }
 f.sql.exec("UPDATE users SET provider='deleted' WHERE id='other'");assert.deepEqual((await f.call('/api/decorations/recipients')).body.profiles,[]);
 f.sql.exec("INSERT INTO users(id,email,name,provider,account_type,created) VALUES('ai_1','ai1@example.test','테스트 봇','ai_service','ai_bot',0); INSERT INTO producers(id,user_id,name,created) VALUES('bot-profile','ai_1','테스트 봇',0); INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','bot-profile',0)");assert.deepEqual((await f.call('/api/decorations/recipients')).body.profiles,[]);
});
