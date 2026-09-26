import {karaokeQueue} from './karaoke.js';
import {one,run,query,now,id,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {lyricsFields} from './lyrics.js';
import {alignedLrc} from '../shared/alignment.js';

export async function alignmentStatus(env,trackId){return one(env,"SELECT id,track_id,source_text,language,state,result_lrc,needs_attention,error,created,updated FROM lyric_jobs WHERE track_id=? AND state!='cancelled'",trackId);}
export async function alignmentWrite(env,trackId,userId,data,body={}){
 if(!data.auto){
  if(body.lyrics_job_id){const job=await one(env,"SELECT id FROM lyric_jobs WHERE track_id=? AND id=? AND state='ready'",trackId,body.lyrics_job_id);if(!job)fail(409,'자동 싱크 결과가 변경됐습니다. 최신 결과를 다시 불러와주세요.');}
  return [query(env,`UPDATE lyric_jobs SET state=?,lease_token=NULL,lease_until=0,updated=? WHERE track_id=?${body.lyrics_job_id?" AND id=? AND state='ready'":''}`,body.lyrics_job_id?'applied':'cancelled',now(),trackId,...(body.lyrics_job_id?[body.lyrics_job_id]:[]))];
 }
 const existing=await one(env,'SELECT * FROM lyric_jobs WHERE track_id=?',trackId);
 if(existing&&existing.source_text===data.source&&existing.language===data.language&&['queued','processing','ready','applied'].includes(existing.state))return [];
 await rate(env,'lyrics-align:'+userId,10,86400);
 return [query(env,`INSERT INTO lyric_jobs(track_id,id,source_text,language,state,created,updated) VALUES(?,?,?,?,'queued',?,?)
 ON CONFLICT(track_id) DO UPDATE SET id=excluded.id,source_text=excluded.source_text,language=excluded.language,state='queued',result_lrc='',needs_attention=0,attempts=0,lease_until=0,lease_token=NULL,error=NULL,created=excluded.created,updated=excluded.updated`,trackId,id(),data.source,data.language,now(),now())];
}
export async function alignmentRoute(req,env,path,user){
 const m=path.match(/^\/api\/studio\/tracks\/([\w-]+)\/lyrics\/(align|audio)$/);if(!m)return null;
 requireUser(user);const track=await one(env,'SELECT * FROM tracks WHERE id=? AND user_id=?',m[1],user.id);if(!track||track.status==='deleted')fail(404,'내 음원을 찾을 수 없습니다.');
 if(m[2]==='audio'){
  if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  const obj=await env.BUCKET.get(`stream/${track.id}.m4a`);if(!obj)fail(409,'음원 변환이 끝난 뒤 미리 들을 수 있습니다.');
  return new Response(req.method==='HEAD'?null:obj.body,{headers:{'content-type':'audio/mp4','content-length':String(obj.size),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 if(req.method==='GET')return json({alignment:await alignmentStatus(env,track.id)});
 if(req.method==='POST'){
  const body=await req.json(),data=lyricsFields({...body,lyrics_mode:'auto'},track),writes=await alignmentWrite(env,track.id,user.id,data);
  if(writes.length)await env.DB.batch(writes);return json({alignment:await alignmentStatus(env,track.id)},202);
 }
 fail(405,'지원하지 않는 요청입니다.');
}
export async function alignmentInternalRoute(req,env,path){
 if(!path.startsWith('/internal/lyrics/'))return null;
 // Called only after the shared worker credential was validated by internalRoute.
 if(path==='/internal/lyrics/claim'&&req.method==='POST'){
  await run(env,"UPDATE lyric_jobs SET state='failed',error='처리 시간이 초과됐습니다. 다시 시도하거나 직접 시간을 지정해주세요.',lease_token=NULL,updated=? WHERE state='processing' AND lease_until<? AND attempts>=3",now(),now());
  const job=await query(env,`UPDATE lyric_jobs SET state='processing',lease_until=?,lease_token=?,attempts=attempts+1,updated=? WHERE track_id=(
   SELECT j.track_id FROM lyric_jobs j JOIN tracks t ON t.id=j.track_id WHERE (j.state='queued' OR (j.state='processing' AND j.lease_until<?)) AND j.attempts<3 AND t.status IN ('published','hidden') AND t.duration>=5 AND t.duration<=1200 ORDER BY j.created LIMIT 1)
   RETURNING id,track_id,source_text,language,lease_token,(SELECT duration FROM tracks WHERE tracks.id=lyric_jobs.track_id) duration`,now()+2100,id(),now(),now()).first();
  return json({job});
 }
 const m=path.match(/^\/internal\/lyrics\/([\w-]+)\/(audio|finish|fail)$/);if(!m)fail(404,'작업 경로를 찾을 수 없습니다.');
 const job=await one(env,"SELECT j.*,t.duration FROM lyric_jobs j JOIN tracks t ON t.id=j.track_id WHERE j.id=? AND j.state='processing' AND j.lease_token=? AND j.lease_until>?",m[1],req.headers.get('x-job-token')||'',now());if(!job)fail(409,'가사 작업이 변경되었거나 만료됐습니다.');
 if(m[2]==='audio'&&req.method==='GET'){
  // Separated vocals align far better than the full mix; fall back to the mix before the karaoke build exists.
  const obj=await env.BUCKET.get(`karaoke/${job.track_id}/vocals.m4a`)||await env.BUCKET.get(`stream/${job.track_id}.m4a`);if(!obj)fail(404,'감상용 음원을 찾을 수 없습니다.');
  return new Response(obj.body,{headers:{'content-type':'audio/mp4','content-length':String(obj.size),'cache-control':'private, no-store'}});
 }
 if(m[2]==='finish'&&req.method==='POST'){
  if(Number(req.headers.get('content-length')||0)>32768)fail(413,'결과가 너무 큽니다.');
  const body=await req.json();let result;try{result=alignedLrc(job.source_text,body.timings,job.duration);}catch(e){fail(400,e.message);}
  const at=now();
  await env.DB.batch([
   query(env,"UPDATE tracks SET lyrics=?,lyrics_mode='synced' WHERE id=? AND status!='deleted' AND EXISTS(SELECT 1 FROM lyric_jobs WHERE track_id=tracks.id AND id=? AND lease_token=? AND state='processing' AND lease_until>?)",result,job.track_id,job.id,job.lease_token,at),
   query(env,"UPDATE lyric_jobs SET state='applied',result_lrc=?,needs_attention=?,error=NULL,lease_until=0,lease_token=NULL,updated=? WHERE id=? AND lease_token=? AND state='processing' AND lease_until>? AND EXISTS(SELECT 1 FROM tracks WHERE id=lyric_jobs.track_id AND status!='deleted' AND lyrics=? AND lyrics_mode='synced')",result,body.needs_attention===true?1:0,at,job.id,job.lease_token,at,result)
  ]);
  if(!await one(env,"SELECT id FROM lyric_jobs WHERE id=? AND state='applied'",job.id))fail(409,'가사 작업이 변경됐습니다.');
  const writes=await karaokeQueue(env,await one(env,'SELECT * FROM tracks WHERE id=?',job.track_id));if(writes.length)await env.DB.batch(writes);
  return json({ok:true});
 }
 if(m[2]==='fail'&&req.method==='POST'){
  await run(env,"UPDATE lyric_jobs SET state='failed',error='자동으로 시간을 맞추지 못했습니다. 가사와 언어를 확인해 다시 시도하거나 직접 시간을 지정해주세요.',lease_until=0,lease_token=NULL,updated=? WHERE id=? AND lease_token=?",now(),job.id,job.lease_token);return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
