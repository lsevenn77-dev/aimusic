import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('home track requests return only the requested public slice',async t=>{
 const f=await fixture(t);
 f.sql.exec("UPDATE tracks SET created=1 WHERE id='one'; UPDATE tracks SET created=2 WHERE id='two'; UPDATE tracks SET created=3 WHERE id='three'; UPDATE tracks SET created=4 WHERE id='hidden'");
 const result=await f.call('/api/catalog?section=tracks&limit=2','GET',undefined,null);
 assert.equal(result.status,200);
 assert.deepEqual(Object.keys(result.body),['tracks']);
 assert.deepEqual(result.body.tracks.map(x=>x.id),['three','two']);
 assert.equal((await f.call('/api/catalog?section=tracks&limit=5&genre=Ballad')).body.tracks.length,0);
});

test('artist sections omit private-only profiles and retain the legacy full catalog',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('private','producer','Private',99); UPDATE tracks SET artist_id='private' WHERE id='hidden'");
 const artists=await f.call('/api/catalog?section=artists&limit=4','GET',undefined,null);
 assert.deepEqual(Object.keys(artists.body),['artists']);
 assert.deepEqual(artists.body.artists.map(x=>x.id),['artist']);
 const all=await f.call('/api/catalog');
 assert.deepEqual(Object.keys(all.body).sort(),['artists','producers','tracks']);
 assert.equal(all.body.tracks.length,3);
 assert.equal(all.body.producers.length,1);
 assert.equal((await f.call('/api/catalog?section=unknown')).status,400);
});

test('catalog size is bounded even with invalid or untrusted limit input',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/catalog?section=tracks&limit=-5')).body.tracks.length,1);
 assert.equal((await f.call('/api/catalog?section=tracks&limit=NaN')).body.tracks.length,3);
 assert.equal((await f.call('/api/catalog?section=tracks&limit=1%3BDROP%20TABLE%20tracks')).body.tracks.length,3);
 assert.equal((await f.call('/api/tracks/one')).status,200);
});
