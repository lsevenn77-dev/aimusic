import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {notificationData,dispatchPush} from '../server/push.js';
import {generateKeyPair,exportPKCS8} from 'jose';

test('gold and silver gifts persist actor, quantity, value and date exactly once; reads are private',async t=>{
 const f=await fixture(t),stamp=Math.floor(Date.now()/1000);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0); INSERT INTO free_gift_wallets(user_id,balance) VALUES('other',100); INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,status,created,paid_at) VALUES('test-purchase','other','web',1000,11000,440,'paid',1,1)");
 const silver={gift_type:'silver-letter',quantity:3,request_id:crypto.randomUUID()},gold={gift_type:'crown',quantity:1,request_id:crypto.randomUUID()};
 for(let i=0;i<2;i++){
  const s=await f.call('/api/producers/producer/gifts','POST',silver,'other');assert.ok(s.status<300,JSON.stringify(s));
  const g=await f.call('/api/tracks/one/gifts','POST',gold,'other');assert.ok(g.status<300,JSON.stringify(g));
 }
 const data=(await f.call('/api/notifications')).body;assert.equal(data.items.length,2);assert.equal(data.unread,2);
 const silverItem=data.items.find(x=>x.currency==='silver'),goldItem=data.items.find(x=>x.currency==='gold');
 assert.deepEqual([silverItem.actor_name,silverItem.gift_name,silverItem.quantity,silverItem.amount,silverItem.target],['친구','손편지',3,6,'producer']);
 assert.deepEqual([goldItem.gift_name,goldItem.quantity,goldItem.amount,goldItem.target],['왕관',1,777,'one']);
 assert.ok(goldItem.created>=stamp);assert.equal((await f.call('/api/notifications','GET',null,'other')).body.items.length,0);
 assert.equal((await f.call('/api/notifications','GET',null,null)).status,401);
 await f.call('/api/notifications/read','POST',{ids:[silverItem.id]},'other');assert.equal((await f.call('/api/notifications/summary')).body.unread,2);
 await f.call('/api/notifications/read','POST',{ids:[silverItem.id]});assert.equal((await f.call('/api/notifications/summary')).body.unread,1);
 f.sql.exec('DELETE FROM push_outbox');assert.equal((await f.call('/api/notifications')).body.items.length,2,'history survives push queue expiration');
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");assert.equal((await f.call('/api/notifications')).body.items.find(n=>n.id===goldItem.id).available,0);
});

function seedCover(f,id,owner='other',parent=null){
 f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_parent_id) VALUES(?,?,'artist',?,'함께 부른 노래','Rock','',1,'wav',128,1,'queued','cover','one',?,?)").run(id,owner,owner==='owner'?'producer':owner==='other'?'friend':'third-profile',parent?'duet':'solo',parent);
}
test('participation is publication-only, deduplicates recipients and republishing, and rolls back with its transaction',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0); INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','세번째',0); INSERT INTO producers(id,user_id,name,created) VALUES('third-profile','third','세번째',0)");
 seedCover(f,'first');assert.equal((await f.call('/api/notifications')).body.items.length,0);
 f.sql.exec("UPDATE tracks SET status='published',cover_mode='duet',duet_open=1 WHERE id='first'");
 assert.equal((await f.call('/api/notifications')).body.items[0].kind,'cover');
 seedCover(f,'second','third','first');f.sql.exec("UPDATE tracks SET status='published' WHERE id='second'");
 assert.equal((await f.call('/api/notifications','GET',null,'other')).body.items[0].kind,'duet');
 assert.equal((await f.call('/api/notifications')).body.items.length,2,'original uploader also notified');
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='second'; UPDATE tracks SET status='published' WHERE id='second'");
 assert.equal(f.sql.prepare("SELECT count(*) n FROM push_outbox WHERE kind='participation'").get().n,3);
 seedCover(f,'own-first','owner');f.sql.exec("UPDATE tracks SET status='published',cover_mode='duet' WHERE id='own-first'");
 seedCover(f,'same-owner','other','own-first');f.sql.exec("UPDATE tracks SET status='published' WHERE id='same-owner'");
 assert.equal(f.sql.prepare("SELECT count(*) n FROM activity_notifications WHERE target='same-owner'").get().n,1,'same original and partner owner receives one notification');
 assert.equal(f.sql.prepare("SELECT kind FROM activity_notifications WHERE target='same-owner'").get().kind,'duet');
 seedCover(f,'rollback');f.sql.exec("BEGIN; UPDATE tracks SET status='published' WHERE id='rollback'; ROLLBACK;");assert.equal(f.sql.prepare("SELECT count(*) n FROM activity_notifications WHERE target='rollback'").get().n,0);
});

test('pagination has no gaps at identical timestamps and blocked activity is hidden',async t=>{
 const f=await fixture(t);for(let i=0;i<37;i++)f.sql.prepare("INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,created) VALUES(?,'owner','other','gift','one',10)").run('event-'+String(i).padStart(2,'0'));
 const first=(await f.call('/api/notifications?filter=gifts')).body,second=(await f.call('/api/notifications?filter=gifts&before='+first.next)).body;
 assert.equal(first.items.length,30);assert.equal(second.items.length,7);assert.equal(new Set([...first.items,...second.items].map(n=>n.id)).size,37);assert.equal(second.next,null);
 assert.equal((await f.call('/api/notifications?before='+first.next,'GET',null,'other')).status,400);
 assert.equal((await f.call('/api/notifications?filter=participation')).body.items.length,0);
 await f.call('/api/blocks/other','PUT',{});assert.equal((await f.call('/api/notifications')).body.items.length,0);assert.equal((await f.call('/api/notifications/summary')).body.unread,0);
});

test('published participation reaches existing native song navigation and respects preferences',async t=>{
 const f=await fixture(t);f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0)");
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'");
 await f.call('/api/push/device','PUT',{token:'n'.repeat(40),platform:'android',account_id:'owner'});
 seedCover(f,'alert');f.sql.exec("UPDATE tracks SET status='published' WHERE id='alert'");
 const {privateKey}=await generateKeyPair('RS256',{extractable:true}),env={DB:f.DB,FCM_SERVICE_ACCOUNT:JSON.stringify({project_id:'aifect-test',client_email:'test@example.test',private_key:await exportPKCS8(privateKey)})};
 const original=globalThis.fetch,delivered=[];t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async(url,options)=>url.includes('oauth2')?Response.json({access_token:'test-only',expires_in:3600}):(delivered.push(JSON.parse(options.body).message),Response.json({}));
 await dispatchPush(env);assert.equal(delivered.length,1);assert.equal(delivered[0].data.kind,'comment');assert.equal(delivered[0].data.activity,'participation');assert.equal(delivered[0].data.target,'alert');assert.match(delivered[0].apns.payload.aps.alert.title,/새로운 참여/);
 await f.call('/api/push/preferences','PUT',{comment:false});seedCover(f,'muted');f.sql.exec("UPDATE tracks SET status='published' WHERE id='muted'");await dispatchPush(env);assert.equal(delivered.length,1);assert.equal((await f.call('/api/notifications')).body.items.length,2,'push preferences do not suppress history');
 await f.call('/api/push/preferences','PUT',{comment:true});seedCover(f,'withdrawn');f.sql.exec("UPDATE tracks SET status='published' WHERE id='withdrawn'; UPDATE tracks SET status='hidden' WHERE id='one'");await dispatchPush(env);assert.equal(delivered.length,1,'do not send participation for a withdrawn original');
 assert.equal(notificationData({kind:'gift',target:'one',recipient:'owner'}).kind,'gift');
});
