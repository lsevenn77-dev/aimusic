import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

async function setup(t){
 const files=new Map([['images/track/one/original-art',Buffer.from('original')],['images/track/singer-cover/custom-art',Buffer.from('old cover art')],['images/producer/singer/photo-one',Buffer.from('singer photo')]]);
 const BUCKET={async head(key){const b=files.get(key);return b?{size:b.length,etag:key}:null;},async get(key){return {body:files.get(key)};}};
 const fallback=readFileSync(new URL('../dist/assets/default-avatar.png',import.meta.url));
 const ASSETS={async fetch(req){assert.equal(new URL(req.url).pathname,'/assets/default-avatar.png');return new Response(req.method==='HEAD'?null:fallback,{headers:{'content-type':'image/png'}});}};
 const f=await fixture(t,{BUCKET,ASSETS});
 f.sql.exec("UPDATE tracks SET karaoke_at=1,has_cover=1,cover_version='original-art',cover_type='image/png' WHERE id='one';INSERT INTO producers(id,user_id,name,created,image_version,image_type) VALUES('singer','other','Singer',0,'photo-one','image/png');INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,has_cover,cover_version,cover_type) VALUES('singer-cover','other','artist','singer','Sung cover','Rock','',1,'wav',128,1,'published','cover','one',1,'custom-art','image/png');INSERT INTO playlists(id,user_id,name,created,is_public) VALUES('cover-playlist','owner','Covers',0,1);INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('cover-playlist','singer-cover',0,0)");
 const image=(version,user=null,method='GET',headers={})=>worker.fetch(new Request('https://aifect.test/media/singer-cover/cover?v='+version,{method,headers:{...headers,...(user?{Cookie:'aifect_session='+user}:{})}}),{DB:f.DB,BUCKET,ASSETS},{waitUntil(){}});
 return {...f,files,image,fallback};
}

test('cover APIs and playlist collages use the singer photo; original and stored artwork stay intact',async t=>{
 const f=await setup(t);
 const detail=(await f.call('/api/tracks/singer-cover')).body.track;
 assert.equal(detail.has_cover,1);assert.equal(detail.cover_version,'profile-photo-one');assert.equal(detail.producer_image_version,'photo-one');
 const covers=(await f.call('/api/tracks/one/covers')).body.covers;
 assert.equal(covers[0].cover_version,'profile-photo-one');
 const studio=(await f.call('/api/studio','GET',null,'other')).body.tracks;
 assert.equal(studio[0].cover_version,'profile-photo-one');
 const edit=(await f.call('/api/studio/tracks/singer-cover','GET',null,'other')).body.profile;
 assert.equal(edit.cover_version,'profile-photo-one');
 const {playlistSummaries}=await import('../server/discovery.js');
 const playlists=await playlistSummaries({DB:f.DB});
 assert.equal(playlists[0].covers[0].cover_version,'profile-photo-one');assert.equal(playlists[0].covers[0].kind,'cover');
 const photo=await f.image(detail.cover_version);assert.equal(photo.status,200);assert.equal(await photo.text(),'singer photo');
 assert.equal(photo.headers.get('cache-control'),'public, max-age=2592000, immutable');
 const original=(await f.call('/api/tracks/one')).body.track;assert.equal(original.cover_version,'original-art');
 assert.equal(f.sql.prepare('SELECT cover_version FROM tracks WHERE id=?').get('singer-cover').cover_version,'custom-art');
 assert.equal(f.files.get('images/track/one/original-art').toString(),'original');
});

test('changing a singer photo changes every cover URL and never makes stale URLs immutable',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE producers SET image_version='photo-two' WHERE id='singer'");f.files.set('images/producer/singer/photo-two',Buffer.from('new singer photo'));
 assert.equal((await f.call('/api/tracks/singer-cover')).body.track.cover_version,'profile-photo-two');
 const stale=await f.image('profile-photo-one');assert.equal(await stale.text(),'new singer photo');assert.equal(stale.headers.get('cache-control'),'public, max-age=0, must-revalidate');
 const current=await f.image('profile-photo-two');assert.match(current.headers.get('cache-control'),/immutable/);
 assert.equal((await f.image('profile-photo-two',null,'GET',{'If-None-Match':current.headers.get('etag')})).status,304);
});

test('singers without photos get the default silhouette, and hidden covers remain owner-only',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE producers SET image_version='' WHERE id='singer'");
 assert.equal((await f.call('/api/tracks/singer-cover')).body.track.cover_version,'profile-default-v1');
 const image=await f.image('profile-default-v1');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),f.fallback);
 assert.equal(await (await f.image('profile-default-v1',null,'HEAD')).text(),'');
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.equal((await f.image('profile-default-v1')).status,404);
 assert.equal((await f.image('profile-default-v1','owner')).status,404);
 const owner=await f.image('profile-default-v1','other');assert.equal(owner.status,200);assert.equal(owner.headers.get('cache-control'),'private, no-store');
 f.sql.exec("UPDATE tracks SET status='deleted' WHERE id='singer-cover'");assert.equal((await f.image('profile-default-v1','other')).status,404);
});

test('cached web cover data cannot fall back to the original album art',()=>{
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('function trackArtworkPath('),app.indexOf('function cover(t,'));
 const context=vm.createContext({});vm.runInContext(source,context);
 const path=t=>context.trackArtworkPath(t);
 assert.equal(path({id:'cover',kind:'cover',has_cover:0,original_id:'original',original_has_cover:1,original_cover_version:'old'}),'/media/cover/cover?v=profile-default-v1');
 assert.equal(path({id:'cover',kind:'cover',has_cover:1,cover_version:'old-upload',producer_image_version:'fresh'}),'/media/cover/cover?v=profile-fresh');
 assert.equal(path({id:'original',kind:'original',has_cover:1,cover_version:'art'}),'/media/original/cover?v=art');
});
