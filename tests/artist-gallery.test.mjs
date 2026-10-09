import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';

async function setup(t){
 const objects=new Map(),BUCKET={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),head:async k=>objects.has(k)?{size:objects.get(k).length,etag:k}:null,get:async k=>({body:objects.get(k)})};
 const f=await fixture(t,{BUCKET});
 // A syntactically valid image container exercises the existing bounded image reader.
 const image=new Uint8Array(24);image.set([82,73,70,70]);new DataView(image.buffer).setUint32(4,16,true);image.set([87,69,66,80],8);
 const send=async(path,method='PUT',who='owner',data=image,type='image/webp')=>{
  const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:'https://aifect.test',...(who?{Cookie:'aifect_session='+who}:{}),'content-type':type},body:['PUT','POST'].includes(method)?data:undefined}),{DB:f.DB,BUCKET},{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.arrayBuffer(),headers:r.headers};
 };
 return {...f,send,objects};
}
test('artist gallery persists photos, permits only owner edits, and serves versioned images',async t=>{
 const f=await setup(t),path='/api/artists/artist/gallery';
 assert.equal((await f.send(path,'PUT','other')).status,403);
 assert.equal((await f.send(path,'PUT',null)).status,401);
 const saved=await f.send(path);assert.equal(saved.status,201);
 const profile=(await f.call('/api/artists/artist')).body;
 assert.equal(profile.can_manage,true);assert.equal(profile.gallery.length,1);
 const guest=(await f.call('/api/artists/artist','GET',null,null)).body;assert.equal(guest.can_manage,false);
 const photo=profile.gallery[0],media=await f.send(photo.url,'GET',null);
 assert.equal(media.status,200);assert.match(media.headers.get('cache-control'),/immutable/);
 assert.equal((await f.send(path+'/'+saved.body.id,'DELETE','other')).status,403);
 assert.equal((await f.send(path+'/'+saved.body.id,'DELETE')).status,200);
 assert.equal(f.objects.size,0);assert.equal((await f.send(photo.url,'GET',null)).status,404);
});
test('invalid, oversized and over-limit uploads leave no stored photos',async t=>{
 const f=await setup(t),path='/api/artists/artist/gallery';
 assert.equal((await f.send(path,'PUT','owner',new TextEncoder().encode('<svg/>'),'image/svg+xml')).status,400);
 assert.equal((await f.send(path,'PUT','owner',new Uint8Array(5*1024*1024+1))).status,413);
 for(let i=0;i<30;i++)f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run('p'+i,'artist','v'+i,'image/webp',i);
 assert.equal((await f.send(path)).status,409);assert.equal(f.objects.size,0);
});
test('gallery mutations cannot cross artists and blocked owners are inaccessible',async t=>{
 const f=await setup(t),path='/api/artists/artist/gallery',saved=await f.send(path);
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('second','producer','Second',0)");
 assert.equal((await f.send('/api/artists/second/gallery/'+saved.body.id,'DELETE')).status,404);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");
 assert.equal((await f.call(path,'GET',null,'other')).status,403);
});
