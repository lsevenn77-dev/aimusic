import {one,run} from './db.js';
import {popularScores} from './popular-chart.js';
export const chartDay=at=>new Date((at+32400)*1000).toISOString().slice(0,10);
export function rankChanges(current,previous){
 const before=previous===null?null:new Map(previous.map((id,i)=>[id,i+1]));
 return current.map((row,i)=>{const rank=i+1,prior=before?.get(row.id),change=prior==null?null:prior-rank;return {...row,chart_rank:rank,previous_rank:prior??null,rank_change:change,chart_movement:!before?'unavailable':prior==null?'new':change>0?'up':change<0?'down':'same'};});
}
// Snapshot the complete public top 100, independent of viewer filters and limits.
// Yesterday is frozen; today's latest observation becomes tomorrow's baseline.
export async function dailyChart(env,period){
 const day=chartDay(period.until),previousDay=chartDay(period.until-86400);
 const [scores,previous,current]=await Promise.all([
  popularScores(env,period,"t.status='published' AND t.kind='original'",[],100),
  one(env,'SELECT ranks_json,captured FROM chart_daily_snapshots WHERE day=? AND period=?',previousDay,period.period),
  one(env,'SELECT captured FROM chart_daily_snapshots WHERE day=? AND period=?',day,period.period)
 ]);
 if(!current||current.captured<=period.until-60)await run(env,`INSERT INTO chart_daily_snapshots(day,period,captured,ranks_json) VALUES(?,?,?,?) ON CONFLICT(day,period) DO UPDATE SET captured=excluded.captured,ranks_json=excluded.ranks_json WHERE chart_daily_snapshots.captured<excluded.captured`,day,period.period,period.until,JSON.stringify(scores.map(t=>t.id)));
 return {tracks:rankChanges(scores,previous?JSON.parse(previous.ranks_json):null),comparison:{date:previousDay,available:!!previous,captured_at:previous?.captured??null}};
}
