import {one,rows,run,query,now,id,fail,json} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {originalKey,objectResponse,MAX_AUDIO} from './storage.js';
const keySQL="CASE WHEN original_key='' THEN 'original/'||id||'.'||original_ext ELSE original_key END";
const eligible="kind='cover' AND status IN ('published','hidden') AND original_ext IN ('wav','flac')";
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const hex=b=>b?Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join(''):'';
const audit=(env,user,action,target)=>query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',id(),user.id,action,target,now());
export async function coverCompressionAdmin(req,env,path,user){
 if(path!=='/api/admin/cover-compression')return null;requireUser(user);if(!isAdmin(env,user))fail(403,'운영자만 사용할 수 있어요.');
 if(req.method==='GET')return json({targets:await rows(env,`SELECT id,title,original_ext,original_bytes,${keySQL} source_key FROM tracks WHERE ${eligible} ORDER BY created,id`),jobs:await rows(env,'SELECT * FROM cover_compressions ORDER BY created DESC LIMIT 100')});
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');const b=await req.json();
 if(b.confirmed!==true||!Array.isArray(b.ids)||!b.ids.length||b.ids.length>50||b.ids.some(v=>typeof v!=='string'||v.length>80))fail(400,'대상과 검증 후 원본 삭제를 확인해주세요.');
 const writes=b.ids.map(tid=>query(env,`INSERT OR IGNORE INTO cover_compressions(track_id,source_key,source_ext,source_bytes,duration,requested_by,created,updated) SELECT id,${keySQL},original_ext,original_bytes,duration,?,?,? FROM tracks WHERE id=? AND ${eligible}`,user.id,now(),now(),tid));
 await env.DB.batch([...writes,audit(env,user,'cover_compression_requested',JSON.stringify({ids:b.ids,bitrate:256,delete_source_after_verification:true}))]);return json({ok:true});
}
export async function coverCompressionInternal(req,env,path){
 if(!path.startsWith('/internal/cover-compression/'))return null;
 if(path==='/internal/cover-compression/claim'&&req.method==='POST'){
  const token=id(),at=now();
  await run(env,"UPDATE cover_compressions SET state='failed',error='Retry limit reached',updated=? WHERE state IN ('queued','processing') AND attempts>=3 AND lease_until<=?",at,at);
  // One atomic claim. Archive/quality workers use the reciprocal guard so a
  // source cannot be swapped or deleted while another worker is reading it.
  const job=await query(env,`UPDATE cover_compressions SET lease_token=?,lease_until=?,attempts=attempts+1,updated=?,output_key=CASE WHEN state='committed' THEN output_key ELSE 'compressed-covers/'||track_id||'/'||?||'.mp3' END,output_bytes=CASE WHEN state='committed' THEN output_bytes ELSE 0 END,output_sha=CASE WHEN state='committed' THEN output_sha ELSE '' END,state=CASE WHEN state='committed' THEN state ELSE 'processing' END WHERE track_id=(SELECT c.track_id FROM cover_compressions c JOIN tracks t ON t.id=c.track_id WHERE c.lease_until<=? AND ((c.state IN ('queued','processing') AND c.attempts<3 AND t.kind='cover' AND t.status IN ('published','hidden') AND t.original_ext=c.source_ext AND t.original_bytes=c.source_bytes AND CASE WHEN t.original_key='' THEN 'original/'||t.id||'.'||t.original_ext ELSE t.original_key END=c.source_key AND NOT EXISTS(SELECT 1 FROM original_archives a WHERE a.track_id=c.track_id AND (a.state='committed' OR a.state='processing' AND a.lease_until>?)) AND NOT EXISTS(SELECT 1 FROM premium_audio_jobs p WHERE p.track_id=c.track_id AND p.state='processing' AND p.lease_until>?)) OR c.state='committed') ORDER BY c.created,c.track_id LIMIT 1) RETURNING *`,token,at+900,at,token,at,at,at).first();
  return json({job});
 }
 const m=path.match(/^\/internal\/cover-compression\/([\w-]+)\/(source|output|finish|cleanup|fail|skip)$/);if(!m)fail(404,'경로를 찾을 수 없습니다.');
 const job=await one(env,"SELECT * FROM cover_compressions WHERE track_id=? AND lease_token=? AND (lease_until>? OR state='done')",m[1],req.headers.get('x-job-token')||'',now());if(!job)fail(409,'변환 작업이 만료됐어요.');
 const track=await one(env,'SELECT * FROM tracks WHERE id=?',job.track_id),action=m[2];if(!track||track.kind!=='cover')fail(409,'커버 원본이 없습니다.');
 if(action==='cleanup'&&req.method==='POST'){
  if(job.state==='done')return json({ok:true});
  if(job.state!=='committed'||originalKey(track)!==job.output_key)fail(409,'파일 교체가 완료되지 않았어요.');
  const stored=await env.BUCKET.head(job.output_key);if(stored?.size!==job.output_bytes||hex(stored?.checksums?.sha256)!==job.output_sha)fail(409,'변환 파일 검증에 실패해 원본을 유지합니다.');
  if(await one(env,"SELECT 1 FROM premium_audio_jobs WHERE track_id=? AND state='processing' AND lease_until>? UNION ALL SELECT 1 FROM original_archives WHERE track_id=? AND state='processing' AND lease_until>?",job.track_id,now(),job.track_id,now()))fail(409,'기존 처리기가 원본을 사용 중입니다. 삭제를 연기합니다.');
  if(job.source_key===job.output_key||job.source_key!==`original/${job.track_id}.${job.source_ext}`&&!job.source_key.startsWith(`archive/${job.track_id}/`))fail(409,'원본 파일 경로를 확인해주세요.');
  if(await one(env,'SELECT 1 FROM tracks WHERE id!=? AND original_key=?',job.track_id,job.source_key))fail(409,'다른 작품이 사용하는 파일은 삭제하지 않습니다.');
  await env.BUCKET.delete(job.source_key);
  await env.DB.batch([query(env,"UPDATE cover_compressions SET state='done',lease_until=0,updated=? WHERE track_id=? AND lease_token=?",now(),job.track_id,job.lease_token),audit(env,{id:job.requested_by},'cover_source_deleted',job.track_id)]);return json({ok:true,saved_bytes:job.source_bytes-job.output_bytes});
 }
 if(job.state==='committed'&&action==='finish'&&req.method==='POST')return json({ok:true});
 if(job.state!=='processing'||!['published','hidden'].includes(track.status)||originalKey(track)!==job.source_key||track.original_ext!==job.source_ext||track.original_bytes!==job.source_bytes)fail(409,'원본 상태가 변경됐어요.');
 if(action==='source'&&req.method==='GET')return objectResponse(req,env,job.source_key,'application/octet-stream');
 if(action==='output'&&req.method==='GET')return objectResponse(req,env,job.output_key,'audio/mpeg');
 if(action==='output'&&req.method==='PUT'){
  const size=Number(req.headers.get('content-length')),sha=req.headers.get('x-content-sha256');if(!Number.isSafeInteger(size)||size<100||size>=job.source_bytes||size>MAX_AUDIO||!digest(sha))fail(400,'더 작은 MP3 파일과 검증값이 필요합니다.');
  const stream=new FixedLengthStream(size),pumping=req.body.pipeTo(stream.writable);await Promise.all([env.BUCKET.put(job.output_key,stream.readable,{httpMetadata:{contentType:'audio/mpeg'},sha256:Uint8Array.from(sha.match(/../g),v=>parseInt(v,16)).buffer}),pumping]);
  await run(env,"UPDATE cover_compressions SET output_bytes=?,output_sha=? WHERE track_id=? AND lease_token=? AND lease_until>? AND state='processing'",size,sha,job.track_id,job.lease_token,now());return json({ok:true});
 }
 if(action==='finish'&&req.method==='POST'){
  const b=await req.json();if(b.codec!=='mp3'||b.bitrate_kbps!==256||b.channels!==2||b.sample_rate!==44100||!Number.isFinite(b.duration)||Math.abs(b.duration-job.duration)>.05||b.sha256!==job.output_sha||!digest(job.output_sha))fail(400,'MP3 음질·길이 검증에 실패했습니다.');
  const stored=await env.BUCKET.head(job.output_key);if(stored?.size!==job.output_bytes||hex(stored?.checksums?.sha256)!==job.output_sha)fail(409,'저장된 변환 파일을 확인할 수 없어요.');
  await env.DB.batch([query(env,`UPDATE tracks SET original_key=?,original_ext='mp3',original_bytes=? WHERE id=? AND kind='cover' AND status IN ('published','hidden') AND original_bytes=? AND original_ext=? AND ${keySQL}=? AND EXISTS(SELECT 1 FROM cover_compressions c WHERE c.track_id=? AND c.lease_token=? AND c.lease_until>? AND c.state='processing')`,job.output_key,job.output_bytes,job.track_id,job.source_bytes,job.source_ext,job.source_key,job.track_id,job.lease_token,now()),query(env,"UPDATE cover_compressions SET state='committed',updated=? WHERE track_id=? AND lease_token=? AND state='processing' AND EXISTS(SELECT 1 FROM tracks WHERE id=? AND original_key=?)",now(),job.track_id,job.lease_token,job.track_id,job.output_key),query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,'cover_source_replaced',?,? WHERE EXISTS(SELECT 1 FROM cover_compressions WHERE track_id=? AND lease_token=? AND state='committed')",id(),job.requested_by,job.track_id,now(),job.track_id,job.lease_token)]);
  if((await one(env,'SELECT state FROM cover_compressions WHERE track_id=?',job.track_id)).state!=='committed')fail(409,'원본 교체에 실패했습니다.');return json({ok:true});
 }
 if(['fail','skip'].includes(action)&&req.method==='POST'){
  const b=await req.json(),changed=await query(env,"UPDATE cover_compressions SET state=?,error=?,lease_until=0,updated=? WHERE track_id=? AND lease_token=? AND state='processing' AND lease_until>? RETURNING track_id",action==='skip'?'skipped':job.attempts>=3?'failed':'queued',String(b.reason||action).slice(0,200),now(),job.track_id,job.lease_token,now()).first();
  if(changed&&originalKey(await one(env,'SELECT * FROM tracks WHERE id=?',job.track_id))!==job.output_key)await env.BUCKET.delete(job.output_key);return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
