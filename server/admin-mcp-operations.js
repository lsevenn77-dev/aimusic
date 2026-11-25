import {effectiveUntilSQL,eventUntilSQL} from './premium-event.js';
import {libraryMigrationStatus} from './library-migration.js';
import {playlistCleanupStatus} from './playlist-cleanup.js';
import {welcomeNoticeStatus} from './welcome-notices.js';
import {one,rows,query,now,fail} from './db.js';
import {hash} from './auth.js';
import {publicCrewNameSQL} from './identity.js';
import {goldBalance} from './gifts.js';
import {isMcpAdmin} from './admin-mcp-auth.js';
import {dubbingReportsAdminRoute} from './dubbing-reports.js';
import {BUSINESS} from '../shared/site-info.js';
import {rankingAudit} from './ranking-audit.js';
import {lyricAnalysisStatus} from './lyric-analysis.js';
import {commentRefreshStatus} from './bot-comment-refresh.js';
import {botNicknameStatus} from './nicknames.js';

const spendable = `p.status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=p.id AND o.state!='paid')
 AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=p.id AND pp.state='refunded')`;
const nick = publicCrewNameSQL();
const paging = a => [a.limit??25,a.offset??0];
const audit = (env,key,actor,action,target,at=now()) => query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',key,actor.id,action,JSON.stringify(target),at);
async function recipient(env,uid) {
 const row=await one(env,`SELECT u.id,${nick} nickname FROM users u WHERE u.id=? AND u.provider!='deleted' AND account_type='human'`,uid);
 if(!row)fail(404,'이용자를 찾을 수 없습니다.');
 return row;
}
async function balance(env,uid) {
 const user=await recipient(env,uid);
 const [total,test]=await Promise.all([goldBalance(env,uid),one(env,`SELECT COALESCE(SUM(p.gold-p.used),0) amount FROM gold_purchases p WHERE p.user_id=? AND p.channel='admin_test' AND ${spendable}`,uid)]);
 return {user,balance_gold:total,test_gold:test.amount,other_gold:total-test.amount,currency:'G'};
}
async function grant(env,actor,a) {
 await recipient(env,a.user_id);
 const payload=await hash(JSON.stringify({user_id:a.user_id,gold:a.gold,reason:a.reason}));
 const replay=async()=>{
  const old=await one(env,'SELECT * FROM admin_test_gold_grants WHERE request_id=?',a.request_id);
  if(!old)return null;
  if(old.operator_id!==actor.id||old.payload_hash!==payload)fail(409,'같은 요청 ID를 다른 지급에 사용할 수 없습니다.');
  return {grant_id:old.purchase_id,user_id:old.user_id,gold:old.gold,reason:old.reason,created:old.created,channel:'admin_test',revenue_krw:0,settlement_krw:0,audit_id:'mcp:'+old.purchase_id};
 };
 const old=await replay();if(old)return {...old,replayed:true};
 const at=now(),dayStart=Math.floor((at+32400)/86400)*86400-32400;
 const purchase='admin_test_'+await hash(a.request_id);
 try {
  await env.DB.batch([
   query(env,"INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,provider_ref,created,paid_at) SELECT ?,?,'admin_test',?,0,0,0,'paid',?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted' AND account_type='human')",purchase,a.user_id,a.gold,a.request_id,at,at,a.user_id),
   // The CHECK rejects the entire batch if concurrent grants exceed the daily budget.
   query(env,`INSERT INTO admin_test_gold_grants(request_id,operator_id,user_id,gold,reason,payload_hash,purchase_id,created)
    VALUES(?,?,?,CASE WHEN (SELECT COALESCE(SUM(gold),0) FROM admin_test_gold_grants WHERE created>=?)+?<=50000 THEN ? ELSE -1 END,?,?,?,?)`,a.request_id,actor.id,a.user_id,dayStart,a.gold,a.gold,a.reason,payload,purchase,at),
   audit(env,'mcp:'+purchase,actor,'mcp:test-gold:grant',{user_id:a.user_id,gold:a.gold,reason:a.reason,request_id:a.request_id,purchase_id:purchase,revenue_krw:0,settlement_krw:0},at)
  ]);
 } catch(e) {
  const duplicate=await replay();if(duplicate)return {...duplicate,replayed:true};
  if(/CHECK constraint/i.test(e.message))fail(409,'한국 시간 하루 테스트 지급 한도 50,000G를 초과했습니다.');
  throw e;
 }
 return {...await replay(),replayed:false};
}
async function history(env,a) {
 await recipient(env,a.user_id);
 const [lots,events]=await Promise.all([
  rows(env,`SELECT id,channel,gold,used,price_krw,status,created,paid_at,channel='admin_test' is_test FROM gold_purchases WHERE user_id=? ORDER BY created DESC,id DESC LIMIT ? OFFSET ?`,a.user_id,...paging(a)),
  rows(env,`SELECT * FROM (
   SELECT id,'credit' kind,channel source,gold delta_gold,created FROM gold_purchases WHERE user_id=? AND status='paid'
   UNION ALL SELECT id,'gift','gift',-gold,created FROM gifts WHERE sender_id=?
   UNION ALL SELECT job_id,'sound_charge','dubbing',-gold,created FROM dubbing_gold_orders WHERE user_id=?
   UNION ALL SELECT o.job_id,'sound_refund','dubbing',SUM(l.refunded_gold),o.updated FROM dubbing_gold_orders o JOIN dubbing_gold_lots l ON l.job_id=o.job_id WHERE o.user_id=? AND l.refunded_gold>0 GROUP BY o.job_id
   ) ORDER BY created DESC,id DESC,kind LIMIT ? OFFSET ?`,a.user_id,a.user_id,a.user_id,a.user_id,...paging(a))
 ]);
 return {lots,events,limit:a.limit??25,offset:a.offset??0,note:'기존 기록을 조회합니다. 결제 취소 상태는 lots.status에 표시되며 과거 취소 시각을 추정하지 않습니다.'};
}
async function stats(env,a) {
 const days=a.days??30,cutoff=now()-days*86400;
 const counts=await one(env,`SELECT
 (SELECT COUNT(*) FROM users WHERE provider!='deleted' AND account_type='human') users,
 (SELECT COUNT(*) FROM users WHERE provider!='deleted' AND account_type='human' AND created>=?) new_users,
 (SELECT COUNT(*) FROM users u WHERE provider!='deleted' AND account_type='human' AND ${effectiveUntilSQL}>?) active_premium,
 (SELECT COUNT(*) FROM tracks WHERE status='published') published_tracks,
 (SELECT COUNT(*) FROM tracks WHERE status='published' AND kind='cover') published_covers,
 (SELECT COUNT(*) FROM dubbing_projects WHERE deleted_at=0) dubbing_projects,
 (SELECT COUNT(*) FROM crews) crews,
 (SELECT COUNT(*) FROM listens WHERE qualified=1 AND started>=?) qualified_plays,
 (SELECT COUNT(*) FROM comment_reports WHERE status='pending') pending_comment_reports,
 (SELECT COUNT(*) FROM track_reports WHERE status IN ('pending','appealed')) pending_content_reports,
 (SELECT COUNT(*) FROM admin_email_bugs) registered_email_bugs,
 (SELECT COALESCE(SUM(gold),0) FROM admin_test_gold_grants WHERE created>=?) test_gold_granted`,cutoff,now(),cutoff,cutoff);
 return {days,from:cutoff,as_of:now(),...counts,welcome_notice:await welcomeNoticeStatus(env),playlist_cleanup:await playlistCleanupStatus(env),library_v2:await libraryMigrationStatus(env),ranking_audit:await rankingAudit(env),lyric_analysis:await lyricAnalysisStatus(env),bot_comment_refresh:await commentRefreshStatus(env),bot_nicknames:await botNicknameStatus(env)};
}
async function reports(env,a) {
 const status=a.status??'pending',filter=status==='all'?'1=1':'r.status=?',args=status==='all'?[]:[status];
 if(a.kind==='bug')return {source:'operator_registered_email',mailbox:BUSINESS.email,automatically_synced:false,
  note:'공식 Gmail 연결에서 접수 메일을 확인한 뒤 aifect_register_email_bug로 등록한 요약만 표시합니다.',
  reports:await rows(env,"SELECT id,subject,summary,received_at,created,operator_id,'pending' status FROM admin_email_bugs WHERE ? IN ('all','pending') ORDER BY received_at DESC,id DESC LIMIT ? OFFSET ?",status,...paging(a))};
 if(a.kind==='comment')return {reports:await rows(env,`SELECT r.id,r.comment_id,r.reason,r.details,r.body_snapshot,r.status,r.created,r.resolved_at,c.track_id,c.dubbing_id,c.deleted_at FROM comment_reports r JOIN comments c ON c.id=r.comment_id WHERE ${filter} ORDER BY r.created DESC,r.id DESC LIMIT ? OFFSET ?`,...args,...paging(a))};
 return {reports:await rows(env,`SELECT r.id,r.track_id,r.dubbing_id,r.reason,r.details,r.status,r.version,r.decision,r.appeal,r.evidence_json,r.created,r.resolved_at,${a.kind==='track'?'t.title,t.status content_status':'p.title,p.visibility content_status'} FROM track_reports r ${a.kind==='track'?'JOIN tracks t ON t.id=r.track_id':'JOIN dubbing_projects p ON p.id=r.dubbing_id'} WHERE ${filter} ORDER BY r.created DESC,r.id DESC LIMIT ? OFFSET ?`,...args,...paging(a))};
}
async function registerBug(env,actor,a) {
 if(a.mailbox.toLowerCase()!==BUSINESS.email.toLowerCase())fail(400,'AIFECT 고객센터 메일함에서 확인한 접수만 등록하세요.');
 if(a.received_at>now()+300)fail(400,'미래의 수신 시각은 등록할 수 없습니다.');
 const source=await hash(a.mailbox.toLowerCase()+'\n'+a.message_id),bugId='email_'+source;
 const payload=await hash(JSON.stringify({subject:a.subject,summary:a.summary,received_at:a.received_at}));
 const replay=async()=>{
  const old=await one(env,'SELECT id,payload_hash FROM admin_email_bugs WHERE id=?',bugId);
  if(old&&old.payload_hash!==payload)fail(409,'이미 등록한 메일입니다. 원래 접수 내용을 확인하세요.');
  return old?{id:old.id,audit_id:'mcp:'+old.id}:null;
 };
 const old=await replay();if(old)return {...old,replayed:true};
 try{await env.DB.batch([
  query(env,'INSERT INTO admin_email_bugs(id,subject,summary,received_at,payload_hash,operator_id,created) VALUES(?,?,?,?,?,?,?)',bugId,a.subject,a.summary,a.received_at,payload,actor.id,now()),
  audit(env,'mcp:'+bugId,actor,'mcp:bug:register',{bug_id:bugId,source:'support_email'})
 ]);}catch(e){const duplicate=await replay();if(duplicate)return {...duplicate,replayed:true};throw e;}
 return {id:bugId,audit_id:'mcp:'+bugId,replayed:false};
}
async function moderate(env,actor,a) {
 const table=a.kind==='comment'?'comment_reports':'track_reports';
 const r=await one(env,`SELECT * FROM ${table} WHERE id=?`,a.report_id);
 if(!r||(a.kind==='track'&&!r.track_id)||(a.kind==='dubbing'&&!r.dubbing_id))fail(404,'신고를 찾을 수 없습니다.');
 if(r.status!==a.expected_status)fail(409,'신고 상태가 변경되었습니다. 다시 조회하세요.');
 if(a.kind==='dubbing'){
  if(!a.version)fail(400,'조회한 신고 version이 필요합니다.');
  const response=await dubbingReportsAdminRoute(new Request('https://aifect.co.kr/api/admin/dubbing-reports/'+encodeURIComponent(r.id),{method:'PATCH',body:JSON.stringify({version:a.version,status:a.decision,note:a.reason})}),env,'/api/admin/dubbing-reports/'+r.id,actor);
  return {report_id:r.id,...await response.json()};
 }
 if(a.kind==='comment'&&(r.status!=='pending'||!['removed','dismissed'].includes(a.decision)))fail(400,'댓글 신고는 대기 상태에서 삭제 또는 기각할 수 있습니다.');
 if(a.kind==='track'&&(!a.version||a.version!==r.version||!({pending:['removed','dismissed'],removed:['restored']}[r.status]?.includes(a.decision))))fail(409,'신고 version 또는 처리 결정을 확인하세요.');
 const at=now(),key=crypto.randomUUID(),writes=[];
 const guard=`EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`;
 // A fresh audit row is the transaction guard for every following write.
 if(a.kind==='comment') {
  writes.push(query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'mcp:comment-report',?,? WHERE EXISTS(SELECT 1 FROM comment_reports WHERE id=? AND status=?)",key,actor.id,JSON.stringify({report_id:r.id,comment_id:r.comment_id,decision:a.decision,reason:a.reason}),at,r.id,a.expected_status));
  if(a.decision==='removed')writes.push(
   query(env,`UPDATE comments SET parent_id=NULL WHERE parent_id=? AND ${guard}`,r.comment_id,key),
   query(env,`UPDATE comments SET body='',edited=?,deleted_at=?,deleted_by=? WHERE id=? AND deleted_at=0 AND ${guard}`,at,at,actor.id,r.comment_id,key),
   query(env,`DELETE FROM comment_likes WHERE comment_id=? AND ${guard}`,r.comment_id,key));
  writes.push(query(env,`UPDATE comment_reports SET status=?,resolved_by=?,resolved_at=? WHERE id=? AND ${guard}`,a.decision,actor.id,at,r.id,key));
 } else {
  const track=await one(env,'SELECT id,status FROM tracks WHERE id=?',r.track_id);
  const from=a.decision==='restored'?'removed':'published',to=a.decision==='restored'?'published':'removed';
  if(a.decision!=='dismissed'&&track?.status!==from)fail(409,'콘텐츠 상태가 변경되었습니다. 다시 확인하세요.');
  // Restoring one report must not override another upheld report on the same track.
  if(a.decision==='restored'&&await one(env,"SELECT 1 FROM track_reports WHERE track_id=? AND id!=? AND status IN ('removed','appealed','upheld')",r.track_id,r.id))fail(409,'다른 신고의 제거 결정이 남아 있습니다.');
  writes.push(query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'mcp:track-report',?,? WHERE EXISTS(SELECT 1 FROM track_reports WHERE id=? AND status=? AND version=?) AND EXISTS(SELECT 1 FROM tracks WHERE id=? AND status=?) AND (?!='restored' OR NOT EXISTS(SELECT 1 FROM track_reports WHERE track_id=? AND id!=? AND status IN ('removed','appealed','upheld')))`,key,actor.id,JSON.stringify({report_id:r.id,track_id:r.track_id,decision:a.decision,reason:a.reason}),at,r.id,a.expected_status,a.version,r.track_id,track.status,a.decision,r.track_id,r.id));
  if(a.decision!=='dismissed')writes.push(query(env,`UPDATE tracks SET status=?,lease_token=NULL,lease_until=0 WHERE id=? AND ${guard}`,to,r.track_id,key));
  writes.push(query(env,`UPDATE track_reports SET status=?,decision=?,resolved_by=?,resolved_at=?,version=version+1 WHERE id=? AND ${guard}`,a.decision,a.reason,actor.id,at,r.id,key));
 }
 await env.DB.batch(writes);
 if(!await one(env,'SELECT id FROM admin_audit WHERE id=?',key))fail(409,'다른 관리자가 먼저 처리했습니다. 다시 조회하세요.');
 return {report_id:r.id,status:a.decision,audit_id:key};
}

export async function executeAdminTool(env,actor,name,a) {
 if(!isMcpAdmin(actor))fail(403,'운영자 인증이 필요합니다.');
 switch(name) {
  case 'aifect_search_users':return {users:await rows(env,`SELECT u.id user_id,${nick} nickname,${eventUntilSQL} event_premium_until,${eventUntilSQL}>? event_premium_active,(SELECT id FROM producers WHERE user_id=u.id) profile_id FROM users u WHERE u.provider!='deleted' AND account_type='human' AND ${nick} LIKE ? ESCAPE '\\' ORDER BY nickname,u.id LIMIT ? OFFSET ?`,now(),'%'+a.nickname.replace(/[\\%_]/g,'\\$&')+'%',...paging(a))};
  case 'aifect_gold_balance':return balance(env,a.user_id);
  case 'aifect_grant_test_gold':return grant(env,actor,a);
  case 'aifect_gold_history':return history(env,a);
  case 'aifect_admin_stats':return stats(env,a);
  case 'aifect_list_reports':return reports(env,a);
  case 'aifect_register_email_bug':return registerBug(env,actor,a);
  case 'aifect_moderate_report':return moderate(env,actor,a);
  case 'aifect_audit_history':return {records:await rows(env,'SELECT id,admin_id operator_id,action,target,created FROM admin_audit ORDER BY created DESC,id DESC LIMIT ? OFFSET ?',...paging(a))};
  default:fail(400,'지원하지 않는 도구입니다.');
 }
}
