import {rows,now} from './db.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {rankingPeriod} from './ranking-period.js';
import {CASTING_TTL} from './dubbing-casting.js';

export const eligibleDubFinal=(alias)=>`(${alias}.state='complete' AND (
 EXISTS(SELECT 1 FROM dubbing_combinations dc WHERE dc.project_id=${alias}.id AND dc.expired_at=0)
 OR EXISTS(SELECT 1 FROM dubbing_final_jobs j WHERE j.project_id=${alias}.id AND j.script_key=${alias}.script_key AND j.state='ready' AND j.output_key!='')
))`;
export const noBlockedDubCast=(alias)=>`NOT EXISTS(SELECT 1 FROM dubbing_recordings r JOIN user_blocks b ON (b.user_id=? AND b.blocked_id=r.user_id) OR (b.blocked_id=? AND b.user_id=r.user_id) WHERE r.project_id=${alias}.id)`;
// One aggregation per page. Respect publication, removal, blocking and casting expiry.
export async function dubbingDiscoveryCounts(env,projects,user){
 const roots=[...new Set(projects.map(p=>p.root_id||p.id))];
 if(!roots.length)return new Map();
 const at=now(),uid=user?.id||'';
 const data=await rows(env,`WITH versions AS (
  SELECT COALESCE(v.root_id,v.id) rootId,v.created,
   (v.root_id IS NOT NULL AND v.state IN ('recruiting','recording','in_progress','mixing') AND
    (c.project_id IS NULL OR (c.expired_at=0 AND c.last_participation>?))) active,
   ${eligibleDubFinal('v')} finished
  FROM dubbing_projects v JOIN users u ON u.id=v.owner_id
  LEFT JOIN dubbing_combinations c ON c.project_id=v.id
  WHERE COALESCE(v.root_id,v.id) IN (${roots.map(()=>'?').join(',')}) AND v.visibility='public' AND u.provider!='deleted' AND ${dubbingVisibleSQL('v')}
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=v.owner_id) OR (b.blocked_id=? AND b.user_id=v.owner_id))
  AND ${noBlockedDubCast('v')}
 ) SELECT rootId,SUM(active) activeCount,SUM(active AND created>=?) weeklyActiveCount,SUM(COALESCE(finished,0)) completedCount FROM versions GROUP BY rootId`,
  at-CASTING_TTL,...roots,uid,uid,uid,uid,rankingPeriod('week',at).from);
 return new Map(data.map(row=>[row.rootId,row]));
}
