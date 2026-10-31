import {one,rows,query,run,now,id,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {dubbingVisibleSQL,assertDubbingCreator} from './dubbing-access.js';
import {dubbingRecordingWindows} from '../shared/dubbing-recording.js';

export const CASTING_LICENSE='casting-2026-11-01';
export const CASTING_TTL=30*86400;
const validId=v=>typeof v==='string'&&/^[\w-]{1,80}$/.test(v);
const blockSQL=`NOT EXISTS(SELECT 1 FROM dubbing_recordings br JOIN user_blocks b ON (b.user_id=? AND b.blocked_id=br.user_id) OR (b.blocked_id=? AND b.user_id=br.user_id) WHERE br.project_id=p.id)`;
async function accessible(env,pid,user){
 const uid=user?.id||'';
 const p=await one(env,`SELECT p.*,${publicNameSQL('u')} owner_name FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND u.provider!='deleted' AND ${dubbingVisibleSQL()}
 AND (p.visibility='public' OR p.owner_id=?) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.owner_id) OR (b.blocked_id=? AND b.user_id=p.owner_id)) AND ${blockSQL}`,pid,uid,uid,uid,uid,uid);
 if(!p)fail(404,'더빙 작품을 찾을 수 없습니다.');return p;
}
async function baseRecording(env,root){
 return one(env,`SELECT r.* FROM dubbing_recordings r JOIN dubbing_recording_permissions v ON v.recording_id=r.id WHERE r.project_id=? AND r.user_id=? AND r.state='submitted' AND v.visibility='public' AND v.license_version=? ORDER BY r.created LIMIT 1`,root.id,root.owner_id,CASTING_LICENSE);
}
async function members(env,pid,onlyRecord=null){
 const list=await rows(env,`SELECT r.id,r.role_id roleId,${publicNameSQL('u')} name,u.account_type,(SELECT id FROM producers WHERE user_id=u.id) profile_id,(SELECT image_version FROM producers WHERE user_id=u.id) image_version
 FROM dubbing_recordings r JOIN users u ON u.id=r.user_id WHERE r.project_id=? AND r.state='submitted' AND u.provider!='deleted' ${onlyRecord?'AND r.id=?':''} ORDER BY r.role_id`,pid,...(onlyRecord?[onlyRecord]:[]));
 return list.map(({id:recordId,...m})=>m);
}
export async function castingInfo(env,p,user){
 const draft=await one(env,'SELECT root_id rootId,target_id targetId,committed_id committedId FROM dubbing_casting_drafts WHERE project_id=?',p.id);
 const combo=await one(env,'SELECT render_requested renderRequested,expired_at expiredAt,offsets_json offsetsJson FROM dubbing_combinations WHERE project_id=?',p.id);
 return {draft,combination:combo?{...combo,offsets:JSON.parse(combo.offsetsJson)}:null,isRoot:!p.root_id};
}
export async function castingRootView(env,pid,user){
 const root=await accessible(env,pid,user);if(root.root_id)fail(400,'원작 대본을 선택해주세요.');
 const script=JSON.parse(root.script_json),uid=user?.id||'',base=await baseRecording(env,root);
 const combos=await rows(env,`SELECT p.id,p.state,c.last_participation,(SELECT COUNT(*) FROM dubbing_recordings r WHERE r.project_id=p.id AND r.state='submitted') count
 FROM dubbing_combinations c JOIN dubbing_projects p ON p.id=c.project_id WHERE c.root_id=? AND c.expired_at=0 AND p.visibility='public' AND ${dubbingVisibleSQL()}
 AND (p.state='complete' OR c.last_participation>?) AND ${blockSQL} ORDER BY count DESC,c.last_participation DESC LIMIT 100`,pid,now()-CASTING_TTL,uid,uid);
 const combinations=[];for(const c of combos)combinations.push({...c,members:await members(env,c.id),expiresAt:c.state==='complete'?null:c.last_participation+CASTING_TTL});
 if(base)combinations.push({id:root.id,base:true,count:1,state:'base',members:await members(env,root.id,base.id),expiresAt:null});
 return {root:{id:root.id,title:root.title,ownerName:root.owner_name,roleCount:root.role_count,genres:JSON.parse(root.options_json).genres,roles:script.roles,isOwner:uid===root.owner_id},combinations,baseReady:!!base};
}
async function readyBackground(env,p){
 const bg=await one(env,"SELECT * FROM dubbing_sound_jobs WHERE project_id=? AND script_key=? AND state='ready' AND output_key IS NOT NULL",p.id,p.script_key);
 if(!bg||!await env.BUCKET.head(bg.output_key))fail(409,'원작의 배경 오디오 준비가 끝나면 녹음할 수 있어요.');return bg;
}
function cloneProject(env,root,pid,owner,visibility,token,guard='1=1',args=[]){
 return query(env,`INSERT INTO dubbing_projects(id,owner_id,title,options_json,script_json,script_key,creation_hash,source,state,visibility,root_id,role_count,duration,write_token,rights_at,created,updated)
 SELECT ?,?,p.title,p.options_json,p.script_json,p.script_key,?,'manual','recording',?,p.id,p.role_count,p.duration,?,?,?,? FROM dubbing_projects p WHERE p.id=? AND ${dubbingVisibleSQL()} AND ${guard} ON CONFLICT(id) DO NOTHING`,pid,owner,'casting:'+pid,visibility,token,now(),now(),now(),root.id,...args);
}
function cloneBackground(env,bg,pid,token){
 return query(env,`INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,state,output_key,created,updated) SELECT ?,?,script_key,mode,timeline_json,'ready',output_key,?,? FROM dubbing_sound_jobs WHERE id=? AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?) ON CONFLICT(project_id,script_key) DO NOTHING`,id(),pid,now(),now(),bg.id,pid,token);
}
async function startDraft(env,root,user,body){
 requireUser(user);await assertDubbingCreator(env,user.id);
 if(root.root_id||root.visibility!=='public')fail(409,'공개 모집 중인 원작에서 참여해주세요.');
 if(!validId(body.id)||!validId(body.roleId))fail(400,'녹음 요청을 확인해주세요.');
 const old=await one(env,'SELECT p.owner_id,d.* FROM dubbing_casting_drafts d JOIN dubbing_projects p ON p.id=d.project_id WHERE d.project_id=?',body.id);
 if(old){if(old.owner_id!==user.id||old.root_id!==root.id||old.role_id!==body.roleId)fail(409,'다른 녹음 요청입니다.');return {projectId:old.project_id};}
 const base=await baseRecording(env,root),script=JSON.parse(root.script_json);
 if(!base)fail(409,'원작자의 공개 녹음이 먼저 필요해요.');
 if(root.owner_id===user.id)fail(409,'원작자 녹음은 기본 조합에서 유지됩니다. 다른 참여자의 목소리를 기다려주세요.');
 if(!script.roles.some(r=>r.id===body.roleId)||base.role_id===body.roleId)fail(409,'비어 있는 배역을 선택해주세요.');
 let target=null;if(body.targetId&&body.targetId!==root.id){target=await accessible(env,body.targetId,user);const c=await one(env,'SELECT * FROM dubbing_combinations WHERE project_id=? AND root_id=? AND expired_at=0 AND last_participation>?',target.id,root.id,now()-CASTING_TTL);if(!c||target.state==='complete')fail(409,'이 조합은 참여가 마감되었어요.');}
 if(target&&await one(env,'SELECT id FROM dubbing_recordings WHERE project_id=? AND (role_id=? OR user_id=?)',target.id,body.roleId,user.id))fail(409,'이미 참여 중이거나 채워진 배역입니다.');
 await rate(env,'casting-draft:'+user.id,30,3600);
 const bg=await readyBackground(env,root),token=id();
 await env.DB.batch([cloneProject(env,root,body.id,user.id,'private',token),cloneBackground(env,bg,body.id,token),
 query(env,'INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) VALUES(?,?,?,?)',body.id,body.roleId,user.id,now()),
 query(env,'INSERT INTO dubbing_casting_drafts(project_id,root_id,target_id,destination_id,role_id,created) VALUES(?,?,?,?,?,?)',body.id,root.id,target?.id||null,target?.id||id(),body.roleId,now())]);
 return {projectId:body.id};
}
function copyTake(env,recordId,pid,token){
 const rid=id();return [
 query(env,`INSERT INTO dubbing_role_claims(project_id,role_id,user_id,created) SELECT ?,role_id,user_id,? FROM dubbing_recordings WHERE id=? AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?)`,pid,now(),recordId,pid,token),
 query(env,`INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,state,write_token,rights_at,created,updated) SELECT ?,?,role_id,user_id,script_key,'submitted',?,rights_at,?,? FROM dubbing_recordings WHERE id=? AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?)`,rid,pid,token,now(),now(),recordId,pid,token),
 query(env,`INSERT INTO dubbing_recording_lines(recording_id,line_id,take_id,audio_key,audio_hash,duration,bytes,updated) SELECT ?,line_id,?||':'||line_id,audio_key,audio_hash,duration,bytes,updated FROM dubbing_recording_lines WHERE recording_id=? AND EXISTS(SELECT 1 FROM dubbing_recordings WHERE id=?)`,rid,rid,recordId,rid),
 query(env,`INSERT INTO dubbing_recording_permissions(recording_id,visibility,license_version,accepted_at) SELECT ?,'public',?,? WHERE EXISTS(SELECT 1 FROM dubbing_recordings WHERE id=?)`,rid,CASTING_LICENSE,now(),rid)];
}
// Return null only for legacy clients. New clients always choose visibility explicitly.
export async function submitCastingRecording(env,p,user,record,body){
 const draft=await one(env,'SELECT * FROM dubbing_casting_drafts WHERE project_id=?',p.id);
 if(!draft&&!body.visibility)return null;
 if(!['public','private'].includes(body.visibility))fail(400,'내 더빙 녹음 공개 설정을 선택해주세요.');
 if(draft?.committed_id)return {combinationId:draft.committed_id,submitted:true};
 if(record.user_id!==user.id)fail(403,'내 녹음만 제출할 수 있습니다.');
 const expected=JSON.parse(p.script_json).lines.filter(l=>l.roleId===record.role_id).length;
 const count=await one(env,'SELECT COUNT(*) n FROM dubbing_recording_lines WHERE recording_id=?',record.id);
 if(!expected||count.n!==expected||record.revision!==body.revision)fail(409,'모든 대사를 저장하고 최신 상태에서 제출해주세요.');
 if(body.visibility==='private'){
  if(record.state==='submitted')fail(409,'이미 공개된 녹음입니다. 작품 관리에서 공개 범위를 확인해주세요.');
  const saved=await query(env,"INSERT INTO dubbing_recording_permissions(recording_id,visibility) SELECT id,'private' FROM dubbing_recordings WHERE id=? AND state='draft' AND revision=? ON CONFLICT(recording_id) DO UPDATE SET visibility='private',license_version='',accepted_at=0 RETURNING recording_id",record.id,body.revision).first();
  if(!saved)fail(409,'녹음 상태가 변경됐어요. 저장된 내용을 다시 확인해주세요.');
  return {private:true};
 }
 if(body.rightsAccepted!==true||body.licenseVersion!==CASTING_LICENSE)fail(400,'공개 캐스팅 이용허락을 확인해주세요.');
 const token=id(),stamp=now();
 const permission=query(env,`INSERT INTO dubbing_recording_permissions(recording_id,visibility,license_version,accepted_at) SELECT ?,'public',?,? WHERE EXISTS(SELECT 1 FROM dubbing_recordings WHERE id=? AND write_token=?) ON CONFLICT(recording_id) DO UPDATE SET visibility='public',license_version=excluded.license_version,accepted_at=excluded.accepted_at`,record.id,CASTING_LICENSE,stamp,record.id,token);
 if(!draft){
  // Existing in-flight performances keep their pre-migration path. Explicit
  // permission is recorded, but they are never invented as managed combinations.
  if(p.root_id||p.owner_id!==user.id){await run(env,"INSERT INTO dubbing_recording_permissions(recording_id,visibility,license_version,accepted_at) VALUES(?,'public',?,?) ON CONFLICT(recording_id) DO UPDATE SET visibility='public',license_version=excluded.license_version,accepted_at=excluded.accepted_at",record.id,CASTING_LICENSE,stamp);return null;}
  const saved=await env.DB.batch([query(env,`UPDATE dubbing_recordings SET state='submitted',rights_at=?,revision=revision+1,write_token=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM dubbing_recordings r JOIN dubbing_recording_permissions v ON v.recording_id=r.id WHERE r.project_id=? AND r.id!=? AND r.user_id=? AND v.visibility='public') RETURNING id`,stamp,token,record.id,body.revision,p.id,record.id,user.id),permission]);
  if(!saved[0].results.length)fail(409,'기본 녹음은 한 배역만 공개할 수 있어요.');return {base:true,submitted:true};
 }
 const root=await accessible(env,draft.root_id,user),base=await baseRecording(env,root);
 if(!base||root.visibility!=='public')fail(409,'원작 모집이 중지됐어요. 내 녹음은 임시 저장되어 있어요.');
 const pid=draft.destination_id,statements=[];
 // The destination is locked only if the submitting draft still has the exact
 // revision and complete line set checked by the caller. All following writes
 // require this fresh token, making a losing submission a no-op transaction.
 const sourceGuard=`EXISTS(SELECT 1 FROM dubbing_recordings sr JOIN dubbing_casting_drafts sd ON sd.project_id=sr.project_id WHERE sr.id=? AND sr.revision=? AND sr.state='draft' AND sd.committed_id IS NULL AND sd.destination_id=? AND (SELECT COUNT(*) FROM dubbing_recording_lines sl WHERE sl.recording_id=sr.id)=?)`;
 const sourceArgs=[record.id,body.revision,pid,expected];
 if(draft.target_id){
  const target=await accessible(env,pid,user);
  statements.push(query(env,`UPDATE dubbing_projects SET write_token=?,revision=revision+1,updated=? WHERE id=? AND state!='complete' AND visibility='public' AND ${dubbingVisibleSQL('dubbing_projects')}
   AND EXISTS(SELECT 1 FROM dubbing_combinations WHERE project_id=? AND root_id=? AND expired_at=0 AND last_participation>?)
   AND NOT EXISTS(SELECT 1 FROM dubbing_recordings WHERE project_id=? AND (role_id=? OR user_id=?)) AND ${sourceGuard} RETURNING id`,token,stamp,target.id,pid,root.id,stamp-CASTING_TTL,pid,record.role_id,user.id,...sourceArgs));
 }else{
  statements.push(cloneProject(env,root,pid,user.id,'public',token,`p.visibility='public' AND ${sourceGuard}`,sourceArgs));
  statements.push(query(env,`INSERT INTO dubbing_combinations(project_id,root_id,last_participation) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?) ON CONFLICT(project_id) DO NOTHING`,pid,root.id,stamp,pid,token));
  statements.push(cloneBackground(env,await readyBackground(env,root),pid,token),...copyTake(env,base.id,pid,token));
 }
 statements.push(query(env,`UPDATE dubbing_recordings SET state='submitted',revision=revision+1,rights_at=?,write_token=? WHERE id=? AND revision=? AND state='draft' AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?)`,stamp,token,record.id,body.revision,pid,token),permission,...copyTake(env,record.id,pid,token));
 statements.push(query(env,`UPDATE dubbing_combinations SET last_participation=? WHERE project_id=? AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?)`,stamp,pid,pid,token));
 statements.push(query(env,`UPDATE dubbing_projects SET state=CASE WHEN (SELECT COUNT(*) FROM dubbing_recordings r WHERE r.project_id=? AND r.state='submitted')=role_count THEN 'complete' ELSE 'recording' END WHERE id=? AND write_token=?`,pid,pid,token));
 statements.push(query(env,`UPDATE dubbing_casting_drafts SET committed_id=? WHERE project_id=? AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND write_token=?) RETURNING committed_id`,pid,p.id,pid,token));
 let result;try{result=await env.DB.batch(statements);}catch(e){if(/unique|constraint/i.test(e.message))fail(409,'이 배역에 다른 녹음이 먼저 등록됐어요. 내 녹음은 보존됩니다. 다른 조합을 선택해주세요.');throw e;}
 if(!result.at(-1).results.length)fail(409,'이 조합은 마감됐거나 배역이 채워졌어요. 내 녹음은 보존됩니다. 다른 조합을 선택해주세요.');
 return {combinationId:pid,submitted:true};
}
export async function castingLines(env,pid,user){
 const p=await accessible(env,pid,user),combo=await one(env,'SELECT * FROM dubbing_combinations WHERE project_id=?',pid);
 if(combo&&(combo.expired_at||p.state!=='complete'&&combo.last_participation<=now()-CASTING_TTL))fail(404,'만료된 조합입니다.');
 const base=!p.root_id?await baseRecording(env,p):null;
 const takes=await rows(env,`SELECT r.role_id,l.line_id,l.duration,l.take_id FROM dubbing_recordings r JOIN dubbing_recording_lines l ON l.recording_id=r.id WHERE r.project_id=? AND r.state='submitted' ${base?'AND r.id=?':!combo?'AND 0=1':''}`,pid,...(base?[base.id]:[]));
 const script=JSON.parse(p.script_json),bg=await one(env,"SELECT timeline_json FROM dubbing_sound_jobs WHERE project_id=? AND script_key=? AND state='ready'",pid,p.script_key),timeline=dubbingRecordingWindows(script,bg?JSON.parse(bg.timeline_json):null),offsets=JSON.parse(combo?.offsets_json||'{}');
 return {projectId:pid,complete:p.state==='complete',canRender:p.state==='complete'&&p.owner_id===user?.id&&!!combo,offsets,members:combo||base?await members(env,pid,base?.id):[],duration:timeline.duration,backgroundUrl:`/api/dubbing/projects/${pid}/background`,lines:timeline.lines.map(l=>{const t=takes.find(t=>t.line_id===l.id);const text=script.lines.find(t=>t.id===l.id);return {...l,text:text.text,roleName:script.roles.find(r=>r.id===l.roleId)?.name,...(t?{duration:t.duration,audioUrl:`/api/dubbing/casting/${pid}/audio/${t.role_id}/${l.id}`}:{})};})};
}
export async function dubbingCastingRoute(req,env,path,user){
 if(!path.startsWith('/api/dubbing/casting/'))return null;
 if(path==='/api/dubbing/casting/mine'&&req.method==='GET'){
  requireUser(user);const q=new URL(req.url).searchParams,kind=q.get('kind')||'original',offset=Math.max(0,Math.min(10000,Number(q.get('offset'))||0));
  const where={original:'p.root_id IS NULL AND p.owner_id=?',recording:"p.state!='complete' AND EXISTS(SELECT 1 FROM dubbing_recordings r WHERE r.project_id=p.id AND r.user_id=?) AND NOT EXISTS(SELECT 1 FROM dubbing_casting_drafts d WHERE d.project_id=p.id AND d.committed_id IS NOT NULL)",produced:"p.state='complete' AND p.owner_id=?",acted:"p.state='complete' AND EXISTS(SELECT 1 FROM dubbing_recordings r WHERE r.project_id=p.id AND r.user_id=?)"}[kind];
  if(!where)fail(400,'내 작업 종류를 확인해주세요.');
  const needle='%'+(q.get('q')||'').slice(0,100)+'%';
  const list=await rows(env,`SELECT p.id,p.title,p.state,p.visibility,p.options_json,p.role_count roleCount,p.duration,${publicNameSQL('u')} ownerName,(SELECT COUNT(*) FROM dubbing_recordings r WHERE r.project_id=p.id AND r.state='submitted') participants FROM dubbing_projects p JOIN users u ON u.id=p.owner_id WHERE ${dubbingVisibleSQL()} AND ${where} AND p.title LIKE ? ORDER BY p.updated DESC,p.id LIMIT 25 OFFSET ?`,user.id,needle,offset);
  return json({projects:list.map(({options_json,...p})=>({...p,genres:JSON.parse(options_json).genres})),nextOffset:list.length===25?offset+25:null});
 }
 const m=path.match(/^\/api\/dubbing\/casting\/([\w-]+)(?:\/(start|lines|audio|retarget|render|timing)(?:\/([\w-]+)\/([\w-]+))?)?$/);if(!m)fail(404,'더빙 참여 경로가 없습니다.');
 const [,pid,action,role,line]=m;
 if(!action&&req.method==='GET')return json(await castingRootView(env,pid,user));
 if(action==='lines'&&req.method==='GET')return json(await castingLines(env,pid,user));
 if(action==='audio'&&['GET','HEAD'].includes(req.method)){
  const data=await castingLines(env,pid,user);if(!data.lines.some(l=>l.id===line&&l.roleId===role&&l.audioUrl))fail(404,'공개된 녹음이 없습니다.');
  const l=await one(env,'SELECT l.audio_key FROM dubbing_recording_lines l JOIN dubbing_recordings r ON r.id=l.recording_id WHERE r.project_id=? AND r.role_id=? AND l.line_id=?',pid,role,line);
  const o=l&&await env.BUCKET.get(l.audio_key);if(!o)fail(404,'녹음 파일을 찾을 수 없습니다.');
  return new Response(req.method==='HEAD'?null:o.body,{headers:{'content-type':'audio/wav','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 requireUser(user);if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');const body=await req.json();
 if(action==='start')return json(await startDraft(env,await accessible(env,pid,user),user,body),201);
 if(action==='retarget'){
  const p=await accessible(env,pid,user),draft=await one(env,'SELECT * FROM dubbing_casting_drafts WHERE project_id=? AND committed_id IS NULL',pid);
  if(!draft||p.owner_id!==user.id)fail(404,'내 녹음 초안을 찾을 수 없습니다.');
  if(body.targetId){
   const target=await accessible(env,body.targetId,user);
   const active=await one(env,'SELECT 1 FROM dubbing_combinations WHERE project_id=? AND root_id=? AND expired_at=0 AND last_participation>?',target.id,draft.root_id,now()-CASTING_TTL);
   const occupied=await one(env,'SELECT 1 FROM dubbing_recordings WHERE project_id=? AND (role_id=? OR user_id=?)',target.id,draft.role_id,user.id);
   if(!active||target.state==='complete'||occupied)fail(409,'이 배역이 비어 있는 다른 진행 조합을 선택해주세요.');
  }
  await run(env,'UPDATE dubbing_casting_drafts SET target_id=?,destination_id=? WHERE project_id=? AND committed_id IS NULL',body.targetId||null,body.targetId||id(),pid);return json({ok:true});
 }
 if(['render','timing'].includes(action)){
  const p=await accessible(env,pid,user),combo=await one(env,'SELECT * FROM dubbing_combinations WHERE project_id=? AND expired_at=0',pid);
  if(!combo||p.owner_id!==user.id||p.state!=='complete')fail(403,'완성작 제작자만 저장·게시할 수 있어요.');
  if(action==='timing'){
   const script=JSON.parse(p.script_json),n=Number(body.offset);if(!script.lines.some(l=>l.id===body.lineId)||!Number.isFinite(n)||Math.abs(n)>1)fail(400,'대사 시작은 ±1초 안에서 조정해주세요.');
   const saved=await query(env,"UPDATE dubbing_combinations SET offsets_json=json_set(offsets_json,?,?) WHERE project_id=? AND render_requested=0 AND NOT EXISTS(SELECT 1 FROM dubbing_final_jobs WHERE project_id=?) RETURNING offsets_json",'$.'+JSON.stringify(body.lineId),Math.round(n*10)/10,pid,pid).first();
   if(!saved)fail(409,'최종 저장을 시작한 작품의 타이밍은 변경할 수 없어요.');return json({offsets:JSON.parse(saved.offsets_json)});
  }
  if(body.rightsAccepted!==true)fail(400,'참여 음성 이용허락을 확인하고 저장·게시해주세요.');
  await rate(env,'casting-render:'+user.id,10,3600);
  await run(env,'UPDATE dubbing_combinations SET render_requested=? WHERE project_id=? AND expired_at=0',now(),pid);
  await run(env,"UPDATE dubbing_final_jobs SET state='invalidated' WHERE project_id=? AND script_key=? AND state='failed'",pid,p.script_key);
  const {queueDubbingFinal}=await import('./dubbing-recording.js');await queueDubbingFinal(env,p);
  const job=await one(env,'SELECT state FROM dubbing_final_jobs WHERE project_id=? AND script_key=?',pid,p.script_key);if(!job)fail(409,'저장 요청은 보관됐어요. 배경과 녹음을 확인한 뒤 다시 저장해주세요.');return json({queued:true,state:job.state});
 }
 fail(404,'더빙 참여 기능을 찾을 수 없습니다.');
}

// Bounded scheduled sweep + durable R2 retry outbox. No legacy or private draft deletion.
export async function expireDubbingCombinations(env,stamp=now()){
 if(env.DUBBING_ENABLED!=='true'||!env.BUCKET)return;
 const expired=await query(env,`UPDATE dubbing_combinations SET expired_at=? WHERE project_id IN (SELECT c.project_id FROM dubbing_combinations c JOIN dubbing_projects p ON p.id=c.project_id WHERE c.expired_at=0 AND c.last_participation<=? AND p.state!='complete' LIMIT 20) RETURNING project_id`,stamp,stamp-CASTING_TTL).all();
 // Include interrupted sweeps, not just newly marked rows.
 const pending=await rows(env,'SELECT c.project_id FROM dubbing_combinations c JOIN dubbing_projects p ON p.id=c.project_id WHERE c.expired_at>0 AND p.deleted_at=0 LIMIT 20');
 for(const c of pending){
  const ids=[...(await rows(env,'SELECT project_id FROM dubbing_casting_drafts WHERE committed_id=?',c.project_id)).map(d=>d.project_id),c.project_id];
  for(const pid of ids)await env.DB.batch([
   query(env,`INSERT INTO dubbing_audio_cleanup(object_key,created) SELECT l.audio_key,? FROM dubbing_recording_lines l JOIN dubbing_recordings r ON r.id=l.recording_id WHERE r.project_id=? ON CONFLICT(object_key) DO NOTHING`,stamp,pid),
   query(env,'DELETE FROM dubbing_recordings WHERE project_id=?',pid),query(env,'DELETE FROM dubbing_role_claims WHERE project_id=?',pid),
   query(env,"UPDATE dubbing_projects SET deleted_at=?,visibility='private' WHERE id=?",stamp,pid)]);
 }
 for(const item of await rows(env,'SELECT object_key FROM dubbing_audio_cleanup ORDER BY created LIMIT 100')){
  const referenced=await one(env,`SELECT 1 present WHERE EXISTS(SELECT 1 FROM dubbing_recording_lines WHERE audio_key=?) OR EXISTS(SELECT 1 FROM dubbing_final_jobs j,dubbing_projects p,json_each(j.manifest_json,'$.lines') l WHERE p.id=j.project_id AND p.deleted_at=0 AND json_extract(l.value,'$.key')=?)`,item.object_key,item.object_key);
  if(referenced){await run(env,'DELETE FROM dubbing_audio_cleanup WHERE object_key=?',item.object_key);continue;}
  try{await env.BUCKET.delete(item.object_key);await run(env,'DELETE FROM dubbing_audio_cleanup WHERE object_key=?',item.object_key);}catch{await run(env,"UPDATE dubbing_audio_cleanup SET attempts=attempts+1,last_error='R2 delete failed; retry pending' WHERE object_key=?",item.object_key);}
 }
 return {expired:expired.results.length};
}
