import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

const testKey='test-mirror-secret-do-not-use-in-production';
const testToken='test-export-token-do-not-use-in-production';
const testImage=Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==','base64');

function setupBucket(){
 const files=new Map();
 const add=(key,data=testImage,type='image/webp')=>files.set(key,{
  key,size:data.length,version:crypto.randomUUID(),httpMetadata:{contentType:type},data
 });
 function head(key){const file=files.get(key);if(!file)return null;const {data,...meta}=file;return meta;}
 const binding={
  head,
  get(key){const file=files.get(key);return file?{...head(key),body:new Response(file.data).body,arrayBuffer:async()=>new Uint8Array(file.data).buffer}:null;},
  list({prefix,cursor,limit}){
   const keys=[...files.keys()].filter(key=>key.startsWith(prefix)).sort();
   const start=cursor?keys.indexOf(cursor)+1:0;
   const selected=keys.slice(start,start+Math.min(limit,2));
   return {objects:selected.map(head),truncated:start+selected.length<keys.length,cursor:selected.at(-1)};
  }
 };
 return {add,files,binding};
}
function environment(bucket){
 return {BUCKET:bucket.binding,AIFECT_IMAGE_EXPORT_TOKEN:testToken,AIFECT_IMAGE_MIRROR_SECRET:testKey,AIFECT_IMAGE_PULL_BASE:'https://lseven7.ext1.cache.iwinv.net'};
}
const call=(env,path,headers={},method='GET',origin='https://aifect.test')=>worker.fetch(new Request(new URL(path,origin),{headers,method}),env);
const exportAuth={Authorization:'Bearer '+testToken};
const grantHeader={'X-Aifect-Image-Mirror':'1'};
const originCall=(env,path,headers={},method='GET')=>call(env,path,headers,method,'https://image-origin.aifect.co.kr');
async function decrypt(blob,rawKey){
 const packed=new Uint8Array(await blob.arrayBuffer()),key=await crypto.subtle.importKey('raw',Buffer.from(rawKey,'base64url'),'AES-GCM',false,['decrypt']);
 return Buffer.from(await crypto.subtle.decrypt({name:'AES-GCM',iv:packed.subarray(0,12)},key,packed.subarray(12)));
}

test('export is authenticated and paginates only known, bounded image keys without granting access to plaintext',async()=>{
 const bucket=setupBucket(),env=environment(bucket);
 bucket.add('stream/music.m4a',Buffer.alloc(4),'audio/mp4');bucket.add('images/unknown/id/version');
 for(let i=0;i<4;i++)bucket.add('images/producer/person/'+i);
 bucket.add('cover-source/legacy',testImage,'application/octet-stream');
 bucket.add('cover-source/notimage',Buffer.from('not an image'),'application/octet-stream');
 bucket.add('chat-images/message.webp');bucket.add('images/crew/id/v',Buffer.alloc(5),'audio/wav');
 for(const headers of [{},{Authorization:'Bearer wrong'}])assert.equal((await call(env,'/internal/image-mirror/inventory',headers)).status,404);
 assert.equal((await call({...env,AIFECT_IMAGE_EXPORT_TOKEN:testKey},'/internal/image-mirror/inventory',{Authorization:'Bearer '+testKey})).status,404);
 assert.equal((await call(env,'/internal/image-mirror/inventory?cursor=invalid',exportAuth)).status,400);
 const entries=[];let cursor='',skipped=0;
 do{
  const response=await call(env,'/internal/image-mirror/inventory'+(cursor?'?cursor='+cursor:''),exportAuth);
  const page=await response.json();entries.push(...page.objects);skipped+=page.skipped;cursor=page.nextCursor;
 }while(cursor);
 assert.equal(entries.length,6);assert.equal(new Set(entries.map(x=>x.id)).size,6);assert.equal(skipped,3);
 const record=entries[0];assert.deepEqual(Object.keys(record).sort(),['handle','id','size','type']);
 const path='/internal/image-mirror/blob?handle='+record.handle+'&id='+record.id;
 assert.equal((await call(env,path)).status,404);
 const blob=await call(env,path,exportAuth);assert.equal(blob.status,200);assert.equal(blob.headers.get('content-type'),'application/octet-stream');
 const bytes=Buffer.from(await blob.arrayBuffer());assert.equal(bytes.length,testImage.length+28);assert.ok(!bytes.includes(testImage));
 assert.notDeepEqual(bytes,Buffer.from(await (await call(env,path,exportAuth)).arrayBuffer()));
 assert.equal((await call(env,path.replace(record.id,'0'.repeat(64)),exportAuth)).status,409);
});

test('hidden image grants preserve ACLs, stable pull paths, immutable versions and origin isolation',async t=>{
 const bucket=setupBucket(),f=await fixture(t),env={...environment(bucket),DB:f.DB};
 const key='images/track/hidden/v1';bucket.add(key);
 f.sql.exec("UPDATE tracks SET has_cover=1,cover_version='v1',cover_type='image/webp' WHERE id='hidden'");
 const path='/media/hidden/cover?v=v1';
 assert.equal((await call(env,path,grantHeader)).status,404);
 const owner={Cookie:'aifect_session=owner',...grantHeader},response=await call(env,path,owner);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const grant=await response.json(),blobPath=new URL(grant.url).pathname;
 assert.equal(grant.type,'image/webp');assert.match(grant.url,/^https:\/\/lseven7\.ext1\.cache\.iwinv\.net\/mirror\/v1\/[\w-]+\/[0-9a-f]{64}\.bin$/);
 assert.equal(grant.url.includes('hidden'),false);assert.equal(Buffer.from(grant.key,'base64url').length,32);
 assert.deepEqual(await (await call(env,path,owner)).json(),grant);
 assert.deepEqual(await decrypt(await originCall(env,blobPath),grant.key),testImage);
 assert.equal((await originCall(env,blobPath,{},'HEAD')).headers.get('content-length'),String(testImage.length+28));
 for(const p of ['/','/api/me','/internal/image-mirror/inventory','/media/hidden/cover',blobPath+'?q=1'])assert.equal((await originCall(env,p)).status,404);
 assert.equal((await originCall(env,blobPath,{Cookie:'aifect_session=owner'})).status,404);
 assert.equal((await call(env,path,{Cookie:owner.Cookie})).headers.get('content-type'),'image/webp');
 assert.equal((await call({...env,AIFECT_IMAGE_PULL_BASE:'https://untrusted.test'},path,owner)).headers.get('content-type'),'image/webp');
 const ranged=await call(env,path,{...owner,Range:'bytes=0-2'});assert.equal(ranged.status,206);
 bucket.add(key);const next=await (await call(env,path,owner)).json();assert.notEqual(next.url,grant.url);assert.notEqual(next.key,grant.key);
 assert.equal((await originCall(env,blobPath)).status,404);
 bucket.add(key,Buffer.from('not an image'));
 const invalid=await (await call(env,path,owner)).json();assert.equal((await originCall(env,new URL(invalid.url).pathname)).status,404);
 bucket.files.delete(key);assert.equal((await call(env,path,owner)).status,404);
});

test('only current-version public images can reuse a session-specific browser grant',async t=>{
 const bucket=setupBucket(),f=await fixture(t),env={...environment(bucket),DB:f.DB};
 bucket.add('images/track/one/v1');
 f.sql.exec("UPDATE tracks SET has_cover=1,cover_version='v1',cover_type='image/webp' WHERE id='one'");
 const response=await call(env,'/media/one/cover?v=v1',grantHeader);
 assert.equal(response.headers.get('cache-control'),'private, max-age=60');
 assert.match(response.headers.get('vary'),/Cookie, Authorization/);
 for(const suffix of ['', '?v=old'])assert.equal((await call(env,'/media/one/cover'+suffix,grantHeader)).headers.get('cache-control'),'private, no-store');
});

test('DM mirror key is withheld from anonymous, unshared, blocked and expired requests',async t=>{
 const f=await fixture(t),bucket=setupBucket(),env={...environment(bucket),DB:f.DB};
 const id='photo',key='chat-images/photo.webp',path='/media/dm/'+id;
 const now=Math.floor(Date.now()/1000);
 f.sql.prepare('INSERT INTO chat_images(id,sender_id,recipient_id,object_key,created,expires) VALUES(?,?,?,?,?,?)').run(id,'owner','other',key,now,now+60);
 bucket.add(key);
 const media=user=>call(env,path,{...grantHeader,...(user?{Cookie:'aifect_session='+user}:{})});
 assert.equal((await media()).status,401);assert.equal((await media('other')).status,404);
 const sender=await (await media('owner')).json();
 assert.deepEqual(await decrypt(await originCall(env,new URL(sender.url).pathname),sender.key),testImage);
 f.sql.prepare("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)").run();
 assert.equal((await media('owner')).status,403);
 f.sql.exec('DELETE FROM user_blocks; UPDATE chat_images SET expires=0');
 assert.equal((await media('owner')).status,410);
});
