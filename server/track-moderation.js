import * as AifectMessages from '../shared/system-messages.js';
import {one,rows,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isTrackModerator,isAdmin,hash} from './auth.js';
import {published,VISIBLE} from './catalog.js';
import {producerNameSQL} from './identity.js';
import {INACTIVE_DAYS,QUALITY_REPORT_THRESHOLD,pendingQualityReportsSQL,trackReviewCandidates,trackReviewFrom,REVIEW_PAGE_SIZE,reviewCursor,reviewPage} from './review-queues.js';
import {closeDeletedContentReports} from './deleted-content-reports.js';

const metrics=`SELECT t.id,t.title,t.kind,t.status,t.created,t.producer_id,${producerNameSQL()} producer,
 COALESCE((SELECT max(l.started) FROM listens l WHERE l.track_id=t.id AND l.qualified=1),0) last_played,
 (SELECT count(*) FROM track_reports r WHERE r.track_id=t.id AND r.reason='low_quality') report_count,
 ${pendingQualityReportsSQL} pending_report_count
 ${trackReviewFrom}`;
function reasons(t,cutoff){return [...(t.created<=cutoff&&t.last_played<=cutoff?['inactive']:[]),...(t.pending_report_count>=QUALITY_REPORT_THRESHOLD?['low_quality']:[])];}

export async function trackModerationRoute(req,env,path,user){
 let m=path.match(/^\/api\/tracks\/([\w-]+)\/report$/);
 if(m){
  requireUser(user);if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);
  const t=await published(env,m[1]);if(t.user_id===user.id)fail(400,'내 곡은 신고할 수 없습니다.');
  const b=await req.json();if(b.reason!=='low_quality')fail(400,'음원 문제 신고를 선택해 주세요.');
  const details=str(b.details||'',500,false);
  if(await one(env,'SELECT id FROM track_reports WHERE track_id=? AND user_id=?',t.id,user.id))return json({ok:true,reported:true});
  await rate(env,'track-report:'+user.id,20,3600);
  const report=await query(env,`INSERT INTO track_reports(id,track_id,user_id,reason,details,created)
   SELECT ?,t.id,?,?,?,? FROM tracks t WHERE t.id=? AND ${VISIBLE()}
   ON CONFLICT(track_id,user_id) DO NOTHING RETURNING id`,id(),user.id,b.reason,details,now(),t.id).first();
  if(!report)await published(env,t.id);
  return json({ok:true,reported:true},report?201:200);
 }
 if(!path.startsWith('/api/admin/track-review'))return null;
 requireUser(user);if(!isTrackModerator(env,user))fail(403,'음원 운영자만 확인할 수 있습니다.');
 if(path==='/api/admin/track-review/covers/purge'){
  if(!isAdmin(env,user))fail(403,'관리자만 전체 커버곡을 삭제할 수 있습니다.');
  const tracks=await rows(env,"SELECT id,title,status,user_id FROM tracks WHERE kind='cover' AND status!='deleted' ORDER BY id");
  const snapshot=await hash(JSON.stringify(tracks));
  if(req.method==='GET')return json({tracks,count:tracks.length,snapshot});
  if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);
  const b=await req.json();if(b.snapshot!==snapshot||b.count!==tracks.length||b.confirm!=='DELETE_ALL_COVERS')fail(409,'삭제 대상이 변경됐습니다. 목록을 다시 확인해 주세요.');
  if(!tracks.length)return json({deleted:0});
  const ids=JSON.stringify(tracks.map(t=>t.id)),audit=id(),at=now();
  await env.DB.batch([
   query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)",audit,user.id,'covers:delete-all',JSON.stringify({tracks}),at),
   query(env,"UPDATE tracks SET uploaded_at=CASE WHEN status='uploading' AND uploaded_at=0 THEN -1 ELSE uploaded_at END,status='deleted',lease_token=NULL,lease_until=0,error=NULL WHERE kind='cover' AND id IN (SELECT value FROM json_each(?))",ids),
   ...closeDeletedContentReports(env,'track',"t.kind='cover' AND t.id IN (SELECT value FROM json_each(?))",[ids],user.id,at),
   query(env,'DELETE FROM lyric_jobs WHERE track_id IN (SELECT value FROM json_each(?))',ids),
   query(env,'DELETE FROM karaoke_jobs WHERE track_id IN (SELECT value FROM json_each(?))',ids)
  ]);
  return json({deleted:tracks.length,audit});
 }
 const candidates=trackReviewCandidates(now()),cutoff=candidates.cutoff;
 if(path==='/api/admin/track-review'&&req.method==='GET'){
  const url=new URL(req.url),view=url.searchParams.get('view')||'candidates',q=str(url.searchParams.get('q')||'',100,false);
  if(!['candidates','all','removed'].includes(view))fail(400,'검토 목록을 확인해 주세요.');
  const args=view==='candidates'?[...candidates.args]:[];
  const clauses=[view==='candidates'?candidates.where:view==='removed'?"t.status='removed'":VISIBLE()];
  if(q){clauses.push('(t.title LIKE ? OR '+producerNameSQL()+' LIKE ?)');args.push('%'+q+'%','%'+q+'%');}
  const cursor=reviewCursor(url.searchParams,'t');
  const {items,...page}=reviewPage(await rows(env,`${metrics} WHERE ${clauses.join(' AND ')} ${cursor.where}
   ORDER BY t.created,t.id LIMIT ?`,...args,...cursor.args,REVIEW_PAGE_SIZE+1));
  return json({tracks:items.map(t=>({...t,reasons:reasons(t,cutoff)})),...page,view,q,inactive_days:INACTIVE_DAYS,report_threshold:QUALITY_REPORT_THRESHOLD,automatic_actions:false});
 }
 m=path.match(/^\/api\/admin\/track-review\/([\w-]+)(?:\/(visibility))?$/);
 if(!m)fail(404,'음원 검토 페이지를 찾을 수 없습니다.');
 const t=await one(env,`${metrics} WHERE t.id=?`,m[1]);if(!t)fail(404,'음원을 찾을 수 없습니다.');
 if(!m[2]&&req.method==='GET')return json({track:{...t,reasons:reasons(t,cutoff)},reports:await rows(env,'SELECT id,reason,details,created,status,decision,resolved_at,version FROM track_reports WHERE track_id=? ORDER BY created DESC LIMIT 100',t.id)});
 if(m[2]&&req.method==='POST'){
  const b=await req.json();if(!['remove','restore'].includes(b.action))fail(400,'처리 방식을 확인해 주세요.');
  const removing=b.action==='remove',from=removing?'published':'removed',to=removing?'removed':'published';
  if(t.status===to)return json({ok:true,status:to});
  if(t.status!==from)fail(409,'공개 또는 운영자 제거 상태의 음원만 변경할 수 있습니다.');
  const note=str(b.note||'',500,false);
  // Manual actions only. Keep audio, playback and financial ledgers so an operator can restore the song.
  await env.DB.batch([
   query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tracks WHERE id=? AND status=?)',id(),user.id,'track:'+b.action,JSON.stringify({track_id:t.id,title:t.title,note}),now(),t.id,from),
   query(env,'UPDATE tracks SET status=?,lease_token=NULL,lease_until=0 WHERE id=? AND status=?',to,t.id,from)
  ]);
  const status=(await one(env,'SELECT status FROM tracks WHERE id=?',t.id)).status;if(status!==to)fail(409,'곡의 상태가 변경되었습니다. 목록을 새로 확인해 주세요.');
  return json({ok:true,status});
 }
 fail(405,AifectMessages.unsupportedRequest);
}
