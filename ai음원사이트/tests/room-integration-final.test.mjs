import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';

test('reservation search pages preserve eligibility and have no overlap for equal creation times',async t=>{
 const f=await liveFixture(t),r=await f.create();
 for(let i=0;i<33;i++)f.addSong('page-'+String(i).padStart(2,'0'));
 f.addSong('page-no-rights',{rights_accepted:0});
 const route=r.root+'karaoke-search?generation='+encodeURIComponent(r.state.generation)+'&q=page-&offset=';
 const first=await f.call(route+'0'),second=await f.call(route+first.body.next);
 assert.equal(first.status,200);assert.equal(second.status,200);
 assert.equal(first.body.tracks.length,30);assert.equal(first.body.next,30);
 assert.equal(second.body.tracks.length,3);assert.equal(second.body.next,null);
 const ids=[...first.body.tracks,...second.body.tracks].map(track=>track.id);
 assert.equal(new Set(ids).size,33);assert.deepEqual(ids,[...ids].sort());
 assert.ok(!ids.includes('page-no-rights'));assert.equal((await f.call(route+'-1')).status,400);
});

test('room playlist rejects guests and stale adds, coalesces concurrent additions and permits readding after removal',async t=>{
 const f=await liveFixture(t),r=await f.create({mode:'talk'}),guest=await f.join(r);
 const consent=await f.call(r.root+'music-consent','POST',{generation:r.state.generation,track_id:'one',accept:true});
 assert.equal(consent.status,200);
 const cmd=(operation,extra={},user='owner')=>f.call(r.root+'music','POST',{generation:user==='owner'?r.state.generation:guest.generation,operation,request_id:crypto.randomUUID(),...extra},user);
 const revision=r.state.music.revision,add={track_id:'one',queue_revision:revision};
 assert.equal((await cmd('enqueue',add,'other')).status,403);
 const responses=await Promise.all([cmd('enqueue',add),cmd('enqueue',add)]);
 assert.deepEqual(responses.map(v=>v.status),[200,200]);
 const state=await f.call(r.root+'state');
 assert.deepEqual(state.body.music.queue.map(v=>v.id),['one']);
 assert.equal(state.body.music.revision,revision+1);
 const removed=await cmd('remove',{index:0});assert.equal(removed.status,200);
 assert.equal((await cmd('enqueue',add)).status,409);
 assert.equal((await cmd('enqueue',{...add,queue_revision:removed.body.music.revision})).status,200);
});
