import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {CREW_GROWTH_LEVELS,growthLevel,crewPeriod} from '../shared/crew-growth.js';
import {syncCrewGrowth,crewGrowthView} from '../server/crew-growth.js';
const crew=f=>f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','크루',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0)");
const dub=f=>{f.sql.exec("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,state,visibility,role_count,duration,write_token,created,updated) VALUES('dub','other','더빙','{}','{}','script','hash','recording','public',2,30,'token',0,0);INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) VALUES('sound','dub','script','generated','{}','ready','sound.wav',0,0);INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES('dub','role','owner',0);INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated) VALUES('record','dub','role','owner','script','draft','token',0,0);INSERT INTO dubbing_recording_lines(recording_id,line_id,take_id,audio_key,audio_hash,duration,bytes,updated) VALUES('record','line','take','take.wav','hash',13,128,0)");};
test('open dubbing follows the profile recording, current script and unclaimed roles',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true'});dub(f);
 for(const viewer of ['owner','other',null]){const r=await f.call('/api/producers/producer/opportunities?type=dubbing','GET',null,viewer);assert.equal(r.status,200);assert.deepEqual(r.body.items.map(x=>x.id),['dub']);assert.equal(r.body.items[0].can_participate,viewer==='other');}
 f.sql.exec("UPDATE dubbing_recordings SET script_key='old'");assert.equal((await f.call('/api/producers/producer/opportunities?type=dubbing')).body.items.length,0);
 f.sql.exec("UPDATE dubbing_recordings SET script_key='script';INSERT INTO dubbing_role_claims VALUES('dub','role2','other',0)");assert.equal((await f.call('/api/producers/producer/opportunities?type=dubbing')).body.items.length,0);
});
test('dubbing ranking excludes incomplete, private and stale final renders',async t=>{
 const f=await fixture(t);dub(f);const at=Math.floor(Date.now()/1000);
 f.sql.prepare("INSERT INTO likes(user_id,dubbing_id,created) VALUES('owner','dub',?)").run(at);
 const rank=()=>f.call('/api/community/rankings?category=dubbing');assert.equal((await rank()).body.rows.length,0);
 f.sql.exec("UPDATE dubbing_projects SET state='complete';INSERT INTO dubbing_final_jobs(id,project_id,script_key,state,manifest_json,output_key,created,updated) VALUES('final','dub','script','ready','{}','final.wav',0,0)");assert.equal((await rank()).body.rows[0].id,'dub');
 f.sql.exec("UPDATE dubbing_projects SET visibility='private'");assert.equal((await rank()).body.rows.length,0);
 f.sql.exec("UPDATE dubbing_projects SET visibility='public';UPDATE dubbing_final_jobs SET script_key='old'");assert.equal((await rank()).body.rows.length,0);
});
test('all seven missions reward exactly once per KST period and retain earned levels',async t=>{
 const f=await fixture(t);crew(f);const start=Date.parse('2026-10-18T15:00:00Z')/1000,at=start+4*86400+3600;
 for(let i=0;i<5;i++){const uid='member'+i;f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(uid,uid+'@test.invalid',uid);f.sql.prepare("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew',?,'member',0)").run(uid);
 f.sql.prepare("INSERT INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,'crew',?,?,'work',?,?)").run('event'+i,uid,['one','two','three','one','two'][i],i<2?1:0,start+i*86400+10);}
 for(let i=0;i<3;i++){f.sql.prepare("INSERT INTO comments(id,track_id,user_id,body,created) VALUES(?,'one',?,?,?)").run('review'+i,'member'+i,'서로 다른 좋은 감상평 '+i,at);}
 await syncCrewGrowth({DB:f.DB},'crew',at);const total=f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp;
 assert.equal(total,530);assert.equal(f.sql.prepare('SELECT count(*) n FROM crew_xp').get().n,12);
 await Promise.all([syncCrewGrowth({DB:f.DB},'crew',at),syncCrewGrowth({DB:f.DB},'crew',at)]);assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,total);
 f.sql.exec('UPDATE crews SET highest_level=8');assert.equal((await crewGrowthView({DB:f.DB},'crew',at)).level,8);
});
test('leader transfer and service-only XP correction keep audit and idempotency',async t=>{
 const f=await fixture(t,{ADMIN_USER_IDS:'owner'});crew(f);const b={amount:300,reason:'로컬 검증 정정',request_id:'local-growth-request-001'};
 assert.equal((await f.call('/api/crews/crew/growth-adjustments','POST',b,'other')).status,403);
 assert.equal((await f.call('/api/crews/crew/growth-adjustments','POST',b)).status,200);assert.equal((await f.call('/api/crews/crew/growth-adjustments','POST',b)).status,200);assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,300);
 assert.equal((await f.call('/api/crews/crew/leadership','POST',{user_id:'other'})).status,200);assert.equal(f.sql.prepare("SELECT role FROM crew_members WHERE user_id='other'").get().role,'owner');assert.equal((await f.call('/api/crews/crew/leave','POST',{})).status,200);
});
test('profile opportunities use the visited owner and exclude closed/private/guest duets',async t=>{
 const f=await fixture(t);f.sql.exec("UPDATE tracks SET karaoke_at=1,performance_mode='duet' WHERE id='one';INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated) VALUES('one','job','ready',1,'ready',0,0);UPDATE tracks SET kind='cover',cover_mode='duet',duet_part='male',duet_open=1,original_id='one',original_key='ready' WHERE id IN ('two','three','hidden');UPDATE tracks SET duet_parent_id='two',duet_open=0 WHERE id='three'");
 for(const viewer of ['owner','other',null]){const r=await f.call('/api/producers/producer/opportunities?type=duet','GET',null,viewer);assert.equal(r.status,200);assert.deepEqual(r.body.items.map(x=>x.id),['two']);assert.equal(r.body.items[0].can_participate,viewer==='other');}
 f.sql.exec("UPDATE tracks SET duet_open=0 WHERE id='two'");assert.equal((await f.call('/api/producers/producer/opportunities')).body.items.length,0);
});
test('artist pins are owner-only, bounded to three and persist in public order',async t=>{
 const f=await fixture(t);for(let i=2;i<=4;i++)f.sql.prepare('INSERT INTO artists(id,producer_id,name,created) VALUES(?,?,?,0)').run('artist'+i,'producer','A'+i);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['artist']},'other')).status,403);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['artist','artist2','artist3','artist4']})).status,400);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['artist3','artist2','artist']})).status,200);
 const publicPins=await f.call('/api/producers/producer/pinned-artists','GET',null,null);assert.deepEqual(publicPins.body.ids,['artist3','artist2','artist']);
 assert.equal((await f.call('/api/producers/producer/pinned-artists','PUT',{ids:['foreign']})).status,403);
});
test('crew notices enforce staff, two pins, four owned images, soft delete and audit',async t=>{
 const f=await fixture(t);crew(f);const body={title:'공지',body:'새로운 크루 공지입니다.',is_pinned:true,images:[]};
 assert.equal((await f.call('/api/crews/crew/notices','POST',body,'other')).status,403);
 const first=await f.call('/api/crews/crew/notices','POST',body);assert.equal(first.status,200);
 assert.equal((await f.call('/api/crews/crew/notices','POST',body)).status,200);
 assert.equal((await f.call('/api/crews/crew/notices','POST',body)).status,409);
 assert.equal((await f.call('/api/crews/crew/notices','POST',{...body,images:['a','b','c','d','e']})).status,400);
 assert.equal((await f.call('/api/crews/crew/notices','POST',{...body,images:['foreign']})).status,403);
 f.sql.exec("UPDATE crew_members SET role='manager' WHERE user_id='other'");assert.equal((await f.call('/api/crews/crew/notices/'+first.body.id,'PATCH',{...body,title:'운영진 수정'},'other')).status,200);
 assert.equal((await f.call('/api/crews/crew/notices/'+first.body.id,'DELETE',null,'other')).status,200);
 assert.equal((await f.call('/api/crews/crew/notices')).body.items.length,1);assert.ok(f.sql.prepare('SELECT deleted_at FROM crew_notices WHERE id=?').get(first.body.id).deleted_at>0);
 f.sql.exec("UPDATE crews SET join_policy='invite_only'");assert.equal((await f.call('/api/crews/crew/notices','GET',null,null)).status,403);
 assert.equal((await f.call('/api/crews/crew/leave','POST',{})).status,409);
});
test('all ten crew level thresholds and KST day/week boundaries',()=>{
 for(const l of CREW_GROWTH_LEVELS){assert.equal(growthLevel(l.xp).level,l.level);assert.equal(growthLevel(l.xp).capacity,l.capacity);if(l.level>1)assert.equal(growthLevel(l.xp-1).level,l.level-1);}
 assert.equal(growthLevel(0,8).level,8);
 const monday=Date.parse('2026-10-25T15:00:00Z')/1000;assert.equal(crewPeriod(monday,'week').start,monday);assert.equal(crewPeriod(monday-1,'week').end,monday);assert.equal(crewPeriod(monday-1).end,monday);
});
test('mission XP is durable, idempotent and cannot be earned from chat/gold or duplicate audio',async t=>{
 const f=await fixture(t);crew(f);const at=Math.floor(Date.now()/1000),BUCKET={head:async()=>({etag:'same-recording'})};
 f.sql.prepare("UPDATE tracks SET original_key='source',created=? WHERE id IN ('one','two')").run(at);
 await syncCrewGrowth({DB:f.DB,BUCKET},'crew',at);await syncCrewGrowth({DB:f.DB,BUCKET},'crew',at);
 assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,30);assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_growth_events WHERE kind='work'").get().n,1);
 const g=await crewGrowthView({DB:f.DB},'crew',at);assert.equal(g.missions.find(m=>m.key==='daily_work').complete,true);
 const next=await crewGrowthView({DB:f.DB},'crew',at+86400);assert.equal(next.missions.find(m=>m.key==='daily_work').progress,0);
 assert.equal((await f.call('/api/crews/crew/messages','POST',{body:'대화는 경험치가 아니에요.',request_id:crypto.randomUUID()})).status,201);
 assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,30);
});
test('an old draft earns on first publication, but republication does not move its reward day',async t=>{
 const f=await fixture(t);crew(f);const at=Math.floor(Date.now()/1000),env={DB:f.DB,BUCKET:{head:async()=>({etag:'old-draft-content'})}};
 f.sql.exec("UPDATE tracks SET status='processing',first_published_at=0 WHERE id='hidden';UPDATE tracks SET status='published' WHERE id='hidden'");
 const published=f.sql.prepare("SELECT first_published_at FROM tracks WHERE id='hidden'").get().first_published_at;assert.ok(published>=at);
 await syncCrewGrowth(env,'crew',published);assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,30);
 f.sql.exec("UPDATE tracks SET status='hidden' WHERE id='hidden';UPDATE tracks SET status='published' WHERE id='hidden'");
 await syncCrewGrowth(env,'crew',published+86400);assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,30);assert.equal(f.sql.prepare("SELECT first_published_at FROM tracks WHERE id='hidden'").get().first_published_at,published);
});
test('crew capacity is atomically capped by level despite an arbitrary higher setting',async t=>{
 const f=await fixture(t);crew(f);f.sql.exec("UPDATE crews SET member_limit=150;DELETE FROM crew_members WHERE user_id='other'");
 for(let i=0;i<9;i++){f.sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run('u'+i,i+'@test.invalid','U'+i);f.sql.prepare("INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew',?,'member',0)").run('u'+i);}
 assert.equal((await f.call('/api/crews/crew')).body.crew.capacity,10);assert.equal((await f.call('/api/crews/crew/join','POST',{},'other')).status,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM crew_members').get().n,10);
});
