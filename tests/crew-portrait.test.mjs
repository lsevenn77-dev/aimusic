import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

// Both formats are real one-pixel images, including their complete container headers.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+y4WQAAAAASUVORK5CYII=','base64');
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');

test('create, replace and read back a crew portrait; failed writes and unrelated edits preserve the original',async t=>{
 const objects=new Map(),bucket={
  async put(key,body,metadata){objects.set(key,{body,...metadata});},
  async get(key){return objects.get(key);},
  async delete(key){objects.delete(key);}
 };
 const f=await fixture(t),env={DB:f.DB,BUCKET:bucket},origin='https://aifect.test';
 const {crew}= (await f.call('/api/crews','POST',{name:'Portrait test'})).body;
 const path='/api/crews/'+crew.id,media='/media/crew/'+crew.id,read=async()=> (await f.call(path)).body.crew;
 const call=(path,options)=>worker.fetch(new Request(origin+path,options),env,{waitUntil(){}});
 const upload=(bytes,type,user='owner')=>call(path+'/image',{method:'PUT',headers:{origin,cookie:'aifect_session='+user,'content-type':type},body:bytes});
 const version=async(bytes,type)=>{const r=await upload(bytes,type);assert.equal(r.status,200);const {image_version}=await r.json();assert.ok(image_version);return image_version;};
 const first=await version(webp,'image/webp');
 assert.equal((await read()).image_version,first);
 assert.equal((await upload(png,'image/webp')).status,400,'reject mismatched MIME and bytes');
 assert.equal((await upload(png,'image/png','other')).status,403,'keep existing permission boundary');
 assert.equal((await read()).image_version,first);
 const patch=await f.call(path,'PATCH',{description:'info only',version:(await read()).version});
 assert.equal(patch.status,200);assert.equal((await read()).image_version,first);
 const second=await version(png,'image/png');
 assert.notEqual(first,second);assert.equal((await read()).image_version,second);
 assert.deepEqual(Buffer.from(objects.get('images/crew/'+crew.id+'/'+first).body),webp);
 for(const suffix of ['?v='+second,'?v='+first,'']){
  const r=await call(media+suffix);
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
  assert.equal(r.headers.get('x-crew-image-version'),second);
  assert.match(r.headers.get('cache-control'),suffix==='?v='+second?/immutable/:/no-cache/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
 }
});
