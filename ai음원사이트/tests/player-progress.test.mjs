import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {playerBackfill} from '../server/player.js';
import {playerProgress} from '../shared/player.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const join=(sql,user='owner')=>{sql.exec("INSERT OR IGNORE INTO crews(id,owner_id,name,created) VALUES('crew','owner','crew',0)");sql.prepare("INSERT INTO crew_members(crew_id,user_id,joined) VALUES('crew',?,0)").run(user);};
const xp=(sql,uid='owner')=>sql.prepare('SELECT COALESCE(sum(amount),0) n FROM player_xp WHERE user_id=?').get(uid).n;

test('level boundaries increase and cap without negative or overfilled progress',()=>{
 for(const [value,level,remaining] of [[0,1,100],[99,1,1],[100,2,200],[299,2,1],[300,3,300],[495000,100,0],[900000,100,0]]){const p=playerProgress(value);assert.equal(p.level,level);assert.equal(p.remaining,remaining);assert.ok(p.progress>=0&&p.progress<=1);}
 assert.equal(playerProgress(-100).xp,0);
});
test('publication XP is awarded once per song and cannot be supplied by a client',async t=>{
 const {sql,call}=await fixture(t);assert.equal(xp(sql),300);
 sql.exec("UPDATE tracks SET status='processing' WHERE id='hidden'");assert.equal(xp(sql),300);
 sql.exec("UPDATE tracks SET kind='cover',status='published' WHERE id='hidden'");assert.equal(xp(sql),360);
 for(let n=0;n<3;n++)sql.exec("UPDATE tracks SET status='hidden' WHERE id='hidden'; UPDATE tracks SET status='published' WHERE id='hidden'");assert.equal(xp(sql),360);
 assert.equal((await call('/api/me/player','POST',{xp:10000})).status,405);
 assert.equal((await call('/api/me/player','GET',null,null)).status,401);
 assert.equal((await call('/internal/player/backfill','POST')).status,401);
 assert.equal((await call('/api/producers/producer')).body.profile.player_level,3);
 assert.equal((await call('/api/me/player','GET',null,'other')).body.player.xp,0);
});
test('qualified listening, non-self comments and crew chat are capped per KST day',async t=>{
 const {sql,call}=await fixture(t);join(sql,'other');
 sql.exec("INSERT INTO listens(id,track_id,listener,user_id,started,day) VALUES('l1','one','other','other',0,'2020-01-01'),('l2','one','other','other',0,'2020-01-02')");
 assert.equal(xp(sql,'other'),0);sql.exec("UPDATE listens SET qualified=1");assert.equal(xp(sql,'other'),10);
 sql.exec("UPDATE listens SET qualified=0; UPDATE listens SET qualified=1");assert.equal(xp(sql,'other'),10);
 for(let n=0;n<3;n++)assert.equal((await call('/api/tracks/one/comments','POST',{body:'좋은 노래 '+n},'other')).status,201);
 assert.equal(xp(sql,'other'),15);
 await call('/api/tracks/one/comments','POST',{body:'내 음악'},'owner');assert.equal(xp(sql),300);
 sql.exec("INSERT INTO crew_messages(id,crew_id,user_id,body,kind,request_id,created) VALUES('s','crew','other','joined','system','s',0),('a','crew','other','hello','message','a',0),('b','crew','other','again','message','b',0)");assert.equal(xp(sql,'other'),20);
 const day=sql.prepare("SELECT date('now','+9 hours') d").get().d;
 assert.equal(sql.prepare("SELECT source_key FROM player_xp WHERE user_id='other' AND kind='listen'").get().source_key,'listen:'+day);
});
test('joining grants one basic crew frame; manual choice persists and leaving revokes use',async t=>{
 const {sql,call}=await fixture(t);join(sql);
 let d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,1);assert.equal(d.inventory[0].equipped,true);assert.equal(d.profile.profile_frame,'crew-outline');const id=d.inventory[0].id;
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:id},'other')).status,409);
 d=(await call('/api/me/player/equipment','PUT',{frame_inventory_id:null})).body;assert.equal(d.inventory[0].equipped,false);assert.equal(d.profile.profile_frame,null);
 await call('/api/me/player/equipment','PUT',{frame_inventory_id:id});sql.exec("DELETE FROM crew_members WHERE user_id='owner'");
 d=(await call('/api/me/player')).body;assert.equal(d.inventory[0].available,false);assert.equal(d.profile.profile_frame,null);
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:id})).status,409);
 join(sql);d=(await call('/api/me/player')).body;assert.equal(d.inventory.length,1);assert.equal(d.inventory[0].available,true);assert.equal(d.inventory[0].equipped,false);
 assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:id})).body.inventory[0].equipped,true);
 assert.equal((await call('/api/me/player/equipment','PUT',{})).status,400);
});
test('expired and revoked grants never render or equip even with stale equipment rows',async t=>{
 const {sql,call}=await fixture(t);join(sql);
 for(const update of ["expires_at=1","expires_at=0,revoked=1"]){sql.exec('UPDATE player_inventory SET '+update);assert.equal((await call('/api/me/player')).body.profile.profile_frame,null);assert.equal((await call('/api/me/player/equipment','PUT',{frame_inventory_id:'crew-frame:owner'})).status,409);assert.equal((await call('/api/producers/producer')).body.profile.profile_frame,null);}
});
test('bounded backfill awards existing songs and memberships once without overriding equipment',async()=>{
 const db=new DatabaseSync(':memory:');try{
 const files=readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
 for(const f of files.filter(n=>n!=='0040_player_progress.sql'))db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.exec("INSERT INTO users(id,email,name,created) VALUES('u','u@test','User',0); INSERT INTO producers(id,user_id,name,created) VALUES('p','u','User',0); INSERT INTO artists(id,producer_id,name,created) VALUES('a','p','Singer',0); INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status) VALUES('t','u','a','p','Track','Pop','AI',1,'wav',10,1,'published'); INSERT INTO crews(id,owner_id,name,created) VALUES('c','u','Crew',0); INSERT INTO crew_members(crew_id,user_id,joined) VALUES('c','u',0)");
 db.exec(readFileSync(new URL('../drizzle/0040_player_progress.sql',import.meta.url),'utf8'));
 const env={DB:{prepare(q){return {bind(...a){return {async run(){const r=db.prepare(q).run(...a);return {meta:{changes:Number(r.changes)}};}};}};},async batch(stmts){const results=[];for(const stmt of stmts)results.push(await stmt.run());return results;}}};
 assert.deepEqual((await playerBackfill(env)).changes,[1,1,1,0,0,0,0]);
 db.exec('UPDATE player_equipment SET frame_inventory_id=NULL');
 assert.deepEqual((await playerBackfill(env)).changes,[0,0,0,0,0,0,0]);
 assert.equal(db.prepare('SELECT frame_inventory_id id FROM player_equipment').get().id,null);
 db.exec("UPDATE player_equipment SET frame_inventory_id='crew-frame:u'");
 assert.equal(xp(db,'u'),100);assert.equal(db.prepare('SELECT count(*) n FROM player_inventory').get().n,1);assert.equal(db.prepare('SELECT frame_inventory_id id FROM player_equipment').get().id,'crew-frame:u');
 db.exec("UPDATE tracks SET status='hidden'; UPDATE tracks SET status='published'");assert.equal(xp(db,'u'),100);
 }finally{db.close();}
});
