import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {notificationData,dispatchPush} from '../server/push.js';
import {generateKeyPair,exportPKCS8} from 'jose';

test('device binding requires the current account; token reassignment and preferences stay private',async t=>{
 const f=await fixture(t),token='a'.repeat(120);
 assert.equal((await f.call('/api/push/device','PUT',{token,platform:'android',account_id:'other'})).status,409);
 assert.equal((await f.call('/api/push/device','PUT',{token,platform:'android',account_id:'owner'})).status,200);
 assert.equal((await f.call('/api/push/device','PUT',{token,platform:'android',account_id:'other'},'other')).status,200);
 assert.equal(f.sql.prepare('SELECT user_id FROM push_devices WHERE token=?').get(token).user_id,'other');
 await f.call('/api/push/device','DELETE',{token});assert.equal(f.sql.prepare('SELECT count(*) n FROM push_devices').get().n,1);
 assert.equal((await f.call('/api/push/preferences','PUT',{dm:false},'other')).status,200);
 assert.equal((await f.call('/api/push/preferences','GET',null,'other')).body.dm,0);
 assert.equal((await f.call('/api/push/preferences','GET')).body.dm,1);
 assert.equal((await f.call('/api/push/preferences','GET',null,null)).status,401);
 assert.equal((await f.call('/api/push/preferences','PUT',{arbitrary:true})).status,400);
});
test('delivery ignores expired login and disabled alerts, retries failure, removes unregistered tokens',async t=>{
 const f=await fixture(t),{privateKey}=await generateKeyPair('RS256',{extractable:true});
 const env={DB:f.DB,FCM_SERVICE_ACCOUNT:JSON.stringify({project_id:'aifect-test',client_email:'test@example.test',private_key:await exportPKCS8(privateKey)})};
 const ownerSession=f.sql.prepare("SELECT token FROM sessions WHERE user_id='owner'").get().token;
 f.sql.prepare('INSERT INTO push_devices VALUES(?,?,?,?)').run('live','owner',ownerSession,0);
 f.sql.prepare('INSERT INTO push_devices VALUES(?,?,?,?)').run('expired','owner','revoked-session',0);
 f.sql.prepare("INSERT INTO push_outbox(id,recipient,kind,target,created) VALUES('event','owner','gift','one',?)").run(Math.floor(Date.now()/1000));
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 let deliveries=[];let status=503;
 globalThis.fetch=async(url,options)=>url.includes('oauth2')?Response.json({access_token:'isolated-test',expires_in:3600}):
  (deliveries.push(JSON.parse(options.body).message.token),Response.json(status===404?{error:{details:[{errorCode:'UNREGISTERED'}]}}:{},{status}));
 await dispatchPush(env);assert.deepEqual(deliveries,['live']);assert.equal(f.sql.prepare('SELECT delivered FROM push_outbox').get().delivered,0);
 f.sql.exec('UPDATE push_outbox SET lease_until=0');status=404;
 await dispatchPush(env);assert.equal(f.sql.prepare("SELECT count(*) n FROM push_devices WHERE token='live'").get().n,0);
 assert.equal(f.sql.prepare('SELECT delivered FROM push_outbox').get().delivered,1);
 f.sql.exec("UPDATE push_outbox SET delivered=0,lease_until=0; INSERT INTO push_preferences(user_id,gift) VALUES('owner',0)");
 const count=deliveries.length;await dispatchPush(env);assert.equal(deliveries.length,count);
});
test('transactional notifications deduplicate retried messages and self comments',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Other',0)");
 const request={body:'hello',request_id:'unique-request-000001'};
 assert.equal((await f.call('/api/dm/producer','POST',request,'other')).status,201);
 await f.call('/api/dm/producer','POST',request,'other');
 const dm=f.sql.prepare("SELECT * FROM push_outbox WHERE kind='dm'").all();assert.equal(dm.length,1);assert.equal(dm[0].target,'other-profile');
 await f.call('/api/tracks/one/comments','POST',{body:'hello'},'other');
 await f.call('/api/tracks/one/comments','POST',{body:'my own'},'owner');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM push_outbox WHERE kind='comment'").get().n,1);
 const data=notificationData(dm[0]);assert.equal(data.recipient,'owner');assert.doesNotMatch(JSON.stringify(data),/hello|example.test/);
});
