import {analyzeLyrics,lyricPlainText,LYRIC_ANALYSIS_VERSION,LYRIC_TAG_BY_ID} from '../shared/lyric-semantics.js';
import {one,rows,run,query,now,id,json,fail} from './db.js';
import {hash,requireUser,isAdmin} from './auth.js';

const ENGINE='lyrics',LEASE=45,MAX_ATTEMPTS=3;
const clamp=(n,fallback,max)=>Number.isFinite(Number(n))?Math.max(1,Math.min(max,Math.trunc(Number(n)))):fallback;
export async function seedLyricJobs(env,limit=32){
 const control=await one(env,'SELECT * FROM lyric_analysis_control WHERE id=?',ENGINE);
 if(control.scan_done&&control.version===LYRIC_ANALYSIS_VERSION)return 0;
 const cursor=control.version===LYRIC_ANALYSIS_VERSION?control.cursor:'';
 const page=await rows(env,"SELECT id FROM tracks WHERE id>? AND status!='deleted' ORDER BY id LIMIT ?",cursor,limit);
 const ids=JSON.stringify(page.map(t=>t.id));
 await env.DB.batch([
  query(env,`INSERT INTO lyric_analysis_jobs(track_id,state,updated) SELECT value,'queued',? FROM json_each(?) WHERE 1 ON CONFLICT(track_id) DO UPDATE SET state='queued',attempts=0,lease_token='',lease_until=0,updated=excluded.updated WHERE lyric_analysis_jobs.version!=?`,now(),ids,LYRIC_ANALYSIS_VERSION),
  query(env,'UPDATE lyric_analysis_control SET cursor=?,scan_done=?,version=? WHERE id=?',page.at(-1)?.id||cursor,page.length<limit?1:0,LYRIC_ANALYSIS_VERSION,ENGINE)
 ]);
 return page.length;
}

export async function analyzeLyricJob(env,{analyzer=analyzeLyrics}={}){
 const at=now(),token=id();
 const job=await query(env,`UPDATE lyric_analysis_jobs SET state='processing',lease_token=?,lease_until=?,attempts=attempts+1,updated=?
 WHERE track_id=(SELECT track_id FROM lyric_analysis_jobs WHERE attempts<? AND ((state='queued' AND lease_until<=?) OR (state='processing' AND lease_until<=?)) ORDER BY updated,track_id LIMIT 1) RETURNING *`,token,at+LEASE,at,MAX_ATTEMPTS,at,at).first();
 if(!job)return null;
 try{
  // Listening pages already use the original lyric for covers; follow the same source.
  const track=await one(env,"SELECT t.id,t.status,CASE WHEN t.kind='cover' THEN COALESCE((SELECT o.lyrics FROM tracks o WHERE o.id=t.original_id AND o.status!='deleted'),'') ELSE t.lyrics END lyrics FROM tracks t WHERE t.id=?",job.track_id);
  if(!track)return {skipped:true};
  const deleted=track.status==='deleted',text=deleted?'':lyricPlainText(track.lyrics),digest=await hash(text);
  // Timing-only edits do not rerun the analyzer. Existing tags remain intact.
  if(!deleted&&job.lyrics_hash===digest&&job.version===LYRIC_ANALYSIS_VERSION&&job.result_json){
   await run(env,"UPDATE lyric_analysis_jobs SET state=?,attempts=0,lease_token='',lease_until=0,error='',updated=? WHERE track_id=? AND lease_token=?",text?'done':'no_lyrics',at,track.id,token);
   return {id:track.id,cached:true};
  }
  const start=performance.now(),result=await analyzer(text),elapsed=performance.now()-start;
  const overrides=await rows(env,'SELECT tag_id,mode FROM lyric_tag_overrides WHERE track_id=?',track.id);
  const byId=new Map(result.tags.map(t=>[t.id,{...t,source:'auto'}]));
  for(const pin of overrides){if(pin.mode==='exclude')byId.delete(pin.tag_id);else if(!deleted&&LYRIC_TAG_BY_ID.has(pin.tag_id))byId.set(pin.tag_id,{id:pin.tag_id,confidence:1,role:'secondary',source:'manual',evidence:[]});}
  const tags=deleted?[]:[...byId.values()],keywords=deleted?[]:result.keywords;
  const guard="EXISTS(SELECT 1 FROM lyric_analysis_jobs j WHERE j.track_id=? AND j.lease_token=? AND j.state='processing')";
  // One atomic batch; a concurrent lyric edit revokes the lease via the DB trigger.
  await env.DB.batch([
   query(env,`DELETE FROM lyric_search_tags WHERE track_id=? AND ${guard}`,track.id,track.id,token),
   query(env,`DELETE FROM lyric_search_terms WHERE track_id=? AND ${guard}`,track.id,track.id,token),
   query(env,`INSERT INTO lyric_search_tags(track_id,tag_id,confidence,role,source,evidence_json) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.confidence'),json_extract(value,'$.role'),json_extract(value,'$.source'),json_extract(value,'$.evidence') FROM json_each(?) WHERE ${guard}`,track.id,JSON.stringify(tags),track.id,token),
   query(env,`INSERT INTO lyric_search_terms(track_id,term,weight) SELECT ?,json_extract(value,'$.term'),json_extract(value,'$.weight') FROM json_each(?) WHERE ${guard}`,track.id,JSON.stringify(keywords),track.id,token),
   query(env,`UPDATE lyric_analysis_jobs SET state=?,version=?,lyrics_hash=?,analyzed_at=?,updated=?,result_json=?,duration_ms=?,error='',attempts=0,lease_token='',lease_until=0 WHERE track_id=? AND lease_token=?`,deleted?'deleted':text?'done':'no_lyrics',LYRIC_ANALYSIS_VERSION,digest,at,at,JSON.stringify({tag_count:tags.length,keyword_count:keywords.length,sentence_count:result.sentence_count}),Math.round(elapsed*100)/100,track.id,token)
  ]);
  return {id:track.id,state:deleted?'deleted':text?'done':'no_lyrics',tags:tags.length,duration_ms:elapsed};
 }catch{
  await run(env,"UPDATE lyric_analysis_jobs SET state=?,lease_until=?,lease_token='',error=?,updated=? WHERE track_id=? AND lease_token=?",job.attempts>=MAX_ATTEMPTS?'failed':'queued',at+30*job.attempts,'local_analysis_failed',at,job.track_id,token);
  return {id:job.track_id,failed:true};
 }
}

export async function runLyricBatch(env,{limit=4,budgetMs=1800}={}){
 if(!env.DB)return {disabled:true};
 const at=now(),token=id(),start=performance.now();
 await run(env,"INSERT OR IGNORE INTO lyric_analysis_control(id,version) VALUES(?,?)",ENGINE,LYRIC_ANALYSIS_VERSION);
 const lock=await query(env,'UPDATE lyric_analysis_control SET lease_token=?,lease_until=? WHERE id=? AND lease_until<=? RETURNING id',token,at+LEASE,ENGINE,at).first();
 if(!lock)return {busy:true};
 const processed=[];let seeded=0;
 try{
  await run(env,"UPDATE lyric_analysis_jobs SET state='failed',lease_token='',error='lease_expired',updated=? WHERE state='processing' AND lease_until<=? AND attempts>=?",at,at,MAX_ATTEMPTS);
  seeded=await seedLyricJobs(env);
  for(let i=0;i<clamp(limit,4,8)&&performance.now()-start<budgetMs;i++){const result=await analyzeLyricJob(env);if(!result)break;processed.push(result);}
  return {seeded,processed:processed.length,failed:processed.filter(r=>r.failed).length,duration_ms:Math.round(performance.now()-start)};
 }finally{
  await run(env,'UPDATE lyric_analysis_control SET lease_token=\'\',lease_until=?,last_batch_ms=?,last_batch_count=?,updated=? WHERE id=? AND lease_token=?',now()+2,Math.round(performance.now()-start),processed.length,now(),ENGINE,token);
 }
}
const heartbeat=new WeakMap();
export function queueLyricAnalysis(env,ctx){
 if(!env.DB||!env.BUCKET||!ctx?.waitUntil||env.LYRIC_ANALYSIS_DISABLED==='true')return;
 const at=Date.now();if(at<(heartbeat.get(env.DB)||0))return;heartbeat.set(env.DB,at+3000);
 ctx.waitUntil(runLyricBatch(env,{limit:clamp(env.LYRIC_ANALYSIS_BATCH_SIZE,4,8)}).catch(()=>console.error('Local lyric analysis pending')));
}
export async function lyricAnalysisStatus(env){
 const [states,coverage,control,resource]=await Promise.all([
  rows(env,'SELECT state,count(*) count FROM lyric_analysis_jobs GROUP BY state'),
  one(env,`SELECT count(*) total,sum(CASE WHEN j.track_id IS NULL THEN 1 ELSE 0 END) missing,sum(CASE WHEN j.state IN ('done','no_lyrics') AND j.version=? THEN 1 ELSE 0 END) current FROM tracks t LEFT JOIN lyric_analysis_jobs j ON j.track_id=t.id WHERE t.status!='deleted'`,LYRIC_ANALYSIS_VERSION),
  one(env,'SELECT version,scan_done,updated,last_batch_ms,last_batch_count FROM lyric_analysis_control WHERE id=?',ENGINE),
  one(env,"SELECT round(avg(duration_ms),3) avg_analysis_ms,max(duration_ms) max_analysis_ms FROM lyric_analysis_jobs WHERE state='done'")
 ]);
 return {version:LYRIC_ANALYSIS_VERSION,states,coverage,control,resource};
}
export async function lyricAnalysisAdmin(req,env,path,user){
 if(path!=='/api/admin/lyric-analysis')return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'관리자만 확인할 수 있어요.');
 if(req.method==='GET')return json(await lyricAnalysisStatus(env));
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 const body=await req.json(),action=body.action;
 const audit=query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)",id(),user.id,'lyrics:'+String(action).slice(0,20),JSON.stringify({track_id:body.track_id||null,tag_id:body.tag_id||null,mode:body.mode||null}),now());
 if(action==='retry_failed')await env.DB.batch([query(env,"UPDATE lyric_analysis_jobs SET state='queued',attempts=0,lease_until=0,lease_token='',updated=? WHERE state='failed'",now()),audit]);
 else if(action==='rebuild')await env.DB.batch([query(env,"UPDATE lyric_analysis_jobs SET version='',state='queued',attempts=0,lease_until=0,lease_token='',updated=?",now()),query(env,"UPDATE lyric_analysis_control SET cursor='',scan_done=0,lease_until=0,lease_token='' WHERE id=?",ENGINE),audit]);
 else if(action==='pin'){
  if(!LYRIC_TAG_BY_ID.has(body.tag_id)||!['include','exclude','clear'].includes(body.mode))fail(400,'태그와 고정 방식을 확인해주세요.');
  const track=await one(env,"SELECT id FROM tracks WHERE id=? AND status!='deleted'",String(body.track_id||''));if(!track)fail(404,'음원을 찾을 수 없습니다.');
  await env.DB.batch([
   body.mode==='clear'?query(env,'DELETE FROM lyric_tag_overrides WHERE track_id=? AND tag_id=?',track.id,body.tag_id):query(env,'INSERT INTO lyric_tag_overrides(track_id,tag_id,mode,operator_id,updated) VALUES(?,?,?,?,?) ON CONFLICT(track_id,tag_id) DO UPDATE SET mode=excluded.mode,operator_id=excluded.operator_id,updated=excluded.updated',track.id,body.tag_id,body.mode,user.id,now()),
   query(env,"INSERT INTO lyric_analysis_jobs(track_id,state,updated) VALUES(?,'queued',?) ON CONFLICT(track_id) DO UPDATE SET state='queued',version='',attempts=0,lease_until=0,lease_token='',updated=excluded.updated",track.id,now()),audit]);
 }else if(action!=='run')fail(400,'지원하지 않는 작업입니다.');
 const batch=await runLyricBatch(env);return json({batch,...await lyricAnalysisStatus(env)});
}
