import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {syncCrewGrowth,crewGrowthView} from '../server/crew-growth.js';
import {CREW_GROWTH_LEVELS,growthLevel} from '../shared/crew-growth.js';

function meter(f){
 const prepare=f.DB.prepare.bind(f.DB),batch=f.DB.batch.bind(f.DB),raw=new WeakMap();
 const stats={trips:0,maxBatch:0};
 f.DB.prepare=sql=>({bind(...args){const statement=prepare(sql).bind(...args),wrapper={};
  for(const method of ['first','all','run'])wrapper[method]=async()=>{stats.trips++;return statement[method]()};
  raw.set(wrapper,statement);return wrapper;
 }});
 f.DB.batch=async statements=>{stats.trips++;stats.maxBatch=Math.max(stats.maxBatch,statements.length);return batch(statements.map(s=>raw.get(s)||s))};
 return stats;
}
function crew(f){
 f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','Crew',0);INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','owner',0),('crew','other','member',0)");
}

test('many reviews are reconciled in bounded round trips and revisits cannot award again',async t=>{
 const f=await fixture(t);crew(f);const at=Math.floor(Date.now()/1000),stats=meter(f);
 const insert=f.sql.prepare("INSERT INTO comments(id,track_id,user_id,body,created) VALUES(?,'one','other',?,?)");
 for(let i=0;i<170;i++)insert.run('comment-'+i,'곡의 목소리와 반주가 좋아요 '+i,at);
 await syncCrewGrowth({DB:f.DB},'crew',at);
 assert.ok(stats.trips<=6,'review count must not cause one remote write per comment');
 assert.ok(stats.maxBatch<=80);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_growth_events WHERE kind='review'").get().n,1);
 stats.trips=0;await syncCrewGrowth({DB:f.DB},'crew',at);
 assert.equal(stats.trips,2,'unchanged missions need only snapshot and reward batch');
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_growth_events WHERE kind='review'").get().n,1);
});

test('storage checks have bounded parallelism, share keys and still reject missing identities',async t=>{
 const f=await fixture(t);crew(f);const at=Math.floor(Date.now()/1000);let active=0,peak=0;const heads=[];
 f.sql.prepare("UPDATE tracks SET created=?,original_key='shared-source' WHERE id IN ('one','two','three')").run(at);
 for(let i=0;i<8;i++)f.sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,original_key) VALUES(?,'owner','artist','producer','New work','Rock','QA',1,'wav',128,?,'published',?)").run('new-'+i,at,'source-'+i);
 const BUCKET={async head(key){heads.push(key);peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,2));active--;return key==='source-7'?null:{etag:key};}};
 await syncCrewGrowth({DB:f.DB,BUCKET},'crew',at);
 assert.ok(peak>1&&peak<=4,'storage requests must be concurrent but bounded');
 assert.equal(heads.filter(x=>x==='shared-source').length,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_growth_events WHERE kind='work' AND id='audio:shared-source'").get().n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_growth_events WHERE source_id='new-7'").get().n,0,'unverified audio earns no credit');
 const first=f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp;
 await syncCrewGrowth({DB:f.DB,BUCKET},'crew',at);
 assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,first);
});

test('batched finalized dubbing credits its current participants and stays idempotent',async t=>{
 const f=await fixture(t);crew(f);const at=Math.floor(Date.now()/1000);
 f.sql.prepare("INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,state,visibility,role_count,duration,write_token,created,updated) VALUES('dub','owner','Dubbing','{}','{}','script','hash','complete','public',2,30,'token',?,?)").run(at,at);
 f.sql.prepare("INSERT INTO dubbing_final_jobs(id,project_id,script_key,state,manifest_json,output_key,created,updated) VALUES('final','dub','script','ready','{}','final.wav',?,?)").run(at,at);
 for(const [role,uid] of [['first','owner'],['second','other']])f.sql.prepare("INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,created,updated) VALUES(?,'dub',?,?,'script','submitted','token',?,?)").run(role,role,uid,at,at);
 const env={DB:f.DB,BUCKET:{head:async()=>({etag:'dubbing-audio'})}};
 await syncCrewGrowth(env,'crew',at);
 assert.equal(f.sql.prepare("SELECT collaboration FROM crew_growth_events WHERE kind='work' AND source_id='dub'").get().collaboration,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM crew_growth_events WHERE kind='activity' AND source_id='dub'").get().n,2);
 assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,85);
 await syncCrewGrowth(env,'crew',at);
 assert.equal(f.sql.prepare('SELECT sum(amount) xp FROM crew_xp').get().xp,85);
 const view=await crewGrowthView(env,'crew',at);assert.equal(view.missions.find(m=>m.key==='daily_collab').complete,true);
});

test('persisted batched levels obey XP and maturity thresholds and never fall',async t=>{
 const f=await fixture(t);crew(f);const at=Math.floor(Date.now()/1000);
 for(const level of CREW_GROWTH_LEVELS){
  const started=at-level.min_days*86400;
  f.sql.prepare("UPDATE crews SET growth_started=?,highest_level=1 WHERE id='crew'").run(started);
  f.sql.exec("DELETE FROM crew_xp");
  f.sql.prepare("INSERT INTO crew_xp(id,crew_id,user_id,amount,created) VALUES('xp','crew','owner',?,?)").run(level.xp,at);
  await syncCrewGrowth({DB:f.DB},'crew',at);
  assert.equal(f.sql.prepare("SELECT highest_level FROM crews WHERE id='crew'").get().highest_level,growthLevel(level.xp,1,started,at).level);
  f.sql.exec("DELETE FROM crew_xp");await syncCrewGrowth({DB:f.DB},'crew',at);
  assert.equal(f.sql.prepare("SELECT highest_level FROM crews WHERE id='crew'").get().highest_level,level.level);
 }
});

