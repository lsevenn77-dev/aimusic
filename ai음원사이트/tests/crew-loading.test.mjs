import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {socialRoute} from '../server/social.js';

test('crew detail synchronizes XP and reads current permissions/music with durable mission synchronization',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
 const prepare=f.DB.prepare.bind(f.DB),batch=f.DB.batch.bind(f.DB);let batches=0,standalone=0,inBatch=false;
 f.DB.prepare=sql=>({bind(...args){const statement=prepare(sql).bind(...args);return Object.fromEntries(['first','all','run'].map(method=>[method,async()=>{if(!inBatch)standalone++;return statement[method]();}]));}});
 f.DB.batch=async statements=>{batches++;inBatch=true;try{return await batch(statements);}finally{inBatch=false;}};
 const get=async(user={id:'owner'},blocked=[])=>{
  const r=await socialRoute(new Request('https://aifect.test/api/crews/crew'),{DB:f.DB,AIFECT_BLOCKED:blocked},'/api/crews/crew',user);return r.json();
 };
 let d=await get();assert.ok(batches<=3);assert.equal(standalone,0,"an unchanged detail must not serialize standalone remote reads");assert.equal(d.crew.xp,0);assert.equal(d.membership.role,'owner');assert.equal(d.members.length,1);assert.equal(d.tracks.length,3,'public originals by current members are included');
 d=await get();assert.equal(d.crew.xp,0,'revisits cannot farm XP');
 assert.equal((await get(null)).membership,null,'guest never inherits membership');
 assert.equal((await get({id:'other'},['owner'])).tracks.length,0,'viewer blocks still filter music');
 f.sql.exec("DELETE FROM crew_members WHERE crew_id='crew'; INSERT INTO crew_bans(crew_id,user_id,created) VALUES('crew','owner',0)");
 d=await get();assert.equal(d.membership,null);assert.equal(d.banned,true);assert.equal(d.members.length,0);assert.equal(d.tracks.length,0);
});

test('crew detail still returns 404 for a missing crew',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/crews/missing')).status,404);
});

test('discovery summary omits unused music while home music and joined detail are preserved',async t=>{
 const f=await fixture(t);
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0)");
 const summary=(await f.call('/api/crews?summary=1')).body;
 assert.equal(summary.crews.length,1);assert.equal(summary.rankings.length,1);assert.equal(summary.mine,'crew');assert.deepEqual(summary.tracks,[]);
 assert.equal((await f.call('/api/crews')).body.tracks.length,3);
 assert.equal((await f.call('/api/crews?summary=1&home=1')).body.detail.tracks.length,3);
});

test('web crew works preserve real recruitment eligibility and the existing popular ordering',async t=>{
 const f=await fixture(t,{DUBBING_ENABLED:'true',DUBBING_RECORDING_ENABLED:'true',TRANSCODER_TOKEN:'fixture',BUCKET:{}});
 f.sql.exec(`
  INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0);
  INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0);
  INSERT INTO producers(id,user_id,name,created) VALUES('other-profile','other','Member',0);
  UPDATE tracks SET karaoke_at=1 WHERE id='one';
  INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,words_state,created,updated)
  VALUES('one','ready-mr','ready',1,'ready',0,0);
  INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id,cover_mode,duet_open,duet_part,original_key)
  VALUES('joinable','other','artist','other-profile','Duet','Rock','',1,'wav',1,1,'published','cover','one','duet',1,'male','audio'),
  ('unavailable','other','artist','other-profile','No audio','Rock','',1,'wav',1,2,'published','cover','one','duet',1,'male','');
  INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,state,visibility,role_count,duration,write_token,created,updated)
  VALUES('stage','other','Dubbing','{}','{}','script','fixture','recruiting','public',2,30,'fixture',1,1);
  INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated)
  VALUES('record','stage','role','other','script','submitted','fixture',1,1);
  INSERT INTO dubbing_recording_lines(recording_id,line_id,take_id,audio_key,audio_hash,duration,bytes,updated)
  VALUES('record','line','take','take.wav','fixture',1,10,1);
  INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES('stage','role','other',1);
  INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated)
  VALUES('sound','stage','script','generated','{}','ready','background.wav',1,1);
  INSERT INTO likes(user_id,track_id,created) VALUES('other','one',2);
 `);
 const path='/api/crews/crew?web=1';
 const r=await f.call(path);
 assert.equal(r.status,200);
 const joinable=r.body.tracks.find(t=>t.id==='joinable'),unavailable=r.body.tracks.find(t=>t.id==='unavailable');
 assert.equal(joinable.completions,0);
 assert.equal(joinable.can_join,true);
 assert.equal(unavailable.can_join,false);
 assert.equal(r.body.tracks.find(t=>t.id==='one').popular_rank,0,'existing likes beat a newer unliked work');
 assert.equal(r.body.dubbings[0].owner_profile_id,'other-profile');
 assert.equal(r.body.dubbings[0].can_join,true);
 const invited=await f.call('/api/crews?summary=1&home=1&web=1');
 assert.equal(invited.body.detail.dubbings[0].can_join,true);
 const guest=await f.call(path,'GET',undefined,null);
 assert.equal(guest.body.dubbings[0].can_join,false);
 const creator=await f.call(path,'GET',undefined,'other');
 assert.equal(creator.body.dubbings[0].can_join,false);
 f.sql.exec("INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES('stage','second','owner',1)");
 const full=await f.call(path);
 assert.equal(full.body.dubbings.length,0,'a full cast disappears from recruitment');
});
