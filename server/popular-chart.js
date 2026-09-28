import {rows} from './db.js';
export const CHART_WEIGHTS=Object.freeze({plays:50,likes:25,comments:15,gifts:10});

// Normalize against the entire public original catalog BEFORE filters/limits.
// Gift lots are the authoritative source for paid, unrefunded gold allocations.
export async function popularScores(env,period,where,args,limit){
 const metricSQL=`WITH metrics AS (SELECT t.id,
  (SELECT count(DISTINCT l.listener||'|'||date(l.started,'unixepoch','+9 hours')) FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND (l.user_id IS NULL OR l.user_id!=t.user_id) AND l.started BETWEEN ?1 AND ?2) chart_plays,
  (SELECT count(*) FROM likes l WHERE l.track_id=t.id AND l.user_id!=t.user_id AND l.created BETWEEN ?1 AND ?2) chart_likes,
  (SELECT count(DISTINCT c.user_id) FROM comments c WHERE c.track_id=t.id AND c.deleted_at=0 AND c.user_id!=t.user_id AND c.created BETWEEN ?1 AND ?2) chart_comments,
  (SELECT COALESCE(sum(gl.gold),0) FROM gifts g JOIN gift_lots gl ON gl.gift_id=g.id JOIN gold_purchases gp ON gp.id=gl.purchase_id WHERE g.track_id=t.id AND g.sender_id!=t.user_id AND gp.status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders go WHERE go.id=gp.id AND go.state!='paid') AND g.created BETWEEN ?1 AND ?2) chart_gold,
  (SELECT count(*) FROM free_gifts g WHERE g.track_id=t.id AND g.sender_id!=t.user_id AND g.created BETWEEN ?1 AND ?2) chart_stars
  FROM tracks t WHERE t.status='published' AND t.kind='original'),
 totals AS (SELECT *,chart_gold+chart_stars chart_gifts FROM metrics),
 scored AS (SELECT *,ROUND(
  COALESCE(50.0*chart_plays/NULLIF(MAX(chart_plays) OVER(),0),0)+
  COALESCE(25.0*chart_likes/NULLIF(MAX(chart_likes) OVER(),0),0)+
  COALESCE(15.0*chart_comments/NULLIF(MAX(chart_comments) OVER(),0),0)+
  COALESCE(10.0*chart_gifts/NULLIF(MAX(chart_gifts) OVER(),0),0),2) chart_score FROM totals)
 SELECT r.* FROM scored r JOIN tracks t ON t.id=r.id JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id
 WHERE ${where} ORDER BY r.chart_score DESC,r.chart_plays DESC,r.chart_likes DESC,t.created DESC,t.id LIMIT ${limit}`;
 return rows(env,metricSQL,period.from,period.until,...args);
}
