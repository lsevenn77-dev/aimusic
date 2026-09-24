import {rows,one,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {published} from './catalog.js';

export const REPORT_REASONS=['abuse','spam','privacy','sexual','other'];
export function removeComment(env,cid,actor){
 const at=now();
 return env.DB.batch([
  query(env,"UPDATE comments SET body='삭제된 댓글입니다.',edited=?,deleted_at=?,deleted_by=? WHERE id=? AND deleted_at=0",at,at,actor,cid),
  query(env,'DELETE FROM comment_likes WHERE comment_id=?',cid)
 ]);
}
export async function commentModerationRoute(req,env,path,user){
 let m=path.match(/^\/api\/comments\/([\w-]+)\/report$/);
 if(m){
  requireUser(user);if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  const c=await one(env,'SELECT * FROM comments WHERE id=?',m[1]);if(!c)fail(404,'댓글을 찾을 수 없습니다.');
  await published(env,c.track_id);
  if(c.deleted_at)fail(409,'이미 삭제된 댓글입니다.');
  if(c.user_id===user.id)fail(400,'내 댓글은 신고할 수 없습니다.');
  const b=await req.json();if(!REPORT_REASONS.includes(b.reason))fail(400,'신고 사유를 선택해주세요.');
  const details=str(b.details||'',500,false);
  if(await one(env,'SELECT id FROM comment_reports WHERE comment_id=? AND user_id=?',c.id,user.id))return json({ok:true,reported:true});
  await rate(env,'comment-report:'+user.id,20,3600);
  await run(env,'INSERT OR IGNORE INTO comment_reports(id,comment_id,user_id,reason,details,body_snapshot,created) VALUES(?,?,?,?,?,?,?)',id(),c.id,user.id,b.reason,details,c.body,now());
  return json({ok:true,reported:true},201);
 }
 if(!path.startsWith('/api/admin/comment-reports'))return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있습니다.');
 if(path==='/api/admin/comment-reports'&&req.method==='GET'){
  const status=new URL(req.url).searchParams.get('status')||'pending';
  if(!['pending','dismissed','removed'].includes(status))fail(400,'처리 상태를 확인해주세요.');
  return json({reports:await rows(env,`SELECT r.*,c.track_id,c.user_id author_id,c.deleted_at,t.title FROM comment_reports r JOIN comments c ON c.id=r.comment_id JOIN tracks t ON t.id=c.track_id WHERE r.status=? ORDER BY r.created LIMIT 100`,status)});
 }
 m=path.match(/^\/api\/admin\/comment-reports\/([\w-]+)$/);
 if(m&&req.method==='PATCH'){
  const r=await one(env,'SELECT * FROM comment_reports WHERE id=?',m[1]);if(!r)fail(404,'신고 내역을 찾을 수 없습니다.');
  const b=await req.json();if(!['dismissed','removed'].includes(b.status))fail(400,'처리 결과를 확인해주세요.');
  if(r.status!=='pending')return json({ok:true,status:r.status});
  const at=now();
  // Audit and moderation are committed together; concurrent decisions cannot overwrite one another.
  await env.DB.batch([
   query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",id(),user.id,'comment-report:'+b.status,r.id,at,r.id),
   ...(b.status==='removed'?[
    query(env,"UPDATE comments SET body='삭제된 댓글입니다.',edited=?,deleted_at=?,deleted_by=? WHERE id=? AND deleted_at=0 AND EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",at,at,user.id,r.comment_id,r.id),
    query(env,"DELETE FROM comment_likes WHERE comment_id=? AND EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status='pending')",r.comment_id,r.id)
   ]:[]),
   query(env,"UPDATE comment_reports SET status=?,resolved_by=?,resolved_at=? WHERE id=? AND status='pending'",b.status,user.id,at,r.id)
  ]);
  return json({ok:true,status:(await one(env,'SELECT status FROM comment_reports WHERE id=?',r.id)).status});
 }
 fail(404,'페이지를 찾을 수 없습니다.');
}
