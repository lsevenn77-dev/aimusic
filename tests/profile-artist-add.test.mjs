import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('profile artist creation requires a signed-in owner, validates fields and preserves existing records',async t=>{
 const f=await fixture(t),before=f.sql.prepare('SELECT * FROM artists ORDER BY id').all();
 const body={name:'새 아티스트',genre:'K-POP',bio:'소개'};
 assert.equal((await f.call('/api/studio/artists','POST',body,null)).status,401);
 assert.equal((await f.call('/api/studio/artists','POST',{...body,name:'없음'})).status,400);
 assert.equal((await f.call('/api/studio/artists','POST',{...body,genre:''})).status,400);
 const created=await f.call('/api/studio/artists','POST',body);
 assert.equal(created.status,201);
 const artist=f.sql.prepare('SELECT * FROM artists WHERE id=?').get(created.body.id);
 assert.equal(artist.producer_id,'producer');assert.equal(artist.name,body.name);assert.equal(artist.bio,body.bio);
 assert.equal((await f.call('/api/studio/artists','POST',body)).body.id,artist.id);
 assert.deepEqual(f.sql.prepare('SELECT * FROM artists WHERE id=?').all('artist'),before);
 assert.equal((await f.call('/api/studio/artists/'+artist.id,'PUT',{name:'변경',genre:'K-POP'},'other')).status,404);
});

