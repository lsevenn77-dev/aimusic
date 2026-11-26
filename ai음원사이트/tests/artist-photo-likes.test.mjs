import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('photo likes persist per account, are idempotent under concurrent requests and cascade on delete',async t=>{
 const f=await fixture(t,{BUCKET:{delete:async()=>{}}});
 f.sql.exec("INSERT INTO artist_photos VALUES('photo','artist','v1','image/webp',0); INSERT INTO artists(id,producer_id,name,created) VALUES('second','producer','Second',0)");
 const path='/api/artists/artist/gallery/photo/like';
 assert.equal((await f.call(path,'PUT',{},null)).status,401);
 assert.equal((await f.call('/api/artists/second/gallery/photo/like','PUT',{})).status,404);
 assert.equal((await f.call(path,'POST',{})).status,405);
 const requests=await Promise.all(Array.from({length:8},()=>f.call(path,'PUT',{},'other')));
 for(const r of requests){assert.equal(r.status,200);assert.equal(r.body.like_count,1);assert.equal(r.body.liked_by_me,1);}
 assert.equal((await f.call(path,'PUT',{})).body.like_count,2);
 const get=async who=>(await f.call('/api/artists/artist/gallery','GET',null,who)).body.photos[0];
 assert.equal((await get('other')).liked_by_me,1);assert.equal((await get(null)).liked_by_me,0);assert.equal((await get(null)).like_count,2);
 const page=(await f.call('/api/artists/artist','GET',null,'other')).body;assert.equal(page.gallery[0].like_count,2);assert.equal(page.gallery[0].liked_by_me,1);
 assert.equal((await f.call(path,'DELETE',{},'other')).body.like_count,1);
 assert.equal((await f.call(path,'DELETE',{},'other')).body.like_count,1);
 assert.equal((await get('other')).liked_by_me,0);
 assert.equal((await f.call('/api/artists/artist/gallery/photo','DELETE',{},'other')).status,403);
 assert.equal((await f.call('/api/artists/artist/gallery/photo','DELETE',{})).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM artist_photo_likes').get().n,0);
 assert.equal((await f.call(path,'PUT',{})).status,404);
});
test('photo likes respect block lists and rate limits without corrupting counts',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO artist_photos VALUES('photo','artist','v1','image/webp',0)");
 const path='/api/artists/artist/gallery/photo/like';
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','other',0)");
 assert.equal((await f.call(path,'PUT',{},'other')).status,403);
 f.sql.exec('DELETE FROM user_blocks');
 for(let i=0;i<120;i++)assert.equal((await f.call(path,'PUT',{},'other')).status,200);
 assert.equal((await f.call(path,'PUT',{},'other')).status,429);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM artist_photo_likes').get().n,1);
});
