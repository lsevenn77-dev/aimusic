import {rows} from './db.js';
export const CHART_WEIGHTS=Object.freeze({plays:55,reactions:25,covers:20});
export const CHART_ORIGINAL=(t='t')=>`${t}.status='published' AND ${t}.kind='original' AND ${t}.original_id IS NULL AND ${t}.duet_parent_id IS NULL`;
export const chartPublication=(t='t')=>`COALESCE(NULLIF(${t}.first_published_at,0),${t}.created)`;
const human=user=>`NOT EXISTS(SELECT 1 FROM users bot WHERE bot.id=${user} AND bot.account_type='ai_bot')`;
const linkedCover=`cv.original_id=t.id AND cv.kind='cover' AND cv.status='published' AND t.karaoke_at>0 AND ((cv.cover_mode='solo' AND cv.duet_parent_id IS NULL) OR (cv.cover_mode='duet' AND cv.duet_parent_id IS NOT NULL AND cv.duet_open=0 AND EXISTS(SELECT 1 FROM tracks dp WHERE dp.id=cv.duet_parent_id AND dp.original_id=t.id AND dp.kind='cover' AND dp.status='published' AND dp.cover_mode='duet' AND dp.duet_parent_id IS NULL)))`;
const plays=(from,until)=>`SELECT count(DISTINCT l.listener||'|'||date(l.started,'unixepoch','+9 hours')) FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.listener!='' AND (l.user_id IS NULL OR l.user_id!=t.user_id) AND ${human('l.user_id')} AND l.started>${from} AND l.started<=${until}`;

// Normalize against the entire public original catalog BEFORE filters/limits.
// Gifts remain response metadata, but do not influence the 55/25/20 score.
// Like/save counts are unique fans across both actions. Cover activity is
// unique fan/KST day across all explicitly linked public completed covers.
export async function popularScores(env,period,where,args,limit=-1,kind='top'){
 const metricSQL=`WITH metrics AS (SELECT t.id,
  (${plays('?1-1','?2')}) chart_plays,
  (${plays('?2-604800','?2')}) chart_recent_plays,
  (${plays('?2-1209600','?2-604800')}) chart_prior_plays,
  (SELECT count(*) FROM likes l WHERE l.track_id=t.id AND l.user_id!=t.user_id AND ${human('l.user_id')} AND l.created BETWEEN ?1 AND ?2) chart_likes,
  (SELECT count(DISTINCT c.user_id) FROM comments c WHERE NOT EXISTS(SELECT 1 FROM users bot WHERE bot.id=c.user_id AND bot.account_type='ai_bot') AND c.track_id=t.id AND c.deleted_at=0 AND c.user_id!=t.user_id AND c.created BETWEEN ?1 AND ?2) chart_comments,
  (SELECT COALESCE(sum(gl.gold),0) FROM gifts g JOIN gift_lots gl ON gl.gift_id=g.id JOIN gold_purchases gp ON gp.id=gl.purchase_id WHERE g.track_id=t.id AND g.sender_id!=t.user_id AND gp.status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders go WHERE go.id=gp.id AND go.state!='paid') AND g.created BETWEEN ?1 AND ?2) chart_gold,
  (SELECT COALESCE(sum(g.silver),0) FROM free_gifts g WHERE g.track_id=t.id AND g.sender_id!=t.user_id AND g.created BETWEEN ?1 AND ?2) chart_stars,
  (SELECT count(DISTINCT fan) FROM (
   SELECT l.user_id fan FROM likes l WHERE l.track_id=t.id AND l.created BETWEEN ?1 AND ?2
   UNION SELECT p.user_id fan FROM playlist_tracks pt JOIN playlists p ON p.id=pt.playlist_id WHERE pt.track_id=t.id AND pt.created BETWEEN ?1 AND ?2
  ) WHERE fan!=t.user_id AND ${human('fan')}) chart_reactions,
  (SELECT count(*) FROM tracks cv WHERE ${linkedCover}) chart_covers,
  (SELECT count(DISTINCT fan_day) FROM (
   SELECT l.listener||'|'||date(l.started,'unixepoch','+9 hours') fan_day FROM listens l JOIN tracks cv ON cv.id=l.track_id
   WHERE ${linkedCover} AND l.qualified=1 AND l.listener!='' AND (l.user_id IS NULL OR l.user_id NOT IN (t.user_id,cv.user_id)) AND ${human('l.user_id')} AND l.started BETWEEN ?1 AND ?2
   UNION SELECT l.user_id||'|'||date(l.created,'unixepoch','+9 hours') FROM likes l JOIN tracks cv ON cv.id=l.track_id
   WHERE ${linkedCover} AND l.user_id NOT IN (t.user_id,cv.user_id) AND ${human('l.user_id')} AND l.created BETWEEN ?1 AND ?2
  )) chart_cover_reactions
  FROM tracks t WHERE ${CHART_ORIGINAL()}),
 totals AS (SELECT *,chart_gold+chart_stars chart_gifts,MAX(0,chart_recent_plays-chart_prior_plays) chart_growth,MAX(0,chart_recent_plays-chart_prior_plays)*1.0/MAX(5,chart_prior_plays) chart_growth_rate FROM metrics),
 scored AS (SELECT *,ROUND(
  COALESCE(55.0*chart_plays/NULLIF(MAX(chart_plays) OVER(),0),0)+
  COALESCE(25.0*chart_reactions/NULLIF(MAX(chart_reactions) OVER(),0),0)+
  COALESCE(20.0*chart_cover_reactions/NULLIF(MAX(chart_cover_reactions) OVER(),0),0),2) chart_score,
  COALESCE(50.0*chart_growth/NULLIF(MAX(chart_growth) OVER(),0),0)+COALESCE(50.0*chart_growth_rate/NULLIF(MAX(chart_growth_rate) OVER(),0),0) chart_rising_score FROM totals)
 SELECT r.* FROM scored r JOIN tracks t ON t.id=r.id JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id
 WHERE ${where}${kind==='releases'?` AND ${chartPublication()} BETWEEN ?2-2592000 AND ?2`:''}${kind==='rising'?' AND r.chart_growth>0':''}
 ORDER BY ${kind==='rising'?'r.chart_rising_score DESC,':''}r.chart_score DESC,r.chart_plays DESC,r.chart_likes DESC,t.created DESC,t.id LIMIT ${limit}`;
 return rows(env,metricSQL,period.from,period.until,...args);
}
