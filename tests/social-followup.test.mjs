import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture} from './fixture.mjs';

async function setup(t){const f=await fixture(t);const p=(await f.call('/api/me/profile','PUT',{name:'Moon'},'other')).body.profile.id;const r=await f.call('/api/crews','POST',{name:'Open room'});assert.equal(r.status,201);return {...f,p,cid:r.body.crew.id};}
const message=body=>({body,request_id:crypto.randomUUID()});

test('listeners can create and join a crew using their existing public ID without opening profile settings',async t=>{
 const f=await fixture(t);const before=f.sql.prepare("SELECT * FROM users WHERE id='other'").get();
 assert.equal(f.sql.prepare("SELECT count(*) n FROM producers WHERE user_id='other'").get().n,0);
 assert.equal((await f.call('/api/crews','POST',{name:'Listener crew'},null)).status,401);
 assert.equal((await f.call('/api/crews','POST',{name:''},'other')).status,400);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM producers WHERE user_id='other'").get().n,0);
 const made=await f.call('/api/crews','POST',{name:'Listener crew'},'other');assert.equal(made.status,201);
 assert.equal(made.body.membership.role,'owner');assert.equal(made.body.members[0].name,'other(Listener crew)');
 assert.deepEqual(f.sql.prepare("SELECT * FROM users WHERE id='other'").get(),before);
 assert.equal((await f.call('/api/crews','POST',{name:'Second crew'},'other')).status,409);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM producers WHERE user_id='other'").get().n,1);
 const joined=await f.call('/api/crews/'+made.body.crew.id+'/join','POST');assert.equal(joined.status,200);
 assert.equal(joined.body.members.find(p=>p.user_id==='owner').name,'QA(Listener crew)');
 assert.equal(f.sql.prepare("SELECT name FROM producers WHERE user_id='owner'").get().name,'QA');
});
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
test('new crew members see messages only from their join notice; only owners manage roles or kick',async t=>{
 t.mock.method(Date,'now',()=>1790910000000);
 const f=await setup(t),room='/api/crews/'+f.cid,chat=room+'/messages',target=room+'/members/'+f.p;
 const before=(await f.call(chat,'POST',message('Before joining'))).body.message;
 for(let i=0;i<2;i++)assert.equal((await f.call(room+'/join','POST',{},'other')).status,200);
 let history=(await f.call(chat,'GET',null,'other')).body.messages;
 const membership=(await f.call(room,'GET',null,'other')).body.membership;
 assert.equal(before.created,membership.joined,'prejoin messages in the same second must stay private');
 assert.ok(before.sequence<membership.joined_sequence);
 assert.ok(history.every(m=>m.sequence>=membership.joined_sequence));
 assert.equal(history.some(m=>m.body==='Before joining'),false);
 assert.equal(history.filter(m=>m.body==='Moon님이 크루에 참여하였습니다.'&&m.kind==='system').length,1);
 assert.equal((await f.call(target,'PATCH',{role:'manager'},'other')).status,403);
 assert.equal((await f.call(room+'/members/producer','DELETE')).status,400);
 assert.equal((await f.call(target,'PATCH',{role:'owner'})).status,400);
 for(const role of ['deputy','operator','manager'])assert.equal((await f.call(target,'PATCH',{role})).status,200);
 const sent=(await f.call(chat,'POST',{...message('Hello'),kind:'system',author_role:'owner'},'other')).body.message;
 assert.equal(sent.kind,'message');assert.equal(sent.role,'manager');assert.ok(sent.sequence>0);
 assert.equal((await f.call(chat,'GET',null,'other')).body.messages.some(m=>m.body==='Before joining'),false,'role promotion must not expand history');
 assert.equal((await f.call(room+'/members/producer','DELETE',null,'other')).status,403);
 assert.equal((await f.call(target,'DELETE')).status,200);
 assert.equal((await f.call(chat,'GET',null,'other')).status,403);
 assert.equal((await f.call(chat,'POST',message('kicked'), 'other')).status,403);
 assert.equal((await f.call(room+'/join','POST',{},'other')).status,403);
 assert.ok((await f.call(chat)).body.messages.some(m=>m.body==='Before joining'));
});

test('rejoining starts a new history boundary and old request IDs cannot restore previous messages',async t=>{
 t.mock.method(Date,'now',()=>1790910000000);
 const f=await setup(t),room='/api/crews/'+f.cid,chat=room+'/messages';
 const firstJoin=(await f.call(room+'/join','POST',{},'other')).body.membership;
 const oldBody=message('My first membership');
 const old=(await f.call(chat,'POST',oldBody,'other')).body.message;
 await f.call(room+'/leave','POST',{},'other');
 await f.call(chat,'POST',message('While absent'));
 const rejoined=(await f.call(room+'/join','POST',{},'other')).body.membership;
 assert.equal(rejoined.joined,firstJoin.joined,'the timestamp can be identical across a rejoin');
 assert.ok(rejoined.joined_sequence>old.sequence);
 assert.equal((await f.call(room+'/join','POST',{},'other')).body.membership.joined_sequence,rejoined.joined_sequence,'duplicate joins preserve the current boundary');
 const current=(await f.call(chat,'GET',null,'other')).body.messages;
 assert.equal(current.length,1);assert.equal(current[0].kind,'system');
 assert.equal((await f.call(chat,'POST',oldBody,'other')).status,409);
 const fresh=(await f.call(chat,'POST',message('My new membership'),'other')).body.message;
 assert.deepEqual((await f.call(chat+'?after=1','GET',null,'other')).body.messages.map(m=>m.id),[current[0].id,fresh.id]);
 const inaccessible=(await f.call(chat+'?before='+rejoined.joined_sequence,'GET',null,'other')).body;
 assert.deepEqual(inaccessible.messages,[]);assert.equal(inaccessible.has_more,false);
 assert.ok((await f.call(chat)).body.messages.some(m=>m.id===old.id),'existing members retain their messages');
});

test('both pagination directions stay within the current membership boundary',async t=>{
 const f=await setup(t),room='/api/crews/'+f.cid,path=room+'/messages';
 const insert=f.sql.prepare("INSERT INTO crew_messages(id,crew_id,user_id,body,request_id,created) VALUES(?,?,'owner',?,?,100)");
 for(let i=0;i<205;i++)insert.run('old'+i,f.cid,'old '+i,'old-request-'+i);
 const membership=(await f.call(room+'/join','POST',{},'other')).body.membership;
 for(let i=0;i<205;i++)insert.run('new'+i,f.cid,'new '+i,'new-request-'+i);
 const latest=(await f.call(path,'GET',null,'other')).body;
 const previous=(await f.call(path+'?before='+latest.messages[0].sequence,'GET',null,'other')).body;
 const oldest=(await f.call(path+'?before='+previous.messages[0].sequence,'GET',null,'other')).body;
 const all=[...oldest.messages,...previous.messages,...latest.messages];
 assert.equal(all.length,206);assert.equal(new Set(all.map(m=>m.id)).size,206);
 assert.ok(all.every(m=>m.sequence>=membership.joined_sequence));
 assert.equal(oldest.has_more,false);
 let cursor=1,ascending=[];
 for(;;){const page=(await f.call(path+'?after='+cursor,'GET',null,'other')).body;ascending.push(...page.messages);if(!page.has_more)break;cursor=page.messages.at(-1).sequence;}
 assert.deepEqual(ascending.map(m=>m.id),all.map(m=>m.id));
});

test('join-boundary migration keeps existing membership history and every stored message',()=>{
 const sql=new DatabaseSync(':memory:');
 try{
  const migrations=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(migrations).filter(x=>x.endsWith('.sql')&&x<'0027_').sort())sql.exec(readFileSync(new URL(file,migrations),'utf8'));
  sql.exec("INSERT INTO users(id,email,name,created) VALUES('legacy','legacy@test.invalid','Legacy',0);INSERT INTO crews(id,owner_id,name,created) VALUES('legacy-room','legacy','Legacy room',1);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('legacy-room','legacy','owner',1);INSERT INTO crew_messages(id,crew_id,user_id,body,request_id,created) VALUES('legacy-message','legacy-room','legacy','Stored conversation','legacy-request',1)");
  const before=sql.prepare('SELECT rowid sequence,* FROM crew_messages').all();
  sql.exec(readFileSync(new URL('0027_crew_chat_join_sequence.sql',migrations),'utf8'));
  assert.equal(sql.prepare('SELECT joined_sequence FROM crew_members').get().joined_sequence,0);
  assert.deepEqual(sql.prepare('SELECT rowid sequence,* FROM crew_messages').all(),before);
 }finally{sql.close();}
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
