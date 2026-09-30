import test from 'node:test';
import assert from 'node:assert/strict';
import {earningsSchedule} from '../shared/gifts.js';
import {fixture} from './fixture.mjs';

test('monthly estimates open at Korean midnight on the fifth and payment is scheduled for the twenty-fifth',()=>{
 const before=Date.parse('2027-01-04T14:59:59Z')/1000,after=before+1;
 assert.deepEqual(earningsSchedule('2026-12',before),{available_on:'2027-01-05',earnings_available:false,payout_on:'2027-01-25'});
 assert.equal(earningsSchedule('2026-12',after).earnings_available,true);
 assert.equal(earningsSchedule('2027-01',after).earnings_available,false);
});

test('payout activity uses actual owned-track listens, deduplicates repeated qualified sessions, and keeps gold separate',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET kind='cover',original_id='one' WHERE id='two'; UPDATE tracks SET user_id='other' WHERE id='three'");
 const listen=f.sql.prepare('INSERT INTO listens(id,track_id,listener,started,day,qualified) VALUES(?,?,?,0,?,?)');
 for(const row of [['a','one','fan','2026-09-01',1],['b','one','fan','2026-09-01',1],['c','one','fan','2026-09-02',1],['d','two','fan','2026-09-01',1],['e','two','other','2026-09-01',0],['f','three','fan','2026-09-01',1]])listen.run(...row);
 f.sql.exec("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES('actual','other','one',27,270000,'producer',189000,81000,'2026-09',0)");
 const r=await f.call('/api/studio/earnings');
 assert.equal(r.status,200);
 assert.deepEqual(r.body.activity,{received_gold:27,original_streams:2,cover_streams:1,total_streams:3});
 assert.equal(r.body.payout_day,25);assert.equal(r.body.earnings_available_day,5);
 assert.equal((await f.call('/api/studio/earnings','GET',undefined,null)).status,401);
});

test('the lightweight follow list is private and follow responses return persisted state without the whole library',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/follows','GET',undefined,null)).status,401);
 const follow=await f.call('/api/producers/producer/follow','PUT',undefined,'other');
 assert.deepEqual([follow.status,follow.body.following,follow.body.followers,follow.body.profile.id],[200,true,1,'producer']);
 assert.equal((await f.call('/api/producers/producer/follow','PUT',undefined,'other')).body.followers,1);
 const list=await f.call('/api/follows','GET',undefined,'other');
 assert.equal(list.body.follows.length,1);assert.equal(list.body.follows[0].target_id,'producer');
 assert.equal((await f.call('/api/follows')).body.follows.length,0);
 const unfollow=await f.call('/api/producers/producer/follow','DELETE',undefined,'other');
 assert.deepEqual([unfollow.body.following,unfollow.body.followers],[false,0]);
 assert.equal((await f.call('/api/follows','GET',undefined,'other')).body.follows.length,0);
});
