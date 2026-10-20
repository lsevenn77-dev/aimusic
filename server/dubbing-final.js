import {dubbingVisibleSQL} from './dubbing-access.js';
import {one,rows,query,run,now,id,json,fail} from './db.js';
import {queueDubbingFinal,recordingEnabled} from './dubbing-recording.js';
const active=`${dubbingVisibleSQL()} AND p.script_key=j.script_key AND EXISTS(SELECT 1 FROM users WHERE id=p.owner_id AND provider!='deleted')
 AND (SELECT COUNT(*) FROM dubbing_recordings r JOIN users u ON u.id=r.user_id WHERE r.project_id=p.id AND r.state='submitted' AND u.provider!='deleted')=p.role_count`;
export async function dubbingFinalInternalRoute(req,env,path){
 if(!path.startsWith('/internal/dubbing-final/'))return null;
 // Called only after the shared worker Bearer authentication.
 if(env.DUBBING_ENABLED!=='true'||!recordingEnabled(env))return json({job:null});
 if(path==='/internal/dubbing-final/claim'&&req.method==='POST'){
  // Recover a final-submit acknowledgement/queue failure without another user action.
  const pending=await rows(env,`SELECT p.* FROM dubbing_projects p WHERE p.state='recording' AND ${dubbingVisibleSQL()}
   AND (SELECT COUNT(*) FROM dubbing_recordings r WHERE r.project_id=p.id AND r.state='submitted')=p.role_count
   AND NOT EXISTS(SELECT 1 FROM dubbing_final_jobs j WHERE j.project_id=p.id AND j.script_key=p.script_key AND j.state!='invalidated') LIMIT 5`);
  for(const p of pending)await queueDubbingFinal(env,p);
  await run(env,"UPDATE dubbing_final_jobs SET state='failed',error='합성 재시도 한도를 초과했습니다.',lease_token=NULL,lease_until=0 WHERE state IN ('queued','mixing') AND lease_until<? AND attempts>=4",now());
  const job=await query(env,`UPDATE dubbing_final_jobs SET state='mixing',lease_token=?,lease_until=?,attempts=attempts+1,updated=? WHERE id=(
   SELECT j.id FROM dubbing_final_jobs j JOIN dubbing_projects p ON p.id=j.project_id WHERE ${active} AND j.state IN ('queued','mixing') AND j.lease_until<? AND j.attempts<4 ORDER BY j.created LIMIT 1)
   RETURNING id,lease_token`,id(),now()+600,now(),now()).first();return json({job});
 }
 const m=path.match(/^\/internal\/dubbing-final\/([\w-]+)\/(step|input|heartbeat|output|finish|fail)(?:\/([\w-]+))?$/);if(!m)fail(404,'합성 작업 경로가 없습니다.');
 const job=await one(env,`SELECT j.*,p.owner_id FROM dubbing_final_jobs j JOIN dubbing_projects p ON p.id=j.project_id WHERE j.id=? AND j.lease_token=? AND j.lease_until>? AND j.state='mixing' AND ${active}`,m[1],req.headers.get('x-job-token')||'',now());
 if(!job)fail(409,'합성 작업이 변경됐거나 만료됐습니다.');
 const manifest=JSON.parse(job.manifest_json),action=m[2];
 if(action==='step'&&req.method==='POST')return json({duration:manifest.duration,lines:manifest.lines.map(l=>({id:l.id,start:l.start,end:l.end}))});
 if(action==='input'&&req.method==='GET'){
  const key=m[3]==='background'?manifest.background:m[3]?.startsWith('line-')?manifest.lines.find(l=>l.id===m[3].slice(5))?.key:null;
  const object=key&&await env.BUCKET.get(key);if(!object)fail(404,'합성 입력을 찾을 수 없습니다.');
  return new Response(object.body,{headers:{'content-type':m[3]==='background'?'audio/mp4':'audio/wav','cache-control':'no-store'}});
 }
 if(action==='heartbeat'&&req.method==='POST'){
  await run(env,'UPDATE dubbing_final_jobs SET lease_until=?,updated=? WHERE id=? AND lease_token=?',now()+600,now(),job.id,job.lease_token);return json({ok:true});
 }
 if(action==='fail'&&req.method==='POST'){
  await run(env,"UPDATE dubbing_final_jobs SET state='failed',error='녹음 합성 검증에 실패했습니다. 저장된 배역 녹음은 보존됩니다.',lease_token=NULL,lease_until=0,updated=? WHERE id=? AND lease_token=?",now(),job.id,job.lease_token);return json({ok:true});
 }
 const output=`dubbing/${job.owner_id}/${job.project_id}/final/${job.id}-${job.lease_token}.m4a`;
 if(action==='output'&&req.method==='PUT'){
  const reader=req.body?.getReader();if(!reader)fail(400,'오디오가 필요합니다.');let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();fail(413,'합성 파일이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  if(size<24||String.fromCharCode(...bytes.subarray(4,8))!=='ftyp')fail(400,'M4A 파일이 필요합니다.');
  await env.BUCKET.put(output,bytes,{httpMetadata:{contentType:'audio/mp4',cacheControl:'private, no-store'}});return json({ok:true});
 }
 if(action==='finish'&&req.method==='POST'){
  const meta=await req.json();if(meta.sampleRate!==48000||!Number.isFinite(meta.duration)||Math.abs(meta.duration-manifest.duration)>.1||!Number.isFinite(meta.peakDb)||meta.peakDb> -1)fail(400,'합성 길이와 피크를 확인해주세요.');
  if(!await env.BUCKET.head(output))fail(409,'완성 오디오를 먼저 저장해주세요.');
  const result=await env.DB.batch([
   query(env,`UPDATE dubbing_final_jobs SET state='ready',output_key=?,output_meta=?,lease_until=0,updated=? WHERE id=? AND lease_token=? AND lease_until>? AND state='mixing'
    AND EXISTS(SELECT 1 FROM dubbing_final_jobs j JOIN dubbing_projects p ON p.id=j.project_id WHERE j.id=dubbing_final_jobs.id AND ${active}) RETURNING id`,output,JSON.stringify(meta),now(),job.id,job.lease_token,now()),
   query(env,"UPDATE dubbing_projects SET state='complete',updated=? WHERE id=? AND EXISTS(SELECT 1 FROM dubbing_final_jobs WHERE id=? AND state='ready' AND lease_token=?)",now(),job.project_id,job.id,job.lease_token)
  ]);if(!result[0].results.length)fail(409,'합성 작업이 만료됐습니다.');return json({ok:true});
 }
 fail(405,'지원하지 않는 합성 요청입니다.');
}
