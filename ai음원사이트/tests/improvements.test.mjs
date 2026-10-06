import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {hash} from '../server/auth.js';
import worker from '../server/index.js';
import {crewLevel} from '../shared/crews.js';

async function person(f,uid){
 f.sql.prepare("INSERT INTO users(id,email,name,provider,created) VALUES(?,?,?,'google',0)").run(uid,uid+'@example.test','Private legal name '+uid);
 f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(await hash(uid),uid,Date.now()/1000+3600);
 const r=await f.call('/api/me/profile','PUT',{name:'Nickname '+uid},uid);assert.equal(r.status,200);return r.body.profile.id;
}
async function crew(f){const r=await f.call('/api/crews','POST',{name:'Together',description:'Music together',interests:'Rock'});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.crew.id;}
const rid=()=>crypto.randomUUID();

test('legacy auto-copied OAuth names stay stored but are absent from public profiles, search and credits until explicitly confirmed',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE users SET provider='google',name='Private legal name' WHERE id='other'; INSERT INTO producers(id,user_id,name,created) VALUES('legacy','other','Private legal name',0); UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES('legacy-cover','other','artist','legacy','Cover','Rock','',1,'wav',128,0,'published','cover','one')");
 await f.call('/api/tracks/legacy-cover/like','PUT');
 for(const path of ['/api/me','/api/me/profile','/api/catalog?section=producers','/api/producers/legacy','/api/tracks/legacy-cover','/api/community?kind=cover','/api/cover-rankings?kind=singers&period=all'])assert.ok(!JSON.stringify((await f.call(path,'GET',null,'other')).body).includes('Private legal name'),path);
 assert.equal((await f.call('/api/search?q=Private%20legal%20name')).body.producers.length,0);
 assert.equal(f.sql.prepare("SELECT name FROM producers WHERE id='legacy'").get().name,'Private legal name');
 await f.call('/api/me/profile','PUT',{name:'Private legal name'},'other');
 assert.equal((await f.call('/api/producers/legacy')).body.profile.name,'Private legal name','an explicit personal nickname choice is respected');
});

test('public identity follows chosen nickname without changing private OAuth identity',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE users SET provider='google',name='Private legal name' WHERE id='other'");
 const anon=(await f.call('/api/me','GET',null,'other')).body.user;assert.equal(anon.name,'리스너 other');
 const profile=(await f.call('/api/me/profile','PUT',{name:'Moon singer',bio:'Hello'},'other')).body.profile;
 assert.equal((await f.call('/api/me','GET',null,'other')).body.user.name,'Moon singer');
 assert.equal(f.sql.prepare("SELECT name FROM users WHERE id='other'").get().name,'Private legal name');
 await f.call('/api/tracks/one/comments','POST',{body:'Listen together'},'other');
 assert.equal((await f.call('/api/tracks/one/comments')).body.comments[0].name,'Moon singer');
 const list=(await f.call('/api/playlists','POST',{name:'Night songs',is_public:true},'other')).body;assert.equal((await f.call('/api/playlists/'+list.id+'/tracks/one','PUT',{},'other')).status,200);
 assert.equal((await f.call('/api/playlists?scope=public')).body.playlists.find(p=>p.user_id==='other').owner_name,'Moon singer');
 f.sql.prepare("INSERT INTO follows VALUES('other','producer','producer',0)").run();
 assert.equal((await f.call('/api/me/profile')).body.followers[0].id,profile.id);
 f.sql.exec("DELETE FROM producers WHERE user_id='other'");
 const follower=(await f.call('/api/me/profile')).body;assert.equal(follower.follower_count,1);assert.equal(follower.followers[0].name,'리스너 other');
});

test('profile photo writes are authenticated, bounded, validated and use public avatar visibility',async t=>{
 const files=new Map(),BUCKET={async head(key){const b=files.get(key);return b?{size:b.length}:null},async put(key,body){files.set(key,body)},async get(key){const body=files.get(key);return body?{body,size:body.length}:null}};
 const f=await fixture(t,{BUCKET});
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 const upload=(body,user='owner',type='image/png')=>worker.fetch(new Request('https://aifect.test/api/me/profile/image',{method:'PUT',headers:{Origin:'https://aifect.test','Content-Type':type,...(user?{Cookie:'aifect_session='+user}:{})},body}),{DB:f.DB,BUCKET},{waitUntil(){}});
 assert.equal((await upload(image,null)).status,401);
 assert.equal((await upload(image,'other')).status,409);
 assert.equal((await upload(new Uint8Array(5*1024*1024+1))).status,413);
 assert.equal((await upload('not a real picture')).status,400);
 assert.equal((await upload(image)).status,200);assert.equal(files.size,1);
 const p=(await f.call('/api/me/profile')).body.profile;
 const r=await worker.fetch(new Request('https://aifect.test/media/producer/producer?v='+p.image_version),{DB:f.DB,BUCKET},{waitUntil(){}});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),image);
});

test('crew membership enforces capacity, single membership, recruitment and chat permissions',async t=>{
 const f=await fixture(t),cid=await crew(f);for(let i=0;i<10;i++)await person(f,'m'+i);
 assert.equal((await f.call(`/api/crews/${cid}/messages`,'GET',null,null)).status,401);
 assert.equal((await f.call(`/api/crews/${cid}/messages`,'GET',null,'m0')).status,403);
 for(let i=0;i<9;i++)assert.equal((await f.call(`/api/crews/${cid}/join`,'POST',{},'m'+i)).status,200);
 assert.equal((await f.call(`/api/crews/${cid}/join`,'POST',{},'m9')).status,409);
 assert.equal((await f.call(`/api/crews/${cid}`,'PATCH',{description:'hijack'},'m0')).status,403);
 assert.equal((await f.call('/api/crews','POST',{name:'Second'},'m0')).status,409);
 await f.call(`/api/crews/${cid}`,'PATCH',{recruiting:false});await f.call(`/api/crews/${cid}/leave`,'POST',{},'m0');
 assert.equal((await f.call(`/api/crews/${cid}/join`,'POST',{},'m9')).status,409);
 assert.equal((await f.call(`/api/crews/${cid}/messages`,'POST',{body:'not a member',request_id:rid()},'m0')).status,403);
 await f.call(`/api/crews/${cid}/leave`,'POST');
 const d=(await f.call(`/api/crews/${cid}`,'GET',null,'m1')).body;assert.equal(d.membership.role,'owner');assert.equal(d.crew.members,8);
});

test('crew XP comes from new public tracks and one daily chat, with exact level caps',async t=>{
 assert.deepEqual([0,100,500,1500,3000].map(x=>crewLevel(x).capacity),[10,20,50,100,150]);
 const f=await fixture(t),cid=await crew(f),path=`/api/crews/${cid}/messages`,request_id=rid();
 await f.call(path,'POST',{body:'Hello',request_id});await f.call(path,'POST',{body:'Hello',request_id});await f.call(path,'POST',{body:'Again',request_id:rid()});
 assert.equal((await f.call(path)).body.messages.filter(m=>m.kind!=='system').length,2);
 assert.equal((await f.call(path,'POST',{body:'Changed',request_id})).status,409);
 let d=(await f.call(`/api/crews/${cid}`)).body;assert.equal(d.crew.xp,10);
 f.sql.exec("UPDATE tracks SET created=unixepoch() WHERE id IN ('one','two'); UPDATE tracks SET created=unixepoch() WHERE id='hidden'");
 d=(await f.call(`/api/crews/${cid}`)).body;assert.equal(d.crew.xp,12);assert.equal(d.crew.capacity,10);
 assert.equal((await f.call(`/api/crews/${cid}`)).body.crew.xp,12);
 assert.ok((await f.call('/api/crews')).body.tracks.some(x=>x.id==='one'));assert.ok(!d.tracks.some(x=>x.id==='hidden'));
});

test('DM conversations are isolated per pair, read receipts restricted and requests idempotent',async t=>{
 const f=await fixture(t),a=await person(f,'a'),b=await person(f,'b'),c=await person(f,'c'),request_id=rid();
 assert.equal((await f.call('/api/dm/'+b,'GET',null,null)).status,401);
 assert.equal((await f.call('/api/dm/'+a,'POST',{body:'self',request_id},'a')).status,400);
 for(let i=0;i<2;i++)assert.equal((await f.call('/api/dm/'+b,'POST',{body:'Secret hello',request_id},'a')).status,201);
 assert.equal((await f.call('/api/dm/'+b,'GET',null,'a')).body.messages.length,1);
 assert.deepEqual((await f.call('/api/dm/'+b+'?sender_id=a','GET',null,'c')).body.messages,[]);
 assert.deepEqual((await f.call('/api/dm','GET',null,'c')).body.conversations,[]);
 assert.equal((await f.call('/api/dm/'+c,'POST',{body:'Secret hello',request_id},'a')).status,409);
 assert.equal((await f.call('/api/dm','GET',null,'b')).body.conversations[0].unread,1);
 await f.call('/api/dm/'+a,'PATCH',{},'c');assert.equal((await f.call('/api/dm','GET',null,'b')).body.conversations[0].unread,1);
 await f.call('/api/dm/'+a,'PATCH',{},'b');assert.equal((await f.call('/api/dm','GET',null,'b')).body.conversations[0].unread,0);
});

test('deleted comments disappear, surviving replies become roots and deleted parents reject new replies',async t=>{
 const f=await fixture(t),parent=(await f.call('/api/tracks/one/comments','POST',{body:'Parent comment'})).body.id;
 const reply=(await f.call('/api/tracks/one/comments','POST',{body:'Surviving reply',parent_id:parent},'other')).body.id;
 assert.equal((await f.call('/api/comments/'+parent,'DELETE',null,'other')).status,403);
 assert.equal((await f.call('/api/comments/'+parent,'DELETE')).status,200);
 const comments=(await f.call('/api/tracks/one/comments')).body.comments;assert.equal(comments.length,1);assert.equal(comments[0].id,reply);assert.equal(comments[0].parent_id,null);
 assert.equal((await f.call('/api/tracks/one/comments','POST',{body:'Late reply',parent_id:parent},'other')).status,400);
});

test('cover attachment endpoint requires active Premium while ordinary streaming still works',async t=>{
 const bytes=new Uint8Array(256),BUCKET={async get(){return {body:bytes,size:bytes.length}},async head(){return {size:bytes.length}}};const f=await fixture(t,{BUCKET});
 f.sql.exec("UPDATE tracks SET karaoke_at=1 WHERE id='one'; INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES('cover','owner','artist','producer','Cover','Rock','',1,'wav',256,0,'published','cover','one')");
 const raw=(path,user='owner',method='GET')=>worker.fetch(new Request('https://aifect.test'+path,{method,headers:user?{Cookie:'aifect_session='+user}:{}}),{DB:f.DB,BUCKET},{waitUntil(){}});
 assert.equal((await raw('/api/covers/cover/download',null)).status,401);assert.equal((await raw('/api/covers/cover/download')).status,403);assert.equal((await raw('/media/cover/stream')).status,200);
 f.sql.exec("UPDATE users SET premium_until=unixepoch()+3600 WHERE id='owner'");let r=await raw('/api/covers/cover/download');assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment/);
 assert.equal((await raw('/api/covers/cover/download','owner','HEAD')).status,200);
 f.sql.exec("UPDATE users SET premium_until=1 WHERE id='owner'");assert.equal((await raw('/api/covers/cover/download')).status,403);
});

test('free playback gets three adjacent cues while whole synchronized lyrics remain Premium',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET duration=100,lyrics_mode='synced',lyrics='[00:00]첫 줄\n[00:10]둘째 줄\n[00:20]셋째 줄\n[01:00]끝 줄' WHERE id='one'");
 const d=(await f.call('/api/tracks/one/lyrics/line?at=10')).body;assert.equal(d.lines.length,3);assert.equal(d.lines[1].active,true);
 assert.equal((await f.call('/api/tracks/one')).body.track.lyrics,'');
 const guest=(await f.call('/api/tracks/one/lyrics/line?at=59','GET',null,null)).body;assert.ok(guest.lines.every(l=>l.time<60));assert.equal((await f.call('/api/tracks/one/lyrics/line?at=60','GET',null,null)).status,401);
});
