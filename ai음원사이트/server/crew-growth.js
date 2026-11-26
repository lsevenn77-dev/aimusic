import {rows,query,now} from './db.js';
import {originalKey} from './storage.js';
import {VISIBLE} from './catalog.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {CREW_MISSIONS,CREW_GROWTH_LEVELS,crewPeriod,growthLevel} from '../shared/crew-growth.js';

export const crewCapacitySQL=(alias='c')=>`CASE ${[...CREW_GROWTH_LEVELS].reverse().map(l=>`WHEN ${alias}.highest_level>=${l.level} OR (unixepoch()>=${alias}.growth_started+${l.min_days}*86400 AND COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=${alias}.id),0)>=${l.xp}) THEN ${l.capacity}`).join(' ')} ELSE 10 END`;

// Bound writes to the D1 statement limit; each batch is one remote round trip.
async function writeBatches(env,statements){
 for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
}
async function contentIdentities(env,keys){
 const result=new Map(),pending=[...new Set(keys)];let index=0;
 if(!env.BUCKET?.head)return result;
 await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
  while(index<pending.length){const key=pending[index++];result.set(key,(await env.BUCKET.head(key))?.etag);}
 }));
 return result;
}
const eventsQuery=(env,cid,start,at)=>query(env,`SELECT e.* FROM crew_growth_events e WHERE e.crew_id=? AND e.credited=1 AND e.created>=max(?,(SELECT growth_started FROM crews WHERE id=e.crew_id)) AND e.created<=? AND (e.kind!='review' OR EXISTS(SELECT 1 FROM comments co WHERE co.id=e.evidence_id AND co.deleted_at=0)) AND (EXISTS(SELECT 1 FROM tracks t WHERE t.id=e.source_id AND ${VISIBLE()}) OR EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=e.source_id AND p.visibility='public' AND p.state='complete' AND ${dubbingVisibleSQL()}))`,cid,start,at);

// Rewards remain durable before responding. No membership or viewer data is cached.
export async function syncCrewGrowth(env,cid,at=now()){
 const start=crewPeriod(at,'week').start-604800;
 const snapshot=await env.DB.batch([
  query(env,'SELECT growth_started FROM crews WHERE id=?',cid),
  query(env,`SELECT t.*,COALESCE(NULLIF(t.first_published_at,0),t.created) event_at,m.joined,dt.user_id partner FROM tracks t JOIN crew_members m ON m.user_id=t.user_id LEFT JOIN tracks dt ON dt.id=t.duet_parent_id WHERE m.crew_id=? AND COALESCE(NULLIF(t.first_published_at,0),t.created)>=max(m.joined,?,(SELECT growth_started FROM crews WHERE id=m.crew_id)) AND ${VISIBLE()} AND (t.kind='original' OR t.cover_mode='solo' OR (t.duet_parent_id IS NOT NULL AND t.duet_open=0)) AND NOT EXISTS(SELECT 1 FROM crew_growth_events e WHERE e.source_id=t.id AND e.kind='work')`,cid,start),
  query(env,`SELECT p.id,p.owner_id,p.updated,p.script_key,f.output_key FROM dubbing_projects p JOIN dubbing_final_jobs f ON f.project_id=p.id AND f.script_key=p.script_key AND f.state='ready' WHERE p.visibility='public' AND p.state='complete' AND ${dubbingVisibleSQL()} AND p.updated>=max(?,(SELECT growth_started FROM crews WHERE id=?)) AND EXISTS(SELECT 1 FROM crew_members m WHERE m.crew_id=? AND m.user_id=p.owner_id AND m.joined<=p.updated)`,start,cid,cid),
  query(env,`SELECT co.id,co.user_id,co.track_id,co.body,co.created FROM comments co JOIN tracks t ON t.id=co.track_id JOIN crew_members m ON m.user_id=co.user_id JOIN crew_members author ON author.user_id=t.user_id AND author.crew_id=m.crew_id WHERE m.crew_id=? AND co.created>=max(m.joined,?,(SELECT growth_started FROM crews WHERE id=m.crew_id)) AND co.deleted_at=0 AND co.user_id!=t.user_id AND ${VISIBLE()} AND length(trim(co.body))>=5 AND NOT EXISTS(SELECT 1 FROM crew_growth_events e WHERE e.user_id=co.user_id AND e.source_id=co.track_id AND e.kind='review')`,cid,start),
  eventsQuery(env,cid,start,at),
  query(env,'SELECT user_id,joined FROM crew_members WHERE crew_id=?',cid)
 ]);
 const crew=snapshot[0].results[0];if(!crew)return;
 const tracks=snapshot[1].results,dubs=snapshot[2].results,comments=snapshot[3].results,members=snapshot[5].results;
 const identities=await contentIdentities(env,[...tracks.map(originalKey),...dubs.map(p=>p.output_key)]);
 const pending=[];
 for(const t of tracks){
  const etag=identities.get(originalKey(t));if(!etag)continue;
  const collab=!!t.partner&&t.partner!==t.user_id&&members.some(m=>m.user_id===t.partner&&m.joined<=t.event_at);
  pending.push(query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,?,?,?,'work',?,?)",'audio:'+etag,cid,t.user_id,t.id,collab?1:0,t.event_at));
  if(collab)pending.push(query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) SELECT ?,?,?,?,'activity',0,? WHERE EXISTS(SELECT 1 FROM crew_growth_events WHERE source_id=? AND kind='work' AND crew_id=?)",'partner:'+t.id,cid,t.partner,t.id,t.event_at,t.id,cid));
 }
 for(const p of dubs){
  const etag=identities.get(p.output_key);if(!etag)continue;
  const participants="SELECT DISTINCT r.user_id FROM dubbing_recordings r JOIN crew_members m ON m.user_id=r.user_id WHERE r.project_id=? AND r.script_key=? AND r.state='submitted' AND m.crew_id=? AND m.joined<=?";
  pending.push(query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) VALUES(?,?,?,?,'work',(SELECT count(*)>=2 FROM ("+participants+")),?)",'audio:'+etag,cid,p.owner_id,p.id,p.id,p.script_key,cid,p.updated,p.updated));
  pending.push(query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,kind,collaboration,created) SELECT ?||participant.user_id,?,participant.user_id,?,'activity',0,? FROM ("+participants+") participant WHERE EXISTS(SELECT 1 FROM crew_growth_events WHERE source_id=? AND kind='work' AND crew_id=?)",'dub:'+p.id+':',cid,p.id,p.updated,p.id,p.script_key,cid,p.updated,p.id,cid));
 }
 for(const c of comments){const normalized=c.body.normalize('NFKC').replace(/\s+/g,'').toLowerCase();if(new Set(normalized).size<4)continue;const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.user_id+':'+normalized)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  pending.push(query(env,"INSERT OR IGNORE INTO crew_growth_events(id,crew_id,user_id,source_id,evidence_id,kind,collaboration,created) SELECT ?,?,?,?,?,'review',0,? WHERE NOT EXISTS(SELECT 1 FROM crew_growth_events WHERE user_id=? AND source_id=? AND kind='review')",'review:'+digest,cid,c.user_id,c.track_id,c.id,c.created,c.user_id,c.track_id));}
 await writeBatches(env,pending);
 const allEvents=pending.length?(await eventsQuery(env,cid,start,at).all()).results:snapshot[4].results,writes=[];
 for(const mission of CREW_MISSIONS){const periods=new Set([crewPeriod(at,mission.period).start,...allEvents.map(e=>crewPeriod(e.created,mission.period).start)]);for(const periodStart of periods){const period=crewPeriod(periodStart,mission.period),events=allEvents.filter(e=>e.created>=period.start&&e.created<period.end);
 const metrics={works:new Set(events.filter(e=>e.kind==='work').map(e=>e.source_id)).size,collabs:new Set(events.filter(e=>e.kind==='work'&&e.collaboration).map(e=>e.source_id)).size,members:new Set(events.map(e=>e.user_id)).size,reviewers:new Set(events.filter(e=>e.kind==='review').map(e=>e.user_id)).size,days:new Set(events.map(e=>crewPeriod(e.created).start)).size},progress=Math.min(mission.target,metrics[mission.metric]);
 writes.push(query(env,'INSERT INTO crew_missions(crew_id,mission_key,period_start,progress,target,reward) VALUES(?,?,?,?,?,?) ON CONFLICT(crew_id,mission_key,period_start) DO UPDATE SET progress=excluded.progress WHERE crew_missions.progress!=excluded.progress',cid,mission.key,period.start,progress,mission.target,mission.xp),query(env,"INSERT OR IGNORE INTO crew_xp(id,crew_id,user_id,amount,created) SELECT ?,c.id,c.owner_id,?,? FROM crews c WHERE c.id=? AND EXISTS(SELECT 1 FROM crew_missions WHERE crew_id=c.id AND mission_key=? AND period_start=? AND progress>=target)",'mission:'+cid+':'+mission.key+':'+period.start,mission.xp,Math.min(at,period.end-1),cid,mission.key,period.start));}}

 // Compute the retained level from the newly awarded XP in the same remote batch.
 const levels=[...CREW_GROWTH_LEVELS].reverse();
 const levelSQL="(SELECT CASE "+levels.map(l=>"WHEN xp>="+l.xp+" AND ?>=growth_started+"+l.min_days+"*86400 THEN "+l.level).join(' ')+" ELSE 1 END FROM (SELECT COALESCE(sum(amount),0) xp FROM crew_xp WHERE crew_id=crews.id))";
 writes.push(query(env,"UPDATE crews SET highest_level=max(highest_level,"+levelSQL+") WHERE id=?",...levels.map(()=>at),cid));
 await writeBatches(env,writes);
}
export const crewMissionQuery=(env,cid,at=now())=>query(env,'SELECT * FROM crew_missions WHERE crew_id=? AND period_start>=?',cid,crewPeriod(at,'week').start);
export function crewGrowthSnapshot(c,progress,at=now()){
 return {...growthLevel(c.xp,c.highest_level,c.growth_started,at),xp:c.xp,levels:CREW_GROWTH_LEVELS,missions:CREW_MISSIONS.map(m=>{const period=crewPeriod(at,m.period),p=progress.find(x=>x.mission_key===m.key&&x.period_start===period.start);return {...m,...period,progress:p?.progress||0,complete:(p?.progress||0)>=m.target};})};
}
export async function crewGrowthView(env,cid,at=now()){
 const [c,progress]=await env.DB.batch([query(env,'SELECT highest_level,growth_started,COALESCE((SELECT sum(amount) FROM crew_xp WHERE crew_id=crews.id),0) xp FROM crews WHERE id=?',cid),crewMissionQuery(env,cid,at)]);
 return crewGrowthSnapshot(c.results[0],progress.results,at);
}
// Also reconcile background publication on worker completion and scheduled maintenance.
export async function syncRecentCrewGrowth(env){
 const active=await rows(env,`SELECT DISTINCT m.crew_id FROM crew_members m WHERE EXISTS(SELECT 1 FROM tracks t WHERE t.user_id=m.user_id AND COALESCE(NULLIF(t.first_published_at,0),t.created)>=?) OR EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.owner_id=m.user_id AND p.updated>=?) OR EXISTS(SELECT 1 FROM comments co WHERE co.user_id=m.user_id AND co.created>=?)`,now()-1209600,now()-1209600,now()-1209600);
 for(const c of active)await syncCrewGrowth(env,c.crew_id);
}
