import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationsFixture} from './decorations-fixture.mjs';

test('bunny frames share Aurora duration policy; only equipped, funded, unexpired frames are public',async t=>{
 const f=await decorationsFixture(t);
 const frames=(await f.call('/api/decorations')).body.products.filter(p=>p.kind==='PROFILE_FRAME');
 const specs=[['frame_moonlight_bunny','달빛토끼',1],['frame_mecha_bunny','로봇토끼',1],['frame_space_bunny','우주 행성토끼',2]];
 assert.equal(frames.length,4);
 const aurora=frames.find(p=>p.sku==='frame_aurora_ring');
 for(const [sku,name,scale] of specs){
  const p=frames.find(p=>p.sku===sku);assert.equal(p.name,name);assert.equal(p.currency,aurora.currency);
  for(const key of Object.keys(aurora.periodPrices))assert.equal(p.periodPrices[key],aurora.periodPrices[key]*scale);
  assert.equal(p.assetPaths.thumbnail,p.assetPaths.overlay);assert.match(p.assetPaths.thumbnail,/\.png$/);
  const giftBody={sku,period:'P1M',profile_id:'friend',request_id:crypto.randomUUID()};
  const gift=await f.call('/api/decorations/gift','POST',giftBody);
  assert.equal(gift.status,201,JSON.stringify(gift.body));
  const repeat=await f.call('/api/decorations/gift','POST',giftBody);assert.equal(repeat.body.order.id,gift.body.order.id);
  assert.equal(gift.body.order.gold,150*scale);
  const stock=gift.body.order.inventory_id;
  assert.equal((await f.call('/api/decorations','GET',null,'other')).body.inventory.find(x=>x.id===stock).stored,true);
  const active=(await f.use(stock,'other')).body.inventory.find(i=>i.item_key===sku&&!i.stored);
  const equip=id=>f.call('/api/me/player/equipment','PUT',{frame_inventory_id:id},'other');
  const view=async()=>(await f.call('/api/decorations/avatars?profiles=friend','GET',null,null)).body.avatars[0];
  assert.equal((await equip(active.id)).body.profile.profile_frame,sku);
  let seen=await view();assert.equal(seen.artwork,p.assetPaths.overlay);assert.equal(seen.effect,p.assetPaths.effect);
  assert.equal(Boolean(seen.effect),scale===2);
  assert.equal((await equip(null)).body.profile.profile_frame,null);assert.equal((await view()).artwork,null);
  await equip(active.id);f.sql.prepare('UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE id=?').run(active.id);
  seen=await view();assert.equal(seen.artwork,null);assert.ok(!seen.effect);
 }
});
