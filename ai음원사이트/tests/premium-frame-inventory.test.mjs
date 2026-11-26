import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';
import {eventEnd} from '../server/premium-event.js';
import {DECORATIONS} from '../shared/decorations.js';

const day=86400;
const itemKey='premium-moonlight-gold';
const frameId=uid=>'premium-frame:'+uid;
const frame=summary=>summary.inventory.find(item=>item.source==='premium');

async function scenario(t,start=eventEnd+10){
 let at=start;
 t.mock.method(Date,'now',()=>at*1000);
 const f=await decorationsFixture(t);
 f.sql.function('unixepoch',()=>at);
 f.sql.prepare('UPDATE sessions SET expires=?').run(eventEnd+90*day);
 const summary=async(uid='owner')=>{
  const res=await f.call('/api/me/player','GET',null,uid);
  assert.equal(res.status,200,JSON.stringify(res.body));
  return res.body;
 };
 const avatar=async()=>{
  const res=await f.call('/api/decorations/avatars?profiles=producer','GET',null,null);
  assert.equal(res.status,200);assert.equal(res.body.avatars.length,1);
  return res.body.avatars[0];
 };
 const inventory=()=>f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all();
 const equip=(id,uid='owner')=>f.call('/api/me/player/equipment','PUT',{frame_inventory_id:id},uid);
 return {...f,summary,avatar,inventory,equip,advance:time=>{at=time;}};
}

function assertDenied(res){
 assert.ok([400,403,404,409].includes(res.status),'expected a rejected operation, received '+res.status);
}

test('an active member sees one personal Moonlight Gold frame with its full term, without a purchase or inventory write',async t=>{
 const f=await scenario(t),end=eventEnd+30*day;
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(end);
 const before=f.inventory(),owner=await f.summary(),item=frame(owner);
 assert.ok(item,'active membership must appear in the frame inventory');
 assert.equal(owner.inventory.filter(x=>x.source==='premium').length,1);
 assert.equal(item.id,frameId('owner'));assert.equal(item.item_key,itemKey);assert.equal(item.name,'문라이트 골드');
 assert.equal(item.artwork,'/assets/premium/moonlight-gold.png');assert.equal(item.expires_at,end);
 assert.equal(item.available,true);assert.equal(item.equipped,true);assert.equal(item.paid,false);
 const visible=await f.avatar();
 assert.equal(visible.premium_default_frame,1);assert.ok(visible.premium_style_until>0&&visible.premium_style_until<end);
 assert.equal(frame(await f.summary()).id,item.id);assert.deepEqual(f.inventory(),before);
 assert.equal((await f.call('/api/me/player','GET',null,null)).status,401);

 const request={sku:itemKey,period:'P7D',request_id:crypto.randomUUID()};
 assertDenied(await f.call('/api/decorations/buy','POST',request));
 assertDenied(await f.call('/api/decorations/gift','POST',{...request,request_id:crypto.randomUUID(),profile_id:'friend'}));
 assertDenied(await f.call('/api/decorations/inventory/'+item.id+'/send','POST',{profile_id:'friend',request_id:crypto.randomUUID()}));
 assert.equal(f.sql.prepare('SELECT used FROM gold_purchases').get().used,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM decoration_orders').get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM decoration_transfers').get().n,0);
 assert.deepEqual(f.inventory(),before);
});

test('explicit no-frame survives an upgrade, can be changed or cleared, and a frame ID belongs only to its member',async t=>{
 const f=await scenario(t),end=eventEnd+100;
 assert.equal(frame(await f.summary()),undefined);
 assertDenied(await f.equip(frameId('owner')));
 assert.equal((await f.equip(null)).status,200);
 f.sql.prepare('UPDATE users SET premium_until=?').run(end);
 assert.equal(frame(await f.summary()).equipped,false);
 assert.equal((await f.avatar()).premium_default_frame,0);
 assert.equal(frame(await f.summary('other')).id,frameId('other'));
 assertDenied(await f.equip(frameId('other'),'owner'));
 assertDenied(await f.equip(frameId('owner'),'other'));
 assert.equal(frame(await f.summary()).equipped,false);

 for(const expected of [true,false,true]){
  const updated=await f.equip(expected?frameId('owner'):null);
  assert.equal(updated.status,200,JSON.stringify(updated.body));
  assert.equal(frame(await f.summary()).equipped,expected);
  assert.equal((await f.avatar()).premium_default_frame,Number(expected));
 }
 const afterSelection=f.inventory();
 f.advance(end);
 assert.equal(frame(await f.summary()),undefined);assert.equal((await f.avatar()).premium_style_until,0);
 assertDenied(await f.equip(frameId('owner')));
 assert.deepEqual(f.inventory(),afterSelection);
});

test('the open gift and independent paid periods supply one frame until the last active entitlement ends',async t=>{
 const start=eventEnd-3*day,f=await scenario(t,start);
 f.sql.prepare("UPDATE users SET created=? WHERE id='owner'").run(start-1);
 assert.equal(frame(await f.summary()).expires_at,eventEnd);
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(eventEnd-10);
 assert.equal(frame(await f.summary()).expires_at,eventEnd);
 f.sql.prepare("UPDATE users SET premium_until=?,apple_premium_until=? WHERE id='owner'").run(eventEnd+2*day,eventEnd+5*day);
 for(const time of [eventEnd-1,eventEnd,eventEnd+2*day]){
  f.advance(time);
  const player=await f.summary(),current=frame(player);
  assert.equal(player.inventory.filter(x=>x.source==='premium').length,1);
  assert.equal(current.id,frameId('owner'));assert.equal(current.expires_at,eventEnd+5*day);assert.equal(current.equipped,true);
  assert.equal((await f.avatar()).premium_default_frame,1);
 }
 f.advance(eventEnd+5*day);
 assert.equal(frame(await f.summary()),undefined);
 assert.equal((await f.avatar()).premium_style_until,0);
 assert.equal(f.inventory().length,0);
});

test('selecting Premium over a purchased animated frame restores the original item and effect at expiry',async t=>{
 const f=await scenario(t),paidKey='frame_space_bunny',end=eventEnd+90;
 const purchase=await f.buyUse(paidKey,'P7D');
 assert.equal(purchase.status,200,JSON.stringify(purchase.body));
 const paidId=purchase.body.receipt.active_inventory_id,assets=DECORATIONS[paidKey].assetPaths;
 assert.equal((await f.equip(paidId)).status,200);
 const before=f.inventory();
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(end);
 const held=await f.summary();
 assert.equal(frame(held).equipped,false);assert.equal(held.inventory.find(i=>i.id===paidId).equipped,true);
 const assertPaidAvatar=async()=>{
  const appearance=await f.avatar();
  assert.equal(appearance.premium_default_frame,0);assert.equal(appearance.item_key,paidKey);
  assert.equal(appearance.artwork,assets.overlay);assert.equal(appearance.effect,assets.effect);
 };
 await assertPaidAvatar();
 const removeDisplayedPremium=()=>f.call('/api/me/player/equipment','PUT',{
  frame_inventory_id:null,expected_frame_inventory_id:frameId('owner')
 });
 assert.equal((await f.equip(frameId('owner'))).status,200);
 const removed=await removeDisplayedPremium();
 assert.equal(removed.status,200,JSON.stringify(removed.body));
 assert.equal(frame(removed.body).equipped,false);
 assert.equal((await f.equip(paidId)).status,200);
 const equipped=await f.equip(frameId('owner'));
 assert.equal(equipped.status,200,JSON.stringify(equipped.body));
 const afterSelection=f.inventory();
 assert.deepEqual(afterSelection.filter(item=>item.source!=='premium'),before);
 const selected=await f.summary();
 assert.equal(frame(selected).equipped,true);assert.equal(selected.inventory.find(i=>i.id===paidId).equipped,false);
 const appearance=await f.avatar();
 assert.equal(appearance.premium_default_frame,1);assert.notEqual(appearance.item_key,paidKey);assert.ok(!appearance.effect);
 assert.deepEqual(f.inventory(),afterSelection);

 f.advance(end);
 const staleRemoval=await removeDisplayedPremium();
 assert.equal(staleRemoval.status,409,JSON.stringify(staleRemoval.body));
 const after=await f.summary();
 assert.equal(frame(after),undefined);assert.equal(after.inventory.find(i=>i.id===paidId).equipped,true);
 await assertPaidAvatar();assert.deepEqual(f.inventory(),afterSelection);
});
