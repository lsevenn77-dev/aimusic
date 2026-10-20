import {one,rows,query,run,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {dubbingVisibleSQL,dubbingRemoved} from './dubbing-access.js';
import {reconcileDubbingGold} from './dubbing-gold.js';
export function evidenceLinks(value){
 if(!Array.isArray(value)||value.length>5)fail(400,'증빙 링크는 최대 5개까지 입력해주세요.');
 return value.map(v=>{const text=str(v,1000);let u;try{u=new URL(text);}catch{fail(400,'증빙 링크 주소를 확인해주세요.');}if(u.protocol!=='https:'||u.username||u.password)fail(400,'증빙은 인증 정보가 없는 HTTPS 링크로 입력해주세요.');return u.href;});
}
export async function dubbingOwnerReports(env,p){return rows(env,'SELECT id,reason,status,decision,appeal,version,created,resolved_at FROM track_reports WHERE dubbing_id=? ORDER BY created DESC LIMIT 100',p.id);}
export async function dubbingReportRoute(req,env,p,user,action,tail){
 if(!['report','appeal'].includes(action))return null;requireUser(user);if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 const body=await req.json();
 if(action==='report'){
  if(p.visibility!=='public'||p.owner_id===user.id||p.removed)fail(400,'현재 작품은 신고할 수 없습니다.');
  const existing=await one(env,'SELECT id FROM track_reports WHERE dubbing_id=? AND user_id=?',p.id,user.id);if(existing)return json({id:existing.id});
  const rightsholder=str(body.rightsholder,100),contact=str(body.contact,254),details=str(body.details,2000),evidence=evidenceLinks(body.evidence);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)||!evidence.length||body.confirmed!==true)fail(400,'권리자 연락 이메일, 증빙 링크와 신고 확인이 필요합니다.');
  await rate(env,'rights-report:'+user.id,10,86400);const rid=id();
  await run(env,"INSERT OR IGNORE INTO track_reports(id,dubbing_id,user_id,reason,details,rightsholder,contact,evidence_json,created) VALUES(?,?,?,'copyright',?,?,?,?,?)",rid,p.id,user.id,details,rightsholder,contact,JSON.stringify(evidence),now());return json({ok:true},201);
 }
 if(p.owner_id!==user.id)fail(403,'작품 작성자만 이의신청할 수 있습니다.');
 const appeal=str(body.details,2000),evidence=evidenceLinks(body.evidence);
 const updated=await query(env,"UPDATE track_reports SET appeal=?,appeal_evidence_json=?,status='appealed',version=version+1 WHERE id=? AND dubbing_id=? AND status='removed' AND version=? RETURNING id",appeal,JSON.stringify(evidence),tail,p.id,body.version).first();
 if(!updated)fail(409,'이의신청 상태가 변경됐어요. 다시 확인해주세요.');return json({ok:true});
}
export async function dubbingReportsAdminRoute(req,env,path,user){
 if(!path.startsWith('/api/admin/dubbing-reports'))return null;requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있습니다.');
 if(path==='/api/admin/dubbing-reports'&&req.method==='GET'){
  const status=new URL(req.url).searchParams.get('status')||'pending';if(!['pending','removed','appealed','upheld','dismissed','restored'].includes(status))fail(400,'신고 상태를 확인해주세요.');
  return json({reports:await rows(env,`SELECT r.*,p.title,p.owner_id,p.generation_id,
   (SELECT json_group_array(json_object('id',x.id,'title',x.title)) FROM dubbing_projects x WHERE x.id!=p.id AND ((p.generation_id IS NOT NULL AND x.generation_id=p.generation_id) OR x.creation_hash=p.creation_hash)) linked_projects,
   (SELECT COUNT(DISTINCT x.dubbing_id) FROM track_reports x JOIN dubbing_projects dp ON dp.id=x.dubbing_id WHERE dp.owner_id=p.owner_id AND x.status IN ('removed','appealed','upheld')) violations
   FROM track_reports r JOIN dubbing_projects p ON p.id=r.dubbing_id WHERE r.status=? ORDER BY r.created,r.id LIMIT 100`,status)});
 }
 const m=path.match(/^\/api\/admin\/dubbing-reports\/([\w-]+)$/);if(!m||req.method!=='PATCH')fail(405,'지원하지 않는 요청입니다.');
 const report=await one(env,'SELECT * FROM track_reports WHERE id=? AND dubbing_id IS NOT NULL',m[1]);if(!report)fail(404,'신고를 찾을 수 없습니다.');
 const body=await req.json(),allowed={pending:['removed','dismissed'],removed:['restored'],appealed:['restored','upheld'],upheld:['restored']};
 if(body.version!==report.version||!allowed[report.status]?.includes(body.status))fail(409,'처리 상태가 변경됐거나 지원하지 않는 결정입니다.');
 const note=str(body.note,1000),at=now();
 const result=await env.DB.batch([
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'dubbing-report',?,? WHERE EXISTS(SELECT 1 FROM track_reports WHERE id=? AND version=?)`,id(),user.id,JSON.stringify({report:report.id,project:report.dubbing_id,status:body.status,note}),at,report.id,body.version),
  query(env,'UPDATE track_reports SET status=?,decision=?,resolved_by=?,resolved_at=?,version=version+1 WHERE id=? AND version=? RETURNING id',body.status,note,user.id,at,report.id,body.version),
  query(env,`UPDATE dubbing_sound_jobs SET state='failed',error='권리 신고 검토로 제작이 중단되었습니다.',lease_token=NULL,lease_until=0,updated=? WHERE project_id=? AND state IN ('queued','planning','generating','mixing') AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=dubbing_sound_jobs.project_id AND NOT (${dubbingVisibleSQL()}))`,at,report.dubbing_id),
  query(env,`UPDATE dubbing_final_jobs SET state='failed',error='권리 신고 검토로 합성이 중단되었습니다.',lease_token=NULL,lease_until=0,updated=? WHERE project_id=? AND state IN ('queued','mixing') AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=dubbing_final_jobs.project_id AND NOT (${dubbingVisibleSQL()}))`,at,report.dubbing_id)
 ]);if(!result[1].results.length)fail(409,'다른 관리자가 먼저 처리했습니다.');await reconcileDubbingGold(env);
 return json({ok:true,removed:await dubbingRemoved(env,report.dubbing_id)});
}
