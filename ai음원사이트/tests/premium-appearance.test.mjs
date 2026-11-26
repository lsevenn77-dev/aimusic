import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {eventEnd} from '../server/premium-event.js';
import {PREMIUM_APPEARANCE} from '../shared/decorations.js';
import {PREMIUM_BENEFITS} from '../shared/site-info.js';

test('display rights follow the KST gift cutoff and independent paid rights without changing inventory or equipment',async t=>{
 let at=eventEnd-20;
 t.mock.method(Date,'now',()=>at*1000);
 const f=await fixture(t,{},at-100);
 f.sql.function('unixepoch',()=>at);
 const lookup=async()=>Object.fromEntries((await f.call('/api/decorations/avatars?profiles=producer,member:owner,member:other','GET',null,null)).body.avatars.map(p=>[p.lookup_key,p]));
 const initial=await lookup();
 for(const key of ['producer','member:owner','member:other']){
  assert.equal(initial[key].premium_style_until,eventEnd);
  assert.equal(initial[key].premium_default_frame,1);
 }
 assert.equal(initial['member:other'].profile_id,null);
 const snapshots=()=>['player_inventory','player_equipment'].map(table=>f.sql.prepare('SELECT * FROM '+table+' ORDER BY user_id').all());
 const before=snapshots();
 f.sql.prepare("UPDATE users SET apple_premium_until=? WHERE id='other'").run(at+5*86400);
 at=eventEnd;
 const next=await lookup();
 assert.equal(next.producer.premium_style_until,0);
 assert.equal(next['member:other'].premium_style_until,at+86400);
 assert.deepEqual(snapshots(),before);
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(at+45);
 assert.equal((await lookup()).producer.premium_style_until,at+45);
 f.sql.exec("INSERT INTO player_equipment(user_id,frame_inventory_id) VALUES('owner',NULL)");
 const off=(await lookup()).producer;
 assert.equal(off.premium_style_until,at+45);assert.equal(off.premium_default_frame,0);
 at+=45;assert.equal((await lookup()).producer.premium_style_until,0);
 assert.equal(f.sql.prepare("SELECT frame_inventory_id FROM player_equipment WHERE user_id='owner'").get().frame_inventory_id,null);
 assert.equal((await f.call('/api/decorations/avatars?profiles=artist:artist')).status,400);
 f.sql.exec("INSERT INTO users(id,email,name,provider,account_type,created) VALUES('ai_1','ai@service.invalid','봇','ai_service','ai_bot',0)");
 const bot=await f.call('/api/decorations/avatars?profiles=member:ai_1');
 assert.equal(bot.body.avatars[0].premium_style_until,0);
});
test('the membership badge and frame reference the supplied transparent PNGs without adding paid SKUs',()=>{
 for(const url of [PREMIUM_APPEARANCE.frameArtwork,PREMIUM_APPEARANCE.badgeArtwork]){
  const png=readFileSync(new URL('../dist'+url,import.meta.url));
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png[25],6);
 }
 for(const id of ['premium_badge','gold_nickname','premium_frame'])assert.equal(PREMIUM_BENEFITS.filter(x=>x.id===id).length,1);
});

