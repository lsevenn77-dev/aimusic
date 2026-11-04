import {rows,one,now} from './db.js';
import {VISIBLE} from './catalog.js';
import {communityPeriod,workRankingData,scoreWorks} from './community-rankings.js';

// Owner-only MCP diagnostics. No event identities, writes, backfill or score overrides.
export async function rankingAudit(env,at=now()){
 const published=await rows(env,`SELECT t.id,t.title,t.cover_mode,t.duet_open,
  t.duet_parent_id IS NOT NULL has_parent,${VISIBLE()} visible,
  EXISTS(SELECT 1 FROM artists a WHERE a.id=t.artist_id) artist_exists,
  EXISTS(SELECT 1 FROM producers p WHERE p.id=t.producer_id) producer_exists,
  (SELECT count(*) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) lifetime_qualified,
  (SELECT max(started) FROM listens l WHERE l.track_id=t.id AND l.qualified=1) last_qualified_at
  FROM tracks t WHERE t.kind='cover' AND t.status='published' ORDER BY t.id LIMIT 50`);
 const count=await one(env,"SELECT count(*) n FROM tracks WHERE kind='cover' AND status='published'");
 const periods=[];
 for(const name of ['week','month']){
  const period=communityPeriod(name,at),candidates=[...await workRankingData(env,period,'work','solo'),...await workRankingData(env,period,'work','duet')];
  const activity=await rows(env,`SELECT t.id,
   (SELECT count(*) FROM listens l WHERE l.track_id=t.id AND l.started>=?1 AND l.started<?2) listen_events,
   (SELECT count(*) FROM listens l WHERE l.track_id=t.id AND l.started>=?1 AND l.started<?2 AND l.qualified=1) qualified_events,
   (SELECT count(*) FROM listens l WHERE l.track_id=t.id AND l.started>=?1 AND l.started<?2 AND l.qualified=1 AND l.user_id=t.user_id) self_qualified_events
   FROM tracks t WHERE t.kind='cover' AND t.status='published' ORDER BY t.id LIMIT 50`,period.from,period.until);
  periods.push({...period,candidate_count:candidates.length,ranked_count:scoreWorks(candidates).length,
   works:published.map(t=>{const candidate=candidates.find(r=>r.id===t.id);return {id:t.id,...activity.find(r=>r.id===t.id),eligible:!!candidate,
    metrics:candidate?Object.fromEntries(['listeners','completion','reactions','gold','silver'].map(k=>[k,candidate[k]])):null};})});
 }
 return {published_cover_count:count.n,truncated:count.n>published.length,published_covers:published,periods,
  aggregation:'Live reads from source ledgers; no ranking table or server ranking cache'};
}
