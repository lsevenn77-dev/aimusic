import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('six categories preserve legacy and new events with isolated 20-item cursors',async t=>{
 const f=await fixture(t);
 const categories={comments:['comment','fan_comment','fan_post'],works:['cover','duet','dubbing_participation','dubbing_complete','work_status'],artists:['follow','artist_follower','artist_release'],crew:['crew_notice','crew_invite','crew_approved','crew_request'],gifts:['gift','person_gift']};
 const insert=f.sql.prepare("INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,created) VALUES(?,'owner','other',?,'one',100)");
 for(const kinds of Object.values(categories))for(const kind of kinds)for(let i=0;i<21;i++)insert.run(`${kind}-${i}`,kind);
 for(const [filter,kinds] of Object.entries(categories)){
  const ids=new Set();let cursor=null;
  do{const r=await f.call('/api/notifications?filter='+filter+(cursor?'&before='+encodeURIComponent(cursor):''));assert.equal(r.status,200);assert(r.body.items.length<=20);for(const n of r.body.items){assert(kinds.includes(n.kind));assert(!ids.has(n.id));ids.add(n.id);}cursor=r.body.next;}while(cursor);
  assert.equal(ids.size,kinds.length*21);
 }
 assert.equal((await f.call('/api/notifications')).body.items.length,20);
 assert.equal((await f.call('/api/notifications','GET',null,'other')).body.items.length,0);
});
