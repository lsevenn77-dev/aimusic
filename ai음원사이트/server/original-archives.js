import {one,run,query,now,id,fail,json} from './db.js';
import {MAX_AUDIO,objectResponse,originalKey} from './storage.js';

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const hex=buffer=>buffer?Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join(''):'';
// Internal-only. Staged keys include a lease token: an expired worker cannot overwrite a committed source.
export async function originalArchiveRoute(req,env,path){
 if(!path.startsWith('/internal/archives/'))return null;
 if(path==='/internal/archives/claim'&&req.method==='POST'){
  await run(env,"INSERT OR IGNORE INTO original_archives(track_id,source_key,source_bytes,state,updated) SELECT id,'original/'||id||'.wav',original_bytes,'queued',? FROM tracks WHERE original_ext='wav' AND original_key='' AND status IN ('published','hidden')",now());
  const token=id(),job=await query(env,`UPDATE original_archives SET lease_token=?,lease_until=?,attempts=attempts+1,updated=? WHERE track_id=(SELECT a.track_id FROM original_archives a JOIN tracks t ON t.id=a.track_id WHERE a.lease_until<? AND ((a.state IN ('queued','processing') AND a.attempts<3 AND t.original_ext='wav' AND t.status IN ('published','hidden')) OR a.state='committed') ORDER BY CASE WHEN a.state='committed' THEN 0 ELSE 1 END,a.updated LIMIT 1) RETURNING *`,token,now()+900,now(),now()).first();
  if(job&&job.state!=='committed'){
   job.state='processing';job.output_key=`archive/${job.track_id}/${token}.flac`;
   await run(env,"UPDATE original_archives SET state='processing',output_key=?,output_sha='',output_bytes=0,pcm_sha='' WHERE track_id=? AND lease_token=?",job.output_key,job.track_id,token);
  }
  return json({job});
 }
 const m=path.match(/^\/internal\/archives\/([\w-]+)\/(source|output|commit|cleanup|skip|fail)$/);if(!m)fail(404,'경로를 찾을 수 없습니다.');
 const job=await one(env,'SELECT * FROM original_archives WHERE track_id=? AND lease_token=? AND lease_until>?',m[1],req.headers.get('x-job-token')||'',now());
 if(!job)fail(409,'원본 보관 작업이 만료됐습니다.');const action=m[2];
 const track=await one(env,'SELECT * FROM tracks WHERE id=?',job.track_id);if(!track)fail(404,'원본이 없습니다.');
 if(action==='cleanup'&&req.method==='POST'){
  if(job.state==='done')return json({ok:true});
  if(job.state!=='committed'||originalKey(track)!==job.output_key)fail(409,'원본 교체가 완료되지 않았습니다.');
  const stored=await env.BUCKET.head(job.output_key);
  if(stored?.size!==job.output_bytes||hex(stored?.checksums?.sha256)!==job.output_sha)fail(409,'보관 파일 검증에 실패했습니다. WAV를 유지합니다.');
  await env.BUCKET.delete(job.source_key);
  await run(env,"UPDATE original_archives SET state='done',lease_until=0,updated=? WHERE track_id=? AND lease_token=?",now(),job.track_id,job.lease_token);
  return json({ok:true,saved_bytes:job.source_bytes-job.output_bytes});
 }
 if(job.state==='committed'&&action==='commit')return json({ok:true});
 if(job.state!=='processing')fail(409,'진행 중인 보관 작업이 아닙니다.');
 if(action==='source'&&req.method==='GET')return objectResponse(req,env,job.source_key,'audio/wav');
 if(action==='output'&&req.method==='GET')return objectResponse(req,env,job.output_key,'audio/flac');
 if(action==='output'&&req.method==='PUT'){
  const size=Number(req.headers.get('content-length')),sha=req.headers.get('x-content-sha256');
  if(!Number.isSafeInteger(size)||size<42||size>=job.source_bytes||size>MAX_AUDIO||!digest(sha))fail(400,'더 작은 FLAC과 검증값이 필요합니다.');
  const stream=new FixedLengthStream(size),pumping=req.body.pipeTo(stream.writable);
  await Promise.all([env.BUCKET.put(job.output_key,stream.readable,{httpMetadata:{contentType:'audio/flac'},sha256:Uint8Array.from(sha.match(/../g),v=>parseInt(v,16)).buffer}),pumping]);
  await run(env,'UPDATE original_archives SET output_sha=?,output_bytes=? WHERE track_id=? AND lease_token=? AND lease_until>?',sha,size,job.track_id,job.lease_token,now());
  return json({ok:true});
 }
 if(action==='commit'&&req.method==='POST'){
  const b=await req.json();
  if(!digest(b.source_pcm_sha)||b.source_pcm_sha!==b.output_pcm_sha||b.stored_sha!==job.output_sha||!digest(job.output_sha))fail(400,'음원 검증값이 일치하지 않습니다. WAV를 유지합니다.');
  const stored=await env.BUCKET.head(job.output_key);
  if(stored?.size!==job.output_bytes||hex(stored?.checksums?.sha256)!==job.output_sha)fail(409,'저장 검증에 실패했습니다. WAV를 유지합니다.');
  // The source pointer and audit record change atomically. Reprocessing/deletion wins a concurrent race.
  await env.DB.batch([
   query(env,"UPDATE tracks SET original_key=?,original_ext='flac',original_bytes=? WHERE id=? AND original_ext='wav' AND original_key='' AND status IN ('published','hidden') AND EXISTS(SELECT 1 FROM original_archives WHERE track_id=? AND lease_token=? AND lease_until>?)",job.output_key,job.output_bytes,job.track_id,job.track_id,job.lease_token,now()),
   query(env,"UPDATE original_archives SET state='committed',pcm_sha=?,updated=? WHERE track_id=? AND lease_token=? AND EXISTS(SELECT 1 FROM tracks WHERE id=? AND original_key=?)",b.source_pcm_sha,now(),job.track_id,job.lease_token,job.track_id,job.output_key)
  ]);
  if((await one(env,'SELECT state FROM original_archives WHERE track_id=?',job.track_id)).state!=='committed')fail(409,'원본 상태가 변경됐습니다. WAV를 유지합니다.');
  return json({ok:true});
 }
 if(['skip','fail'].includes(action)&&req.method==='POST'){
  const b=await req.json();await run(env,'UPDATE original_archives SET state=?,error=?,lease_until=0,updated=? WHERE track_id=? AND lease_token=? AND state=\'processing\'',action==='skip'?'skipped':'queued',String(b.reason||action).slice(0,100),now(),job.track_id,job.lease_token);
  // Remove only this worker's unreferenced staged output; keep the WAV on every failure.
  if(originalKey(await one(env,'SELECT * FROM tracks WHERE id=?',job.track_id))!==job.output_key)await env.BUCKET.delete(job.output_key);
  return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
