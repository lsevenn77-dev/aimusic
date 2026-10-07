import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {rememberAppleToken,revokeAppleLogin,drainDeletedFiles} from '../server/account-safety.js';

test('deletion requires an authenticated session and an explicit confirmation',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/account/delete','POST',{confirmation:'DELETE'},null)).status,401);
 assert.equal((await f.call('/api/account/delete','POST',{})).status,400);
 assert.equal(f.sql.prepare("SELECT name FROM users WHERE id='owner'").get().name,'owner');
});
test('deletion removes personal content and sessions, retaining anonymous transaction keys',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO comments(id,track_id,user_id,body,created) VALUES('comment','one','owner','private content',0); INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES('dm','owner','other','message','request',0); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,created,status) VALUES('paid','owner','apple',100,1000,0,'paid')");
 const r=await f.call('/api/account/delete','POST',{confirmation:'DELETE'});assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await f.call('/api/me')).body.user,null);
 const u=f.sql.prepare("SELECT * FROM users WHERE id='owner'").get();assert.equal(u.provider,'deleted');assert.equal(u.password,null);assert.equal(u.subject,null);assert.equal(u.name,'탈퇴한 회원');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM comments').get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM direct_messages').get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gold_purchases').get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM tracks WHERE status!='deleted'").get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM account_file_deletions').get().n,1);
 assert.equal((await f.call('/api/catalog','GET',null,'other')).body.tracks.length,0);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('deleting a crew owner transfers ownership and removes their chat history',async t=>{
 const f=await fixture(t);const p=await f.call('/api/me/profile','PUT',{name:'Second'},'other');assert.equal(p.status,200);
 const c=(await f.call('/api/crews','POST',{name:'Music room'})).body.crew.id;
 assert.equal((await f.call(`/api/crews/${c}/join`,'POST',{},'other')).status,200);
 assert.equal((await f.call('/api/account/delete','POST',{confirmation:'DELETE'})).status,200);
 assert.equal(f.sql.prepare('SELECT owner_id FROM crews WHERE id=?').get(c).owner_id,'other');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_messages WHERE user_id='owner'").get().n,0);
});
test('a block hides content and prevents messages in both directions, and can be undone',async t=>{
 const f=await fixture(t);const other=(await f.call('/api/me/profile','PUT',{name:'Second'},'other')).body.profile.id;
 assert.equal((await f.call('/api/blocks/owner','PUT',{},'other')).status,200);
 for(const [sender,target] of [['owner',other],['other','producer']]){
  assert.equal((await f.call(`/api/dm/${target}`,'POST',{body:'hello',request_id:'unique-request-123'},sender)).status,403);
  assert.equal((await f.call(`/api/dm/${target}`,'GET',null,sender)).status,403);
 }
 assert.equal((await f.call('/api/catalog','GET',null,'other')).body.tracks.length,0);
 assert.equal((await f.call('/api/tracks/one','GET',null,'other')).status,403);
 assert.equal((await f.call('/api/blocks','GET',null,'other')).body.blocks[0].id,'owner');
 assert.equal((await f.call('/api/blocks/owner','DELETE',{},'other')).status,200);
 assert.equal((await f.call('/api/catalog','GET',null,'other')).body.tracks.length,3);
});
test('blocked crew messages are excluded before pagination',async t=>{
 const f=await fixture(t);await f.call('/api/me/profile','PUT',{name:'Second'},'other');
 const cid=(await f.call('/api/crews','POST',{name:'Safe room'})).body.crew.id;
 await f.call(`/api/crews/${cid}/join`,'POST',{},'other');
 await f.call(`/api/crews/${cid}/messages`,'POST',{body:'hidden message',request_id:'crew-message-12345'});
 await f.call('/api/blocks/owner','PUT',{},'other');
 const r=await f.call(`/api/crews/${cid}/messages`,'GET',null,'other');assert.equal(r.status,200);assert.ok(r.body.messages.every(m=>m.user_id!=='owner'));
});
test('Apple revocation tokens are encrypted and bound to the account',async t=>{
 const f=await fixture(t),env={DB:f.DB,AUTH_PEPPER:'test-pepper',APPLE_CLIENT_ID:'client',APPLE_CLIENT_SECRET:'secret'};
 await rememberAppleToken(env,'owner','private-refresh-token');
 const saved=f.sql.prepare("SELECT cipher FROM apple_login_tokens WHERE user_id='owner'").get().cipher;assert.ok(!saved.includes('private-refresh-token'));
 t.mock.method(globalThis,'fetch',async (url,options)=>{assert.equal(url,'https://appleid.apple.com/auth/revoke');assert.equal(options.body.get('token'),'private-refresh-token');return new Response('',{status:200});});
 await revokeAppleLogin(env,'owner');
 f.sql.prepare('INSERT INTO apple_login_tokens VALUES(?,?)').run('other',saved);
 await assert.rejects(revokeAppleLogin(env,'other'));
});
test('missing Apple refresh authorization preserves the account and asks for login again',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE users SET provider='apple' WHERE id='owner'");
 const r=await f.call('/api/account/delete','POST',{confirmation:'DELETE'});assert.equal(r.status,409);
 assert.equal(f.sql.prepare("SELECT provider FROM users WHERE id='owner'").get().provider,'apple');
});
test('file cleanup retries failure and repeats after in-flight uploads can finish',async t=>{
 const f=await fixture(t),keys=new Set(['images/producer/producer/image','images/producer/producer-other/keep']);let unavailable=true;
 const env={DB:f.DB,BUCKET:{async list({prefix}){if(unavailable)throw Error('offline');return {objects:[...keys].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};},async delete(items){for(const key of Array.isArray(items)?items:[items])keys.delete(key);}}};
 f.sql.prepare('INSERT INTO account_file_deletions VALUES(?,?,0,0)').run('job',JSON.stringify([{prefix:'images/producer/producer/'}]));
 await drainDeletedFiles(env);assert.equal(keys.size,2);assert.equal(f.sql.prepare('SELECT pass FROM account_file_deletions').get().pass,0);
 unavailable=false;f.sql.exec('UPDATE account_file_deletions SET ready_at=0');await drainDeletedFiles(env);assert.equal(keys.size,1);assert.equal(f.sql.prepare('SELECT pass FROM account_file_deletions').get().pass,1);
 keys.add('images/producer/producer/late');f.sql.exec('UPDATE account_file_deletions SET ready_at=0');await drainDeletedFiles(env);assert.equal(keys.size,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM account_file_deletions').get().n,0);
});
