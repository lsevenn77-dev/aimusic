import {one,rows,run,now,id,fail,str,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {removeComment,REPORT_REASONS} from './comment-moderation.js';
import {assertDubbingCreator} from './dubbing-access.js';
export async function dubbingCommunityStatus(env,p,user){
 const uid=user?.id||'';
 return one(env,`SELECT (SELECT COUNT(*) FROM likes WHERE dubbing_id=?) likes,
 EXISTS(SELECT 1 FROM likes WHERE dubbing_id=? AND user_id=?) liked,
 (SELECT COUNT(*) FROM comments c WHERE c.dubbing_id=? AND c.deleted_at=0 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=c.user_id) OR (b.blocked_id=? AND b.user_id=c.user_id))) comments`,p.id,p.id,uid,p.id,uid,uid);
}
export async function dubbingCommunityRoute(req,env,p,user,action,tail){
 if(!['like','comments'].includes(action))return null;
 if(p.visibility!=='public'||p.removed)fail(404,'공개 중인 작품에서 이용할 수 있습니다.');
 const uid=user?.id||'',method=req.method;
 if(action==='like'){
  requireUser(user);
  if(method==='PUT')await run(env,'INSERT OR IGNORE INTO likes(user_id,dubbing_id,created) VALUES(?,?,?)',uid,p.id,now());
  else if(method==='DELETE')await run(env,'DELETE FROM likes WHERE user_id=? AND dubbing_id=?',uid,p.id);else fail(405,'지원하지 않는 요청입니다.');
  return json(await dubbingCommunityStatus(env,p,user));
 }
 if(!tail&&method==='GET'){
  const offset=Math.max(0,Math.min(10000,Math.floor(Number(new URL(req.url).searchParams.get('offset'))||0)));
  const list=await rows(env,`SELECT c.id,c.body,c.created,c.edited,${publicNameSQL('u')} name,c.user_id,
   EXISTS(SELECT 1 FROM comment_reports r WHERE r.comment_id=c.id AND r.user_id=?) reported
   FROM comments c JOIN users u ON u.id=c.user_id WHERE c.dubbing_id=? AND c.deleted_at=0 AND u.provider!='deleted'
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=c.user_id) OR (b.blocked_id=? AND b.user_id=c.user_id)) ORDER BY c.created DESC,c.id DESC LIMIT 31 OFFSET ?`,uid,p.id,uid,uid,offset);
  return json({comments:list.slice(0,30).map(({user_id,...c})=>({...c,mine:user_id===uid,canDelete:!!uid&&(user_id===uid||p.owner_id===uid),canReport:!!uid&&user_id!==uid&&!c.reported})),nextOffset:list.length>30?offset+30:null});
 }
 requireUser(user);
 if(!tail&&method==='POST'){
  await assertDubbingCreator(env,uid);const body=await req.json(),text=str(body.body,2000),cid=body.id;
  if(!/^[0-9a-f-]{36}$/.test(cid||''))fail(400,'댓글 요청 식별자를 확인해주세요.');
  const prior=await one(env,'SELECT * FROM comments WHERE id=?',cid);
  if(prior){if(prior.user_id!==uid||prior.dubbing_id!==p.id||prior.body!==text)fail(409,'댓글 요청이 변경됐어요.');return json({id:cid});}
  await rate(env,'comment:'+uid,20,3600);
  await run(env,'INSERT OR IGNORE INTO comments(id,dubbing_id,user_id,body,created) VALUES(?,?,?,?,?)',cid,p.id,uid,text,now());
  const saved=await one(env,'SELECT user_id,dubbing_id,body FROM comments WHERE id=?',cid);
  if(saved?.user_id!==uid||saved.dubbing_id!==p.id||saved.body!==text)fail(409,'댓글 요청이 변경됐어요.');
  return json({id:cid},201);
 }
 const [cid,sub,...extra]=(tail||'').split('/');if(extra.length)fail(404,'댓글 경로가 없습니다.');
 const c=await one(env,'SELECT * FROM comments WHERE id=? AND dubbing_id=?',cid,p.id);if(!c||env.AIFECT_BLOCKED?.includes(c.user_id))fail(404,'댓글을 찾을 수 없습니다.');
 if(!sub&&method==='DELETE'){
  if(c.user_id!==uid&&p.owner_id!==uid)fail(403,'이 댓글을 삭제할 수 없습니다.');await removeComment(env,c.id,uid);return json({ok:true});
 }
 if(sub==='report'&&method==='POST'){
  if(c.deleted_at||c.user_id===uid)fail(400,'신고할 수 없는 댓글입니다.');const body=await req.json();
  if(!REPORT_REASONS.includes(body.reason))fail(400,'신고 사유를 확인해주세요.');
  await rate(env,'comment-report:'+uid,20,3600);
  await run(env,'INSERT OR IGNORE INTO comment_reports(id,comment_id,user_id,reason,details,body_snapshot,created) VALUES(?,?,?,?,?,?,?)',id(),cid,uid,body.reason,str(body.details||'',500,false),c.body,now());return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
