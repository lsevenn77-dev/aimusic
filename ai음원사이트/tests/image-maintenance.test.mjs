import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {replaceStoredPNG} from '../server/image-maintenance.js';

test('convert only the expected static PNG and keep the old image and concurrent user edits',async t=>{
 const f=await fixture(t);
 const entityId=crypto.randomUUID(),version=crypto.randomUUID(),prefix='images/producer/'+entityId+'/';
 // Use a separate profile without dependent artist/track rows.
 f.sql.prepare("INSERT INTO producers(id,user_id,name,image_version,image_type,created) VALUES(?,'other','Test',?,'image/png',0)").run(entityId,version);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNocFAAAAIkAOGVpLGLAAAAAElFTkSuQmCC','base64');
 const webp=Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=','base64');
 const objects=new Map([[prefix+version,png]]);
 const env={DB:f.DB,CAFE24_ORIGIN_KEY:'test',BUCKET:{
  get:async key=>({body:objects.get(key)}),
  put:async(key,bytes)=>objects.set(key,bytes),
  delete:async key=>objects.delete(key)
 }};
 const req=()=>new Request('https://aifect.test/internal/images/replace-png',{method:'POST',body:JSON.stringify({kind:'producer',entityId,expectedVersion:version})});
 const encode=t.mock.method(globalThis,'fetch',async()=>new Response(webp,{headers:{'content-type':'image/webp'}}));
 const update=f.sql.prepare('UPDATE producers SET image_type=?,image_version=? WHERE id=?');
 const animated=Buffer.alloc(20);animated.writeUInt32BE(8);animated.write('acTL',4);animated.writeUInt32BE(2,8);
 objects.set(prefix+version,Buffer.concat([png.subarray(0,33),animated,png.subarray(33)]));
 assert.equal((await (await replaceStoredPNG(req(),env)).json()).state,'animation');
 assert.equal(encode.mock.callCount(),0);
 objects.set(prefix+version,png);
 const result=await (await replaceStoredPNG(req(),env)).json();
 assert.equal(result.state,'replaced');assert.equal(objects.size,2);
 assert.equal((await (await replaceStoredPNG(req(),env)).json()).state,'skipped');
 assert.equal(encode.mock.callCount(),1);
 update.run('image/png',version,entityId);
 encode.mock.mockImplementation(async()=>{update.run('image/webp','user-edit',entityId);return new Response(webp,{headers:{'content-type':'image/webp'}});});
 assert.equal((await (await replaceStoredPNG(req(),env)).json()).state,'skipped');
 assert.equal(objects.size,2);
 assert.equal(f.sql.prepare('SELECT image_version FROM producers WHERE id=?').get(entityId).image_version,'user-edit');
});
