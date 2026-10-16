import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {deleteAccount} from '../server/account-safety.js';
async function setup(t){
 const objects=new Map(),BUCKET={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),head:async k=>objects.has(k)?{size:objects.get(k).length,etag:k}:null,get:async k=>({body:objects.get(k)})};
 const f=await fixture(t,{BUCKET}),image=new Uint8Array(24);
 image.set([82,73,70,70]);new DataView(image.buffer).setUint32(4,16,true);image.set([87,69,66,80],8);
 const send=async(path,method='PUT',who='owner',data=image,type='image/webp',origin='https://aifect.test')=>{
  const r=await worker.fetch(new Request('https://aifect.test'+path,{method,headers:{Origin:origin,...(who?{Cookie:'aifect_session='+who}:{}),'content-type':type},body:['PUT','POST'].includes(method)?data:undefined}),{DB:f.DB,BUCKET},{waitUntil(p){p.catch(()=>{});}});
  return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.arrayBuffer(),headers:r.headers};
 };
 return {...f,send,objects,BUCKET};
}
test('My gallery persists, appears on public profile and only its owner can edit',async t=>{
 const f=await setup(t),path='/api/producers/producer/gallery';
 assert.equal((await f.send(path,'PUT',null)).status,401);
 assert.equal((await f.send(path,'PUT','other')).status,403);
 const saved=await f.send(path);assert.equal(saved.status,201);assert.equal(f.objects.size,1);
 const profile=(await f.call('/api/producers/producer','GET',null,null)).body;
 assert.equal(profile.gallery.length,1);assert.equal(profile.gallery_limit,30);
 const gallery=(await f.call(path)).body;assert.equal(gallery.can_manage,true);
 assert.equal((await f.call(path,'GET',null,'other')).body.can_manage,false);
 const photo=profile.gallery[0],media=await f.send(photo.url,'GET',null);
 assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/webp');
 assert.match(media.headers.get('cache-control'),/no-store/);
 assert.equal((await f.send(photo.url,'HEAD',null)).status,200);
 assert.equal((await f.send(path+'/'+saved.body.id,'DELETE','other')).status,403);
 assert.equal((await f.send(path+'/'+saved.body.id,'DELETE')).status,200);
 assert.equal(f.objects.size,0);assert.equal((await f.send(photo.url,'GET',null)).status,404);
});
test('invalid, oversized, cross-origin and over-limit gallery writes are rejected',async t=>{
 const f=await setup(t),path='/api/producers/producer/gallery';
 assert.equal((await f.send(path,'PUT','owner',new TextEncoder().encode('<svg/>'),'image/svg+xml')).status,400);
 assert.equal((await f.send(path,'PUT','owner',new Uint8Array(5*1024*1024+1))).status,413);
 assert.equal((await f.send(path,'PUT','owner',undefined,'image/webp','https://other.test')).status,403);
 for(let i=0;i<30;i++)f.sql.prepare('INSERT INTO profile_photos VALUES(?,?,?,?,?)').run('p'+i,'producer','v'+i,'image/webp',i);
 assert.equal((await f.send(path)).status,409);assert.equal(f.objects.size,0);
});
test('gallery enforces profile association, block state and account deletion',async t=>{
 const f=await setup(t),path='/api/producers/producer/gallery',saved=await f.send(path);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('second','other','Other',0)");
 assert.equal((await f.send('/api/producers/second/gallery/'+saved.body.id,'DELETE','other')).status,404);
 const photo=(await f.call(path)).body.photos[0];
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");
 assert.equal((await f.call(path,'GET',null,'other')).status,403);
 assert.equal((await f.send(photo.url,'GET','other')).status,403);
 await deleteAccount({DB:f.DB},f.sql.prepare("SELECT * FROM users WHERE id='owner'").get());
 assert.equal(f.sql.prepare('SELECT count(*) n FROM profile_photos').get().n,0);
 assert.equal((await f.send(photo.url,'GET',null)).status,404);
 const job=f.sql.prepare('SELECT targets FROM account_file_deletions').get();
 assert.ok(JSON.parse(job.targets).some(p=>p.prefix==='images/producer/producer/'));
});
test('storage failure retains gallery row for deletion retry',async t=>{
 const f=await setup(t),path='/api/producers/producer/gallery',saved=await f.send(path);
 f.BUCKET.delete=async()=>{throw Error('temporary storage failure');};
 assert.equal((await f.send(path+'/'+saved.body.id,'DELETE')).status,500);
 assert.equal((await f.call(path)).body.photos.length,1);
 f.BUCKET.delete=async k=>f.objects.delete(k);
 assert.equal((await f.send(path+'/'+saved.body.id,'DELETE')).status,200);
});

