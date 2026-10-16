import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';
import {cleanupChatImages,CHAT_IMAGE_TTL} from '../server/chat-features.js';
import {fixture} from './fixture.mjs';
const msg=body=>({body,request_id:crypto.randomUUID()});
async function setup(t){const f=await fixture(t);const p=(await f.call('/api/me/profile','PUT',{name:'Moon'},'other')).body.profile.id;return {...f,p};}
test('per-account deletion hides old pages while preserving the recipient and new messages',async t=>{
 const f=await setup(t),path='/api/dm/'+f.p;
 await f.call(path,'POST',msg('one'));await f.call('/api/dm/producer','POST',msg('two'),'other');
 assert.equal((await f.call('/api/dm/summary')).body.unread,1);
 assert.equal((await f.call(path,'DELETE')).status,200);
 assert.equal((await f.call(path)).body.messages.length,0);
 assert.equal((await f.call(path+'?before=100')).body.messages.length,0);
 assert.equal((await f.call('/api/dm')).body.conversations.length,0);
 assert.equal((await f.call('/api/dm/producer','GET',null,'other')).body.messages.length,2);
 await f.call('/api/dm/producer','POST',msg('new'),'other');
 assert.deepEqual((await f.call(path)).body.messages.map(m=>m.body),['new']);
 assert.equal((await f.call('/api/dm')).body.conversations[0].unread,1);
 assert.equal((await f.call('/api/dm','DELETE')).status,200);
 assert.equal((await f.call('/api/dm/summary')).body.unread,0);
});
test('clearing one room preserves other rooms, recipient history, and future messages',async t=>{
 const f=await setup(t),path='/api/dm/'+f.p;
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','Third',0);INSERT INTO producers(id,user_id,name,created) VALUES('third-profile','third','Third',0)");
 await f.call(path,'POST',msg('old outgoing'));
 await f.call('/api/dm/producer','POST',msg('old incoming'),'other');
 await f.call('/api/dm/third-profile','POST',msg('keep other room'));
 assert.equal((await f.call(path,'DELETE')).status,200);
 assert.equal((await f.call(path,'DELETE')).status,200,'repeated clear is safe');
 for(const suffix of ['', '?before=999', '?after=1']) {
  const response=await f.call(path+suffix);assert.equal(response.status,200);
  assert.deepEqual(response.body.messages,[]);
 }
 assert.deepEqual((await f.call('/api/dm/third-profile')).body.messages.map(m=>m.body),['keep other room']);
 assert.deepEqual((await f.call('/api/dm/producer','GET',null,'other')).body.messages.map(m=>m.body),['old outgoing','old incoming']);
 await f.call('/api/dm/producer','POST',msg('new incoming'),'other');
 assert.deepEqual((await f.call(path)).body.messages.map(m=>m.body),['new incoming']);
});

test('mute persists by peer and crew unread respects joining and read boundaries',async t=>{
 const f=await setup(t),path='/api/dm/'+f.p;
 await f.call(path,'POST',msg('hi'));assert.equal((await f.call(path+'/settings','PUT',{muted:true})).status,200);
 assert.equal((await f.call('/api/dm')).body.conversations[0].muted,1);
 assert.equal((await f.call('/api/dm/producer/settings','GET',null,'other')).body.muted,0);
 const crew=(await f.call('/api/crews','POST',{name:'Moon crew'})).body.crew.id;
 await f.call('/api/crews/'+crew+'/messages','POST',msg('before'));
 await f.call('/api/crews/'+crew+'/join','POST',{},'other');
 assert.equal((await f.call('/api/dm/summary','GET',null,'other')).body.crew.unread,0);
 const sent=(await f.call('/api/crews/'+crew+'/messages','POST',msg('after'))).body.message;
 assert.equal((await f.call('/api/dm/summary','GET',null,'other')).body.crew.unread,1);
 await f.call('/api/crews/'+crew+'/read','POST',{sequence:sent.sequence},'other');
 assert.equal((await f.call('/api/dm/summary','GET',null,'other')).body.crew.unread,0);
 assert.equal((await f.call('/api/dm/read-all','POST',{},'other')).status,200);
 assert.equal((await f.call('/api/dm/summary','GET',null,'other')).body.unread,0);
});
test('WebP photos are private, bind to one peer, expire at 14 days and retry physical deletion',async t=>{
 const f=await setup(t),objects=new Map(),env={DB:f.DB,BUCKET:{put:async(k,data)=>objects.set(k,data),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k)}};
 const image=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');
 const upload=async(user='owner',type='image/webp',body=image)=>worker.fetch(new Request('https://aifect.test/api/dm/'+f.p+'/images',{method:'PUT',headers:{Origin:'https://aifect.test',Cookie:'aifect_session='+user,'content-type':type},body}),env,{waitUntil(){}});
 const media=(id,user)=>worker.fetch(new Request('https://aifect.test/media/dm/'+id,{headers:user?{Cookie:'aifect_session='+user}:{}}),env,{waitUntil(){}});
 assert.equal((await upload('owner','image/png')).status,400);
 const up=await upload();assert.equal(up.status,201);const photo=await up.json();assert.ok(Math.abs(photo.expires-Math.floor(Date.now()/1000)-CHAT_IMAGE_TTL)<2);
 assert.equal((await media(photo.id,null)).status,401);assert.equal((await media(photo.id,'other')).status,404);
 assert.equal((await f.call('/api/dm/producer','POST',{...msg('photo'),image_id:photo.id},'other')).status,400);
 const send={...msg('photo'),image_id:photo.id};const first=await f.call('/api/dm/'+f.p,'POST',send);assert.equal(first.status,201);
 assert.equal((await f.call('/api/dm/'+f.p,'POST',send)).body.message.id,first.body.message.id);
 assert.equal((await media(photo.id,'other')).status,200);
 f.sql.prepare('UPDATE chat_images SET expires=0 WHERE id=?').run(photo.id);
 assert.equal((await media(photo.id,'other')).status,410);
 const key=f.sql.prepare('SELECT object_key FROM chat_images').get().object_key;
 await assert.rejects(cleanupChatImages({...env,BUCKET:{delete:async()=>{throw Error('retry')}}}));
 assert.equal(f.sql.prepare('SELECT deleted FROM chat_images').get().deleted,0);
 await cleanupChatImages(env);assert.equal(objects.has(key),false);assert.equal(f.sql.prepare('SELECT deleted FROM chat_images').get().deleted,1);
});


test('crew photos enforce membership, join boundary, ownership, expiry and private caching',async t=>{
 const f=await setup(t),objects=new Map(),env={DB:f.DB,BUCKET:{put:async(k,data)=>objects.set(k,data),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k)}};
 const image=Buffer.alloc(65536);Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64').copy(image);image.writeUInt32LE(image.length-8,4); // Exceeds the JSON request limit: crew photos use the bounded binary route.
 const crew=(await f.call('/api/crews','POST',{name:'Photo crew'})).body.crew.id;
 const path='/api/crews/'+crew;
 const upload=(user='owner',type='image/webp')=>worker.fetch(new Request('https://aifect.test'+path+'/images',{method:'PUT',headers:{Origin:'https://aifect.test',Cookie:'aifect_session='+user,'content-type':type},body:image}),env,{waitUntil(){}});
 const media=(id,user)=>worker.fetch(new Request('https://aifect.test/media/crew-chat/'+id,{headers:user?{Cookie:'aifect_session='+user}:{}}),env,{waitUntil(){}});
 assert.equal((await upload('other')).status,403);
 assert.equal((await upload('owner','image/png')).status,400);
 const first=await (await upload()).json();
 assert.equal((await media(first.id,'owner')).status,404);
 const request={...msg('photo'),image_id:first.id};
 const sent=await f.call(path+'/messages','POST',request);assert.equal(sent.status,201);assert.equal(sent.body.message.image_id,first.id);assert.equal(sent.body.message.image_expires,first.expires);
 assert.equal((await f.call(path+'/messages','POST',request)).body.message.id,sent.body.message.id);
 assert.equal((await media(first.id,null)).status,401);
 assert.equal((await media(first.id,'other')).status,404);
 await f.call(path+'/join','POST',{},'other');
 assert.equal((await media(first.id,'other')).status,404,'new members cannot read old photos by direct URL');
 const next=await (await upload()).json();
 assert.equal((await f.call(path+'/messages','POST',{...msg('photo'),image_id:next.id},'other')).status,400,'another sender cannot attach this upload');
 const message=await f.call(path+'/messages','POST',{...msg('photo'),image_id:next.id});assert.equal(message.status,201);
 assert.equal((await f.call(path+'/messages','GET',null,'other')).body.messages.find(x=>x.id===message.body.message.id).image_id,next.id);
 const response=await media(next.id,'other');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 f.sql.prepare("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)").run();
 assert.equal((await media(next.id,'other')).status,404);
 f.sql.prepare('DELETE FROM user_blocks').run();
 await f.call(path+'/leave','POST',{},'other');assert.equal((await media(next.id,'other')).status,404);
 await f.call(path+'/join','POST',{},'other');assert.equal((await media(next.id,'other')).status,404,'rejoining resets visibility');
 f.sql.prepare('UPDATE crew_chat_images SET expires=0').run();assert.equal((await media(next.id,'owner')).status,410);
 await assert.rejects(cleanupChatImages({...env,BUCKET:{delete:async()=>{throw Error('retry')}}}));
 assert.equal(f.sql.prepare('SELECT count(*) n FROM crew_chat_images WHERE deleted=0').get().n,2);
 await cleanupChatImages(env);assert.equal(objects.size,0);
});
