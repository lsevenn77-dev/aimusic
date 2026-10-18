import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('release date is owner editable, calendar validated, public, and independent of upload date',async t=>{
 const f=await fixture(t),before=f.sql.prepare("SELECT created,uploaded_at FROM tracks WHERE id='one'").get();
 const data={title:'one',genre:'Rock',ai_tool:'QA',artist_id:'artist',release_date:'2024-02-29'};
 assert.equal((await f.call('/api/studio/tracks/one','PUT',data)).status,200);
 assert.equal((await f.call('/api/tracks/one')).body.track.release_date,'2024-02-29');
 assert.deepEqual(f.sql.prepare("SELECT created,uploaded_at FROM tracks WHERE id='one'").get(),before);
 assert.equal((await f.call('/api/studio/tracks/one','PUT',{...data,release_date:'2024-03-01'},'other')).status,404);
 for(const value of ['2025-02-29','2026-13-01','2026-10-18T00:00:00Z',123,'1899-12-31'])assert.equal((await f.call('/api/studio/tracks/one','PUT',{...data,release_date:value})).status,400);
 const {release_date,...legacy}=data;await f.call('/api/studio/tracks/one','PUT',legacy);
 assert.equal((await f.call('/api/studio/tracks/one')).body.profile.release_date,'2024-02-29','older app edits preserve the release date');
 await f.call('/api/studio/tracks/one','PUT',{...data,release_date:''});assert.equal((await f.call('/api/studio/tracks/one')).body.profile.release_date,'');
});

test('cover release date edits do not change inherited title or original metadata',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET kind='cover',original_id='one' WHERE id='two'");
 const r=await f.call('/api/studio/tracks/two','PUT',{description:'가창 메모',release_date:'2026-10-18',title:'바꾸면 안 됨'});assert.equal(r.status,200);
 const saved=(await f.call('/api/studio/tracks/two')).body.profile;assert.equal(saved.release_date,'2026-10-18');assert.equal(saved.title,'two');assert.equal(saved.description,'가창 메모');
 assert.equal((await f.call('/api/studio/tracks/one')).body.profile.release_date,'');
});
