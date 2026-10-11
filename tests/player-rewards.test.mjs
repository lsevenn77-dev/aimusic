import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {playerBackfill} from '../server/player.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const addXP=(sql,amount,user='owner',key='reward-test')=>sql.prepare("INSERT INTO player_xp(user_id,source_key,kind,amount,created) VALUES(?,?,'publish',?,0)").run(user,key,amount);
const join=sql=>sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0); INSERT INTO crew_members(crew_id,user_id,joined) VALUES('crew','owner',0); INSERT INTO crew_xp(id,crew_id,user_id,amount,created) VALUES('reward-test','crew','owner',499,0)");
const reward=(d,key)=>d.inventory.find(i=>i.item_key===key);

test('level 10 threshold grants once without equipping; permanent reward works without crew',async t=>{
 const {sql,call}=await fixture(t);addXP(sql,4199); // fixture publication XP = 300
 let d=(await call('/api/me/player')).body;
 assert.equal(d.player.level,9);assert.equal(reward(d,'player-level-10'),undefined);
 assert.equal(d.rewards.find(i=>i.item_key==='player-level-10').available,false);
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:'reward:player-level-10:owner',xp:99999})).status,409);
 addXP(sql,1,'owner','threshold');
 const states=await Promise.all([call('/api/me/player'),call('/api/me/player')]);
 for(const state of states){assert.equal(state.status,200);assert.equal(state.body.player.level,10);assert.equal(state.body.profile.profile_frame,null);}
 d=states[0].body;const item=reward(d,'player-level-10');assert.ok(item.available);assert.equal(d.inventory.length,1);
 assert.equal(d.rewards.some(i=>i.item_key==='player-level-10'),false);
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id},'other')).status,409);
 d=(await call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id})).body;
 assert.equal(d.profile.profile_frame,'player-level-10');assert.equal(d.profile.profile_frame_artwork,item.artwork);
 const profile=(await call('/api/producers/producer')).body.profile;assert.equal(profile.profile_frame_artwork,item.artwork);
 assert.equal((await call('/api/me/profile')).body.profile.profile_frame_artwork,item.artwork);
 sql.exec('DELETE FROM player_xp'); // already earned, no membership or ongoing level restriction
 assert.equal(reward((await call('/api/me/player')).body,'player-level-10').available,true);
});

test('crew 3/4/5 rewards follow crew XP boundaries, preserve equipped choice and enforce membership',async t=>{
 const {sql,call}=await fixture(t);join(sql);
 let d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,1);
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:'reward:crew-level-3:owner'})).status,409);
 for(const [xp,count,level] of [[500,2,3],[1499,2,3],[1500,3,4],[2999,3,4],[3000,4,5]]){
  sql.prepare("UPDATE crew_xp SET amount=? WHERE id='reward-test'").run(xp);
  d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,count);assert.ok(reward(d,'crew-level-'+level).available);assert.equal(d.profile.profile_frame,'crew-outline');
 }
 const frame=reward(d,'crew-level-5');await call('/api/me/player/equipment','PUT',{frame_inventory_id:frame.id});
 d=(await call('/api/me/player')).body;assert.equal(d.profile.profile_frame_artwork,frame.artwork);
 sql.exec("UPDATE crew_xp SET amount=2999 WHERE id='reward-test'");
 d=(await call('/api/me/player')).body;assert.equal(reward(d,'crew-level-5').available,false);assert.equal(d.profile.profile_frame,null);
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:frame.id})).status,409);
 sql.exec("DELETE FROM crew_members WHERE user_id='owner'");
 d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,4);assert.ok(d.inventory.every(i=>!i.available));assert.equal(d.profile.profile_frame_artwork,null);
 sql.exec("UPDATE crew_xp SET amount=3000 WHERE id='reward-test'; INSERT INTO crew_members(crew_id,user_id,joined) VALUES('crew','owner',0)");
 assert.equal((await call('/api/me/player')).body.inventory.length,4);
});

test('existing eligible users receive rewards on backfill; expired/revoked rewards cannot be regranted or worn',async t=>{
 const {sql,call,DB}=await fixture(t);addXP(sql,6000);join(sql);sql.exec("UPDATE crew_xp SET amount=3000");
 await playerBackfill({DB});await playerBackfill({DB});
 let d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,5);assert.equal(d.profile.profile_frame,'crew-outline');
 const item=reward(d,'player-level-10');await call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id});
 for(const change of ['expires_at=1','expires_at=0,revoked=1']){
  sql.prepare('UPDATE player_inventory SET '+change+' WHERE id=?').run(item.id);
  d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,5);assert.equal(reward(d,'player-level-10').available,false);assert.equal(d.profile.profile_frame_artwork,null);
  assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:item.id})).status,409);
 }
});

test('web displays future server-provided frame keys without a client release and rejects external paths',()=>{
 const ctx=vm.createContext({AifectPlayer:{PLAYER_ITEMS:{}},document:{addEventListener(){}},esc:x=>String(x)});
 vm.runInContext(readFileSync(new URL('../dist/player-progress.js',import.meta.url),'utf8'),ctx);
 const path='/assets/future-event-2099-v1.webp';ctx.person={profile_frame:'future-event',profile_frame_artwork:path};
 assert.match(vm.runInContext('playerBadgeHTML(person)',ctx),/future-event-2099-v1.webp/);
 for(const path of ['https://third-party.test/frame.png','//third-party.test/a.png','/assets/../private.png','/assets/a.png" onerror="bad']){ctx.person.profile_frame_artwork=path;assert.equal(vm.runInContext('playerFrameURL(person)',ctx),'');}
});
