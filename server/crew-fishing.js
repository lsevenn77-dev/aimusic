import {one, rows, run, json, fail, id} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {FISH} from '../dist/crew-fishing/catalog.js';
import {TIERS,SIZES,LIMITS,weighted,position,progressAfter,season} from '../dist/crew-fishing/rules.js';

function randomBelow(limit){
  const n=new Uint32Array(1), bound=2**32-(2**32%limit);
  do{crypto.getRandomValues(n);}while(n[0]>=bound);
  return n[0]%limit;
}
export function encounter(random=randomBelow){
  const tier=weighted(TIERS,random(10000)), pool=FISH.filter(f=>f.tier===tier);
  const fish=pool[random(pool.length)], grade=weighted(SIZES,random(100)), size=SIZES[grade];
  const deviation=size.min+random(size.max-size.min+1);
  return {fish:fish.id, grade, length:fish.standardCm*(10000+deviation),
    amount:TIERS[tier].base*size.percent/100, cycle:TIERS[tier].cycle, goal:TIERS[tier].goal,
    target:10+random(81-LIMITS.width), width:LIMITS.width};
}
function view(r){
  if(!r)return null;
  const state={id:r.id,status:r.status,progress:r.progress,warnings:r.warnings,seq:r.seq,
    lastPass:r.last_pass,goal:r.goal,cycle:r.cycle_ms,start:r.start_ms,target:r.target,width:r.width};
  if(r.status!=='active')Object.assign(state,{fish:r.fish,length:r.length,grade:r.grade,
    value:r.status==='caught'?r.amount:0,notice:r.notice});
  return state;
}
const memberGuard='EXISTS(SELECT 1 FROM crew_members WHERE user_id=? AND crew_id=?)';
async function ranking(env,week,personal){
  const name=personal?publicNameSQL():'c.name';
  const join=personal?'JOIN users u ON u.id=r.participant':'JOIN crews c ON c.id=r.participant';
  const key=personal?'f.user_id':'f.crew_id';
  return rows(env,`WITH scores AS (SELECT ${key} AS participant,SUM(amount) AS score FROM crew_fishing_casts f
    WHERE week=? AND status='caught' GROUP BY ${key}), ranked AS (SELECT *,RANK() OVER(ORDER BY score DESC) AS place FROM scores)
    SELECT r.participant AS id,${name} AS name,r.score,r.place FROM ranked r
    ${join} ORDER BY r.place,name,id LIMIT 100`,week);
}
export async function fishingRoute(req,env,path,user,ms=Date.now()){
  requireUser(user);
  const uid=user.id, action=path.slice('/api/crew-fishing/'.length), {day,week,open}=season(ms);
  const m=await one(env,`SELECT cm.crew_id,c.name,${publicNameSQL()} AS nickname FROM crew_members cm
    JOIN crews c ON c.id=cm.crew_id JOIN users u ON u.id=cm.user_id
    WHERE cm.user_id=?`,uid);
  if(!m)fail(403,'크루에 가입한 뒤 이용해주세요.');
  const crew=m.crew_id;
  if(req.method==='GET' && action==='lobby' && new URL(req.url).searchParams.get('mode')==='practice'){
    return json({practice:true,scope:uid+'|'+crew,crew,name:m.name,nickname:m.nickname,day,serverTime:ms});
  }
  if(req.method==='POST' && action==='practice-cast')return json({draw:encounter(),serverTime:ms});
  const active=()=>one(env,"SELECT * FROM crew_fishing_casts WHERE user_id=? AND crew_id=? AND day=? AND status='active'",uid,crew,day);
  const response=cast=>json({cast:view(cast),serverTime:ms});
  if(req.method==='GET' && action==='lobby'){
    const [quota,mine,ours,individual,crews,current]=await Promise.all([
      one(env,'SELECT COUNT(*) AS total,COUNT(CASE WHEN day=? THEN 1 END) AS today FROM crew_fishing_casts WHERE user_id=? AND week=?',day,uid,week),
      one(env,"SELECT COALESCE(SUM(amount),0) AS score FROM crew_fishing_casts WHERE week=? AND user_id=? AND status='caught'",week,uid),
      one(env,"SELECT COALESCE(SUM(amount),0) AS score FROM crew_fishing_casts WHERE week=? AND crew_id=? AND status='caught'",week,crew),
      ranking(env,week,true),ranking(env,week,false),open?active():null]);
    return json({crew,name:m.name,week,day,open,remaining:Math.max(0,Math.min(LIMITS.day-quota.today,LIMITS.week-quota.total)),
      weeklyRemaining:Math.max(0,LIMITS.week-quota.total),mine:mine.score,ours:ours.score,individual,crews,cast:view(current),serverTime:ms});
  }
  if(req.method==='GET'&&action==='book'){
    const records=await rows(env,`WITH best AS (SELECT fish,length,grade,nickname,end_ms,COUNT(*) OVER(PARTITION BY fish) AS count,
      ROW_NUMBER() OVER(PARTITION BY fish ORDER BY length DESC,end_ms,rowid) AS place FROM crew_fishing_casts
      WHERE crew_id=? AND status='caught') SELECT fish,length,grade,nickname,end_ms,count FROM best WHERE place=1`,crew);
    return json({name:m.name,records});
  }
  if(req.method!=='POST'||!['cast','pull'].includes(action))fail(404,'경로를 찾지 못했어요.');
  const body=await req.json();
  if(action==='cast'){
    if(!/^[a-z0-9-]{16,64}$/i.test(String(body?.requestId||'')))fail(400,'도전 식별자를 확인해주세요.');
    const previous=()=>one(env,'SELECT * FROM crew_fishing_casts WHERE user_id=? AND crew_id=? AND request_id=?',uid,crew,body.requestId);
    const existing=await previous();
    if(existing && (existing.status!=='active'||(open&&existing.day===day)))return response(existing);
    if(!open)fail(409,'이번 주 공식 낚시가 마감됐어요.');
    const current=await active();
    if(current)return response(current);
    const f=encounter();
    await run(env,`INSERT INTO crew_fishing_casts
      (id,user_id,crew_id,nickname,request_id,day,week,fish,grade,length,amount,start_ms,cycle_ms,goal,target,width)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${memberGuard}
      AND (SELECT COUNT(*) FROM crew_fishing_casts WHERE user_id=? AND week=? AND day=?)<?
      AND (SELECT COUNT(*) FROM crew_fishing_casts WHERE user_id=? AND week=?)<? ON CONFLICT DO NOTHING`,
      id(),uid,crew,m.nickname,body.requestId,day,week,f.fish,f.grade,f.length,f.amount,ms,f.cycle,f.goal,f.target,f.width,
      uid,crew,uid,week,day,LIMITS.day,uid,week,LIMITS.week);
    const cast=await previous()||await active();
    if(!cast || cast.day!==day)fail(409,'오늘 낚시 기회를 모두 사용했거나 도전이 만료됐어요.');
    return response(cast);
  }
  if(typeof body?.id!=='string'||!Number.isSafeInteger(body.seq)||body.seq<1)fail(400,'올바르지 않은 당기기 요청이에요.');
  const find=()=>one(env,'SELECT * FROM crew_fishing_casts WHERE id=? AND user_id=? AND crew_id=?',body.id,uid,crew);
  const cast=await find();
  if(!cast)fail(404,'낚시 기록을 찾지 못했어요.');
  if(cast.status!=='active')return response(cast);
  if(cast.day!==day||!open)fail(409,'도전 시간이 지났어요. 대기실에서 다시 확인해주세요.');
  if(body.seq<=cast.seq)return response(cast);
  if(body.seq!==cast.seq+1)fail(409,'도전 상태를 다시 확인해주세요.');
  const elapsed=ms-cast.start_ms, pass=Math.floor(2*elapsed/cast.cycle_ms);
  if(pass<=cast.last_pass)return response(cast);
  const p=position(elapsed,cast.cycle_ms), hit=p>=cast.target&&p<=cast.target+cast.width;
  const next=progressAfter(cast,hit);
  await run(env,`UPDATE crew_fishing_casts SET progress=?,warnings=?,seq=?,last_pass=?,status=?,end_ms=?,
    notice=CASE WHEN ?='caught' THEN CASE
      WHEN NOT EXISTS(SELECT 1 FROM crew_fishing_casts WHERE crew_id=? AND fish=? AND status='caught') THEN 'new'
      WHEN ?>(SELECT MAX(length) FROM crew_fishing_casts WHERE crew_id=? AND fish=? AND status='caught') THEN 'best'
      END END WHERE id=? AND status='active' AND seq=? AND ${memberGuard}`,
    next.progress,next.warnings,body.seq,pass,next.status,next.status==='active'?null:ms,next.status,crew,cast.fish,cast.length,
    crew,cast.fish,cast.id,cast.seq,uid,crew);
  return response(await find());
}

