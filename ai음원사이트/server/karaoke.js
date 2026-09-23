import {one,run,query,now,id,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {MAX_AUDIO,put,objectResponse} from './storage.js';
import {KARAOKE_MAX_SECONDS,karaokeLyrics,karaokeWords} from '../shared/karaoke.js';

const MR_TYPES=['wav','flac','mp3'];
const key=(trackId,name)=>`karaoke/${trackId}/${name}`;

export function karaokeStatus(env,trackId){return one(env,"SELECT state,mr_source,mr_ready,vocals_ready,words_state,lyrics_text!='' has_lyrics,error,updated FROM karaoke_jobs WHERE track_id=?",trackId);}

// Writes that (re)queue a track's karaoke build. mr: 'keep' re-aligns words only when the lyrics changed,
// 'auto' separates the published audio again, 'upload' converts the creator's own MR file.
export async function karaokeQueue(env,track,{mr='keep',ext='',bytes=0}={}){
 if(!track.karaoke_at||!['published','hidden'].includes(track.status))return [];
 const existing=await one(env,'SELECT lyrics_text FROM karaoke_jobs WHERE track_id=?',track.id),lyrics=karaokeLyrics(track);
 if(mr==='keep'){if(!existing)mr='auto';else if(existing.lyrics_text===lyrics)return [];}
 const language=(await one(env,'SELECT language FROM lyric_jobs WHERE track_id=?',track.id))?.language||'ko';
 const tooLong=track.duration>KARAOKE_MAX_SECONDS,resetMr=mr!=='keep';
 return [query(env,`INSERT INTO karaoke_jobs(track_id,id,state,mr_source,mr_ext,mr_bytes,lyrics_text,language,error,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(track_id) DO UPDATE SET id=excluded.id,state=excluded.state,lyrics_text=excluded.lyrics_text,language=excluded.language,words='',words_state='none',attempts=0,lease_until=0,lease_token=NULL,error=excluded.error,updated=excluded.updated${resetMr?",mr_source=excluded.mr_source,mr_ext=excluded.mr_ext,mr_bytes=excluded.mr_bytes,mr_ready=0,vocals_ready=CASE WHEN excluded.mr_source='auto' THEN 0 ELSE karaoke_jobs.vocals_ready END":''}`,
  track.id,id(),tooLong?'failed':'queued',mr==='keep'?'auto':mr,ext,bytes,lyrics,language,tooLong?`노래방 MR은 ${KARAOKE_MAX_SECONDS/60}분 이하 곡만 만들 수 있습니다.`:null,now(),now())];
}

export async function karaokeRoute(req,env,path,user){
 const m=path.match(/^\/api\/studio\/tracks\/([\w-]+)\/karaoke(\/mr)?$/);if(!m)return null;
 requireUser(user);const track=await one(env,'SELECT * FROM tracks WHERE id=? AND user_id=?',m[1],user.id);if(!track)fail(404,'내 음원을 찾을 수 없습니다.');
 const method=req.method;
 if(!m[2]){
  if(method==='GET')return json({karaoke:await karaokeStatus(env,track.id)});
  if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  if(!track.karaoke_at)fail(409,'노래방 MR 제공에 먼저 동의해주세요.');
  if(!['published','hidden'].includes(track.status))fail(409,'음원 변환이 끝난 뒤 노래방 MR을 만들 수 있습니다.');
  await rate(env,'karaoke:'+user.id,10,86400);
  await env.DB.batch(await karaokeQueue(env,track,{mr:'auto'}));return json({karaoke:await karaokeStatus(env,track.id)},202);
 }
 if(['GET','HEAD'].includes(method)){
  if(!(await karaokeStatus(env,track.id))?.mr_ready)fail(404,'노래방 MR이 아직 없습니다.');
  return objectResponse(req,env,key(track.id,'mr.m4a'),'audio/mp4');
 }
 if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
 if(!track.karaoke_at)fail(409,'노래방 MR 제공에 먼저 동의해주세요.');
 if(!['published','hidden'].includes(track.status))fail(409,'음원 변환이 끝난 뒤 반주 파일을 올릴 수 있습니다.');
 const ext=new URL(req.url).searchParams.get('ext'),bytes=Number(req.headers.get('content-length'));
 if(!MR_TYPES.includes(ext))fail(400,'반주 파일은 WAV·FLAC·MP3만 올릴 수 있습니다.');
 await rate(env,'karaoke:'+user.id,10,86400);
 await put(env,key(track.id,'mr-source.'+ext),req,MAX_AUDIO,'application/octet-stream');
 await env.DB.batch(await karaokeQueue(env,track,{mr:'upload',ext,bytes}));return json({karaoke:await karaokeStatus(env,track.id)},202);
}

const FAIL_REASONS={
 duration_mismatch:'올린 반주 파일의 길이가 원곡과 다릅니다. 원곡과 같은 길이의 반주를 올려주세요.',
 unreadable:'반주 파일을 읽지 못했습니다. WAV·FLAC·MP3 파일인지 확인해주세요.',
};
export async function karaokeInternalRoute(req,env,path){
 if(!path.startsWith('/internal/karaoke/'))return null;
 // Called only after the shared worker credential was validated by internalRoute.
 if(path==='/internal/karaoke/claim'&&req.method==='POST'){
  await run(env,"UPDATE karaoke_jobs SET state='failed',error='노래방 MR을 만들지 못했습니다. 다시 만들기를 눌러주세요.',lease_token=NULL,updated=? WHERE state='processing' AND lease_until<? AND attempts>=3",now(),now());
  // Separation takes several minutes per song on CPU; the lease covers the whole build.
  const job=await query(env,`UPDATE karaoke_jobs SET state='processing',lease_until=?,lease_token=?,attempts=attempts+1,updated=? WHERE track_id=(
   SELECT k.track_id FROM karaoke_jobs k JOIN tracks t ON t.id=k.track_id WHERE (k.state='queued' OR (k.state='processing' AND k.lease_until<?)) AND k.attempts<3 AND t.status IN ('published','hidden') AND t.karaoke_at>0 AND t.duration<=? ORDER BY k.updated LIMIT 1)
   RETURNING id,track_id,mr_source,mr_ext,mr_ready,vocals_ready,lyrics_text,language,lease_token,(SELECT duration FROM tracks WHERE tracks.id=karaoke_jobs.track_id) duration`,now()+3600,id(),now(),now(),KARAOKE_MAX_SECONDS).first();
  return json({job});
 }
 const m=path.match(/^\/internal\/karaoke\/([\w-]+)\/(audio|vocals|mr-source|mr|finish|fail)$/);if(!m)fail(404,'작업 경로를 찾을 수 없습니다.');
 const job=await one(env,"SELECT k.*,t.duration FROM karaoke_jobs k JOIN tracks t ON t.id=k.track_id WHERE k.id=? AND k.state='processing' AND k.lease_token=? AND k.lease_until>?",m[1],req.headers.get('x-job-token')||'',now());if(!job)fail(409,'노래방 작업이 변경되었거나 만료됐습니다.');
 const action=m[2],method=req.method;
 if(method==='GET'){
  const source={audio:`stream/${job.track_id}.m4a`,vocals:key(job.track_id,'vocals.m4a'),'mr-source':key(job.track_id,'mr-source.'+job.mr_ext)}[action];
  if(!source)fail(405,'지원하지 않는 요청입니다.');
  return objectResponse(req,env,source,'application/octet-stream');
 }
 if(method==='PUT'&&['mr','vocals'].includes(action)){await put(env,key(job.track_id,action+'.m4a'),req,MAX_AUDIO,'audio/mp4');return json({ok:true});}
 if(action==='finish'&&method==='POST'){
  if(Number(req.headers.get('content-length')||0)>262144)fail(413,'결과가 너무 큽니다.');
  const body=await req.json();
  if(!await env.BUCKET.head(key(job.track_id,'mr.m4a')))fail(409,'노래방 MR 파일이 누락됐습니다.');
  const vocals=!!await env.BUCKET.head(key(job.track_id,'vocals.m4a'));
  let words='',wordsState='none';
  if(job.lyrics_text){
   if(Array.isArray(body.words)){try{words=karaokeWords(job.lyrics_text,body.words,job.duration);wordsState=body.needs_attention===true?'attention':'ready';}catch(e){fail(400,e.message);}}
   else wordsState='failed';
  }
  const changed=await query(env,"UPDATE karaoke_jobs SET state='ready',mr_ready=1,vocals_ready=?,words=?,words_state=?,error=NULL,lease_until=0,lease_token=NULL,updated=? WHERE id=? AND lease_token=? AND state='processing' AND lease_until>? RETURNING id",vocals?1:0,words,wordsState,now(),job.id,job.lease_token,now()).first();
  if(!changed)fail(409,'노래방 작업이 변경됐습니다.');return json({ok:true});
 }
 if(action==='fail'&&method==='POST'){
  const reason=(await req.json().catch(()=>({}))).reason;
  await run(env,"UPDATE karaoke_jobs SET state='failed',error=?,lease_until=0,lease_token=NULL,updated=? WHERE id=? AND lease_token=?",FAIL_REASONS[reason]||'노래방 MR을 만들지 못했습니다. 다시 만들기를 눌러주세요.',now(),job.id,job.lease_token);return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
