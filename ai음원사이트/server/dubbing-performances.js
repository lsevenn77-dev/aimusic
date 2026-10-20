import {one,rows,query,now,id,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {dubbingVisibleSQL} from './dubbing-access.js';
import {reconcileDubbingGold} from './dubbing-gold.js';

export async function dubbingVersions(env,p,user){
 const root=p.root_id||p.id,uid=user?.id||'';
 return rows(env,`SELECT p.id,p.state,p.role_count roleCount,${publicNameSQL('u')} ownerName,
 (SELECT COUNT(*) FROM dubbing_role_claims WHERE project_id=p.id) participants,
 EXISTS(SELECT 1 FROM dubbing_role_claims WHERE project_id=p.id AND user_id=?) mine
 FROM dubbing_projects p JOIN users u ON u.id=p.owner_id
 WHERE (p.id=? OR p.root_id=?) AND p.visibility='public' AND u.provider!='deleted' AND ${dubbingVisibleSQL()}
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))
 ORDER BY (p.state='complete'),p.created DESC,p.id LIMIT 100`,uid,root,root,uid,uid);
}
export async function startDubbingPerformance(req,env,p,user){
 requireUser(user);
 const body=await req.json(),pid=body.id,roleId=body.roleId;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid||''))fail(400,'요청 식별자를 확인해주세요.');
 const root=await one(env,`SELECT p.* FROM dubbing_projects p WHERE p.id=? AND p.visibility='public' AND ${dubbingVisibleSQL()}`,p.root_id||p.id);
 if(!root||env.AIFECT_BLOCKED?.includes(root.owner_id))fail(404,'참여할 대본을 찾을 수 없습니다.');
 const script=JSON.parse(root.script_json);
 if(!script.roles.some(r=>r.id===roleId))fail(400,'시작할 배역을 선택해주세요.');
 const prior=await one(env,'SELECT * FROM dubbing_projects WHERE id=?',pid);
 if(prior){
  if(prior.deleted_at)fail(409,'이미 삭제된 참여 요청입니다. 새로 시작해주세요.');
  if(prior.owner_id!==user.id||prior.root_id!==root.id||!await one(env,'SELECT role_id FROM dubbing_role_claims WHERE project_id=? AND role_id=? AND user_id=?',pid,roleId,user.id))fail(409,'다른 참여 요청입니다.');
  return json({id:pid});
 }
 await rate(env,'dubbing-performance:'+user.id,30,3600);
 const bg=await one(env,"SELECT * FROM dubbing_sound_jobs WHERE project_id=? AND script_key=? AND state='ready'",root.id,root.script_key);
 if(!bg)fail(409,'대본 작성자가 배경 오디오를 준비한 뒤 새 더빙을 시작할 수 있어요.');
 const source=await env.BUCKET.get(bg.output_key);if(!source)fail(409,'배경 오디오를 준비하고 있어요.');
 const scriptKey=`dubbing/${user.id}/${pid}/scripts/${id()}.json`,audioKey=`dubbing/${user.id}/${pid}/audio/${id()}.m4a`,at=now();
 await env.BUCKET.put(scriptKey,JSON.stringify({script,timeline:JSON.parse(bg.timeline_json)}),{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
 await env.BUCKET.put(audioKey,source.body,{httpMetadata:{contentType:'audio/mp4',cacheControl:'private, no-store'}});
 try{
  const writes=await env.DB.batch([
   query(env,`INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,source,root_id,role_count,duration,write_token,created,updated,visibility,state,rights_at)
    SELECT ?,?,?,?,?,?,?,'performance',?,?,?,?,?,?,'public','recruiting',? WHERE EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=? AND p.revision=? AND p.visibility='public' AND ${dubbingVisibleSQL()})
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted') ON CONFLICT(id) DO NOTHING RETURNING id`,
    pid,user.id,root.title,root.options_json,root.script_json,scriptKey,root.creation_hash,root.id,root.role_count,root.duration,id(),at,at,at,root.id,root.revision,user.id),
   query(env,`INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND script_key=?)`,pid,roleId,user.id,at,pid,scriptKey),
   query(env,`INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,output_meta,created,updated)
    SELECT ?,?,?,?,?,'ready',?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND script_key=?)`,
    id(),pid,scriptKey,bg.mode,bg.timeline_json,audioKey,bg.output_meta,at,at,pid,scriptKey)
  ]);
  if(!writes[0].results.length){
   const replay=await one(env,'SELECT id FROM dubbing_projects WHERE id=? AND owner_id=? AND root_id=? AND deleted_at=0',pid,user.id,root.id);
   if(!replay)fail(409,'대본이 변경됐어요. 다시 확인해주세요.');
  }
 }finally{
  // Keep committed objects after an uncertain acknowledgement.
  if(!await one(env,'SELECT id FROM dubbing_projects WHERE script_key=?',scriptKey)){await env.BUCKET.delete(scriptKey);await env.BUCKET.delete(audioKey);}
 }
 return json({id:pid},201);
}
export async function deleteDubbingProject(req,env,p,user){
 requireUser(user);if(p.owner_id!==user.id)fail(403,'올린 사람만 삭제할 수 있어요.');
 const body=await req.json();if(body.revision!==p.revision)fail(409,'대본이 변경됐어요. 다시 확인해주세요.');
 const at=now();
 const result=await query(env,`UPDATE dubbing_projects SET deleted_at=?,visibility='private',revision=revision+1,updated=?
 WHERE id=? AND owner_id=? AND revision=? AND deleted_at=0 RETURNING id`,at,at,p.id,user.id,body.revision).first();
 if(!result)fail(409,'이미 삭제했거나 변경된 대본입니다.');
 // Retain recordings and accounting records; every read/worker checks the tombstone.
 await reconcileDubbingGold(env);
 return json({deleted:true});
}
