import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {socialRoute} from '../server/social.js';

test('crew detail synchronizes XP and reads current permissions/music in one DB round trip',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
 const prepare=f.DB.prepare.bind(f.DB),batch=f.DB.batch.bind(f.DB);let batches=0,standalone=0,inBatch=false;
 f.DB.prepare=sql=>({bind(...args){const statement=prepare(sql).bind(...args);return Object.fromEntries(['first','all','run'].map(method=>[method,async()=>{if(!inBatch)standalone++;return statement[method]();}]));}});
 f.DB.batch=async statements=>{batches++;inBatch=true;try{return await batch(statements);}finally{inBatch=false;}};
 const get=async(user={id:'owner'},blocked=[])=>{
  const r=await socialRoute(new Request('https://aifect.test/api/crews/crew'),{DB:f.DB,AIFECT_BLOCKED:blocked},'/api/crews/crew',user);return r.json();
 };
 let d=await get();assert.equal(batches,1);assert.equal(standalone,0);assert.equal(d.crew.xp,3);assert.equal(d.membership.role,'owner');assert.equal(d.members.length,1);assert.equal(d.tracks.length,3);
 d=await get();assert.equal(d.crew.xp,3,'revisits cannot farm XP');
 assert.equal((await get(null)).membership,null,'guest never inherits membership');
 assert.equal((await get({id:'other'},['owner'])).tracks.length,0,'viewer blocks still filter music');
 f.sql.exec("DELETE FROM crew_members WHERE crew_id='crew'; INSERT INTO crew_bans(crew_id,user_id,created) VALUES('crew','owner',0)");
 d=await get();assert.equal(d.membership,null);assert.equal(d.banned,true);assert.equal(d.members.length,0);assert.equal(d.tracks.length,0);
});

test('crew detail still returns 404 for a missing crew',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/crews/missing')).status,404);
});

test('discovery summary omits unused music while home music and joined detail are preserved',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
 const summary=(await f.call('/api/crews?summary=1')).body;
 assert.equal(summary.crews.length,1);assert.equal(summary.rankings.length,1);assert.equal(summary.mine,'crew');assert.deepEqual(summary.tracks,[]);
 assert.equal((await f.call('/api/crews')).body.tracks.length,3);
 assert.equal((await f.call('/api/crews?summary=1&home=1')).body.detail.tracks.length,3);
});
