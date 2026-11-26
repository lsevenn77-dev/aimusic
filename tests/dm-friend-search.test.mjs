import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';

test('DM recipient search matches public nicknames and IDs and respects both directions of a block',async t=>{
 const f=await fixture(t);
 const add=(id,name,provider='email',type='human')=>{
  f.sql.prepare('INSERT INTO users(id,email,name,created,provider,account_type) VALUES(?,?,?,0,?,?)').run(id,id+'@example.test',name,provider,type);
  f.sql.prepare('INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES(?,?,?,0,1)').run('p-'+id,id,name);
 };
 for(const [id,kind] of [['valid','human'],['out','human'],['in','human'],['ai_987654','ai_bot']])add(id,'별빛 '+id,kind==='human'?'email':'ai_service',kind);
 add('gone','별빛 gone','deleted');
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('owner','out',1),('in','owner',1)");
 const query=term=>'/api/dm/recipients/search?q='+encodeURIComponent(term);
 const code=f.sql.prepare("SELECT code FROM public_profile_ids WHERE user_id='valid'").get().code;
 assert.equal((await f.call(query('별빛'),'GET',undefined,null)).status,401);
 assert.deepEqual((await f.call(query('  '))).body.members,[]);
 for(const term of ['별빛',code.toLowerCase()]){
  const {status,body}=await f.call(query(term));assert.equal(status,200,JSON.stringify(body));
  assert.deepEqual(body.members.map(p=>[p.id,p.nickname,p.public_id]),[['p-valid','별빛 valid',code]]);
 }
 assert.deepEqual((await f.call(query('QA'))).body.members,[]);
 assert.deepEqual((await f.call(query('%_'))).body.members,[]);
 const initial=await f.call('/api/dm/p-valid');assert.equal(initial.status,200);assert.deepEqual(initial.body.messages,[]);
 assert.equal((await f.call('/api/dm/p-in')).status,403);
 assert.equal((await f.call('/api/dm/p-out')).status,403);
});

test('share recipients prioritize recent conversations, deduplicate follows, and find eligible new people',async t=>{
 const f=await fixture(t);
 for(const [id,name] of [['other','최근 상대'],['followed','팔로우 상대'],['discoverable','음악 친구'],['blocked','차단 상대']]){
  if(id!=='other')f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(id,id+'@example.test',name);
  f.sql.prepare('INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES(?,?,?,0,1)').run('p-'+id,id,name);
 }
 f.sql.exec(`INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','p-followed',1),('owner','producer','p-other',1),('followed','producer','producer',1),('owner','producer','p-blocked',1);
  INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES('recent','other','owner','안녕하세요','previous',2),('blocked-dm','blocked','owner','예전 대화','blocked-prev',3);
  INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('blocked','owner',1)`);
 const path='/api/dm/recipients/search?suggested=1';
 const suggestions=await f.call(path);
 assert.equal(suggestions.status,200,JSON.stringify(suggestions.body));
 assert.deepEqual(suggestions.body.members.map(x=>x.id),['p-other','p-followed']);
 assert.deepEqual((await f.call(path+'&q='+encodeURIComponent('음악 친구'))).body.members.map(x=>x.id),['p-discoverable']);
 assert.deepEqual((await f.call(path+'&q='+encodeURIComponent('차단'))).body.members,[]);
});

test('typed song shares use existing DM persistence, reject inaccessible songs and hide unavailable artwork',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO producers(id,user_id,name,created) VALUES('recipient','other','친구',0)");
 const path='/api/dm/recipient',payload={track_id:'one',request_id:crypto.randomUUID()};
 assert.equal((await f.call(path,'POST',payload,null)).status,401);
 assert.equal((await f.call(path,'POST',{...payload,track_id:'hidden'})).status,404);
 assert.equal((await f.call(path,'POST',{...payload,image_id:'also-image'})).status,400);
 const first=await f.call(path,'POST',payload);
 assert.equal(first.status,201,JSON.stringify(first.body));
 assert.equal(first.body.message.shared_track.id,'one');
 assert.equal(first.body.message.body,'곡을 공유했습니다.');
 assert.equal((await f.call(path,'POST',payload)).body.message.id,first.body.message.id);
 assert.equal((await f.call(path,'POST',{...payload,track_id:'two'})).status,409);
 const plain=await f.call(path,'POST',{body:'곡을 공유했습니다.',request_id:crypto.randomUUID()});
 assert.ok(!Object.hasOwn(plain.body.message,'shared_track'));
 const recipient=await f.call('/api/dm/producer','GET',undefined,'other');
 assert.equal(recipient.body.messages[0].shared_track.title,'one');
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 const after=(await f.call('/api/dm/producer','GET',undefined,'other')).body.messages;
 assert.equal(after[0].shared_track,null);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM direct_messages WHERE request_id=?").get(payload.request_id).n,1);
 f.sql.exec("INSERT INTO user_blocks(user_id,blocked_id,created) VALUES('other','owner',0)");
 assert.equal((await f.call(path,'POST',{track_id:'two',request_id:crypto.randomUUID()})).status,403);
});

test('cover shares retain cover artwork and vocalist credit in both DM histories',async t=>{
 const f=await fixture(t);
 f.sql.exec(`INSERT INTO producers(id,user_id,name,created,nickname_confirmed) VALUES('singer','other','커버 가창자',0,1);
  UPDATE tracks SET karaoke_at=1 WHERE id='one';
  INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,has_cover,cover_version,cover_type)
  VALUES('cover','other','artist','singer','나의 커버','Rock','',1,'wav',128,0,'published','cover','one',1,'cover-art','image/webp');`);
 const payload={track_id:'cover',request_id:crypto.randomUUID()};
 const sent=await f.call('/api/dm/singer','POST',payload);
 assert.equal(sent.status,201,JSON.stringify(sent.body));
 const card={id:'cover',kind:'cover',title:'나의 커버',artist:'커버 가창자 · 커버',artwork_id:'cover',cover_version:'cover-art'};
 assert.deepEqual(sent.body.message.shared_track,card);
 assert.deepEqual((await f.call('/api/dm/singer')).body.messages[0].shared_track,card);
 assert.deepEqual((await f.call('/api/dm/producer','GET',undefined,'other')).body.messages[0].shared_track,card);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='one'");
 assert.equal((await f.call('/api/dm/producer','GET',undefined,'other')).body.messages[0].shared_track,null);
 assert.equal((await f.call('/api/dm/singer','POST',{...payload,request_id:crypto.randomUUID()})).status,404);
});
