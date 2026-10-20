import {dubbingVisibleSQL} from './dubbing-access.js';
import {one,rows,query,run,now,id,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {dubbingRecordingWindows,validateDubbingTake} from '../shared/dubbing-recording.js';
import {dubbingSoundStatus} from './dubbing-sound.js';
import {dubbingTimeline} from '../shared/dubbing.js';

export const recordingEnabled=env=>env.DUBBING_RECORDING_ENABLED==='true'&&!!env.BUCKET&&!!env.TRANSCODER_TOKEN;
const active=`${dubbingVisibleSQL()} AND EXISTS(SELECT 1 FROM users WHERE id=p.owner_id AND provider!='deleted')`;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const conflict=()=>fail(409,'녹음이 다른 창에서 변경됐어요. 저장된 내용을 다시 불러와주세요.');
async function audioResponse(req,env,key,type='audio/wav'){
 const obj=key&&await env.BUCKET.get(key);if(!obj)fail(404,'오디오 파일을 찾을 수 없습니다.');
 return new Response(req.method==='HEAD'?null:obj.body,{headers:{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff',...(obj.size?{'content-length':String(obj.size)}:{})}});
}
export async function dubbingRecordingStatus(env,p,user){
 const recordings=await rows(env,`SELECT r.id,r.role_id,r.user_id,r.state,r.revision,(SELECT COUNT(*) FROM dubbing_recording_lines l WHERE l.recording_id=r.id) saved FROM dubbing_recordings r JOIN users u ON u.id=r.user_id WHERE r.project_id=? AND u.provider!='deleted'`,p.id);
 const final=await one(env,'SELECT state,error FROM dubbing_final_jobs WHERE project_id=? AND script_key=?',p.id,p.script_key);
 const allSubmitted=recordings.length===p.role_count&&recordings.every(r=>r.state==='submitted');
 const blocked=recordings.some(r=>env.AIFECT_BLOCKED?.includes(r.user_id));
 return {available:recordingEnabled(env),roles:recordings.map(r=>({roleId:r.role_id,state:r.state,saved:r.saved,...(r.user_id===user?.id?{revision:r.revision}:{})})),
  final:final?{state:allSubmitted?final.state:'invalidated',error:final.error,audioUrl:allSubmitted&&!blocked&&final.state==='ready'?`/api/dubbing/projects/${p.id}/final`:null}:null};
}
async function recordingView(env,p,user){
 const script=JSON.parse(p.script_json),timeline=dubbingRecordingWindows(script);
 const takes=await rows(env,`SELECT r.role_id,r.user_id,r.state,l.line_id,l.duration,l.take_id FROM dubbing_recordings r JOIN dubbing_recording_lines l ON l.recording_id=r.id JOIN users u ON u.id=r.user_id
  WHERE r.project_id=? AND u.provider!='deleted' AND (r.user_id=? OR r.state='submitted')`,p.id,user.id);
 const visible=takes.filter(t=>!env.AIFECT_BLOCKED?.includes(t.user_id));
 return {recording:await dubbingRecordingStatus(env,p,user),timeline,lines:timeline.lines.map(l=>{
  const t=visible.find(t=>t.line_id===l.id);return {...l,...(t?{takeId:t.take_id,duration:t.duration,audioUrl:`/api/dubbing/projects/${p.id}/recording/${t.role_id}/lines/${l.id}`}:{})};
 })};
}
export async function queueDubbingFinal(env,p){
 const recordings=await rows(env,"SELECT * FROM dubbing_recordings WHERE project_id=? AND state='submitted'",p.id);
 if(recordings.length!==p.role_count)return;
 const bg=await one(env,"SELECT output_key FROM dubbing_sound_jobs WHERE project_id=? AND script_key=? AND state='ready'",p.id,p.script_key);if(!bg)return;
 const lines=await rows(env,'SELECT l.*,r.role_id,r.user_id FROM dubbing_recording_lines l JOIN dubbing_recordings r ON r.id=l.recording_id WHERE r.project_id=?',p.id);
 const timeline=dubbingRecordingWindows(JSON.parse(p.script_json));
 if(lines.length!==timeline.lines.length)return;
 const manifest={duration:timeline.duration,background:bg.output_key,lines:timeline.lines.map(l=>{const take=lines.find(t=>t.line_id===l.id);return {id:l.id,start:l.start,end:l.recordEnd,key:take.audio_key,takeId:take.take_id,userId:take.user_id};})};
 await query(env,`INSERT INTO dubbing_final_jobs(id,project_id,script_key,manifest_json,created,updated)
  SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM dubbing_recordings r JOIN users u ON u.id=r.user_id WHERE r.project_id=? AND r.state='submitted' AND u.provider!='deleted')=? AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=? AND ${dubbingVisibleSQL()})
  ON CONFLICT(project_id,script_key) DO UPDATE SET id=excluded.id,state='queued',manifest_json=excluded.manifest_json,attempts=0,lease_token=NULL,lease_until=0,output_key=NULL,output_meta=NULL,error='',updated=excluded.updated WHERE dubbing_final_jobs.state='invalidated'`,id(),p.id,p.script_key,JSON.stringify(manifest),now(),now(),p.id,p.role_count,p.id).run();
}
export async function dubbingRecordingRoute(req,env,p,user,action,rest=''){
 if(!['recording','final'].includes(action))return null;
 if(action==='final'){
  if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  const status=await dubbingRecordingStatus(env,p,user);if(!status.final?.audioUrl)fail(404,'완성 오디오가 아직 준비되지 않았습니다.');
  const job=await one(env,"SELECT output_key FROM dubbing_final_jobs WHERE project_id=? AND script_key=? AND state='ready'",p.id,p.script_key);
  return audioResponse(req,env,job?.output_key,'audio/mp4');
 }
 requireUser(user);
 if(!recordingEnabled(env))fail(503,'더빙 녹음 기능을 준비하고 있어요.');
 const claim=await one(env,'SELECT role_id FROM dubbing_role_claims WHERE project_id=? AND user_id=?',p.id,user.id);
 if(!claim)fail(403,'먼저 참여할 배역을 선택해주세요.');
 if(!rest&&req.method==='GET')return json(await recordingView(env,p,user));
 if(rest==='prepare'&&req.method==='POST'){
  // A claimed participant may prepare silence, but cannot spend the owner's
  // Gold or replace an existing paid sound job.
  if(env.DUBBING_SOUND_ENABLED!=='true')fail(503,'녹음 준비 서버를 확인하고 있어요.');
  if(!await one(env,'SELECT id FROM dubbing_sound_jobs WHERE project_id=? AND script_key=?',p.id,p.script_key)){
   await rate(env,'dubbing-record-prepare:'+user.id,20,3600);
   const timeline=dubbingTimeline(JSON.parse(p.script_json));timeline.sounds=[];
   await query(env,`INSERT INTO dubbing_sound_jobs(id,project_id,script_key,mode,timeline_json,created,updated)
    SELECT ?,?,?,'basic',?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=? AND p.script_key=? AND p.first_recorded_at=0 AND ${active}
    AND EXISTS(SELECT 1 FROM dubbing_role_claims c WHERE c.project_id=p.id AND c.user_id=?))
    ON CONFLICT(project_id,script_key) DO NOTHING`,id(),p.id,p.script_key,JSON.stringify(timeline),now(),now(),p.id,p.script_key,user.id).run();
  }
  const sound=await dubbingSoundStatus(env,p);
  if(sound.state==='not_started')conflict();
  return json({sound},sound.state==='ready'?200:202);
 }
 const match=rest.match(/^([\w-]+)(?:\/(start|submit|lines)(?:\/([\w-]+))?)?$/);
 if(!match)fail(404,'녹음 경로를 찾을 수 없습니다.');
 const role=match[1],operation=match[2],lineId=match[3];
 if(operation==='lines'&&['GET','HEAD'].includes(req.method)){
  const take=await one(env,`SELECT l.audio_key,r.user_id,r.state FROM dubbing_recordings r JOIN dubbing_recording_lines l ON l.recording_id=r.id JOIN users u ON u.id=r.user_id WHERE r.project_id=? AND r.role_id=? AND l.line_id=? AND u.provider!='deleted'`,p.id,role,lineId);
  if(!take||env.AIFECT_BLOCKED?.includes(take.user_id)||(take.user_id!==user.id&&take.state!=='submitted'))fail(404,'녹음 파일을 찾을 수 없습니다.');
  return audioResponse(req,env,take.audio_key);
 }
 if(claim.role_id!==role)fail(403,'내가 선택한 배역만 녹음할 수 있습니다.');
 if(operation==='start'&&req.method==='POST'){
  const body=await req.json(),bg=await one(env,"SELECT id FROM dubbing_sound_jobs WHERE project_id=? AND script_key=? AND state='ready'",p.id,p.script_key);
  if(!bg||body.soundId!==bg.id)fail(409,'완성된 배경 오디오를 확인한 뒤 녹음해주세요.');
  const token=id(),at=now();
  await env.DB.batch([
   query(env,`UPDATE dubbing_projects AS p SET first_recorded_at=CASE WHEN first_recorded_at=0 THEN ? ELSE first_recorded_at END,state='recording',updated=? WHERE id=? AND script_key=? AND state IN ('recruiting','recording') AND ${active} AND EXISTS(SELECT 1 FROM dubbing_role_claims WHERE project_id=p.id AND role_id=? AND user_id=?)`,at,at,p.id,p.script_key,role,user.id),
   query(env,`INSERT INTO dubbing_recordings(id,project_id,role_id,user_id,script_key,write_token,created,updated)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=? AND ${dubbingVisibleSQL()} AND p.script_key=? AND p.state='recording' AND ${active})
    AND EXISTS(SELECT 1 FROM dubbing_role_claims WHERE project_id=? AND role_id=? AND user_id=?)
    ON CONFLICT(project_id,role_id) DO NOTHING`,id(),p.id,role,user.id,p.script_key,token,at,at,p.id,p.script_key,p.id,role,user.id)
  ]);
  if(!await one(env,'SELECT id FROM dubbing_recordings WHERE project_id=? AND role_id=? AND user_id=?',p.id,role,user.id))conflict();
  return json(await recordingView(env,p,user));
 }
 const record=await one(env,'SELECT * FROM dubbing_recordings WHERE project_id=? AND role_id=? AND user_id=?',p.id,role,user.id);
 if(!record)fail(409,'녹음을 먼저 시작해주세요.');
 if(operation==='lines'&&req.method==='PUT'){
  const params=new URL(req.url).searchParams,rev=Number(params.get('revision')),takeId=params.get('take');
  if(!uuid(takeId)||!Number.isSafeInteger(rev)||rev<1)fail(400,'녹음 저장 정보를 확인해주세요.');
  const window=dubbingRecordingWindows(JSON.parse(p.script_json)).lines.find(l=>l.id===lineId&&l.roleId===role);if(!window)fail(404,'내 배역의 대사가 아닙니다.');
  await rate(env,'dubbing-take:'+user.id,300,3600);
  const max=44+Math.ceil((window.recordEnd-window.start)*48000)*2;
  if(Number(req.headers.get('content-length')||0)>max)fail(413,'대사 구간보다 긴 녹음입니다.');
  const reader=req.body?.getReader();if(!reader)fail(400,'녹음 파일이 필요합니다.');
  let size=0;const chunks=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'대사 구간보다 긴 녹음입니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let info;try{info=validateDubbingTake(bytes,window.recordEnd-window.start);}catch(e){fail(400,e.message);}
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const old=await one(env,'SELECT * FROM dubbing_recording_lines WHERE recording_id=? AND line_id=?',record.id,lineId);
  if(old?.take_id===takeId){if(old.audio_hash!==digest)conflict();return json(await recordingView(env,p,user));}
  if(record.state!=='draft'||record.revision!==rev)conflict();
  // Fresh object identity prevents concurrent reuse of a take ID overwriting a
  // committed file before the unique/CAS database checks reject the contender.
  const key=`dubbing/${user.id}/${p.id}/voices/${record.id}/${takeId}-${id()}.wav`,token=id();
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'audio/wav',cacheControl:'private, no-store'}});
  try{
   const result=await env.DB.batch([
    query(env,`UPDATE dubbing_recordings SET revision=revision+1,write_token=?,updated=? WHERE id=? AND revision=? AND state='draft'
     AND EXISTS(SELECT 1 FROM dubbing_role_claims WHERE project_id=? AND role_id=? AND user_id=?)
     AND EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted') AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=dubbing_recordings.project_id AND ${dubbingVisibleSQL()}) RETURNING id`,token,now(),record.id,rev,p.id,role,user.id,user.id),
    query(env,`INSERT INTO dubbing_recording_lines(recording_id,line_id,take_id,audio_key,audio_hash,duration,bytes,updated)
     SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_recordings WHERE id=? AND write_token=?)
     ON CONFLICT(recording_id,line_id) DO UPDATE SET take_id=excluded.take_id,audio_key=excluded.audio_key,audio_hash=excluded.audio_hash,duration=excluded.duration,bytes=excluded.bytes,updated=excluded.updated`,record.id,lineId,takeId,key,digest,info.duration,info.bytes,now(),record.id,token)
   ]);if(!result[0].results.length)conflict();
  }catch(e){try{if(!await one(env,'SELECT take_id FROM dubbing_recording_lines WHERE audio_key=?',key))await env.BUCKET.delete(key);}catch{}if(/unique|constraint/i.test(e.message))conflict();throw e;}
  if(old?.audio_key&&old.audio_key!==key)await env.BUCKET.delete(old.audio_key).catch(()=>{});
  return json(await recordingView(env,p,user));
 }
 if(operation==='submit'&&req.method==='POST'){
  const body=await req.json();if(body.rightsAccepted!==true)fail(400,'내 음성의 공동 작품 공개에 동의해주세요.');
  if(record.state==='submitted'){await queueDubbingFinal(env,p);return json(await recordingView(env,p,user));}
  const count=JSON.parse(p.script_json).lines.filter(l=>l.roleId===role).length;
  const saved=await query(env,`UPDATE dubbing_recordings SET state='submitted',revision=revision+1,rights_at=?,updated=? WHERE id=? AND revision=? AND state='draft'
   AND (SELECT COUNT(*) FROM dubbing_recording_lines WHERE recording_id=?)=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted') AND EXISTS(SELECT 1 FROM dubbing_projects p WHERE p.id=dubbing_recordings.project_id AND ${dubbingVisibleSQL()}) RETURNING id`,now(),now(),record.id,body.revision,record.id,count,user.id).first();
  if(!saved)fail(409,'모든 대사를 저장하고 최신 녹음 상태에서 제출해주세요.');
  await queueDubbingFinal(env,p);return json(await recordingView(env,p,user));
 }
 fail(405,'지원하지 않는 녹음 요청입니다.');
}
