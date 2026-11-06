import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import worker from '../server/index.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('public artist representative image editor is visible only to the owner',()=>{
 const context={document:{addEventListener(){}},heading:()=>'',portrait:()=>'<div>portrait</div>',esc:String,number:String,followed:()=>false,section:()=>'',list:()=>'',icon:()=>''};
 nicknameContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-fanpage.js',import.meta.url),'utf8'),context);vm.runInContext(readFileSync(new URL('../dist/artist-gallery.js',import.meta.url),'utf8'),context);
 const data={profile:{name:'Artist'},tracks:[],followers:0};
 assert.doesNotMatch(context.artistPageHTML(data,'artist'),/data-artist-image/);
 assert.match(context.artistPageHTML({...data,can_manage:true},'artist'),/data-artist-image="artist"/);
 assert.match(context.artistPageHTML({...data,can_manage:true},'artist'),/<button type="button"[^>]*data-artist-image-pick/);
});

function imagePicker(uploadFile=async()=>{}){
 const listeners={},notices=[];let clicks=0,renders=0;
 const context={document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn);}},uploadFile,location:{hash:'#artist/artist'},render:async()=>{renders++;},toast:message=>notices.push(message)};
 nicknameContext(context);vm.runInContext(readFileSync(new URL('../dist/artist-gallery.js',import.meta.url),'utf8'),context);
 const group={querySelector:selector=>selector==='[data-artist-image]'?input:button};
 const button={disabled:false,closest:()=>group};
 const input={disabled:false,files:[],value:'',dataset:{artistImage:'artist'},click(){clicks++;},closest:()=>group};
 const eventFor=element=>({target:{closest:selector=>selector==='[data-artist-image-pick]'&&element===button?button:selector==='[data-artist-image]'&&element===input?input:null}});
 return {button,input,notices,get clicks(){return clicks;},get renders(){return renders;},click(element=button){return listeners.click.map(fn=>fn(eventFor(element)));},change(){return listeners.change[0](eventFor(input));}};
}

test('representative photo button opens the picker synchronously once and ignores busy or input clicks',()=>{
 const picker=imagePicker();picker.click();assert.equal(picker.clicks,1,'picker must open during the original user gesture');
 picker.click(picker.input);assert.equal(picker.clicks,1,'forwarded input click must not recurse');
 picker.input.disabled=true;picker.click();assert.equal(picker.clicks,1);
 picker.input.disabled=false;picker.button.disabled=true;picker.click();assert.equal(picker.clicks,1);
});

test('cancelled selection is harmless and a failed image save allows selecting the same photo again',async()=>{
 let finish,calls=0;const picker=imagePicker(()=>{calls++;return new Promise((resolve,reject)=>{finish=reject;});});
 await picker.change();assert.equal(calls,0);assert.equal(picker.button.disabled,false);
 picker.input.files=[new File(['photo'],'photo.png',{type:'image/png'})];picker.input.value='photo.png';
 const saving=picker.change();assert.equal(calls,1);assert.equal(picker.button.disabled,true);assert.equal(picker.input.disabled,true);
 picker.click();await picker.change();assert.equal(calls,1);assert.equal(picker.clicks,0);
 finish(new Error('사진 편집을 취소했어요.'));await saving;
 assert.equal(picker.button.disabled,false);assert.equal(picker.input.disabled,false);assert.equal(picker.input.value,'');assert.equal(picker.renders,0);
 picker.click();assert.equal(picker.clicks,1);assert.match(picker.notices[0],/취소/);
});

test('representative image update enforces ownership and updates the public portrait version',async t=>{
 const f=await setup(t),path='/api/studio/artists/artist/image';
 assert.equal((await f.send(path,'PUT',null)).status,401);
 assert.equal((await f.send(path,'PUT','other')).status,404);
 assert.equal(f.objects.size,0);
 const saved=await f.send(path);assert.equal(saved.status,200);
 assert.ok(saved.body.version);
 assert.equal((await f.call('/api/artists/artist')).body.profile.image_version,saved.body.version);
 assert.equal(f.objects.size,1);
});

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
test('gallery PNG and JPEG fallbacks retain their stored MIME and publicly served bytes without a server encoder',async t=>{
 const f=await setup(t),path='/api/artists/artist/gallery';
 const images=[
  ['image/png','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNocFAAAAIkAOGVpLGLAAAAAElFTkSuQmCC'],
  ['image/jpeg','/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AI4AOff/2Q==']
 ];
 for(const [type,base64] of images){
  const bytes=Buffer.from(base64,'base64'),saved=await f.send(path,'PUT','owner',bytes,type);
  assert.equal(saved.status,201);
  const photo=f.sql.prepare('SELECT * FROM artist_photos WHERE id=?').get(saved.body.id);
  assert.equal(photo.image_type,type);
  const key=`images/artist/artist/gallery/${photo.image_version}`;
  assert.deepEqual(Buffer.from(f.objects.get(key)),bytes);
  const media=await f.send(`/media/artist-gallery/${photo.id}?v=${photo.image_version}`,'GET',null);
  assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),type);
  assert.match(media.headers.get('cache-control'),/immutable/);assert.deepEqual(Buffer.from(media.body),bytes);
 }
 assert.equal(f.objects.size,2);
});
test('invalid, oversized and over-limit uploads leave no stored photos',async t=>{
 const f=await setup(t),path='/api/artists/artist/gallery';
 assert.equal((await f.send(path,'PUT','owner',new TextEncoder().encode('<svg/>'),'image/svg+xml')).status,400);
 assert.equal((await f.send(path,'PUT','owner',new Uint8Array(5*1024*1024+1))).status,413);
 for(let i=0;i<20;i++)f.sql.prepare('INSERT INTO artist_photos VALUES(?,?,?,?,?)').run('p'+i,'artist','v'+i,'image/webp',i);
 assert.equal((await f.send(path)).status,409);assert.equal(f.objects.size,0);
});
test('gallery mutations cannot cross artists and blocked owners are inaccessible',async t=>{
 const f=await setup(t),path='/api/artists/artist/gallery',saved=await f.send(path);
 f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('second','producer','Second',0)");
 assert.equal((await f.send('/api/artists/second/gallery/'+saved.body.id,'DELETE')).status,404);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");
 assert.equal((await f.call(path,'GET',null,'other')).status,403);
});
