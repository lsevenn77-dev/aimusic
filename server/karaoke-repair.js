import {fail,id,json,now,query,rows} from './db.js';
import {KARAOKE_MAX_SECONDS,karaokeLineTimings} from '../shared/karaoke.js';

// Maintenance uses the existing authenticated media-worker channel. Return only
// inventory metadata. Creator text, audio, object URLs and leases stay private.
const inventory=`SELECT t.id,t.title,t.status,t.duration,t.rights_accepted,t.karaoke_at,t.karaoke_terms,t.lyrics_mode,t.lyrics,
 j.id lyric_job,j.state lyric_state,j.error lyric_error,j.attempts lyric_attempts,length(j.source_text) source_chars,j.updated lyric_updated,
 k.id job,k.state job_state,k.mr_source,k.mr_ext,k.mr_ready,k.words_state,k.words,k.lyrics_text,k.error job_error,k.attempts job_attempts,k.updated job_updated,
 EXISTS(SELECT 1 FROM admin_audit WHERE id='karaoke-align-anchors-v2:'||j.id) retried_alignment
 FROM tracks t LEFT JOIN lyric_jobs j ON j.track_id=t.id LEFT JOIN karaoke_jobs k ON k.track_id=t.id
 WHERE t.kind='original'`;
function wordLines(value){
 try{const lines=JSON.parse(value);return Array.isArray(lines)&&lines.every(line=>Array.isArray(line?.w)&&line.w.length)?lines:[];}catch{return [];}
}
async function inspect(env,t){
 const publicConsent=t.status==='published'&&t.karaoke_at>0&&t.rights_accepted>0;
 const mr=publicConsent?await env.BUCKET.head('karaoke/'+t.id+'/mr.m4a'):null;
 const timings=karaokeLineTimings(t),text=timings.map(line=>line.w[0].t).join('\n');
 const words=wordLines(t.words),listed=t.status==='published'&&t.karaoke_at>0&&t.job_state==='ready'&&!!t.mr_ready&&['ready','attention'].includes(t.words_state);
 let action='ready';
 if(!publicConsent)action='not_offered';
 else if(t.duration<=0||t.duration>KARAOKE_MAX_SECONDS)action='unsupported_duration';
 else if(['queued','processing'].includes(t.job_state)||['queued','processing'].includes(t.lyric_state))action='in_progress';
 else if(!text){
  action=t.lyrics_mode==='none'&&t.lyric_state==='failed'&&t.source_chars>0?(t.retried_alignment?'alignment_review':'retry_alignment'):'no_synced_lyrics';
 }else if(t.mr_source==='upload'&&!t.mr_ready&&t.job_state==='failed')action='uploaded_mr_review';
 else if(!mr?.size)action='build_missing_mr';
 else if(!listed||!words.length||t.lyrics_text!==text)action='link_existing_mr';
 return {action,listed,mr,timings,text,words};
}
function summary(t,s){
 return {id:t.id,title:t.title,status:t.status,duration:t.duration,consent_at:t.karaoke_at,rights_at:t.rights_accepted,terms:t.karaoke_terms,
  lyrics_mode:t.lyrics_mode,source_chars:t.source_chars||0,lyric_lines:s.timings.length,lyric_job:t.lyric_job,lyric_state:t.lyric_state,lyric_attempts:t.lyric_attempts,lyric_error:t.lyric_error,
  job:t.job,job_state:t.job_state,mr_source:t.mr_source,mr_ready:t.mr_ready,job_attempts:t.job_attempts,job_error:t.job_error,words_state:t.words_state,word_lines:s.words.length,
  mr_bytes:s.mr?.size??null,mr_etag:s.mr?.etag??null,listed:!!s.listed,action:s.action};
}
const trackGuard=`EXISTS(SELECT 1 FROM tracks t WHERE t.id=? AND t.kind='original' AND t.status='published'
 AND t.karaoke_at=? AND t.rights_accepted>0 AND t.duration=? AND t.lyrics_mode=? AND t.lyrics=?)`;
async function repair(env,t,s){
 const guard=[t.id,t.karaoke_at,t.duration,t.lyrics_mode,t.lyrics],at=now();
 let write,auditId=id();
 if(s.action==='retry_alignment'){
  auditId='karaoke-align-anchors-v2:'+t.lyric_job;
  write=query(env,`UPDATE lyric_jobs SET state='queued',attempts=0,lease_until=0,lease_token=NULL,error=NULL,updated=?
   WHERE track_id=? AND id=? AND state='failed' AND updated=? AND source_text!='' AND ${trackGuard}
   AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`,at,t.id,t.lyric_job,t.lyric_updated,...guard,auditId);
 }else if(['link_existing_mr','build_missing_mr'].includes(s.action)){
  const reuse=s.action==='link_existing_mr',key=t.mr_source==='upload'?'karaoke/'+t.id+'/mr-source.'+t.mr_ext:'stream/'+t.id+'.m4a';
  if(!reuse&&!(await env.BUCKET.head(key))?.size)return 'missing_source';
  const vocals=!!(await env.BUCKET.head('karaoke/'+t.id+'/vocals.m4a'))?.size;
  const keepWords=t.lyrics_text===s.text&&s.words.length>0&&['attention','ready'].includes(t.words_state);
  const words=keepWords?t.words:JSON.stringify(s.timings),wordState=keepWords?t.words_state:'attention';
  // A conflict may be a creator replacement, a completed worker, or a second
  // operator. Only update the exact inactive generation inspected above.
  write=query(env,`INSERT INTO karaoke_jobs(track_id,id,state,mr_ready,vocals_ready,lyrics_text,words,words_state,created,updated,language)
   SELECT ?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT language FROM lyric_jobs WHERE track_id=?),'ko') WHERE ${trackGuard}
   ON CONFLICT(track_id) DO UPDATE SET state=excluded.state,mr_ready=excluded.mr_ready,vocals_ready=excluded.vocals_ready,lyrics_text=excluded.lyrics_text,
   words=excluded.words,words_state=excluded.words_state,error=NULL,attempts=0,lease_until=0,lease_token=NULL,updated=excluded.updated
   WHERE karaoke_jobs.id=? AND karaoke_jobs.state=? AND karaoke_jobs.updated=? AND karaoke_jobs.state NOT IN ('queued','processing')`,
   t.id,id(),reuse?'ready':'queued',reuse?1:0,vocals?1:0,s.text,reuse?words:'',reuse?wordState:'none',at,at,t.id,...guard,t.job,t.job_state,t.job_updated);
 }else return s.action;
 const audit=query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,'media-worker','karaoke_catalog_repair',?,? WHERE changes()=1`,
  auditId,JSON.stringify({track_id:t.id,action:s.action,job:t.job,lyric_job:t.lyric_job,previous_job_state:t.job_state,previous_lyrics_state:t.lyric_state,previous_error:t.lyric_error||t.job_error,mr_etag:s.mr?.etag??null}),at);
 const [,logged]=await env.DB.batch([write,audit]);
 return logged.meta?.changes===0?'changed_since_read':s.action;
}
export async function karaokeRepairRoute(req,env,path){
 if(path!=='/internal/karaoke/catalog-audit'&&path!=='/internal/karaoke/catalog-repair')return null;
 const scan=path.endsWith('audit');
 if(req.method!==(scan?'GET':'POST'))fail(405,'허용되지 않는 요청입니다.');
 const params=new URL(req.url).searchParams,trackId=params.get('track_id'),after=params.get('after')||'';
 if((trackId!==null&&!/^[\w-]{1,80}$/.test(trackId))||after&&!/^[\w-]{1,80}$/.test(after)||!scan&&!trackId)fail(400,'원곡 ID를 확인해 주세요.');
 const found=await rows(env,inventory+(trackId?' AND t.id=?':' AND t.id>? ORDER BY t.id LIMIT 17'),trackId??after);
 if(trackId&&!found.length)fail(404,'원곡을 찾을 수 없습니다.');
 if(!scan){
  const t=found[0],s=await inspect(env,t);
  const {action}=await req.json();
  if(action!==s.action)return json({id:t.id,outcome:'changed_since_read',action:s.action});
  return json({id:t.id,outcome:await repair(env,t,s)});
 }
 const tracks=await Promise.all(found.slice(0,16).map(async t=>summary(t,await inspect(env,t))));
 return json({tracks,next:found.length>16?tracks.at(-1).id:null});
}
