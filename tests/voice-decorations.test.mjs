import test from 'node:test';
import assert from 'node:assert/strict';
import {DECORATIONS,FREE_ROOM_THEMES,roomUIMode} from '../shared/decorations.js';
import sharp from 'sharp';
import {decorationsFixture} from './decorations-fixture.mjs';
import {liveFixture} from './live-karaoke-fixture.mjs';

for(const mode of ['talk','karaoke']){
 test(mode+' rejects retired selections and upgrades persisted themes on directory or room access',async t=>{
  const f=await liveFixture(t),retired=['navy','sunset','night'];
  const options=(await f.call('/api/voice/options?mode='+mode)).body;
  assert.deepEqual(options.themes.map(t=>[t.sku,t.name]),[['basic_dark','턴테이블'],['basic_light','헤드폰']]);
  assert.equal(options.preferred_theme,'basic_dark');
  for(const key of ['background','theme_sku'])for(const sku of retired){
   const request_id=crypto.randomUUID();
   const blocked=await f.call('/api/voice/rooms','POST',{request_id,title:'퇴역 테마',mode,[key]:sku});
   assert.equal(blocked.status,400);assert.equal(f.rooms.has(request_id),false);
  }
  for(const [i,sku] of retired.entries()){
   const {room,state,root}=await f.create({mode}),id=state.room.id;
   const original=room.data.config,revision=original.settings_revision||0,title=original.title;
   for(const key of ['background','theme_sku']){
    const blocked=await f.call(root+'settings','POST',{generation:state.generation,revision,[key]:sku});
    assert.equal(blocked.status,400);
   }
   original.background=sku;
   if(i===1)delete original.theme_sku;else original.theme_sku=sku;
   if(i===2)f.sql.prepare('DELETE FROM room_decorations WHERE room_id=?').run(id);
   else f.sql.prepare('UPDATE room_decorations SET sku=? WHERE room_id=?').run(sku,id);
   f.roomSql.prepare('UPDATE voice_rooms SET background=? WHERE id=?').run(sku,id);
   await room.save();room.data=null;
   const listing=(await f.call('/api/voice/public-rooms?limit=24&mode='+mode)).body.rooms.find(row=>row.id===id);
   assert.equal(listing.theme.sku,'basic_dark');assert.deepEqual(listing.theme.assets,FREE_ROOM_THEMES[0].assetPaths);
   const joined=(await f.join({root})).room;
   assert.deepEqual([joined.theme_sku,joined.background,joined.theme.sku],Array(3).fill('basic_dark'));
   assert.equal(joined.title,title);assert.equal(joined.settings_revision||0,revision);
   assert.equal(f.roomSql.prepare('SELECT background FROM voice_rooms WHERE id=?').get(id).background,'basic_dark');
   if(i!==2)assert.equal(f.sql.prepare('SELECT sku FROM room_decorations WHERE room_id=?').get(id).sku,'basic_dark');
   assert.equal((await room.ctx.storage.get('room')).config.background,'basic_dark');
  }
 });
}

test('legacy palette beneath verified paid equipment preserves artwork, orders and inventory',async t=>{
 const f=await decorationsFixture(t,{voice:true}),sku='theme_cherry_blossom';
 await f.buyUse(sku);
 const inventory=()=>f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all();
 const purchases=()=>f.sql.prepare('SELECT * FROM decoration_orders ORDER BY id').all();
 const beforeInventory=inventory(),beforePurchases=purchases();
 const r=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'기존 유료 방',theme_sku:sku});
 const id=r.body.room.id,room=f.rooms.get(id);
 for(const explicit of [true,false]){
  room.data.config.background='navy';
  if(explicit)room.data.config.theme_sku=sku;else delete room.data.config.theme_sku;
  await room.save();room.data=null;
  const state=(await f.call('/api/voice/rooms/'+id+'/state')).body.room;
  assert.equal(state.theme.sku,sku);assert.deepEqual(state.theme.assets,DECORATIONS[sku].assetPaths);
 }
 assert.deepEqual(inventory(),beforeInventory);assert.deepEqual(purchases(),beforePurchases);
});

test('a completed create retry keeps the original atomic room selection',async t=>{
 const f=await decorationsFixture(t,{voice:true}),request_id=crypto.randomUUID();
 const create=background=>f.call('/api/voice/rooms','POST',{request_id,title:'재시도',background});
 assert.equal((await create('basic_light')).status,201);
 const retry=await create('basic_dark');
 assert.equal(retry.status,201);assert.equal(retry.body.room.theme.sku,'basic_light');
 assert.equal(f.sql.prepare('SELECT sku FROM room_decorations WHERE room_id=?').get(request_id).sku,'basic_light');
});

test('basic room skins provide four valid WebP variants and legacy or unknown modes default to dark',async()=>{
 for(const [sku,mode] of [['basic_dark','dark'],['basic_light','light']]){
  const skin=FREE_ROOM_THEMES.find(t=>t.sku===sku);
  assert.equal(roomUIMode(skin),mode);
  for(const [key,size] of Object.entries({roomCard:[1200,1600],roomDesktop:[2560,1440],roomMobile:[1440,2560],roomMobileTall:[1440,3120]})){
   const image=await sharp('dist'+skin.assetPaths[key]).metadata();
   assert.equal(image.format,'webp');assert.deepEqual([image.width,image.height],size);
  }
 }
 assert.equal(roomUIMode({}), 'dark');assert.equal(roomUIMode({uiMode:'sepia'}),'dark');
});

test('room mode and catalog artwork survive settings, listener entry and directory resolution',async t=>{
 const f=await decorationsFixture(t,{voice:true});
 const created=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'두 가지 스킨',visibility:'public',theme_sku:'basic_light'});
 assert.equal(created.status,201);const id=created.body.room.id,root='/api/voice/rooms/'+id+'/';
 const owner=(await f.call(root+'join','POST',{request_id:crypto.randomUUID()})).body;
 const guest=(await f.call(root+'join','POST',{request_id:crypto.randomUUID()},'other')).body;
 assert.equal(guest.room.theme.uiMode,'light');assert.equal(guest.room.theme.expires_at,0);
 const catalog=FREE_ROOM_THEMES.find(t=>t.sku==='basic_light');
 assert.deepEqual(guest.room.theme.assets,catalog.assetPaths);
 const listing=(await f.call('/api/voice/public-rooms')).body.rooms.find(room=>room.id===id);
 assert.equal(listing.theme.uiMode,'light');assert.equal(listing.theme.assets.roomCard,catalog.assetPaths.roomCard);
 const save=(body,session,user='owner')=>f.call(root+'settings','POST',{generation:session.generation,revision:session.room.settings_revision||0,...body},user);
 assert.equal((await save({theme_sku:'basic_dark'},guest,'other')).status,403);
 const switched=await save({mode:'karaoke'},owner);assert.equal(switched.status,200);
 assert.equal(switched.body.room.mode,'karaoke');
 assert.equal(switched.body.room.theme.uiMode,'light');assert.equal(switched.body.room.id,id);
 const dark=await save({theme_sku:'basic_dark'},{...owner,room:switched.body.room});assert.equal(dark.status,200);
 assert.equal((await f.call(root+'theme','GET',null,'other')).body.theme.uiMode,'dark');
});

test('new room defaults to the latest active paid theme, keeps paid choices first, and preserves an explicit free choice',async t=>{
 const f=await decorationsFixture(t,{voice:true});
 const aurora=await f.buy('theme_aurora_night'),stock=await f.buy('theme_cherry_blossom');
 assert.equal(aurora.status,201);assert.equal(stock.status,201);
 let options=(await f.call('/api/voice/options')).body;
 assert.equal(options.preferred_theme,'basic_dark');assert.ok(options.themes.filter(p=>p.paid).every(p=>p.status==='UNUSED'),'unused stock is visible but cannot become a default');
 await f.buyUse('theme_starlight_lounge');await f.use(aurora.body.order.inventory_id);
 options=(await f.call('/api/voice/options')).body;
 assert.equal(options.preferred_theme,'theme_aurora_night');
 assert.deepEqual(options.themes.map(p=>p.sku),['theme_aurora_night','theme_starlight_lounge','theme_cherry_blossom','basic_dark','basic_light']);
 assert.ok(options.themes.slice(0,2).every(p=>p.paid&&p.selectable));
 const created=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'활성 배경 기본값',visibility:'public'});
 assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.room.theme.sku,'theme_aurora_night');
 const free=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'직접 고른 무료 배경',visibility:'public',theme_sku:'basic_light'});
 assert.equal(free.status,201);assert.equal(free.body.room.theme.sku,'basic_light');
 const joined=await f.call('/api/voice/rooms/'+free.body.room.id+'/join','POST',{request_id:crypto.randomUUID()});
 assert.equal(joined.body.room.theme.sku,'basic_light','entry must not replace the host’s explicit free background');
 f.sql.exec("UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE item_key='theme_aurora_night' AND source='decoration'");
 options=(await f.call('/api/voice/options')).body;assert.equal(options.preferred_theme,'theme_starlight_lounge');assert.ok(!options.themes.some(p=>p.sku==='theme_aurora_night'));
});

test('room entry and heartbeats attach current public frames in one lookup and use the host theme for every listener',async t=>{
 const f=await decorationsFixture(t,{voice:true});
 await f.buyUse('theme_aurora_night');await f.buyUse('frame_aurora_ring');
 await f.buyUse('frame_aurora_ring','P7D',{profile_id:'friend'});await f.buyUse('theme_cherry_blossom','P7D',{profile_id:'friend'});
 const ownerFrame=f.sql.prepare("SELECT id FROM player_inventory WHERE user_id='owner' AND item_key='frame_aurora_ring' AND source='decoration'").get().id;
 const otherFrame=f.sql.prepare("SELECT id FROM player_inventory WHERE user_id='other' AND item_key='frame_aurora_ring' AND source='decoration'").get().id;
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:ownerFrame});
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:otherFrame},'other');
 const created=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'장착 프레임 확인',visibility:'public'}),root='/api/voice/rooms/'+created.body.room.id+'/';
 let lookups=0;const prepare=f.DB.prepare;
 f.DB.prepare=query=>{if(query.startsWith('SELECT u.id,')&&query.includes('profile_frame_artwork')&&query.includes('u.id IN ('))lookups++;return prepare(query);};
 const joined=await f.call(root+'join','POST',{request_id:crypto.randomUUID()},'other');
 assert.equal(joined.status,200,JSON.stringify(joined.body));assert.equal(lookups,1,'all room members share one equipment query');
 assert.equal(joined.body.room.theme.sku,'theme_aurora_night','a listener’s own theme cannot replace the host background');
 assert.deepEqual(joined.body.room.theme.assets,DECORATIONS.theme_aurora_night.assetPaths);
 for(const member of joined.body.members){assert.equal(member.profile_frame,'frame_aurora_ring');assert.equal(member.profile_frame_artwork,DECORATIONS.frame_aurora_ring.assetPaths.overlay);assert.equal(member.player_xp,undefined);assert.equal(member.inventory,undefined);}
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:null});
 f.sql.prepare('UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE id=?').run(otherFrame);
 lookups=0;
 const refreshed=await f.call(root+'heartbeat','POST',{generation:joined.body.generation},'other');
 assert.equal(refreshed.status,200);assert.equal(lookups,1);
 refreshed.body.members.forEach(member=>{assert.equal(member.profile_frame,null);assert.equal(member.profile_frame_artwork,null);});
 assert.equal(refreshed.body.room.theme.sku,'theme_aurora_night');
});

test('host handoff resets the room only; the successor can apply only their own active skins',async t=>{
 const f=await decorationsFixture(t,{voice:true});
 await f.buyUse('theme_aurora_night');await f.buyUse('theme_cherry_blossom','P7D',{profile_id:'friend'});
 const create=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'Handoff',visibility:'public'});
 const roomId=create.body.room.id,root='/api/voice/rooms/'+roomId+'/',join=id=>f.call(root+'join','POST',{request_id:crypto.randomUUID()},id);
 const guest=await join('other'),owner=await join('owner');
 const inventory=()=>f.sql.prepare('SELECT * FROM player_inventory ORDER BY id').all();
 const initialInventory=inventory();
 await f.call(root+'leave','POST',{generation:owner.body.generation});
 const state=(await f.call(root+'state','GET',null,'other')).body;
 assert.equal(state.room.host_id,'other');assert.equal(state.room.theme.sku,'basic_dark');
 const settings=sku=>f.call(root+'settings','POST',{generation:guest.body.generation,revision:state.room.settings_revision,theme_sku:sku},'other');
 assert.equal((await settings('theme_aurora_night')).status,403);
 assert.equal((await settings('theme_cherry_blossom')).body.room.theme.sku,'theme_cherry_blossom');
 assert.deepEqual(inventory(),initialInventory);
 const back=await join('owner');assert.equal(back.body.room.theme.sku,'theme_cherry_blossom');
 assert.equal((await f.call(root+'settings','POST',{generation:back.body.generation,theme_sku:'theme_aurora_night'})).status,403);
 const row=f.sql.prepare('SELECT host_id,revision FROM room_decorations WHERE room_id=?').get(roomId);
 assert.equal(row.host_id,'other');
 const {saveRoomTheme}=await import('../server/room-decorations.js');
 await saveRoomTheme({DB:f.DB},{id:'owner'},create.body.room,'theme_aurora_night');
 assert.equal((await f.call(root+'theme','GET',null,'owner')).body.theme.sku,'theme_cherry_blossom');
 f.sql.prepare("UPDATE player_inventory SET expires_at=unixepoch()-1 WHERE user_id='other' AND item_key='theme_cherry_blossom'").run();
 assert.equal((await f.call(root+'theme','GET',null,'other')).body.theme.sku,'basic_dark');
 assert.equal((await settings('theme_cherry_blossom')).status,403);
 await f.call(root+'leave','POST',{generation:guest.body.generation},'other');
 const again=(await f.call(root+'state','GET',null,'owner')).body;
 assert.equal(again.room.host_id,'owner');assert.equal(again.room.theme.sku,'basic_dark');
});
