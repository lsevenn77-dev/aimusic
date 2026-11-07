import {gameLimits} from './crew-game-limits.js';
import {one,rows,run,json,fail,id,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {VERSION,RULES,CHART,replayRhythm} from '../dist/crew-rhythm/core.js';
import {season} from '../dist/crew-fishing/rules.js';

const TTL=3600000;
export async function rhythmRoute(req,env,path,user,ms=Date.now()){
  requireUser(user);
  const uid=user.id,action=path.slice('/api/crew-rhythm/'.length),{day,week}=season(ms);
  const member=await one(env,'SELECT crew_id FROM crew_members WHERE user_id=?',uid);
  if(!member)fail(403,'크루에 가입하면 공식 랭킹에 참여할 수 있어요.');
  const crew=member.crew_id;
  if(action==='lobby'&&req.method==='GET'){
    const limits=await gameLimits(env,uid,ms);
    const [used,bests,individualRanking,ranking]=await Promise.all([
      one(env,'SELECT COUNT(*) AS n FROM crew_rhythm_runs WHERE user_id=? AND day=?',uid,day),
      rows(env,"SELECT difficulty,MAX(score) AS score,MAX(max_combo) AS combo FROM crew_rhythm_runs WHERE user_id=? AND week=? AND status='finished' GROUP BY difficulty",uid,week),
      rows(env,`WITH best AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY score DESC,finished,id) AS choice
        FROM crew_rhythm_runs WHERE week=? AND status='finished' AND crew_id IS NOT NULL),
        ranked AS (SELECT *,RANK() OVER(ORDER BY score DESC) AS place FROM best WHERE choice=1)
        SELECT r.user_id,r.user_id AS id,${publicNameSQL()} AS name,r.score AS points,r.difficulty,r.place,(r.user_id=?) AS mine,p.id AS profile_id,p.image_version
        FROM ranked r JOIN users u ON u.id=r.user_id LEFT JOIN producers p ON p.user_id=u.id WHERE r.place<=100 OR r.user_id=? ORDER BY r.place,r.finished,r.id`,week,uid,uid),
      rows(env,`WITH best AS (SELECT crew_id,user_id,MAX(score) AS points FROM crew_rhythm_runs
        WHERE week=? AND status='finished' AND crew_id IS NOT NULL GROUP BY crew_id,user_id),
        members AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY crew_id ORDER BY points DESC,user_id) AS member_place FROM best),
        totals AS (SELECT crew_id,SUM(points) AS points FROM members WHERE member_place<=10 GROUP BY crew_id),
        ranked AS (SELECT *,RANK() OVER(ORDER BY points DESC) AS place FROM totals)
        SELECT r.*,c.name,c.image_version FROM ranked r JOIN crews c ON c.id=r.crew_id WHERE place<=100 OR crew_id=? ORDER BY place,c.name,r.crew_id`,week,crew)
    ]);
    return json({userId:uid,crew,day,week,open:true,...limits,remaining:Math.max(0,limits.dailyLimit-used.n),version:VERSION,song:CHART.title||'Double Tap',bests,
      individualRanking,ranking,team:ranking.find(r=>r.crew_id===crew)?.points||0});
  }
  if(req.method!=='POST')fail(405,'지원하지 않는 요청이에요.');
  await rate(env,'crew-rhythm:'+uid,45,60);
  const body=await req.json();
  if(action==='start'){
    const limits=await gameLimits(env,uid,ms);
    if(!Object.hasOwn(RULES.base,body.difficulty)||!/^[-\w]{12,64}$/.test(String(body.requestId||'')))fail(400,'도전 정보를 확인해주세요.');
    const previous=()=>one(env,'SELECT * FROM crew_rhythm_runs WHERE user_id=? AND request_id=?',uid,body.requestId);
    let record=await previous();
    if(!record){
      await run(env,`INSERT OR IGNORE INTO crew_rhythm_runs(id,user_id,crew_id,week,day,request_id,difficulty,version,starts)
        SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM crew_rhythm_runs WHERE user_id=? AND day=?)<?
        AND NOT EXISTS(SELECT 1 FROM crew_rhythm_runs WHERE user_id=? AND status='active' AND starts>?)
        AND NOT EXISTS(SELECT 1 FROM crew_rhythm_runs WHERE user_id=? AND week=? AND crew_id IS NOT ?)`,
        id(),uid,crew,week,day,body.requestId,body.difficulty,VERSION,ms,uid,day,limits.dailyLimit,uid,ms-TTL,uid,week,crew);
      record=await previous();
    }
    if(!record||record.crew_id!==crew||record.day!==day||record.difficulty!==body.difficulty||record.status!=='active'||ms>record.starts+TTL)fail(409,`진행 중인 도전 또는 오늘 공식 도전 ${limits.dailyLimit}회 한도를 확인해주세요.`);
    return json({id:record.id,difficulty:record.difficulty,version:record.version,serverTime:ms});
  }
  const record=await one(env,'SELECT * FROM crew_rhythm_runs WHERE id=? AND user_id=? AND crew_id=?',String(body.id||''),uid,crew);
  if(!record)fail(404,'공식 도전을 찾지 못했어요.');
  if(action==='abandon'){
    await run(env,"UPDATE crew_rhythm_runs SET status='abandoned' WHERE id=? AND status='active'",record.id);
    return json({ok:true});
  }
  if(action!=='finish')fail(404,'경로를 찾지 못했어요.');
  if(record.status==='finished')return json({score:record.score,maxCombo:record.max_combo,saved:true});
  if(record.status!=='active'||record.version!==VERSION||ms>record.starts+TTL)fail(409,'기록 제출 시간이 지났어요.');
  let result;
  try{result=replayRhythm(record.difficulty,body.events,body.finishAt,body.reason);}catch{fail(400,'리듬 입력 기록을 확인해주세요.');}
  if(ms-record.starts+500<body.finishAt+RULES.leadIn*1000)fail(409,'도전을 마친 뒤 기록을 제출해주세요.');
  await run(env,`UPDATE crew_rhythm_runs SET score=?,max_combo=?,inputs=?,finished=?,status='finished'
    WHERE id=? AND status='active'`,result.total,result.maxCombo,JSON.stringify(body.events),ms,record.id);
  const saved=await one(env,'SELECT status,score,max_combo FROM crew_rhythm_runs WHERE id=?',record.id);
  if(saved.status!=='finished')fail(409,'이미 종료된 도전이에요.');
  return json({score:saved.score,maxCombo:saved.max_combo,saved:true,missionEventKey:'crew-rhythm:'+record.id});
}
