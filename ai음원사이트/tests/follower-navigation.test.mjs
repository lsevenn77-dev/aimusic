import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('a follower without a producer profile has a read-only identity without private account fields',async t=>{
 const f=await fixture(t);
 await f.call('/api/producers/producer/follow','PUT',{},'other');
 const list=(await f.call('/api/me/profile')).body.followers;
 assert.equal(list[0].user_id,'other');assert.equal(list[0].id,null);
 const before=f.sql.prepare('SELECT count(*) n FROM producers').get().n;
 const r=await f.call('/api/followers/other');assert.equal(r.status,200);
 assert.equal(r.body.profile.name,'other');assert.equal(r.body.profile.id,null);
 assert.deepEqual(Object.keys(r.body.profile).sort(),['bio','id','image_version','name','user_id']);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM producers').get().n,before,'visiting never creates or changes the follower account');
 assert.equal((await f.call('/api/followers/other','GET',null,null)).status,401);
 assert.equal((await f.call('/api/followers/owner','GET',null,'other')).status,404);
 assert.equal((await f.call('/api/followers/other','POST',{})).status,405);
 await f.call('/api/producers/producer/follow','DELETE',{},'other');
 assert.equal((await f.call('/api/followers/other')).status,404);
});

test('a follower who adds a public profile retains their identity and resolves to that real profile',async t=>{
 const f=await fixture(t);await f.call('/api/producers/producer/follow','PUT',{},'other');
 const p=(await f.call('/api/me/profile','PUT',{name:'Next voice'},'other')).body.profile;
 const r=await f.call('/api/followers/other');assert.equal(r.status,200);assert.equal(r.body.profile.id,p.id);
 assert.equal((await f.call('/api/producers/'+p.id)).status,200);
});
