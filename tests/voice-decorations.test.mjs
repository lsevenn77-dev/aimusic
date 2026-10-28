import test from 'node:test';
import assert from 'node:assert/strict';
import {DECORATIONS} from '../shared/decorations.js';
import {decorationsFixture} from './decorations-fixture.mjs';

test('new room defaults to the latest active paid theme, keeps paid choices first, and preserves an explicit free choice',async t=>{
 const f=await decorationsFixture(t,{voice:true});
 const aurora=await f.buy('theme_aurora_night'),stock=await f.buy('theme_cherry_blossom');
 assert.equal(aurora.status,201);assert.equal(stock.status,201);
 let options=(await f.call('/api/voice/options')).body;
 assert.equal(options.preferred_theme,'navy');assert.ok(options.themes.every(p=>!p.paid),'unused stock cannot become a default');
 await f.buyUse('theme_starlight_lounge');await f.use(aurora.body.order.inventory_id);
 options=(await f.call('/api/voice/options')).body;
 assert.equal(options.preferred_theme,'theme_aurora_night');
 assert.deepEqual(options.themes.map(p=>p.sku),['theme_aurora_night','theme_starlight_lounge','navy','sunset','night']);
 assert.ok(options.themes.slice(0,2).every(p=>p.paid&&p.selectable));
 const created=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'활성 배경 기본값',visibility:'public'});
 assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.room.theme.sku,'theme_aurora_night');
 const free=await f.call('/api/voice/rooms','POST',{request_id:crypto.randomUUID(),title:'직접 고른 무료 배경',visibility:'public',theme_sku:'night'});
 assert.equal(free.status,201);assert.equal(free.body.room.theme.sku,'night');
 const joined=await f.call('/api/voice/rooms/'+free.body.room.id+'/join','POST',{request_id:crypto.randomUUID()});
 assert.equal(joined.body.room.theme.sku,'night','entry must not replace the host’s explicit free background');
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
