import {query,one,rows,json,fail,id,rate} from './db.js';
import {requireUser} from './auth.js';
import {VERSION,HZ,replay} from '../shared/crew-jump.js';

// Add 'rhythm' to this rotation only when a playable rhythm route is implemented.
const COUNTDOWN_MS=3000, SUBMIT_GRACE_MS=30000, RUN_TTL_MS=60000+SUBMIT_GRACE_MS;
const playableRotation=['jump'];
const DAY=86400000, WEEK=7*DAY, KST=9*3600000;
export function seasonTime(ms,env){
 const local=new Date(ms+KST),day=local.toISOString().slice(0,10);
 const monday=Date.parse(day)-(local.getUTCDay()+6)%7*DAY,week=new Date(monday).toISOString().slice(0,10);
 const closes=monday-KST+4*DAY+22*3600000;
 const date=env.CREW_JUMP_START_MONDAY||'',anchor=Date.parse(date);
 const configured=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(anchor)&&new Date(anchor).toISOString().startsWith(date)&&new Date(anchor).getUTCDay()===1;
 const game=configured?playableRotation[Math.floor((monday-anchor)/WEEK)%playableRotation.length]:null;
 return {day,week,closes,open:configured&&monday>=anchor&&ms<closes&&game==='jump',seed:'aifect/'+VERSION+'/'+week};
}
const scoreSQL='SELECT MAX(score) best FROM crew_jump_runs WHERE week=? AND user_id=?';
export async function jumpRoute(req,env,path,user,ms=Date.now()){
 const match=/^\/api\/crews\/([\w-]+)\/jump(?:\/(start|finish|abandon))?$/.exec(path);
 if(!match)return null;
 requireUser(user);
 const crew=match[1],uid=user.id;
 if(!await one(env,'SELECT 1 FROM crew_members WHERE crew_id=? AND user_id=?',crew,uid))fail(403,'소속 크루에서 참여해주세요.');
 const calendar=seasonTime(ms,env),{day,week,seed,open,closes}=calendar;
 if(!match[2]&&req.method==='GET'){
  const used=await one(env,'SELECT COUNT(*) n FROM crew_jump_runs WHERE day=? AND user_id=?',day,uid);
  const best=await one(env,scoreSQL,week,uid);
  const ranking=await rows(env,`WITH best AS (
    SELECT crew_id,user_id,MAX(score) points FROM crew_jump_runs WHERE week=? AND score IS NOT NULL AND crew_id IS NOT NULL GROUP BY crew_id,user_id
  ), members AS (
    SELECT *,ROW_NUMBER() OVER(PARTITION BY crew_id ORDER BY points DESC,user_id) AS place FROM best
  ), totals AS (
    SELECT crew_id,SUM(points) points,COUNT(*) members FROM members WHERE place<=10 GROUP BY crew_id
  ), ranked AS (
    SELECT *,RANK() OVER(ORDER BY points DESC) place FROM totals
  ) SELECT c.name,r.* FROM ranked r JOIN crews c ON c.id=r.crew_id WHERE place<=10 OR crew_id=? ORDER BY place,c.name,r.crew_id`,week,crew);
  const own=ranking.find(r=>r.crew_id===crew);
  const mission=await one(env,'SELECT COUNT(score) completed FROM crew_jump_runs WHERE day=? AND user_id=? AND crew_id=?',day,uid,crew);
  return json({week,open:open&&ms+COUNTDOWN_MS+RUN_TTL_MS<closes,seed,version:VERSION,remaining:3-used.n,best:best.best,team:own?.points??0,teamRank:own?.place??null,ranking,participated:mission.completed>0});

 }
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 await rate(env,'crew-jump-write:'+uid,45,60);
 const body=await req.json();
 if(match[2]==='start'){
  if(!open||ms+COUNTDOWN_MS+RUN_TTL_MS>=closes)fail(409,'공식 도전 기간이 아니에요.');
  if(typeof body.requestId!=='string'||!/^[\w-]{12,64}$/.test(body.requestId))fail(400,'다시 시도해주세요.');
  // One SQLite statement serializes quota, active-round and crew checks across tabs.
  await query(env,`INSERT OR IGNORE INTO crew_jump_runs(id,user_id,crew_id,week,day,request_id,seed,version,starts)
    SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM crew_jump_runs WHERE user_id=? AND day=?)<3
    AND NOT EXISTS(SELECT 1 FROM crew_jump_runs WHERE user_id=? AND score IS NULL AND inputs IS NULL AND starts>?)
    AND NOT EXISTS(SELECT 1 FROM crew_jump_runs WHERE user_id=? AND week=? AND crew_id IS NOT ?)`,
   id(),uid,crew,week,day,body.requestId,seed,VERSION,ms+COUNTDOWN_MS,uid,day,uid,ms-RUN_TTL_MS,uid,week,crew).run();
  const run=await one(env,'SELECT id,seed,version,starts,score,inputs FROM crew_jump_runs WHERE user_id=? AND request_id=? AND crew_id=? AND day=?',uid,body.requestId,crew,day);
  if(!run||run.inputs!==null||run.score!==null||ms>run.starts+RUN_TTL_MS)fail(409,'진행 중인 도전이나 오늘의 남은 횟수를 확인해주세요.');
  return json({...run,serverNow:ms});
 }

 const run=await one(env,'SELECT * FROM crew_jump_runs WHERE id=? AND user_id=? AND crew_id=?',body.id||'',uid,crew);
 if(!run)fail(404,'도전을 찾을 수 없어요.');
 if(match[2]==='abandon'){
  await query(env,"UPDATE crew_jump_runs SET inputs='null' WHERE id=? AND score IS NULL AND inputs IS NULL",run.id).run();
  return json({ok:true});
 }
 if(run.inputs==='null')fail(409,'이탈한 도전이에요.');
 // A verified row is the durable participation event. Mission consumers can deduplicate by this key.
 const completion=score=>json({score,missionEventKey:'crew-jump:'+run.id});
 if(run.score!==null)return completion(run.score);
 if(run.version!==VERSION||!open||run.week!==week||ms>=closes||ms>run.starts+RUN_TTL_MS)fail(409,'제출 시간이 지났어요.');
 let result;
 try{result=replay(run.seed,body.inputs)}catch{console.warn('crew_jump_invalid_replay');fail(400,'점프 기록을 확인해주세요.')}
 if(ms<run.starts+Math.floor(result.tick*1000/HZ)-100)fail(409,'도전을 마친 뒤 제출해주세요.');
 await query(env,'UPDATE crew_jump_runs SET score=?,inputs=? WHERE id=? AND score IS NULL AND inputs IS NULL',result.score,JSON.stringify(body.inputs),run.id).run();
 const saved=await one(env,'SELECT score FROM crew_jump_runs WHERE id=?',run.id);
 if(saved.score===null)fail(409,'도전이 종료됐어요.');
 return completion(saved.score);
}
