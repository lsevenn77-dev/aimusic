import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

async function setup(t){const f=await fixture(t);const p=(await f.call('/api/me/profile','PUT',{name:'Moon'},'other')).body.profile.id;const r=await f.call('/api/crews','POST',{name:'Open room'});assert.equal(r.status,201);return {...f,p,cid:r.body.crew.id};}
const message=body=>({body,request_id:crypto.randomUUID()});
test('received gold earns one XP per gold once, while earlier gifts and free stars earn none',async t=>{
 const f=await setup(t),room='/api/crews/'+f.cid;
 f.sql.exec("INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,creator_mw,platform_mw,month,created) VALUES('old','other','one',50,500000,'producer',350000,150000,'2026-09',0),('new','other','one',27,270000,'producer',189000,81000,'2026-09',unixepoch());UPDATE tracks SET created=unixepoch() WHERE id IN ('one','two','hidden')");
 assert.equal((await f.call(room)).body.crew.xp,29);
 assert.equal((await f.call(room)).body.crew.xp,29);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_xp WHERE id='gift:new'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_xp WHERE id='gift:old'").get().n,0);
 await f.call(room+'/join','POST',{},'other');await f.call(room+'/leave','POST');
 const newRoom=(await f.call('/api/crews','POST',{name:'New room'})).body.crew;
 assert.equal(newRoom.xp,0,'existing track and gift IDs must not reward a second crew');
});
test('new crew members see previous messages and one join notice; only owners manage roles or kick',async t=>{
 const f=await setup(t),room='/api/crews/'+f.cid,chat=room+'/messages',target=room+'/members/'+f.p;
 await f.call(chat,'POST',message('Before joining'));
 for(let i=0;i<2;i++)assert.equal((await f.call(room+'/join','POST',{},'other')).status,200);
 let history=(await f.call(chat,'GET',null,'other')).body.messages;
 assert.ok(history.some(m=>m.body==='Before joining'&&m.role==='owner'));
 assert.equal(history.filter(m=>m.body==='Moon님이 크루에 참여하였습니다.'&&m.kind==='system').length,1);
 assert.equal((await f.call(target,'PATCH',{role:'manager'},'other')).status,403);
 assert.equal((await f.call(room+'/members/producer','DELETE')).status,400);
 assert.equal((await f.call(target,'PATCH',{role:'owner'})).status,400);
 for(const role of ['deputy','operator','manager'])assert.equal((await f.call(target,'PATCH',{role})).status,200);
 const sent=(await f.call(chat,'POST',{...message('Hello'),kind:'system',author_role:'owner'},'other')).body.message;
 assert.equal(sent.kind,'message');assert.equal(sent.role,'manager');assert.ok(sent.sequence>0);
 assert.equal((await f.call(room+'/members/producer','DELETE',null,'other')).status,403);
 assert.equal((await f.call(target,'DELETE')).status,200);
 assert.equal((await f.call(chat,'GET',null,'other')).status,403);
 assert.equal((await f.call(chat,'POST',message('kicked'), 'other')).status,403);
 assert.equal((await f.call(room+'/join','POST',{},'other')).status,403);
 assert.ok((await f.call(chat)).body.messages.some(m=>m.body==='Before joining'));
});
test('crew history paginates stably through equal timestamps and new messages without loss',async t=>{
 const f=await setup(t),path='/api/crews/'+f.cid+'/messages';
 const insert=f.sql.prepare("INSERT INTO crew_messages(id,crew_id,user_id,body,request_id,created) VALUES(?,?,'owner',?,?,100)");
 for(let i=0;i<205;i++)insert.run('m'+i,f.cid,'message '+i,'request-'+i);
 const latest=(await f.call(path)).body;assert.equal(latest.messages.length,100);assert.equal(latest.has_more,true);
 const previous=(await f.call(path+'?before='+latest.messages[0].sequence)).body;
 const oldest=(await f.call(path+'?before='+previous.messages[0].sequence)).body;
 const all=[...oldest.messages,...previous.messages,...latest.messages];assert.equal(all.length,206);assert.equal(new Set(all.map(m=>m.id)).size,206);assert.equal(oldest.has_more,false);
 const sent=(await f.call(path,'POST',message('New'))).body.message;
 assert.deepEqual((await f.call(path+'?after='+latest.messages.at(-1).sequence)).body.messages.map(m=>m.id),[sent.id]);
 assert.equal((await f.call(path+'?before=1&after=2')).status,400);
});
test('DM inbox separates partners and includes last text, timestamp, unread count and complete paginated history',async t=>{
 const f=await setup(t);const path='/api/dm/'+f.p;
 const insert=f.sql.prepare("INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,'other','owner',?,?,100)");
 for(let i=0;i<105;i++)insert.run('dm'+i,'text '+i,'request-'+i);
 f.sql.exec("INSERT INTO users(id,email,name,created) VALUES('third','third@test.invalid','Third',0);INSERT INTO producers(id,user_id,name,created) VALUES('third-profile','third','Third',0);INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES('third-dm','owner','third','Separate conversation','separate-request',101)");
 const inbox=(await f.call('/api/dm')).body.conversations;assert.equal(inbox.length,2);assert.equal(inbox[0].id,'third-profile');assert.equal(inbox[1].last_message,'text 104');assert.equal(inbox[1].unread,105);
 const latest=(await f.call(path)).body;assert.equal(latest.messages.length,100);assert.equal(latest.has_more,true);
 const old=(await f.call(path+'?before='+latest.messages[0].sequence)).body;assert.equal(old.messages.length,5);assert.equal(old.has_more,false);
 assert.ok([...old.messages,...latest.messages].every(m=>m.recipient_id==='owner'&&m.sender_id==='other'));
 await f.call(path,'PATCH');assert.equal((await f.call('/api/dm')).body.conversations[1].unread,0);
 const sent=(await f.call(path,'POST',message('Reply'))).body.message;assert.equal(sent.body,'Reply');assert.ok(sent.sequence>0);
 assert.deepEqual((await f.call(path+'?after='+latest.messages.at(-1).sequence)).body.messages.map(m=>m.id),[sent.id]);
});
test('karaoke chart includes public zero-like covers while excluding originals and hidden covers',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one';INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES('cover','owner','artist','producer','Cover','Rock','',1,'wav',128,0,'published','cover','one')");
 const path='/api/cover-rankings?kind=tracks&period=week&include_unranked=1';
 const d=(await f.call(path)).body;assert.deepEqual(d.tracks.map(t=>t.id),['cover']);assert.equal(d.tracks[0].rank_likes,0);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");assert.deepEqual((await f.call(path)).body.tracks,[]);
});
