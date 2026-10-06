import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';

test('inactive review uses the last 60 days of qualified plays, allows new songs, and makes no automatic changes',async t=>{
 const f=await fixture(t,{TRACK_REVIEW_USER_IDS:'owner'}),now=Math.floor(Date.now()/1000),cutoff=now-60*86400;
 f.sql.prepare('UPDATE tracks SET created=?').run(cutoff-100);
 f.sql.prepare("UPDATE tracks SET created=? WHERE id='three'").run(now-1);
 f.sql.prepare("INSERT INTO listens(id,track_id,listener,started,day,qualified) VALUES('recent','one','x',?,'today',1),('old','two','x',?,'old',1),('short','two','y',?,'today',0)").run(now-1,cutoff-1,now-1);
 const d=(await f.call('/api/admin/track-review')).body;
 assert.equal(d.automatic_actions,false);assert.deepEqual(d.tracks.map(x=>x.id),['two']);assert.deepEqual(d.tracks[0].reasons,['inactive']);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM tracks WHERE status='published'").get().n,3);
 assert.equal((await f.call('/api/admin/payouts')).status,404);
 assert.equal((await f.call('/api/me')).body.track_moderator,true);assert.equal((await f.call('/api/me')).body.admin,false);
 assert.equal((await f.call('/api/admin/track-review','GET',null,'other')).status,403);
 assert.equal((await f.call('/api/admin/track-review','GET',null,'')).status,401);
});

test('three different authenticated reporters trigger review, duplicates count once and evidence stays private',async t=>{
 const f=await fixture(t,{TRACK_REVIEW_USER_IDS:'owner'});f.sql.exec('UPDATE tracks SET created=unixepoch()');
 for(const uid of ['third','fourth']){f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@test.invalid',uid);f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,unixepoch()+3600)').run(await hash(uid),uid);}
 assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'low_quality'},'')).status,401);
 assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'low_quality'})).status,400);
 assert.equal((await f.call('/api/tracks/hidden/report','POST',{reason:'low_quality'},'other')).status,404);
 assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'other'},'other')).status,400);
 for(const uid of ['other','third'])assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'low_quality',details:'noise'},uid)).status,201);
 for(let i=0;i<4;i++)assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'low_quality'},'other')).status,200);
 assert.equal((await f.call('/api/admin/track-review')).body.tracks.length,0);
 assert.equal((await f.call('/api/tracks/one/report','POST',{reason:'low_quality',details:'clipping'},'fourth')).status,201);
 const d=(await f.call('/api/admin/track-review')).body;assert.equal(d.tracks.length,1);assert.equal(d.tracks[0].report_count,3);assert.deepEqual(d.tracks[0].reasons,['low_quality']);
 assert.equal((await f.call('/api/tracks/one')).body.track.status,undefined);
 assert.equal((await f.call('/api/admin/track-review/one','GET',null,'other')).status,403);
 const evidence=(await f.call('/api/admin/track-review/one')).body;assert.equal(evidence.reports.length,3);assert.ok(evidence.reports.every(x=>!('user_id' in x)));
 assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'published');
});

test('only explicit operators remove an exact song, block its playback and covers, preserve ledgers and restore it',async t=>{
 const f=await fixture(t,{TRACK_REVIEW_USER_IDS:'owner'});
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one';UPDATE tracks SET kind='cover',original_id='one' WHERE id='two';INSERT INTO likes(user_id,track_id,created) VALUES('other','one',1)");
 const path='/api/admin/track-review/one/visibility';
 assert.equal((await f.call(path,'POST',{action:'remove'},'other')).status,403);
 assert.equal((await f.call(path,'POST',{action:'remove'})).body.status,'removed');
 assert.equal((await f.call(path,'POST',{action:'remove'})).status,200);
 assert.equal((await f.call('/api/tracks/one')).status,404);assert.equal((await f.call('/api/tracks/two')).status,404);
 assert.equal((await f.call('/api/playback/one','POST',{})).status,404);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM likes WHERE track_id='one'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM admin_audit WHERE action='track:remove'").get().n,1);
 assert.deepEqual((await f.call('/api/admin/track-review?view=removed')).body.tracks.map(x=>x.id),['one']);
 assert.equal((await f.call('/api/uploads/one/retry','POST',{})).status,409);
 assert.equal((await f.call(path,'POST',{action:'restore'})).body.status,'published');
 assert.equal((await f.call('/api/tracks/one')).status,200);assert.equal((await f.call('/api/tracks/two')).status,200);
 assert.equal((await f.call('/api/admin/track-review/hidden/visibility','POST',{action:'restore'})).status,409);
 assert.equal((await f.call('/api/admin/track-review?view=all&q=three')).body.tracks.length,1);
});

test('community and catalog expose the uploader photo version independently of artist and cover identity',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE producers SET image_version='profile-42';UPDATE tracks SET cover_version='cover-12'");
 const catalog=(await f.call('/api/catalog?section=tracks')).body.tracks,community=(await f.call('/api/community')).body.tracks;
 for(const song of [...catalog,...community]){assert.equal(song.producer_image_version,'profile-42');assert.equal(song.cover_version,'cover-12');}
});

test('owner unpublish cannot overwrite a concurrent moderator removal',async t=>{
 const f=await fixture(t,{TRACK_REVIEW_USER_IDS:'other'}),prepare=f.DB.prepare;let intervened=false;
 async function intervene(q){if(!intervened&&q.includes("UPDATE tracks SET status='hidden'")){intervened=true;assert.equal((await f.call('/api/admin/track-review/one/visibility','POST',{action:'remove'},'other')).status,200);}}
 f.DB.prepare=q=>{const statement=prepare(q);return {bind(...args){const bound=statement.bind(...args);return {...bound,async first(){await intervene(q);return bound.first();},async run(){await intervene(q);return bound.run();}};}};};
 assert.equal((await f.call('/api/uploads/one/unpublish','POST',{})).status,409);
 assert.equal(f.sql.prepare("SELECT status FROM tracks WHERE id='one'").get().status,'removed');
 assert.deepEqual((await f.call('/api/admin/track-review?view=removed','GET',null,'other')).body.tracks.map(x=>x.id),['one']);
 assert.equal((await f.call('/api/admin/track-review/one/visibility','POST',{action:'restore'},'other')).status,200);
});
