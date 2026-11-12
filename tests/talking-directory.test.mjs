import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './live-karaoke-fixture.mjs';
import {hash} from '../server/auth.js';
import {fixture} from './fixture.mjs';

const path='/api/voice/public-rooms?limit=24';

test('one directory request also reports unavailable voice service without contacting it',async t=>{
 const f=await fixture(t);
 const result=await f.call(path,'GET',undefined,null);
 assert.equal(result.status,200);
 assert.deepEqual(result.body,{enabled:false,rooms:[],next_cursor:null,crews:[]});
});
test('talking directory returns only followed current members, public rooms and verified cover artwork',async t=>{
 const f=await liveFixture(t);
 f.sql.exec("UPDATE producers SET image_version='host-photo' WHERE id='producer'; INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','producer',0)");
 f.sql.exec("INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at) VALUES('theme','owner','theme_aurora_night','decoration','directory-test',0,unixepoch()+600)");
 const r=await f.create({mode:'talk',title:'Only here',background:'theme_aurora_night',max_members:12});
 await f.create({mode:'karaoke'});await f.create({mode:'talk',visibility:'private'});
 for(let i=0;i<6;i++){
  const uid='guest-'+i,pid='profile-'+i;
  f.sql.prepare("INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)").run(uid,uid+'@example.test',uid);
  f.sql.prepare("INSERT INTO producers(id,user_id,name,created,image_version) VALUES(?,?,?,0,?)").run(pid,uid,uid,'v'+i);
  f.sql.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,unixepoch()+300)').run(await hash(uid),uid);
  f.sql.prepare("INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer',?,0)").run(pid);
  if(i!==5)await f.join(r,uid); // A follow outside this room must never appear.
 }
 await f.join(r,'other'); // A present non-followed listener also stays out of the badges.
 const read=async(user='owner')=>(await f.call(path,'GET',undefined,user)).body;
 const result=await read();assert.equal(result.enabled,true);assert.equal(result.next_cursor,null);assert.equal(result.rooms.length,1);
 const card=result.rooms[0];assert.equal(card.member_count,7);assert.equal(card.max_members,12);
 assert.deepEqual(card.host_profile,{name:card.host_name,profile_id:'producer',user_id:'owner',image_version:'host-photo'});
 assert.equal(card.followed_count,5);assert.equal(card.followed_profiles.length,3);
 assert.deepEqual(card.followed_profiles.map(p=>p.profile_id),['profile-0','profile-1','profile-2']);
 assert.equal(card.followed_profiles[0].image_version,'v0');assert.ok(!('member_ids' in card));
 assert.match(card.theme.assets.roomCard,/theme_aurora_night/);
 const guest=(await read(null)).rooms[0];assert.deepEqual(guest.followed_profiles,[]);assert.equal(guest.followed_count,0);
 await f.call(r.root+'leave','POST',{generation:r.room.data.members['guest-0'].generation},'guest-0');
 assert.equal((await read()).rooms[0].followed_count,4);
 await f.call('/api/producers/profile-1/follow','DELETE');
 assert.equal((await read()).rooms[0].followed_count,3);
 f.sql.exec("UPDATE player_inventory SET revoked=1 WHERE id='theme'");
 assert.equal((await read()).rooms[0].theme.sku,'basic_dark');
 assert.equal(f.sql.prepare('SELECT sku FROM room_decorations WHERE room_id=?').get(card.id).sku,'basic_dark');
});

test('cursor remains stable across ties and newer rooms, and search beyond the old cap skips unrelated presence',async t=>{
 const f=await liveFixture(t);
 const target=await f.create({mode:'talk',title:'Deep target',max_members:10});
 const second=await f.create({mode:'talk',title:'Another room'});
 f.roomSql.prepare('UPDATE voice_rooms SET created=5').run();
 // Closed/stale candidates before the target simulate an older directory.
 const insert=f.roomSql.prepare("INSERT INTO voice_rooms(id,title,host_id,visibility,created) VALUES(?,?,?,'public',?)");
 for(let i=0;i<106;i++)insert.run('old-'+i,'Unrelated','old-host',i+10);
 let cursor='',requests=0;const found=[];
 do{
  const result=await f.call(path+'&q=target'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
  assert.equal(result.status,200);requests++;cursor=result.body.next_cursor;found.push(...result.body.rooms);
 }while(cursor&&requests<5);
 assert.equal(requests,2);assert.deepEqual(found.map(r=>r.id),[target.state.room.id]);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/cards')).length,1);
 assert.deepEqual(f.calls.find(c=>c.path.endsWith('/cards')).body.input.ids,[target.state.room.id]);
 f.roomSql.exec("DELETE FROM voice_rooms WHERE host_id='old-host'");
 const first=await f.call('/api/voice/public-rooms?limit=1&q=QA');
 assert.equal(first.body.rooms.length,1);assert.ok(first.body.next_cursor);
 await f.create({mode:'talk',title:'Newest'});
 const last=await f.call('/api/voice/public-rooms?limit=1&q=QA&cursor='+encodeURIComponent(first.body.next_cursor));
 assert.equal(last.body.next_cursor,null);
 assert.deepEqual(new Set([...first.body.rooms,...last.body.rooms].map(r=>r.id)),new Set([target.state.room.id,second.state.room.id]));
 assert.equal((await f.call(path+'&cursor=broken')).status,400);
 assert.equal((await f.call('/api/voice/public-rooms?limit=100')).status,400);
 assert.ok((await f.call('/api/voice/public-rooms')).body.rooms.length>=3);
});

test('mixed public directory honors mode, presence, search and privacy on first load and refresh',async t=>{
 const f=await liveFixture(t);
 const sing=await f.create({mode:'karaoke',title:'같이 노래해요',max_members:9});
 const talk=await f.create({mode:'talk',title:'같이 이야기해요'});
 const hidden=await f.create({mode:'karaoke',visibility:'private'});
 f.sql.exec("INSERT INTO follows(user_id,kind,target_id,created) VALUES('owner','producer','friend',0)");
 const member=await f.join(sing,'other');
 const read=async(params,viewer='owner')=>(await f.call(path+'&'+new URLSearchParams(params),'GET',undefined,viewer)).body.rooms;
 const all=await read({mode:'all',q:'같이'});
 assert.deepEqual(all.map(r=>r.mode).sort(),['karaoke','talk']);
 const [card]=await read({mode:'karaoke',q:'같이'});
 assert.equal(card.id,sing.state.room.id);assert.equal(card.member_count,2);assert.equal(card.max_members,9);
 assert.deepEqual(card.followed_profiles.map(p=>p.profile_id),['friend']);
 assert.equal((await read({mode:'all',ids:card.id},null))[0].followed_count,0);
 assert.deepEqual(await read({mode:'talk',ids:card.id}),[]);
 assert.deepEqual(await read({mode:'all',ids:hidden.state.room.id}),[]);
 assert.deepEqual((await read({mode:'talk',q:card.host_name})).map(r=>r.id),[talk.state.room.id]);
 await f.call(sing.root+'leave','POST',{generation:member.generation},'other');
 const [updated]=await read({mode:'all',ids:card.id});
 assert.equal(updated.member_count,1);assert.equal(updated.followed_count,0);assert.ok(!('member_ids' in updated));
 assert.equal((await f.call(path+'&mode=unknown')).status,400);
 assert.equal((await f.call(path+'&ids=broken!')).status,400);
});
