import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {membership} from '../server/membership.js';
import {mediaRoute} from '../server/media.js';
import {chatSummary} from '../server/chat-features.js';

function measured(db){
 let trips=0;const original=new WeakMap();
 const DB={prepare(sql){return {bind(...args){
  const target=db.prepare(sql).bind(...args),wrapped={};
  for(const method of ['first','all','run'])wrapped[method]=(...values)=>{trips++;return target[method](...values);};
  original.set(wrapped,target);return wrapped;
 }};},batch(statements){trips++;return db.batch(statements.map(s=>original.get(s)||s));}};
 return {DB,get trips(){return trips;}};
}

test('membership uses one DB trip and preserves current plan, quota and account isolation',async t=>{
 const f=await fixture(t),at=Math.floor(Date.now()/1000);
 f.sql.prepare("UPDATE tracks SET uploaded_at=? WHERE id='one'").run(at);
 f.sql.exec("INSERT INTO playlists(id,user_id,name,created) VALUES('p1','owner','First',1),('p2','owner','Second',2),('p3','owner','Locked',3)");
 const free=measured(f.DB),result=await membership(free,{id:'owner',premium_until:0});
 assert.equal(free.trips,1);assert.equal(result.plan,'free');assert.equal(result.owned_count,3);
 assert.deepEqual(result.active_ids,[]);assert.equal(result.locked_count,0);assert.equal(result.playlists_unlimited,true);
 assert.equal(result.upload_quota.used,1);assert.equal(result.upload_quota.remaining,2);
 f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(at+3600);
 const premium=measured(f.DB),upgraded=await membership(premium,{id:'owner',premium_until:at+3600});
 assert.equal(premium.trips,1);assert.equal(upgraded.active_ids.length,0);assert.equal(upgraded.upload_quota.remaining,9);
 const other=await membership({DB:f.DB},{id:'other'});assert.equal(other.owned_count,0);assert.equal(other.upload_quota.used,0);
});

test('studio uses one DB trip with correct paging, private works and owner checks',async t=>{
 const f=await fixture(t),env=measured(f.DB),req=new Request('https://aifect.test/api/studio?offset=1');
 const result=await (await mediaRoute(req,env,'/api/studio',{id:'owner'})).json();
 assert.equal(env.trips,1);assert.equal(result.track_total,4);assert.equal(result.tracks.length,3);
 assert.equal(result.producer.id,'producer');assert.equal(result.artists[0].id,'artist');
 assert.equal(result.upload_quota.limit,3);
 const other=await (await mediaRoute(req,{DB:f.DB},'/api/studio',{id:'other'})).json();
 assert.equal(other.producer,null);assert.deepEqual(other.tracks,[]);assert.deepEqual(other.artists,[]);
 await assert.rejects(mediaRoute(req,{DB:f.DB},'/api/studio',null),{status:401});
});

test('message summary uses one DB trip and retains unread and block boundaries',async t=>{
 const f=await fixture(t);
 await f.call('/api/me/profile','PUT',{name:'Moon'},'other');
 await f.call('/api/dm/producer','POST',{body:'Unread',request_id:crypto.randomUUID()},'other');
 const env=measured(f.DB),summary=await chatSummary(env,{id:'owner'});
 assert.equal(env.trips,1);assert.equal(summary.unread,1);assert.equal(summary.direct_unread,1);assert.equal(summary.crew,null);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',0)");
 assert.equal((await chatSummary({DB:f.DB},{id:'owner'})).unread,0);
 await assert.rejects(chatSummary({DB:f.DB},null),{status:401});
});
