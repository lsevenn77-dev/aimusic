import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
function memoryBucket(){
 const files=new Map();
 return {files,
  async head(key){return files.has(key)?{size:files.get(key).length}:null;},
  async get(key){const b=files.get(key);return b?{body:b,size:b.length}:null;},
  async put(key,body){files.set(key,body instanceof Uint8Array?body:new Uint8Array(await new Response(body).arrayBuffer()));},
 };
}
async function coverFixture(t){
 const BUCKET=memoryBucket(),f=await fixture(t,{BUCKET});
 // 'one' is offered for karaoke and covers; 'two' is public but its creator never agreed.
 f.sql.exec("UPDATE tracks SET karaoke_terms='2026-09-24',karaoke_at=1,duration=200 WHERE id='one'");
 const env={DB:f.DB,BUCKET};
 const raw=(path,{method='GET',body,type,user='owner'}={})=>worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:'https://aifect.test',...(user?{Cookie:'aifect_session='+user}:{}),...(type?{'Content-Type':type}:{})},body}),env,{waitUntil(){}});
 const cover={original_id:'one',extension:'wav',bytes:128,own_voice:true,rights:true,description:'첫 커버'};
 return {...f,BUCKET,raw,cover};
}
async function publishedCover(f,user='other'){
 const out=await f.call('/api/covers','POST',f.cover,user);assert.equal(out.status,201,JSON.stringify(out.body));
 f.sql.prepare("UPDATE tracks SET status='published',duration=190 WHERE id=?").run(out.body.id);
 return out.body;
}

test('covers need a public original whose creator allowed karaoke, and the singer own recording',async t=>{
 const f=await coverFixture(t);
 assert.equal((await f.call('/api/covers','POST',f.cover,null)).status,401);
 assert.equal((await f.call('/api/covers','POST',{...f.cover,original_id:'two'},'other')).status,404,'no karaoke consent');
 assert.equal((await f.call('/api/covers','POST',{...f.cover,original_id:'hidden'},'other')).status,404,'hidden original');
 assert.equal((await f.call('/api/covers','POST',{...f.cover,own_voice:false},'other')).status,400);
 assert.equal((await f.call('/api/covers','POST',{...f.cover,extension:'ogg'},'other')).status,400);
 const out=await f.call('/api/covers','POST',f.cover,'other');
 assert.equal(out.status,201);
 const row=f.sql.prepare('SELECT * FROM tracks WHERE id=?').get(out.body.id);
 assert.deepEqual({kind:row.kind,original_id:row.original_id,artist_id:row.artist_id,title:row.title,status:row.status,karaoke_at:row.karaoke_at},{kind:'cover',original_id:'one',artist_id:'artist',title:'one',status:'uploading',karaoke_at:0});
 const profile=f.sql.prepare('SELECT * FROM producers WHERE id=?').get(out.body.producer_id);
 assert.equal(profile.user_id,'other','a first cover creates the singer profile');
 f.sql.prepare("UPDATE tracks SET status='published' WHERE id=?").run(out.body.id);
 assert.equal((await f.call('/api/covers','POST',{...f.cover,original_id:out.body.id},'other')).status,404,'no covers of covers');
});

test('a cover lives on its original and on the singer profile, not in charts or AI artist pages',async t=>{
 const f=await coverFixture(t),c=await publishedCover(f);
 const list=(await f.call('/api/tracks/one/covers')).body;
 assert.equal(list.accepts_covers,true);assert.deepEqual(list.covers.map(x=>x.id),[c.id]);
 assert.equal((await f.call('/api/tracks/one')).body.track.covers,1);
 const detail=(await f.call('/api/tracks/'+c.id)).body.track;
 assert.deepEqual({kind:detail.kind,original_id:detail.original_id,original_title:detail.original_title,artist:detail.artist,producer:detail.producer,original_artist:detail.original_artist},
  {kind:'cover',original_id:'one',original_title:'one',artist:'other · 커버',producer:'other',original_artist:'QA'});
 assert.ok(!(await f.call('/api/catalog?section=tracks')).body.tracks.some(x=>x.id===c.id),'charts list originals');
 assert.ok(!(await f.call('/api/artists/artist')).body.tracks.some(x=>x.id===c.id),'AI artist pages list originals');
 const singer=(await f.call('/api/producers/'+c.producer_id)).body;
 assert.deepEqual(singer.covers.map(x=>x.id),[c.id]);assert.equal(singer.tracks.length,0);assert.deepEqual(singer.gifts.ranking,[]);
 const creator=(await f.call('/api/producers/producer')).body;
 assert.ok(creator.tracks.some(x=>x.id==='one'));assert.equal(creator.covers.length,0);
 assert.ok((await f.call('/api/catalog?section=producers')).body.producers.some(p=>p.id===c.producer_id),'cover singers are people too');
 assert.equal((await f.call(`/api/tracks/${c.id}/like`,'PUT')).status,200);
 assert.equal((await f.call(`/api/tracks/${c.id}/comments`,'POST',{body:'좋아요'})).status,201);
 assert.equal((await f.call('/api/tracks/one/covers?sort=plays')).status,200);
 assert.equal((await f.call('/api/tracks/one/covers?sort=bogus')).status,400);
});

test('hiding the original, or losing its karaoke consent, hides every cover of it',async t=>{
 const f=await coverFixture(t),c=await publishedCover(f);
 await f.call(`/api/tracks/${c.id}/like`,'PUT');
 for(const hide of ["UPDATE tracks SET status='hidden' WHERE id='one'","UPDATE tracks SET karaoke_at=0 WHERE id='one'"]){
  f.sql.exec(hide);
  assert.equal((await f.call('/api/tracks/'+c.id)).status,404);
  assert.equal((await f.raw(`/media/${c.id}/preview`,{user:null})).status,404);
  assert.equal((await f.call('/api/producers/'+c.producer_id)).body.covers.length,0);
  assert.ok(!(await f.call('/api/library')).body.likes.some(x=>x.id===c.id));
  f.sql.exec("UPDATE tracks SET status='published',karaoke_at=1 WHERE id='one'");
  assert.equal((await f.call('/api/tracks/'+c.id)).status,200,'restoring the original restores the cover');
 }
});

test('covers never get a karaoke MR and their studio edits touch only the note',async t=>{
 const f=await coverFixture(t),c=await publishedCover(f);
 assert.equal((await f.call(`/api/uploads/${c.id}/karaoke`,'POST',{accept:true},'other')).status,400);
 assert.equal((await f.call(`/api/studio/tracks/${c.id}`,'PUT',{description:'다시 부른 버전',title:'바꾼 제목',genre:'Rock'},'other')).status,200);
 const row=f.sql.prepare('SELECT title,genre,description FROM tracks WHERE id=?').get(c.id);
 assert.deepEqual({...row},{title:'one',genre:'Rock',description:'다시 부른 버전'});
 const studio=(await f.call('/api/studio','GET',undefined,'other')).body;
 assert.deepEqual(studio.tracks.map(x=>[x.kind,x.original_title]),[['cover','one']]);
});

test('profile banners belong to people and are public once they have a public song or cover',async t=>{
 const f=await coverFixture(t);
 assert.equal((await f.raw('/api/studio/producers/producer/banner',{method:'PUT',body:png,type:'image/png'})).status,200);
 assert.equal((await f.raw('/api/studio/artists/artist/banner',{method:'PUT',body:png,type:'image/png'})).status,404);
 const banner=await f.raw('/media/banner/producer',{user:null});
 assert.equal(banner.status,200);assert.match(banner.headers.get('cache-control'),/public/);
 assert.equal((await f.call('/api/producers/producer')).body.profile.banner_version.length>0,true);
 const draft=(await f.call('/api/covers','POST',f.cover,'other')).body;
 assert.equal((await f.raw(`/api/studio/producers/${draft.producer_id}/banner`,{method:'PUT',body:png,type:'image/png',user:'other'})).status,200);
 assert.equal((await f.raw(`/media/banner/${draft.producer_id}`,{user:null})).status,404,'nothing public yet');
 assert.equal((await f.raw(`/media/banner/${draft.producer_id}`,{user:'other'})).status,200,'the owner still sees it');
});
