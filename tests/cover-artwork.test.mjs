import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

const origin='https://aifect.test';
const png=readFileSync(new URL('../dist/assets/default-avatar.png',import.meta.url));
const mark=readFileSync(new URL('../dist/assets/brand/20261117/aifect-icon-512.png',import.meta.url));

async function setup(t){
 const files=new Map([['images/track/one/original-art',Buffer.from('original')],['images/producer/producer/photo',Buffer.from('profile')]]);
 const BUCKET={
  async head(key){const b=files.get(key);return b?{size:b.length,etag:key}:null;},
  async get(key){return {body:files.get(key)};},
  async put(key,data){files.set(key,Buffer.from(data));},
 };
 const ASSETS={async fetch(req){assert.equal(new URL(req.url).pathname,'/assets/brand/20261117/aifect-icon-512.png');return new Response(req.method==='HEAD'?null:mark,{headers:{'content-type':'image/png'}});}};
 const f=await fixture(t,{BUCKET,ASSETS});
 f.sql.exec("UPDATE tracks SET karaoke_at=1,has_cover=1,cover_version='original-art',cover_type='image/png' WHERE id='one'; UPDATE producers SET image_version='photo',image_type='image/png'; INSERT INTO producers(id,user_id,name,created,image_version,image_type) VALUES('singer','other','Singer',0,'other-photo','image/png'); INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,has_cover,cover_version,cover_type) VALUES('work','other','artist','singer','Recording','Rock','',1,'wav',128,1,'published','cover','one',1,'profile-old','image/png'); INSERT INTO playlists(id,user_id,name,created,is_public) VALUES('list','owner','Covers',0,1);INSERT INTO playlist_tracks(playlist_id,track_id,position,created) VALUES('list','work',0,0)");
 const request=(path,method='GET',user=null,body=null,headers={})=>worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,...(user?{Cookie:'aifect_session='+user}:{}),...(body?{'content-type':'image/png'}:{}),...headers},body}),{DB:f.DB,BUCKET,ASSETS},{waitUntil(p){p.catch(()=>{});}});
 const representations=async()=>[
  (await f.call('/api/tracks/work')).body.track,
  (await f.call('/api/tracks/one/covers')).body.covers[0],
  (await f.call('/api/community?kind=cover')).body.tracks[0],
  (await f.call('/api/studio','GET',null,'other')).body.tracks[0],
  (await f.call('/api/studio/tracks/work','GET',null,'other')).body.profile
 ];
 return {...f,files,BUCKET,request,representations};
}

test('legacy solo and duet artwork inherits current original, even on the old media URL',async t=>{
 const f=await setup(t);
 for(const mode of ['solo','duet']){
  f.sql.prepare('UPDATE tracks SET cover_mode=? WHERE id=?').run(mode,'work');
  for(const row of await f.representations()){assert.equal(row.artwork_id,'one');assert.equal(row.cover_version,'original-art');assert.equal(row.work_has_cover,0);}
 }
 assert.equal((await f.call('/api/tracks/work')).body.track.producer_image_version,'other-photo');
 const stale=await f.request('/media/work/cover?v=profile-old');assert.equal(await stale.text(),'original');assert.match(stale.headers.get('cache-control'),/must-revalidate/);
 assert.equal((await f.request('/api/studio/tracks/one/image','PUT','owner',png)).status,200);
 const {cover_version}= (await f.call('/api/tracks/one')).body.track;
 for(const row of await f.representations())assert.equal(row.cover_version,cover_version);
 const fresh=await f.request('/media/work/cover?v='+cover_version);
 assert.deepEqual(Buffer.from(await fresh.arrayBuffer()),png);assert.match(fresh.headers.get('cache-control'),/immutable/);
 assert.equal((await f.request('/media/work/cover?v='+cover_version,'HEAD',null,null,{'if-none-match':fresh.headers.get('etag')})).status,304);
});

test('only the owner can set/reset artwork; resetting changes metadata only and preserves both objects',async t=>{
 const f=await setup(t),url='/api/studio/tracks/work/image';
 const intact=()=>{const row={...f.sql.prepare("SELECT * FROM tracks WHERE id='work'").get()};for(const key of ['has_cover','cover_version','cover_type'])delete row[key];return row;};
 const before=intact();assert.equal((await f.request(url,'PUT','owner',png)).status,404);
 const result=await f.request(url,'PUT','other',png);assert.equal(result.status,200);
 const {version}=await result.json();
 for(const row of await f.representations()){assert.equal(row.artwork_id,'work');assert.equal(row.cover_version,version);assert.equal(row.work_has_cover,1);}
 assert.deepEqual(Buffer.from(await (await f.request('/media/work/cover?v='+version)).arrayBuffer()),png);
 assert.equal((await f.request(url,'DELETE','owner')).status,404);
 assert.equal((await f.request(url,'DELETE','other')).status,200);
 for(const row of await f.representations()){assert.equal(row.artwork_id,'one');assert.equal(row.cover_version,'original-art');assert.equal(row.work_has_cover,0);}
 assert.equal(await (await f.request('/media/work/cover?v='+version)).text(),'original');
 assert.deepEqual(f.files.get('images/track/work/'+version),png);assert.deepEqual(intact(),before);
});

test('no image uses the shared mark; hidden original artwork stays private even to the cover owner',async t=>{
 const f=await setup(t);f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.equal((await f.request('/media/work/cover?v=profile-old')).status,404);
 const privateImage=await f.request('/media/work/cover','GET','other');assert.equal(privateImage.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(Buffer.from(await privateImage.arrayBuffer()),mark);
 f.sql.exec("UPDATE tracks SET status='published',has_cover=0,cover_version='' WHERE id='one'");
 for(const row of await f.representations())assert.equal(row.artwork_id,null);
 assert.deepEqual(Buffer.from(await (await f.request('/media/work/cover')).arrayBuffer()),mark);
 f.sql.exec("UPDATE tracks SET has_cover=1 WHERE id='one'");f.files.set('cover/one.jpg',Buffer.from('legacy JPEG'));
 assert.equal(await (await f.request('/media/work/cover?v=original')).text(),'legacy JPEG');
});

test('failed R2 artwork writes, duplicate create requests and lost completion responses can be retried without another work',async t=>{
 const f=await setup(t),body={request_id:'draft:other:one:1793620000000',original_id:'one',own_voice:true,rights:true,extension:'mp3',bytes:128,publish_as:'solo'};
 const create=()=>f.call('/api/covers','POST',body,'other'),[a,b]=await Promise.all([create(),create()]);
 assert.equal(a.status,201);assert.equal(a.body.id,b.body.id);const id=a.body.id;
 const url='/api/uploads/'+id+'/cover',put=f.BUCKET.put;
 assert.equal((await f.request(url,'PUT','owner',png)).status,404);
 f.BUCKET.put=async()=>{throw Error('simulated image write failure');};
 assert.equal((await f.request(url,'PUT','other',png)).status,500);
 const retried=await create();assert.equal(retried.body.id,id);assert.equal(retried.body.status,'uploading');assert.equal(retried.body.has_cover,0);
 f.BUCKET.put=put;assert.equal((await f.request(url,'PUT','other',png)).status,200);
 f.files.set('original/'+id+'.mp3',Buffer.alloc(128));assert.equal((await f.call('/api/uploads/'+id+'/complete','POST',null,'other')).status,200);
 const settled=await create();assert.equal(settled.body.id,id);assert.equal(settled.body.status,'queued');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM tracks WHERE kind='cover' AND id!='work'").get().n,1);
});

test('all web thumbnails use the same resolver including older cached artwork payloads',()=>{
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 const c=nicknameContext({});vm.runInContext(app.slice(app.indexOf('function trackArtworkPath('),app.indexOf('function cover(t,')),c);vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);
 for(const resolve of [c.trackArtworkPath,c.homeArtworkPath]){
  const old={id:'work',kind:'cover',has_cover:1,cover_version:'profile-old',original_id:'one',original_has_cover:1,original_cover_version:'art'};
  assert.equal(resolve(old),'/media/one/cover?artwork=track&v=art');
  assert.equal(resolve({...old,work_has_cover:1,work_cover_version:'custom'}),'/media/work/cover?artwork=track&v=custom');
  assert.equal(resolve({...old,artwork_id:null}),'/assets/brand/20261117/aifect-icon-512.png');
 }
});
