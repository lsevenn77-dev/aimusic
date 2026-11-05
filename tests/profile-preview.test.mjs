import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('profile preview returns real counts and the current crew level badge without private account data',async t=>{
 const f=await fixture(t);
 const crew=(await f.call('/api/crews','POST',{name:'Saved crew'})).body.crew;
 f.sql.prepare('UPDATE crews SET image_version=? WHERE id=?').run('saved-v2',crew.id);
 await f.call('/api/producers/producer/follow','PUT',null,'other');
 await f.call('/api/artists/artist/follow','PUT');
 const r=await f.call('/api/producers/producer/preview','GET',null,'other');
 assert.equal(r.status,200);assert.equal(r.body.profile.id,'producer');
 assert.equal(r.body.followers,1);assert.equal(r.body.following_count,1);assert.equal(r.body.following,true);
 assert.deepEqual(r.body.crew,{id:crew.id,name:'Saved crew',image_version:'saved-v2',level:1,badge_url:'/assets/crew-badges/lv1.webp'});
 assert.equal(r.body.profile.email,undefined);assert.equal(r.body.tracks,undefined);
 const guest=await f.call('/api/producers/producer/preview','GET',null,null);
 assert.equal(guest.status,200);assert.equal(guest.body.following,false);
 await f.call('/api/producers/producer/follow','DELETE',null,'other');
 assert.equal((await f.call('/api/producers/producer/preview')).body.followers,0);
});
test('preview handles no crew, missing profiles, method and block restrictions',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/producers/producer/preview')).body.crew,null);
 assert.equal((await f.call('/api/producers/missing/preview')).status,404);
 assert.equal((await f.call('/api/producers/producer/preview','POST',{})).status,405);
 await f.call('/api/blocks/owner','PUT',null,'other');
 assert.equal((await f.call('/api/producers/producer/preview','GET',null,'other')).status,403);
});

 test('preview includes only valid equipped frame artwork and reflects unequip',async t=>{
 const f=await fixture(t);
 await f.call('/api/crews','POST',{name:'Frame crew'});
 await f.call('/api/me/player');
 const item=f.sql.prepare("SELECT id FROM player_inventory WHERE user_id='owner' AND item_key='crew-outline'").get();
 assert.ok(item);
 assert.equal((await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id})).status,200);
 const p=(await f.call('/api/producers/producer/preview','GET',null,null)).body.profile;
 assert.equal(p.profile_frame,'crew-outline');assert.equal(p.profile_frame_artwork,'/assets/crew-basic-v2.webp');assert.equal(p.player_xp,undefined);
 await f.call('/api/me/player/equipment','PUT',{frame_inventory_id:null});
 assert.equal((await f.call('/api/producers/producer/preview')).body.profile.profile_frame,null);
 });
