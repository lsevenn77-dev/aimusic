import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../server/auth.js';
import {fixture} from './fixture.mjs';
import {queueArtistDigests,digestWindow,artistDigestBody} from '../server/notification-digest.js';
import {dispatchPush,notificationData} from '../server/push.js';
import {generateKeyPair,exportPKCS8} from 'jose';

const post=(f,who,body,extra={})=>f.call('/api/artists/artist/fanpage/posts','POST',{body,request_id:crypto.randomUUID(),...extra},who);
async function third(f){f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@example.test','third',0);INSERT INTO producers(id,user_id,name,created) VALUES('friend','other','친구',0),('third-profile','third','third',0)");f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash('third'),'third',Math.floor(Date.now()/1000)+3600);}
const count=(f,table,where='1=1')=>f.sql.prepare(`SELECT count(*) n FROM ${table} WHERE ${where}`).get().n;

test('fan lounge comments and replies notify root and reply author once, never the actor; deleted targets are safe',async t=>{
 const f=await fixture(t);await third(f);
 const root=(await post(f,'owner','응원글')).body.id;
 const comment=(await post(f,'other','댓글',{parent_id:root})).body.id;
 assert.equal(count(f,'activity_notifications',"kind='fan_comment' AND recipient='owner'"),1);
 assert.equal(count(f,'push_outbox',"kind='fan_comment'"),1);
 const reply=await post(f,'third','답글',{reply_to_id:comment});assert.equal(reply.status,201);
 assert.equal(count(f,'activity_notifications',`target='${reply.body.id}'`),2);
 const ownReply=await post(f,'owner','글쓴이 답글',{reply_to_id:comment});assert.equal(ownReply.status,201);
 assert.equal(count(f,'activity_notifications',`target='${ownReply.body.id}'`),1);
 const data=(await f.call('/api/notifications?filter=comments')).body;const n=data.items.find(n=>n.target===comment);
 assert.match(n.href,new RegExp('post='+comment));
 const focus=await f.call('/api/artists/artist/fanpage/posts?kind=lounge&focus='+reply.body.id);assert.deepEqual(new Set(focus.body.items.map(p=>p.id)),new Set([root,reply.body.id]));
 assert.equal((await f.call('/api/notifications/'+encodeURIComponent(n.id)+'/open','POST',{},'other')).status,404);
 await f.call('/api/artists/artist/fanpage/posts/'+comment,'DELETE',null,'other');
 const opened=await f.call('/api/notifications/'+encodeURIComponent(n.id)+'/open','POST',{});assert.equal(opened.body.available,0);assert.equal(opened.body.href,'');
});

test('new lounge posts are inbox-only; self, blocked and deleted actors never create activity',async t=>{
 const f=await fixture(t);await third(f);
 await post(f,'other','새 응원글');assert.equal(count(f,'activity_notifications',"kind='fan_post'"),1);assert.equal(count(f,'push_outbox'),0);
 await post(f,'owner','직접 작성');assert.equal(count(f,'activity_notifications'),1);
 await f.call('/api/blocks/other','PUT',{});assert.equal((await f.call('/api/notifications')).body.items.length,0);
 f.sql.exec("INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,created) VALUES('blocked','owner','other','fan_post','x',1)");assert.equal(count(f,'activity_notifications',"id='blocked'"),0);
});

test('artist follower history deduplicates repeated follows across days and aggregates each owned artist',async t=>{
 const f=await fixture(t);await third(f);f.sql.exec("INSERT INTO artists(id,producer_id,name,created) VALUES('artist2','producer','두번째',0)");
 const at=Date.parse('2026-10-30T19:59:00+09:00')/1000;
 for(const aid of ['artist','artist2']){
  f.sql.prepare("INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','artist',?,?)").run(aid,at);
  f.sql.prepare("DELETE FROM follows WHERE target_id=?").run(aid);
  f.sql.prepare("INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','artist',?,?)").run(aid,at+86400);
 }
 assert.equal(count(f,'activity_notifications',"kind='artist_follower'"),2);assert.equal(count(f,'push_outbox'),0);
 await queueArtistDigests({DB:f.DB},at);assert.equal(count(f,'notification_digests'),0);
 await Promise.all([queueArtistDigests({DB:f.DB},at+60),queueArtistDigests({DB:f.DB},at+60)]);
 assert.equal(count(f,'notification_digests'),1);assert.equal(count(f,'push_outbox',"kind='artist_digest'"),1);
 const body=await artistDigestBody({DB:f.DB},'owner','2026-10-30');assert.match(body,/QA · 새 팔로워 1명/);assert.match(body,/두번째 · 새 팔로워 1명/);
 await queueArtistDigests({DB:f.DB},at+3600);assert.equal(count(f,'push_outbox'),1);
});

test('Korean 20:00 windows, midnight and daily push preferences; after-cutoff events wait for next day',async t=>{
 const f=await fixture(t);await third(f);const cutoff=Date.parse('2026-10-30T20:00:00+09:00')/1000;
 assert.equal(digestWindow(cutoff-1),null);assert.equal(digestWindow(cutoff).day,'2026-10-30');assert.equal(digestWindow(cutoff+4*3600),null);
 f.sql.prepare("INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','artist','artist',?)").run(cutoff+1);
 await queueArtistDigests({DB:f.DB},cutoff+2);assert.equal(count(f,'notification_digests'),0);
 await f.call('/api/push/preferences','PUT',{artist_follower:false,artist_release:false});await queueArtistDigests({DB:f.DB},cutoff+86400);assert.equal(count(f,'notification_digests'),0);
 await f.call('/api/push/preferences','PUT',{artist_follower:true});await queueArtistDigests({DB:f.DB},cutoff+86400);assert.equal(count(f,'notification_digests'),1);
 assert.equal((await f.call('/api/notifications?filter=artists')).body.items.length,1);
});

test('original releases use followers only, publication once, excluding covers and self',async t=>{
 const f=await fixture(t);await third(f);f.sql.exec("INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','artist','artist',0),('owner','artist','artist',0);UPDATE tracks SET status='queued' WHERE id='one';UPDATE tracks SET status='published' WHERE id='one';UPDATE tracks SET status='hidden' WHERE id='one';UPDATE tracks SET status='published' WHERE id='one'");
 assert.equal(count(f,'activity_notifications',"kind='artist_release'"),1);assert.equal(count(f,'push_outbox'),0);
 assert.equal((await f.call('/api/notifications?filter=artists','GET',null,'other')).body.items[0].href,'#song/one');
});

test('crew invites replace their DM push; approval and authorized work requests are idempotent and private',async t=>{
 const f=await fixture(t);await third(f);f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','QA crew',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0);INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created,crew_invite_id) VALUES('invite','owner','third','초대','invite-key',1,'crew')");
 assert.equal(count(f,'push_outbox',"id='dm:invite'"),0);assert.equal(count(f,'push_outbox',"kind='crew_invite'"),1);
 f.sql.exec("INSERT INTO crew_audit(id,crew_id,actor_id,action,detail,created) VALUES('approval','crew','owner','application_approved','other',1)");assert.equal(count(f,'activity_notifications',"kind='crew_approved'"),1);
 const body={crew_id:'crew',recipient_id:'other',track_id:'one',request_id:crypto.randomUUID()};
 const r=await f.call('/api/notifications/crew-requests','POST',body);assert.equal(r.status,201,JSON.stringify(r));assert.equal((await f.call('/api/notifications/crew-requests','POST',body)).status,200);
 assert.equal(count(f,'activity_notifications',"kind='crew_request'"),1);
 assert.equal((await f.call('/api/notifications/crew-requests/'+encodeURIComponent(r.body.id),'GET',null,'other')).status,200);
 assert.equal((await f.call('/api/notifications/crew-requests/'+encodeURIComponent(r.body.id))).status,404);
 assert.equal((await f.call('/api/notifications/crew-requests','POST',{...body,recipient_id:'third',request_id:crypto.randomUUID()})).status,403);
});

function dubbing(f){
 f.sql.exec("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,role_count,duration,write_token,created,updated,state,visibility) VALUES('dub','owner','함께 더빙','{}','{}','script','hash',2,30,'token',1,1,'recording','public');INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,write_token,created,updated,state) VALUES('r1','dub','a','owner','script','a',1,10,'submitted'),('r2','dub','b','other','script','b',1,20,'submitted')");
}
test('dubbing completion only on public final completion, excludes last submitting participant and republishing',async t=>{
 const f=await fixture(t);await third(f);dubbing(f);assert.equal(count(f,'activity_notifications'),0);
 f.sql.exec("UPDATE dubbing_recordings SET state='draft' WHERE id='r2';UPDATE dubbing_recordings SET state='submitted' WHERE id='r2';UPDATE dubbing_projects SET state='complete' WHERE id='dub'");assert.equal(count(f,'activity_notifications',"kind='dubbing_complete'"),1);
 const n=(await f.call('/api/notifications?filter=works')).body.items[0];assert.equal(n.href,'#dubbing/dub');
 f.sql.exec("UPDATE dubbing_projects SET visibility='private' WHERE id='dub';UPDATE dubbing_projects SET visibility='public' WHERE id='dub'");assert.equal(count(f,'push_outbox'),1);
});

test('actual work failure/rejection/restriction creates owner-only immediate notice; result reason survives',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET status='failed',error='파일을 다시 업로드해주세요' WHERE id='one';UPDATE tracks SET status='failed' WHERE id='one';UPDATE tracks SET status='removed' WHERE id='two';UPDATE tracks SET status='rejected' WHERE id='three'");
 assert.equal(count(f,'activity_notifications',"kind='work_status'"),3);assert.equal(count(f,'push_outbox'),3);
 const data=(await f.call('/api/notifications?filter=works')).body;assert.ok(data.items.every(n=>n.available&&n.href.startsWith('#studio?track=')));assert.match(data.items.find(n=>n.target==='one').detail,/다시 업로드/);
 assert.equal((await f.call('/api/notifications','GET',null,'other')).body.items.length,0);
});

test('new push types use compatible string data on Android/iOS; disabled push leaves inbox intact',async t=>{
 const f=await fixture(t);await third(f);const root=(await post(f,'owner','응원글')).body.id;
 await f.call('/api/push/device','PUT',{token:'z'.repeat(40),platform:'ios',account_id:'owner'});
 const {privateKey}=await generateKeyPair('RS256',{extractable:true}),env={DB:f.DB,FCM_SERVICE_ACCOUNT:JSON.stringify({project_id:'aifect-test',client_email:'test@example.test',private_key:await exportPKCS8(privateKey)})};
 const original=globalThis.fetch,sent=[];t.after(()=>globalThis.fetch=original);globalThis.fetch=async(url,opts)=>url.includes('oauth2')?Response.json({access_token:'test',expires_in:3600}):(sent.push(JSON.parse(opts.body).message),Response.json({}));
 await post(f,'other','댓글',{parent_id:root});await dispatchPush(env);assert.equal(sent.length,1);assert.equal(sent[0].data.activity,'fan_comment');assert.ok(sent[0].data.notification_id.startsWith('fan:'));assert.match(sent[0].data.route,/post=/);assert.ok(Object.values(sent[0].data).every(v=>typeof v==='string'));assert.ok(sent[0].apns.payload.aps.alert.title);
 await f.call('/api/push/preferences','PUT',{fan_comment:false});await post(f,'third','새 댓글',{parent_id:root});await dispatchPush(env);assert.equal(sent.length,1);assert.equal(count(f,'activity_notifications',"kind='fan_comment'"),2);
 assert.equal(notificationData({kind:'participation',target:'one',recipient:'owner'}).kind,'comment');
});

test('a partial device failure retries only the failed device for the same single daily digest',async t=>{
 const f=await fixture(t);await third(f);
 const cutoff=Date.parse('2026-10-30T20:00:00+09:00')/1000;
 f.sql.prepare("INSERT INTO follows(user_id,kind,target_id,created) VALUES('other','artist','artist',?)").run(cutoff-1);
 await queueArtistDigests({DB:f.DB},cutoff);
 for(const token of ['a'.repeat(40),'b'.repeat(40)])assert.equal((await f.call('/api/push/device','PUT',{token,platform:'android',account_id:'owner'})).status,200);
 const {privateKey}=await generateKeyPair('RS256',{extractable:true}),env={DB:f.DB,FCM_SERVICE_ACCOUNT:JSON.stringify({project_id:'aifect-test',client_email:'test@example.test',private_key:await exportPKCS8(privateKey)})};
 const original=globalThis.fetch,calls=[];t.after(()=>globalThis.fetch=original);let failed=false;
 globalThis.fetch=async(url,opts)=>{
  if(url.includes('oauth2'))return Response.json({access_token:'test',expires_in:3600});
  const m=JSON.parse(opts.body).message;calls.push(m);
  if(m.token.startsWith('b')&&!failed){failed=true;return Response.json({error:{}},{status:503});}
  return Response.json({});
 };
 await dispatchPush(env);f.sql.exec('UPDATE push_outbox SET lease_until=0 WHERE delivered=0');await dispatchPush(env);
 assert.equal(calls.filter(m=>m.token.startsWith('a')).length,1);assert.equal(calls.filter(m=>m.token.startsWith('b')).length,2);
 assert.equal(count(f,'notification_digests'),1);assert.equal(count(f,'push_outbox',"kind='artist_digest' AND delivered=1"),1);
 assert.ok(calls.every(m=>m.data.title==='오늘의 아티스트 소식'));
});
