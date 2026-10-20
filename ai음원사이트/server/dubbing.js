import {dubbingSettings} from './dubbing-settings.js';
import {dubbingVisibleSQL,dubbingRemoved,assertDubbingCreator} from './dubbing-access.js';
import {dubbingCommunityStatus,dubbingCommunityRoute} from './dubbing-community.js';
import {dubbingOwnerReports,dubbingReportRoute} from './dubbing-reports.js';
import {dubbingGoldEnabled,reconcileDubbingGold} from './dubbing-gold.js';
import {one,rows,query,run,now,id,json,fail,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {publicNameSQL} from './identity.js';
import {dubbingOptions,validateDubbingScript,dubbingTimeline,DUBBING_MODEL,DUBBING_GENRES} from '../shared/dubbing.js';
import {dubbingAIAvailable,generateDubbingScript} from './dubbing-ai.js';
import {dubbingSoundStatus,dubbingSoundProjectRoute} from './dubbing-sound.js';
import {pikaAvailable} from './dubbing-pika.js';
import {dubbingQuota,reserveDubbingGeneration} from './dubbing-quota.js';
import {dubbingRewardRoute} from './dubbing-rewarded.js';
import {dubbingRewardAvailable} from './dubbing-ad-config.js';
import {dubbingRecordingRoute,dubbingRecordingStatus,recordingEnabled} from './dubbing-recording.js';

const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))fail(400,'요청 식별자를 확인해주세요.');return value;};
const revision=value=>{if(!Number.isSafeInteger(value)||value<1)fail(400,'저장 버전을 확인해주세요.');return value;};
const conflict=()=>fail(409,'다른 변경이 먼저 저장되었습니다. 최신 내용을 다시 불러와주세요.');
const activeOwner="EXISTS(SELECT 1 FROM users u WHERE u.id=dubbing_projects.owner_id AND u.provider!='deleted')";
const unblocked=`NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id))`;
async function project(env,pid,user){
 const p=await one(env,`SELECT p.*,${publicNameSQL('u')} owner_name FROM dubbing_projects p JOIN users u ON u.id=p.owner_id
  WHERE p.id=? AND u.provider!='deleted' AND (p.visibility='public' OR p.owner_id=? OR EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?)) AND ${unblocked}`,pid,user?.id||'',user?.id||'',user?.id||'',user?.id||'');
 if(!p)fail(404,'더빙 작품을 찾을 수 없습니다.');
 p.removed=await dubbingRemoved(env,p.id);if(p.removed&&p.owner_id!==user?.id)fail(404,'더빙 작품을 찾을 수 없습니다.');
 return p;
}
function owner(p,user){requireUser(user);if(p.owner_id!==user.id)fail(404,'더빙 작품을 찾을 수 없습니다.');}
async function dto(env,p,user){
 const claims=await rows(env,`SELECT c.role_id,c.user_id,${publicNameSQL('u')} name FROM dubbing_role_claims c JOIN users u ON u.id=c.user_id
  WHERE c.project_id=? AND u.provider!='deleted'`,p.id);
 const script=JSON.parse(p.script_json);
 return {removed:!!p.removed,community:await dubbingCommunityStatus(env,p,user),reports:p.owner_id===user?.id?await dubbingOwnerReports(env,p):[],id:p.id,title:p.title,ownerName:p.owner_name,isOwner:p.owner_id===user?.id,options:JSON.parse(p.options_json),script,
  source:p.source,state:p.state,visibility:p.visibility,revision:p.revision,duration:p.duration,created:p.created,updated:p.updated,
  roles:script.roles.map(r=>{const c=claims.find(c=>c.role_id===r.id);const blocked=c&&env.AIFECT_BLOCKED?.includes(c.user_id);
   return {...r,claimed:!!c,mine:c?.user_id===user?.id,participant:c?(blocked?'참여자':c.name):null};}),
  canEdit:!p.removed&&p.owner_id===user?.id&&!p.first_recorded_at&&claims.length===0&&p.visibility==='private',recordingAvailable:recordingEnabled(env),recording:await dubbingRecordingStatus(env,p,user),
  sound:await dubbingSoundStatus(env,p)};
}
async function storeScript(env,ownerId,pid,script,rev){
 if(!env.BUCKET)fail(503,'대본 저장소 연결이 필요합니다.');
 const key=`dubbing/${ownerId}/${pid}/scripts/${rev}-${id()}.json`;
 try{await env.BUCKET.put(key,JSON.stringify({script,soundPlan:script.soundCues,timeline:dubbingTimeline(script)}),{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});}
 catch{fail(503,'대본을 저장하지 못했습니다. 내용을 유지한 채 다시 시도해주세요.');}
 return key;
}
async function discard(env,key){
 // A lost DB response may follow a successful commit. Never delete a referenced object.
 try{if(!await one(env,'SELECT id FROM dubbing_projects WHERE script_key=?',key))await env.BUCKET.delete(key);}
 catch{/* Unknown outcome: keep the private object for reconciliation. */}
}
async function generationResult(env,g){
 if(g.state==='running'&&g.updated<now()-180){
  await run(env,"UPDATE dubbing_generations SET state='unknown',error='결과 확인 필요',updated=? WHERE id=? AND state='running' AND updated=?",now(),g.id,g.updated);
  g={...g,state:'unknown'};
 }
 return json({id:g.id,state:g.state,...(g.state==='ready'?{...JSON.parse(g.result_json),usage:JSON.parse(g.usage_json)}:{}),
  message:g.state==='unknown'?'생성 결과를 확인하지 못했습니다. 중복 호출을 막기 위해 자동 재시도하지 않습니다.':g.error||''},g.state==='running'?202:200);
}
export async function dubbingRoute(req,env,path,user){
 if(!path.startsWith('/api/dubbing/'))return null;
 if(path==='/api/dubbing/config'&&req.method==='GET')return json({enabled:env.DUBBING_ENABLED==='true',aiAvailable:env.DUBBING_ENABLED==='true'&&dubbingAIAvailable(env),model:DUBBING_MODEL,recordingAvailable:recordingEnabled(env),soundAvailable:env.DUBBING_ENABLED==='true'&&env.DUBBING_SOUND_ENABLED==='true',pikaAvailable:pikaAvailable(env),soundPriceGold:(await dubbingSettings(env)).soundGold,goldChargingEnabled:dubbingGoldEnabled(env),quota:env.DUBBING_ENABLED==='true'&&user?{...await dubbingQuota(env,user.id),rewardedAdAvailable:dubbingRewardAvailable(req,env)}:null});
 if(env.DUBBING_ENABLED!=='true')fail(503,'더빙 스튜디오를 준비하고 있습니다.');
 const reward=await dubbingRewardRoute(req,env,path,user);if(reward)return reward;
 const url=new URL(req.url),method=req.method;
 if(path==='/api/dubbing/payments'&&method==='GET'){
  requireUser(user);
  return json({payments:await rows(env,`SELECT o.job_id id,o.project_id projectId,COALESCE(p.title,'삭제된 작품') title,o.gold,o.state,o.created,
   COALESCE((SELECT SUM(refunded_gold) FROM dubbing_gold_lots l WHERE l.job_id=o.job_id),0) refundedGold
   FROM dubbing_gold_orders o LEFT JOIN dubbing_projects p ON p.id=o.project_id WHERE o.user_id=? ORDER BY o.created DESC,o.job_id DESC LIMIT 50`,user.id)});
 }
 if(path==='/api/dubbing/projects'&&method==='GET'){
  const tab=url.searchParams.get('tab')||'latest';if(!['latest','popular','open','complete','mine'].includes(tab))fail(400,'목록을 확인해주세요.');
  const genre=url.searchParams.get('genre')||'';if(genre&&!DUBBING_GENRES.includes(genre))fail(400,'장르를 확인해주세요.');
  if(tab==='mine')requireUser(user);
  const offset=Math.max(0,Math.min(10000,Math.floor(Number(url.searchParams.get('offset'))||0)));
  const where=tab==='mine'?`(p.owner_id=? OR EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?))`:`p.visibility='public'${tab==='open'?" AND p.state IN ('recruiting','recording') AND (SELECT COUNT(*) FROM dubbing_role_claims c WHERE c.project_id=p.id)<p.role_count":tab==='complete'?" AND p.state='complete'":''}`;
  const list=await rows(env,`SELECT p.id,p.title,p.options_json,p.role_count,p.duration,p.state,p.visibility,p.created,p.updated,${publicNameSQL('u')} owner_name,
   (SELECT COUNT(*) FROM dubbing_role_claims c WHERE c.project_id=p.id) participants FROM dubbing_projects p JOIN users u ON u.id=p.owner_id
   WHERE u.provider!='deleted' AND ${where} AND ${unblocked} ${tab==='mine'?'':`AND ${dubbingVisibleSQL()}`}
   ${genre?"AND EXISTS(SELECT 1 FROM json_each(p.options_json,'$.genres') g WHERE g.value=?)":''}
   ORDER BY ${tab==='popular'?'participants DESC,':''}p.created DESC,p.id LIMIT 25 OFFSET ?`,
   ...(tab==='mine'?[user.id,user.id]:[]),user?.id||'',user?.id||'',...(genre?[genre]:[]),offset);
  return json({projects:list.map(p=>({id:p.id,title:p.title,genres:JSON.parse(p.options_json).genres,roleCount:p.role_count,duration:p.duration,
   state:p.state,visibility:p.visibility,ownerName:p.owner_name,participants:p.participants,created:p.created})),nextOffset:list.length===25?offset+25:null});
 }
 if(path==='/api/dubbing/generations'&&method==='POST'){
  requireUser(user);await assertDubbingCreator(env,user.id);const body=await req.json(),gid=uuid(body.requestId),options=dubbingOptions(body.options),inputHash=await hash(JSON.stringify(options));
  let g=await one(env,'SELECT * FROM dubbing_generations WHERE id=?',gid);
  if(g){if(g.user_id!==user.id)fail(404,'생성 요청을 찾을 수 없습니다.');if(g.input_hash!==inputHash)conflict();return generationResult(env,g);}
  if(!dubbingAIAvailable(env))fail(503,'AI 대본 연동 대기 중입니다. 직접 대본을 작성할 수 있어요.');
  await rate(env,'dubbing-ai-user:'+user.id,20,86400);await rate(env,'dubbing-ai-all',100,86400);
  const reserved=await reserveDubbingGeneration(env,user.id,gid,inputHash);
  if(!reserved){g=await one(env,'SELECT * FROM dubbing_generations WHERE id=? AND user_id=?',gid,user.id);if(!g)fail(429,'오늘의 대본 작성 횟수를 모두 사용했어요. 광고 보상으로 최대 4회 더 이용할 수 있습니다.');if(g.input_hash!==inputHash)conflict();return generationResult(env,g);}
  try{
   const result=await generateDubbingScript(env,options);
   await run(env,"UPDATE dubbing_generations SET state='ready',result_json=?,usage_json=?,provider_id=?,updated=? WHERE id=? AND state='running'",JSON.stringify({script:result.script,model:result.model}),JSON.stringify(result.usage),result.providerRequestId,now(),gid);
  }catch(e){
   // Unknown includes network failures after the provider may have accepted a request.
   const state=e.status?'failed':'unknown',message=e.status?e.message:'응답을 확인하지 못했습니다. 자동 재요청하지 않았습니다.';
   await run(env,"UPDATE dubbing_generations SET state=?,error=?,usage_json=?,provider_id=?,updated=? WHERE id=? AND state='running'",state,message,JSON.stringify(e.usage||{}),e.providerRequestId||'',now(),gid);
  }
  g=await one(env,'SELECT * FROM dubbing_generations WHERE id=? AND user_id=?',gid,user.id);
  if(!g)fail(404,'생성 요청을 찾을 수 없습니다.');
  return generationResult(env,g);
 }
 const generationMatch=path.match(/^\/api\/dubbing\/generations\/([^/]+)$/);
 if(generationMatch&&method==='GET'){requireUser(user);const g=await one(env,'SELECT * FROM dubbing_generations WHERE id=? AND user_id=?',uuid(generationMatch[1]),user.id);if(!g)fail(404,'생성 요청을 찾을 수 없습니다.');return generationResult(env,g);}
 if(path==='/api/dubbing/projects'&&method==='POST'){
  requireUser(user);await assertDubbingCreator(env,user.id);await rate(env,'dubbing-create:'+user.id,30,3600);
  const body=await req.json(),pid=uuid(body.id),options=dubbingOptions(body.options),script=validateDubbingScript(body.script,options);
  const creationHash=await hash(JSON.stringify({options,script})),existing=await one(env,'SELECT * FROM dubbing_projects WHERE id=?',pid);
  if(existing){if(existing.owner_id!==user.id)fail(404,'작품을 찾을 수 없습니다.');if(existing.creation_hash!==creationHash)conflict();return json({project:await dto(env,await project(env,pid,user),user)});}
  let generationId=null;
  if(body.generationId){generationId=uuid(body.generationId);if(!await one(env,"SELECT id FROM dubbing_generations WHERE id=? AND user_id=? AND state='ready'",generationId,user.id))fail(400,'AI 대본 생성 기록을 확인해주세요.');}
  const key=await storeScript(env,user.id,pid,script,1);
  try{
   const inserted=await query(env,`INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,source,generation_id,role_count,duration,write_token,created,updated)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted') ON CONFLICT(id) DO NOTHING RETURNING id`,
    pid,user.id,script.title,JSON.stringify(options),JSON.stringify(script),key,creationHash,generationId?'ai':'manual',generationId,script.roles.length,dubbingTimeline(script).duration,id(),now(),now(),user.id).first();
   if(!inserted){await discard(env,key);const replay=await one(env,'SELECT * FROM dubbing_projects WHERE id=? AND owner_id=? AND creation_hash=?',pid,user.id,creationHash);if(!replay)conflict();}
  }catch(e){await discard(env,key);throw e;}
  return json({project:await dto(env,await project(env,pid,user),user)},201);
 }
 const match=path.match(/^\/api\/dubbing\/projects\/([^/]+)(?:\/(publish|unpublish|claims|sound|background|recording|final|like|comments|report|appeal)(?:\/(.+))?)?$/);
 if(!match)fail(404,'요청을 찾을 수 없습니다.');
 const pid=uuid(match[1]),action=match[2],roleId=match[3],p=await project(env,pid,user);
 const report=await dubbingReportRoute(req,env,p,user,action,roleId);if(report)return report;
 if(p.removed&&(action||method!=='GET'))fail(403,'권리 신고 검토로 이용이 중단된 작품입니다. 이의신청을 이용해주세요.');
 if(!['GET','HEAD','DELETE'].includes(method)&&user)await assertDubbingCreator(env,user.id);
 const community=await dubbingCommunityRoute(req,env,p,user,action,roleId);if(community)return community;
 const recording=await dubbingRecordingRoute(req,env,p,user,action,roleId);if(recording)return recording;
 const sound=await dubbingSoundProjectRoute(req,env,p,user,action);if(sound)return sound;
 if(!action&&method==='GET')return json({project:await dto(env,p,user)});
 requireUser(user);
 const body=await req.json(),rev=revision(body.revision),token=id();
 if(!action&&method==='PUT'){
  owner(p,user);const options=dubbingOptions(body.options),script=validateDubbingScript(body.script,options);
  let generationId=p.generation_id;
  if(body.generationId){generationId=uuid(body.generationId);if(!await one(env,"SELECT id FROM dubbing_generations WHERE id=? AND user_id=? AND state='ready'",generationId,user.id))fail(400,'AI 대본 생성 기록을 확인해주세요.');}
  const key=await storeScript(env,user.id,pid,script,rev+1);
  try{
   const updated=await query(env,`UPDATE dubbing_projects SET title=?,options_json=?,script_json=?,script_key=?,role_count=?,duration=?,generation_id=?,source=?,revision=revision+1,write_token=?,updated=?
    WHERE id=? AND owner_id=? AND revision=? AND first_recorded_at=0 AND visibility='private' AND ${activeOwner}
    AND NOT EXISTS(SELECT 1 FROM dubbing_role_claims WHERE project_id=?) RETURNING id`,
    script.title,JSON.stringify(options),JSON.stringify(script),key,script.roles.length,dubbingTimeline(script).duration,generationId,generationId?'ai':'manual',token,now(),pid,user.id,rev,pid).first();
   if(!updated)conflict();
  }catch(e){await discard(env,key);throw e;}
  await reconcileDubbingGold(env);
 }else if(['publish','unpublish'].includes(action)&&method==='POST'){
  owner(p,user);if(action==='publish'&&body.rightsAccepted!==true)fail(400,'대본을 공개하고 함께 연기할 권한을 확인해주세요.');
  const updated=await query(env,`UPDATE dubbing_projects SET visibility=?,state=CASE WHEN first_recorded_at>0 THEN state ELSE ? END,rights_at=?,revision=revision+1,write_token=?,updated=?
   WHERE id=? AND owner_id=? AND revision=? AND ${activeOwner} RETURNING id`,
   action==='publish'?'public':'private',action==='publish'?'recruiting':'script_ready',action==='publish'?now():p.rights_at,token,now(),pid,user.id,rev).first();
  if(!updated)conflict();
 }else if(action==='claims'&&roleId&&['POST','DELETE'].includes(method)){
  if(!JSON.parse(p.script_json).roles.some(r=>r.id===roleId))fail(404,'배역을 찾을 수 없습니다.');
  const claim=await one(env,'SELECT user_id FROM dubbing_role_claims WHERE project_id=? AND role_id=?',pid,roleId);
  if(method==='POST'&&claim?.user_id===user.id)return json({project:await dto(env,p,user)});
  if(method==='DELETE'&&claim?.user_id!==user.id)fail(403,'내가 선택한 배역만 취소할 수 있습니다.');
  if(method==='DELETE'&&await one(env,'SELECT id FROM dubbing_recordings WHERE project_id=? AND role_id=?',pid,roleId))fail(409,'이미 녹음을 시작한 배역입니다. 녹음 화면에서 이어서 진행해주세요.');
  const update=query(env,`UPDATE dubbing_projects SET revision=revision+1,write_token=?,updated=? WHERE id=? AND revision=?
   ${method==='POST'?"AND visibility='public' AND state IN ('recruiting','recording')":'AND NOT EXISTS(SELECT 1 FROM dubbing_recordings WHERE project_id=dubbing_projects.id AND role_id=?)'} AND ${activeOwner} RETURNING id`,token,now(),pid,rev,...(method==='DELETE'?[roleId]:[]));
  const write=method==='POST'?query(env,`INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created)
   SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?) AND EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted')`,pid,roleId,user.id,now(),pid,token,user.id):
   query(env,'DELETE FROM dubbing_role_claims WHERE project_id=? AND role_id=? AND user_id=? AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?)',pid,roleId,user.id,pid,token);
  let result;
  try{result=await env.DB.batch([update,write]);}catch(e){if(/unique|constraint/i.test(e.message))fail(409,'이미 선택된 배역입니다. 한 작품에서는 한 배역을 선택할 수 있어요.');throw e;}
  if(!result[0]?.results?.length)conflict();
  if(method==='DELETE'&&p.visibility==='private'&&p.owner_id!==user.id)return json({released:true,project:null});
 }else fail(405,'허용되지 않는 요청입니다.');
 return json({project:await dto(env,await project(env,pid,user),user)});
}
