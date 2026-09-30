import {one,run,query,now,id,fail,json} from './db.js';
import {MAX_AUDIO,objectResponse,originalKey} from './storage.js';
import {isPremium} from './membership.js';

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const hex=buffer=>buffer?Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join(''):'';
export async function premiumAudio(env,track,user){
 if(!isPremium(user))return null;
 const job=await one(env,"SELECT output_key,output_bytes FROM premium_audio_jobs WHERE track_id=? AND state='ready'",track.id);
 return job&&(await env.BUCKET.head(job.output_key))?.size===job.output_bytes?job:null;
}

// A separate queue upgrades published music without interrupting its existing stream or MR.
export async function premiumAudioRoute(req,env,path){
 if(!path.startsWith('/internal/premium-audio/'))return null;
 if(path==='/internal/premium-audio/claim'&&req.method==='POST'){
  await run(env,"INSERT OR IGNORE INTO premium_audio_jobs(track_id,updated) SELECT id,? FROM tracks WHERE status IN ('published','hidden')",now());
  await run(env,"UPDATE premium_audio_jobs SET state='failed',lease_token=NULL WHERE state='processing' AND lease_until<=? AND attempts>=3",now());
  const token=id(),job=await query(env,`UPDATE premium_audio_jobs SET state='processing',lease_token=?,lease_until=?,attempts=attempts+1,updated=?,output_key='',output_sha='',output_bytes=0 WHERE track_id=(SELECT j.track_id FROM premium_audio_jobs j JOIN tracks t ON t.id=j.track_id WHERE j.state IN ('queued','processing') AND j.attempts<3 AND j.lease_until<=? AND t.status IN ('published','hidden') ORDER BY j.updated,j.track_id LIMIT 1) RETURNING *`,token,now()+900,now(),now()).first();
  if(job){
   const track=await one(env,'SELECT * FROM tracks WHERE id=?',job.track_id);
   job.source_key=originalKey(track);job.original_ext=track.original_ext;job.duration=track.duration;
   job.output_key=`premium/${job.track_id}/${token}.m4a`;
   await run(env,'UPDATE premium_audio_jobs SET source_key=?,output_key=? WHERE track_id=? AND lease_token=?',job.source_key,job.output_key,job.track_id,token);
  }
  return json({job});
 }
 const m=path.match(/^\/internal\/premium-audio\/([\w-]+)\/(source|output|finish|fail)$/);if(!m)fail(404,'경로를 찾을 수 없습니다.');
 const job=await one(env,"SELECT j.*,t.status track_status,t.duration FROM premium_audio_jobs j JOIN tracks t ON t.id=j.track_id WHERE j.track_id=? AND j.lease_token=? AND j.lease_until>? AND j.state IN ('processing','ready')",m[1],req.headers.get('x-job-token')||'',now());
 if(!job||!['published','hidden'].includes(job.track_status))fail(409,'고음질 변환 작업이 만료됐습니다.');
 const action=m[2];
 if(action==='finish'&&job.state==='ready'&&req.method==='POST')return json({ok:true});
 if(job.state!=='processing')fail(409,'진행 중인 변환 작업이 아닙니다.');
 if(action==='source'&&req.method==='GET')return objectResponse(req,env,job.source_key,'application/octet-stream');
 if(action==='output'&&req.method==='PUT'){
  const size=Number(req.headers.get('content-length')),sha=req.headers.get('x-content-sha256');
  if(!Number.isSafeInteger(size)||size<100||size>MAX_AUDIO||!digest(sha))fail(400,'음원 파일과 검증값이 필요합니다.');
  const stream=new FixedLengthStream(size),pumping=req.body.pipeTo(stream.writable);
  await Promise.all([env.BUCKET.put(job.output_key,stream.readable,{httpMetadata:{contentType:'audio/mp4'},sha256:Uint8Array.from(sha.match(/../g),v=>parseInt(v,16)).buffer}),pumping]);
  await run(env,"UPDATE premium_audio_jobs SET output_sha=?,output_bytes=? WHERE track_id=? AND lease_token=? AND lease_until>? AND state='processing'",sha,size,job.track_id,job.lease_token,now());return json({ok:true});
 }
 if(action==='finish'&&req.method==='POST'){
  const b=await req.json();
  if(b.codec!=='aac'||b.bitrate_kbps!==256||b.channels!==2||b.sample_rate!==44100||!Number.isFinite(b.duration)||Math.abs(b.duration-job.duration)>1||!digest(job.output_sha)||b.sha256!==job.output_sha)fail(400,'AAC 256 변환 검증에 실패했습니다.');
  const stored=await env.BUCKET.head(job.output_key);
  if(stored?.size!==job.output_bytes||hex(stored?.checksums?.sha256)!==job.output_sha)fail(409,'저장된 고음질 파일을 확인할 수 없습니다.');
  const done=await query(env,"UPDATE premium_audio_jobs SET state='ready',updated=? WHERE track_id=? AND lease_token=? AND lease_until>? AND state='processing' AND EXISTS(SELECT 1 FROM tracks t WHERE t.id=track_id AND t.status IN ('published','hidden')) RETURNING track_id",now(),job.track_id,job.lease_token,now()).first();
  if(!done)fail(409,'고음질 변환 작업이 만료됐습니다.');return json({ok:true});
 }
 if(action==='fail'&&req.method==='POST'){
  await run(env,"UPDATE premium_audio_jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease_until=0,lease_token=NULL,updated=? WHERE track_id=? AND lease_token=? AND state='processing'",now(),job.track_id,job.lease_token);return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
