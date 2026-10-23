import {one,rows,query,now} from './db.js';
import {originalKey} from './storage.js';
import {VISIBLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {CREW_MISSIONS,CREW_GROWTH_LEVELS,crewPeriod,growthLevel} from '../shared/crew-growth.js';

export const crewCapacitySQL=(alias='c')=>`CASE ${[...CREW_GROWTH_LEVELS].reverse().map(l=>`WHEN ${alias}.highest_level>=${l.level} OR COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=${alias}.id),0)>=${l.xp} THEN ${l.capacity}`).join(' ')} ELSE 10 END`;
// Global content keys prevent a member moving/re-uploading the same recording from earning twice.
export async function syncCrewGrowth(env,cid,at=now()){
 const crew=await one(env,'SELECT growth_started FROM crews WHERE id=?',cid);if(!crew)return;
 const start=Math.max(crew.growth_started,crewPeriod(at,'week').start-604800);
 const tracks=await rows(env,`SELECT t.*,COALESCE(NULLIF(t.first_published_at,0),t.created) event_at,m.joined,dt.user_id partner FROM tracks t JOIN crew_members m ON m.user_id=t.user_id LEFT JOIN tracks dt ON dt.id=t.duet_parent_id WHERE m.crew_id=? AND COALESCE(NULLIF(t.first_published_at,0),t.created)>=max(m.joined,?) AND ${VISIBLE()} AND (t.kind='original' OR t.cover_mode='solo' OR (t.duet_parent_id IS NOT NULL AND t.duet_open=0)) AND NOT EXISTS(SELECT 1 FROM crew_growth_events e WHERE e.source_id=t.id AND e.kind='work')`,cid,start);
 for(const t of tracks){
  const object=env.BUCKET?.head?await env.BUCKET.head(originalKey(t)):null;
  // Fail closed: without a storage content identity a re-upload cannot be safely deduplicated.
  if(!object?.etag)continue;
  const collab=!!t.partner&&t.partner!==t.user_id&&!!await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=? AND joined<=?',cid,t.partner,t.event_at);
  await query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,?,?,?,'work',?,?)",'audio:'+object.etag,cid,t.user_id,t.id,collab?1:0,t.event_at).run();
  if(collab&&await one(env,'SELECT 1 FROM crew_growth_events WHERE source_id=? AND kind=\'work\' AND crew_id=?',t.id,cid))await query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,?,?,?,'activity',0,?)",'partner:'+t.id,cid,t.partner,t.id,t.event_at).run();
 }
 const dubs=await rows(env,`SELECT p.id,p.owner_id,p.updated,p.script_key,f.output_key FROM dubbing_projects p JOIN dubbing_final_jobs f ON f.project_id=p.id AND f.script_key=p.script_key AND f.state='ready' WHERE p.visibility='public' AND p.state='complete' AND ${dubbingVisibleSQL()} AND p.updated>=? AND EXISTS(SELECT 1 FROM crew_members m WHERE m.crew_id=? AND m.user_id=p.owner_id AND m.joined<=p.updated)`,start,cid);
 for(const p of dubs){const object=env.BUCKET?.head?await env.BUCKET.head(p.output_key):null;if(!object?.etag)continue;
  const members=await rows(env,"SELECT DISTINCT r.user_id FROM dubbing_recordings r JOIN crew_members m ON m.user_id=r.user_id WHERE r.project_id=? AND r.script_key=? AND r.state='submitted' AND m.crew_id=? AND m.joined<=?",p.id,p.script_key,cid,p.updated);
  await query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,?,?,?,'work',?,?)",'audio:'+object.etag,cid,p.owner_id,p.id,members.length>=2?1:0,p.updated).run();
  for(const m of members)if(await one(env,"SELECT 1 FROM crew_growth_events WHERE source_id=? AND kind='work' AND crew_id=?",p.id,cid))await query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,?,?,?,'activity',0,?)",'dub:'+p.id+':'+m.user_id,cid,m.user_id,p.id,p.updated).run();
 }
 const comments=await rows(env,`SELECT co.id,co.user_id,co.track_id,co.body,co.created FROM comments co JOIN tracks t ON t.id=co.track_id JOIN crew_members m ON m.user_id=co.user_id JOIN crew_members author ON author.user_id=t.user_id AND author.crew_id=m.crew_id WHERE m.crew_id=? AND co.created>=max(m.joined,?) AND co.deleted_at=0 AND co.user_id!=t.user_id AND ${VISIBLE()} AND length(trim(co.body))>=5`,cid,start);
 for(const c of comments){const normalized=c.body.normalize('NFKC').replace(/\s+/g,'').toLowerCase();if(new Set(normalized).size<4)continue;const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.user_id+':'+normalized)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  await query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,evidence_id,kind,collaboration,created) SELECT ?,?,?,?,?,'review',0,? WHERE NOT EXISTS(SELECT 1 FROM crew_growth_events WHERE user_id=? AND source_id=? AND kind='review')",'review:'+digest,cid,c.user_id,c.track_id,c.id,c.created,c.user_id,c.track_id).run();}
 const allEvents=await rows(env,`SELECT e.* FROM crew_growth_events e WHERE e.crew_id=? AND e.created>=? AND e.created<=? AND (e.kind!='review' OR EXISTS(SELECT 1 FROM comments co WHERE co.id=e.evidence_id AND co.deleted_at=0)) AND (EXISTS(SELECT 1 FROM tracks t WHERE t.id=e.source_id AND ${VISIBLE()}) OR EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=e.source_id AND p.visibility='public' AND p.state='complete' AND ${dubbingVisibleSQL()}))`,cid,start,at),writes=[];
 for(const mission of CREW_MISSIONS){const periods=new Set([crewPeriod(at,mission.period).start,...allEvents.map(e=>crewPeriod(e.created,mission.period).start)]);for(const periodStart of periods){const period=crewPeriod(periodStart,mission.period),events=allEvents.filter(e=>e.created>=period.start&&e.created<period.end);
 const metrics={works:new Set(events.filter(e=>e.kind==='work').map(e=>e.source_id)).size,collabs:new Set(events.filter(e=>e.kind==='work'&&e.collaboration).map(e=>e.source_id)).size,members:new Set(events.map(e=>e.user_id)).size,reviewers:new Set(events.filter(e=>e.kind==='review').map(e=>e.user_id)).size,days:new Set(events.map(e=>crewPeriod(e.created).start)).size},progress=Math.min(mission.target,metrics[mission.metric]);
 writes.push(query(env,'INSERT INTO crew_missions(crew_id,mission_key,period_start,progress,target,reward) VALUES(?,?,?,?,?,?) ON CONFLICT(crew_id,mission_key,period_start) DO UPDATE SET progress=excluded.progress',cid,mission.key,period.start,progress,mission.target,mission.xp),query(env,"INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT ?,c.id,c.owner_id,?,? FROM crews c WHERE c.id=? AND EXISTS(SELECT 1 FROM crew_missions WHERE crew_id=c.id AND mission_key=? AND period_start=? AND progress>=target)",'mission:'+cid+':'+mission.key+':'+period.start,mission.xp,Math.min(at,period.end-1),cid,mission.key,period.start));}}
 if(writes.length)await env.DB.batch(writes);
 const total=await one(env,'SELECT COALESCE(sum(amount),0) xp FROM crew_xp WHERE crew_id=?',cid);
 await query(env,'UPDATE crews SET highest_level=max(highest_level,?) WHERE id=?',growthLevel(total.xp).level,cid).run();
}
export async function crewGrowthView(env,cid,at=now()){
 const c=await one(env,'SELECT highest_level,COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0) xp FROM crews WHERE id=?',cid);
 const progress=await rows(env,'SELECT * FROM crew_missions WHERE crew_id=? AND period_start>=?',cid,crewPeriod(at,'week').start);
 return {...growthLevel(c.xp,c.highest_level),xp:c.xp,levels:CREW_GROWTH_LEVELS,missions:CREW_MISSIONS.map(m=>{const period=crewPeriod(at,m.period),p=progress.find(x=>x.mission_key===m.key&&x.period_start===period.start);return {...m,...period,progress:p?.progress||0,complete:(p?.progress||0)>=m.target};})};
}

// Also reconcile background publication on worker completion and scheduled maintenance.
export async function syncRecentCrewGrowth(env){
 const active=await rows(env,`SELECT DISTINCT m.crew_id FROM crew_members m WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.user_id=m.user_id AND COALESCE(NULLIF(t.first_published_at,0),t.created)>=?) OR EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.owner_id=m.user_id AND p.updated>=?) OR EXISTS(SELECT 1 FROM comments co WHERE co.user_id=m.user_id AND co.created>=?)`,now()-1209600,now()-1209600,now()-1209600);
 for(const c of active)await syncCrewGrowth(env,c.crew_id);
}
