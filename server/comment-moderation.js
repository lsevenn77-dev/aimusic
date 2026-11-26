import * as AifectMessages from '../shared/system-messages.js';
import {assertDubbingPublic} from './dubbing-access.js';
import {rows,one,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {published} from './catalog.js';
import {commentReportFrom,pendingCommentReportSQL,REVIEW_PAGE_SIZE,reviewCursor,reviewPage} from './review-queues.js';

export const REPORT_REASONS=['abuse','spam','privacy','sexual','other'];
export function closeDeletedCommentReports(env,cid,actor,at){
 const pending=`comment_id=? AND status='pending'
  AND EXISTS(SELECT 1 FROM comments c WHERE c.id=comment_reports.comment_id AND c.deleted_at>0)`;
 return [
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT lower(hex(randomblob(16))),?,'comment-report:auto-close',
    json_object('report_id',id,'comment_id',comment_id,'decision','removed'),?
   FROM comment_reports WHERE ${pending}`,actor,at,cid),
  query(env,`UPDATE comment_reports SET status='removed',resolved_by=?,resolved_at=? WHERE ${pending}`,actor,at,cid)
 ];
}

export function removeComment(env,cid,actor){
 const at=now();
 return env.DB.batch([
  query(env,'UPDATE comments SET parent_id=NULL WHERE parent_id=?',cid),
  query(env,"UPDATE comments SET body='',edited=?,deleted_at=?,deleted_by=? WHERE id=? AND deleted_at=0",at,at,actor,cid),
  query(env,'DELETE FROM comment_likes WHERE comment_id=?',cid),
  ...closeDeletedCommentReports(env,cid,actor,at)
 ]);
}
export async function commentModerationRoute(req,env,path,user){
 let m=path.match(/^\/api\/comments\/([\w:-]+)\/report$/);
 if(m){
  requireUser(user);if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);
  const c=await one(env,'SELECT * FROM comments WHERE id=?',m[1]);if(!c)fail(404,'댓글을 찾을 수 없습니다.');
  if(c.dubbing_id)await assertDubbingPublic(env,c.dubbing_id,user.id);else await published(env,c.track_id);
  if(c.deleted_at)fail(409,'이미 삭제된 댓글입니다.');
  if(c.user_id===user.id)fail(400,'내 댓글은 신고할 수 없습니다.');
  const b=await req.json();if(!REPORT_REASONS.includes(b.reason))fail(400,'신고 사유를 선택해 주세요.');
  const details=str(b.details||'',500,false);
  if(await one(env,'SELECT id FROM comment_reports WHERE comment_id=? AND user_id=?',c.id,user.id))return json({ok:true,reported:true});
  await rate(env,'comment-report:'+user.id,20,3600);
  const report=await query(env,`INSERT INTO comment_reports(id,comment_id,user_id,reason,details,body_snapshot,created)
   SELECT ?,c.id,?,?,?,c.body,? FROM comments c WHERE c.id=? AND c.deleted_at=0
   ON CONFLICT(comment_id,user_id) DO NOTHING RETURNING id`,id(),user.id,b.reason,details,now(),c.id).first();
  if(!report&&!await one(env,'SELECT id FROM comments WHERE id=? AND deleted_at=0',c.id))fail(409,'이미 삭제된 댓글입니다.');
  return json({ok:true,reported:true},report?201:200);
 }
 if(!path.startsWith('/api/admin/comment-reports'))return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있습니다.');
 if(path==='/api/admin/comment-reports'&&req.method==='GET'){
  const params=new URL(req.url).searchParams,status=params.get('status')||'pending';
  if(!['pending','dismissed','removed'].includes(status))fail(400,'처리 상태를 확인해 주세요.');
  const cursor=reviewCursor(params,'r');
  const {items,...page}=reviewPage(await rows(env,`SELECT r.*,c.track_id,c.dubbing_id,c.user_id author_id,c.deleted_at,COALESCE(t.title,p.title) title
   ${commentReportFrom} LEFT JOIN tracks t ON t.id=c.track_id LEFT JOIN dubbing_projects p ON p.id=c.dubbing_id
   WHERE r.status=? ${status==='pending'?`AND ${pendingCommentReportSQL}`:''} ${cursor.where}
   ORDER BY r.created,r.id LIMIT ?`,status,...cursor.args,REVIEW_PAGE_SIZE+1));
  return json({reports:items,...page});
 }
 m=path.match(/^\/api\/admin\/comment-reports\/([\w-]+)$/);
 if(m&&req.method==='PATCH'){
  const r=await one(env,'SELECT * FROM comment_reports WHERE id=?',m[1]);if(!r)fail(404,'신고 내역을 찾을 수 없습니다.');
  const b=await req.json();if(!['dismissed','removed'].includes(b.status))fail(400,'처리 결과를 확인해 주세요.');
  if(r.status!=='pending')return json({ok:true,status:r.status});
  const at=now();
  // Audit and moderation are committed together; concurrent decisions cannot overwrite one another.
  await env.DB.batch([
   query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",id(),user.id,'comment-report:'+b.status,r.id,at,r.id),
   ...(b.status==='removed'?[
    query(env,"UPDATE comments SET parent_id=NULL WHERE parent_id=? AND EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",r.comment_id,r.id),
    query(env,"UPDATE comments SET body='',edited=?,deleted_at=?,deleted_by=? WHERE id=? AND deleted_at=0 AND EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",at,at,user.id,r.comment_id,r.id),
    query(env,"DELETE FROM comment_likes WHERE comment_id=? AND EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",r.comment_id,r.id)
   ]:[]),
   query(env,"UPDATE comment_reports SET status=?,resolved_by=?,resolved_at=? WHERE id=? AND status='pending'",b.status,user.id,at,r.id),
   ...(b.status==='removed'?closeDeletedCommentReports(env,r.comment_id,user.id,at):[])
  ]);
  return json({ok:true,status:(await one(env,'SELECT status FROM comment_reports WHERE id=?',r.id)).status});
 }
 fail(404,AifectMessages.notFound);
}
