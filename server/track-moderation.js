import {one,rows,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isTrackModerator} from './auth.js';
import {published,VISIBLE} from './catalog.js';
import {producerNameSQL} from './identity.js';

export const INACTIVE_DAYS=60,QUALITY_REPORT_THRESHOLD=3;
const metrics=`SELECT t.id,t.title,t.kind,t.status,t.created,t.producer_id,${producerNameSQL()} producer,
 COALESCE((SELECT max(l.started) FROM listens l WHERE l.track_id=t.id AND l.qualified=1),0) last_played,
 (SELECT count(*) FROM track_reports r WHERE r.track_id=t.id AND r.reason='low_quality') report_count
 FROM tracks t JOIN producers p ON p.id=t.producer_id`;
function reasons(t,cutoff){return [...(t.created<=cutoff&&t.last_played<=cutoff?['inactive']:[]),...(t.report_count>=QUALITY_REPORT_THRESHOLD?['low_quality']:[])];}

export async function trackModerationRoute(req,env,path,user){
 let m=path.match(/^\/api\/tracks\/([\w-]+)\/report$/);
 if(m){
  requireUser(user);if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  const t=await published(env,m[1]);if(t.user_id===user.id)fail(400,'내 곡은 신고할 수 없습니다.');
  const b=await req.json();if(b.reason!=='low_quality')fail(400,'음질 문제 신고를 선택해주세요.');
  const details=str(b.details||'',500,false);
  if(await one(env,'SELECT id FROM track_reports WHERE track_id=? AND user_id=?',t.id,user.id))return json({ok:true,reported:true});
  await rate(env,'track-report:'+user.id,20,3600);
  await run(env,'INSERT OR IGNORE INTO track_reports(id,track_id,user_id,reason,details,created) VALUES(?,?,?,?,?,?)',id(),t.id,user.id,b.reason,details,now());
  return json({ok:true,reported:true},201);
 }
 if(!path.startsWith('/api/admin/track-review'))return null;
 requireUser(user);if(!isTrackModerator(env,user))fail(403,'음원 운영자만 확인할 수 있습니다.');
 const cutoff=now()-INACTIVE_DAYS*86400;
 if(path==='/api/admin/track-review'&&req.method==='GET'){
  const url=new URL(req.url),view=url.searchParams.get('view')||'candidates',q=str(url.searchParams.get('q')||'',100,false);
  if(!['candidates','all','removed'].includes(view))fail(400,'검토 목록을 확인해주세요.');
  const args=[],clauses=[view==='removed'?"t.status='removed'":VISIBLE()];
  if(q){clauses.push('(t.title LIKE ? OR '+producerNameSQL()+' LIKE ?)');args.push('%'+q+'%','%'+q+'%');}
  if(view==='candidates')clauses.push(`((t.created<=? AND NOT EXISTS(SELECT 1 FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.started>?)) OR (SELECT count(*) FROM track_reports r WHERE r.track_id=t.id AND r.reason='low_quality')>=?)`),args.push(cutoff,cutoff,QUALITY_REPORT_THRESHOLD);
  const tracks=await rows(env,`${metrics} WHERE ${clauses.join(' AND ')} ORDER BY t.created,t.id LIMIT 101`,...args),has_more=tracks.length>100;
  tracks.length=Math.min(tracks.length,100);
  return json({tracks:tracks.map(t=>({...t,reasons:reasons(t,cutoff)})),has_more,view,q,inactive_days:INACTIVE_DAYS,report_threshold:QUALITY_REPORT_THRESHOLD,automatic_actions:false});
 }
 m=path.match(/^\/api\/admin\/track-review\/([\w-]+)(?:\/(visibility))?$/);
 if(!m)fail(404,'음원 검토 페이지를 찾을 수 없습니다.');
 const t=await one(env,`${metrics} WHERE t.id=?`,m[1]);if(!t)fail(404,'음원을 찾을 수 없습니다.');
 if(!m[2]&&req.method==='GET')return json({track:{...t,reasons:reasons(t,cutoff)},reports:await rows(env,'SELECT id,reason,details,created FROM track_reports WHERE track_id=? ORDER BY created DESC LIMIT 100',t.id)});
 if(m[2]&&req.method==='POST'){
  const b=await req.json();if(!['remove','restore'].includes(b.action))fail(400,'처리 방식을 확인해주세요.');
  const removing=b.action==='remove',from=removing?'published':'removed',to=removing?'removed':'published';
  if(t.status===to)return json({ok:true,status:to});
  if(t.status!==from)fail(409,'공개 또는 운영자 제거 상태의 음원만 변경할 수 있어요.');
  const note=str(b.note||'',500,false);
  // Manual actions only. Keep audio, playback and financial ledgers so an operator can restore the song.
  await env.DB.batch([
   query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tracks WHERE id=? AND status=?)',id(),user.id,'track:'+b.action,JSON.stringify({track_id:t.id,title:t.title,note}),now(),t.id,from),
   query(env,'UPDATE tracks SET status=?,lease_token=NULL,lease_until=0 WHERE id=? AND status=?',to,t.id,from)
  ]);
  const status=(await one(env,'SELECT status FROM tracks WHERE id=?',t.id)).status;if(status!==to)fail(409,'곡의 상태가 변경되었어요. 목록을 새로 확인해주세요.');
  return json({ok:true,status});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
