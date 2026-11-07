import {gameLimits,officialClose} from './crew-game-limits.js';
import {one, rows, run, json, fail, id} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {FISH} from '../dist/crew-fishing/catalog.js';
import {TIERS,SIZES,LIMITS,IDLE_MS,weighted,position,progressAfter,season} from '../dist/crew-fishing/rules.js';
import {inputElapsed} from '../dist/crew-fishing/timing.js';
import {fishValue} from '../dist/crew-fishing/pricing.js';
import {FISH_VALUE_SQL} from './crew-fishing-pricing.js';

function randomBelow(limit){
  const n=new Uint32Array(1), bound=2**32-(2**32%limit);
  do{crypto.getRandomValues(n);}while(n[0]>=bound);
  return n[0]%limit;
}
export const biteDelay=(random=randomBelow)=>(1+random(15))*1000;
// While active, end_ms is the last accepted touch time; once finished it is the end time.
// start_ms is the persisted bite time, so reloading cannot redraw or skip the wait.
const idleDeadline=cast=>(cast.end_ms??cast.start_ms)+IDLE_MS;
export function encounter(random=randomBelow){
  const tier=weighted(TIERS,random(10000)), pool=FISH.filter(f=>f.tier===tier);
  const fish=pool[random(pool.length)], grade=weighted(SIZES,random(100)), size=SIZES[grade];
  const deviation=size.min+random(size.max-size.min+1);
  return {fish:fish.id, grade, length:fish.standardCm*(10000+deviation),
    amount:fishValue(fish.id,grade), cycle:TIERS[tier].cycle, goal:TIERS[tier].goal,
    target:10+random(81-TIERS[tier].width), width:TIERS[tier].width};
}
function view(r){
  if(!r)return null;
  const state={id:r.id,status:r.status,progress:r.progress,warnings:r.warnings,seq:r.seq,
    lastPass:r.last_pass,goal:r.goal,cycle:r.cycle_ms,start:r.start_ms,target:r.target,width:r.width,
    expiresAt:idleDeadline(r)};
  if(r.status!=='active')Object.assign(state,{fish:r.fish,length:r.length,grade:r.grade,
    value:r.status==='caught'?fishValue(r.fish,r.grade,r.amount):0,notice:r.notice});
  return state;
}
const memberGuard='EXISTS(SELECT 1 FROM crew_members WHERE user_id=? AND crew_id=?)';
// Operator-configured allowances expire at the next KST day without changing catch records.
function configuredLimits(env,uid,day){
  try{
    const raw=env.CREW_FISHING_QUOTA_OVERRIDES;
    if(typeof raw!=='string'||raw.length>16384)return LIMITS;
    const overrides=JSON.parse(raw);
    if(!overrides||Array.isArray(overrides)||!Object.hasOwn(overrides,uid))return LIMITS;
    const entry=overrides[uid];
    if(!entry||entry.day!==day||!Number.isSafeInteger(entry.dayLimit)||
      !Number.isSafeInteger(entry.weekLimit)||entry.dayLimit<LIMITS.day||entry.dayLimit>1000||
      entry.weekLimit<LIMITS.week||entry.weekLimit<entry.dayLimit||entry.weekLimit>5000)return LIMITS;
    return {...LIMITS,day:entry.dayLimit,week:entry.weekLimit};
  }catch{return LIMITS;}
}
// A dated top-up can be issued to one user without replacing the shared overrides.
export function fishingLimits(env,uid,day){
  const base=configuredLimits(env,uid,day);
  if(!/^[a-z0-9-]{1,64}$/.test(uid))return base;
  const raw=env['CREW_FISHING_BONUS_'+uid.toUpperCase().replaceAll('-','_')];
  if(typeof raw!=='string'||raw.length>80)return base;
  try{
    const grant=JSON.parse(raw);
    if(grant?.day!==day||!Number.isSafeInteger(grant.extra)||grant.extra<1||grant.extra>1000)return base;
    return {...base,day:base.day+grant.extra,week:base.week+grant.extra};
  }catch{return base;}
}
async function ranking(env,week,personal,viewer){
  const name=personal?publicNameSQL():'c.name';
  const join=personal?'JOIN users u ON u.id=r.participant LEFT JOIN producers p ON p.user_id=u.id':'JOIN crews c ON c.id=r.participant';
  const profile=personal?'u.id user_id,p.id AS profile_id,p.image_version':'r.participant AS crew_id,c.image_version';
  const key=personal?'f.user_id':'f.crew_id';
  return rows(env,`WITH scores AS (SELECT ${key} AS participant,SUM(${FISH_VALUE_SQL}) AS score FROM crew_fishing_casts f
    WHERE week=? AND status='caught' GROUP BY ${key}), ranked AS (SELECT *,RANK() OVER(ORDER BY score DESC) AS place FROM scores)
    SELECT r.participant AS id,${name} AS name,r.score,r.place,${profile},(r.participant=?) AS mine FROM ranked r
    ${join} WHERE r.place<=100 OR r.participant=? ORDER BY r.place,name,r.participant`,week,viewer,viewer);
}
export async function fishingRoute(req,env,path,user,ms=Date.now(),clock={receivedTime:ms,started:performance.now()}){
  const respond=data=>json({...data,receivedTime:clock.receivedTime,serverTime:clock.receivedTime+performance.now()-clock.started});
  requireUser(user);
  const uid=user.id, action=path.slice('/api/crew-fishing/'.length), {day,week}=season(ms);
  const open=ms<officialClose(env,ms,Date.parse(week+'T22:00:00+09:00')+4*86400000);
  const baseLimits=fishingLimits(env,uid,day);
  const quotaLimits=['lobby','cast'].includes(action)?await gameLimits(env,uid,ms,baseLimits.day):{premiumBonus:0,dailyLimit:baseLimits.day};
  const limits={...baseLimits,day:quotaLimits.dailyLimit,week:baseLimits.week+quotaLimits.premiumBonus*5};
  const m=await one(env,`SELECT cm.crew_id,c.name,${publicNameSQL()} AS nickname FROM crew_members cm
    JOIN crews c ON c.id=cm.crew_id JOIN users u ON u.id=cm.user_id
    WHERE cm.user_id=?`,uid);
  if(!m)fail(403,'크루에 가입한 뒤 이용해주세요.');
  const crew=m.crew_id;
  if(req.method==='GET' && action==='lobby' && new URL(req.url).searchParams.get('mode')==='practice'){
    return respond({practice:true,scope:uid+'|'+crew,crew,name:m.name,nickname:m.nickname,day});
  }
  if(req.method==='POST' && action==='practice-cast')return respond({draw:{...encounter(),waitMs:biteDelay()}});
  async function expire(cast,at=clock.receivedTime){
    if(cast?.status==='active'&&at>=idleDeadline(cast)){
      await run(env,`UPDATE crew_fishing_casts SET status='escaped',end_ms=?,notice='idle'
        WHERE id=? AND status='active' AND seq=? AND ${memberGuard}`,idleDeadline(cast),cast.id,cast.seq,uid,crew);
      return one(env,'SELECT * FROM crew_fishing_casts WHERE id=?',cast.id);
    }
    return cast;
  }
  const active=async()=>{
    const current=await expire(await one(env,"SELECT * FROM crew_fishing_casts WHERE user_id=? AND crew_id=? AND day=? AND status='active'",uid,crew,day));
    return current?.status==='active'?current:null;
  };
  const response=cast=>respond({cast:view(cast)});
  if(req.method==='GET' && action==='lobby'){
    const [quota,mine,ours,individual,crews,current]=await Promise.all([
      one(env,'SELECT COUNT(*) AS total,COUNT(CASE WHEN day=? THEN 1 END) AS today FROM crew_fishing_casts WHERE user_id=? AND week=?',day,uid,week),
      one(env,`SELECT COALESCE(SUM(${FISH_VALUE_SQL}),0) AS score FROM crew_fishing_casts WHERE week=? AND user_id=? AND status='caught'`,week,uid),
      one(env,`SELECT COALESCE(SUM(${FISH_VALUE_SQL}),0) AS score FROM crew_fishing_casts WHERE week=? AND crew_id=? AND status='caught'`,week,crew),
      ranking(env,week,true,uid),ranking(env,week,false,crew),open?active():null]);
    return respond({crew,name:m.name,week,day,open,...quotaLimits,dailyLimit:limits.day,weeklyLimit:limits.week,remaining:Math.max(0,Math.min(limits.day-quota.today,limits.week-quota.total)),
      weeklyRemaining:Math.max(0,limits.week-quota.total),mine:mine.score,ours:ours.score,individual,crews,cast:view(current)});
  }
  if(req.method==='GET'&&action==='book'){
    const records=await rows(env,`WITH best AS (SELECT user_id,fish,length,grade,nickname,end_ms,COUNT(*) OVER(PARTITION BY fish) AS count,
      ROW_NUMBER() OVER(PARTITION BY fish ORDER BY length DESC,end_ms,rowid) AS place FROM crew_fishing_casts
      WHERE crew_id=? AND status='caught') SELECT user_id,fish,length,grade,nickname,end_ms,count FROM best WHERE place=1`,crew);
    return json({name:m.name,records});
  }
  if(req.method!=='POST'||!['cast','pull'].includes(action))fail(404,'경로를 찾지 못했어요.');
  const body=await req.json();
  if(action==='cast'){
    if(!/^[a-z0-9-]{16,64}$/i.test(String(body?.requestId||'')))fail(400,'도전 식별자를 확인해주세요.');
    const previous=()=>one(env,'SELECT * FROM crew_fishing_casts WHERE user_id=? AND crew_id=? AND request_id=?',uid,crew,body.requestId);
    const existing=await previous();
    if(existing && (existing.status!=='active'||(open&&existing.day===day)))return response(await expire(existing));
    if(!open)fail(409,'이번 주 공식 낚시가 마감됐어요.');
    const current=await active();
    if(current)return response(current);
    const f=encounter();
    await run(env,`INSERT INTO crew_fishing_casts
      (id,user_id,crew_id,nickname,request_id,day,week,fish,grade,length,amount,start_ms,cycle_ms,goal,target,width)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${memberGuard}
      AND (SELECT COUNT(*) FROM crew_fishing_casts WHERE user_id=? AND week=? AND day=?)<?
      AND (SELECT COUNT(*) FROM crew_fishing_casts WHERE user_id=? AND week=?)<? ON CONFLICT DO NOTHING`,
      id(),uid,crew,m.nickname,body.requestId,day,week,f.fish,f.grade,f.length,f.amount,ms+biteDelay(),f.cycle,f.goal,f.target,f.width,
      uid,crew,uid,week,day,limits.day,uid,week,limits.week);
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
  if(body.timeout===true)return response(await expire(cast));
  let elapsed;
  try{elapsed=inputElapsed({start:cast.start_ms},body.elapsed,clock.receivedTime);}catch(error){fail(409,error.message);}
  if(elapsed<0||clock.receivedTime<cast.start_ms)return response(cast);
  const touchedAt=cast.start_ms+elapsed;
  if(touchedAt>=idleDeadline(cast))return response(await expire(cast,touchedAt));
  if(touchedAt<(cast.end_ms??cast.start_ms))return response(cast);
  const pass=Math.floor(2*elapsed/cast.cycle_ms);
  const p=position(elapsed,cast.cycle_ms), hit=p>=cast.target&&p<=cast.target+cast.width;
  // Repeated taps on one pass reset inactivity but can never earn another hit.
  const next=pass<=cast.last_pass?cast:progressAfter(cast,hit);
  await run(env,`UPDATE crew_fishing_casts SET progress=?,warnings=?,seq=?,last_pass=?,status=?,end_ms=?,
    notice=CASE WHEN ?='caught' THEN CASE
      WHEN NOT EXISTS(SELECT 1 FROM crew_fishing_casts WHERE crew_id=? AND fish=? AND status='caught') THEN 'new'
      WHEN ?>(SELECT MAX(length) FROM crew_fishing_casts WHERE crew_id=? AND fish=? AND status='caught') THEN 'best'
      END END WHERE id=? AND status='active' AND seq=? AND ${memberGuard}`,
    next.progress,next.warnings,body.seq,pass,next.status,next.status==='active'?touchedAt:ms,next.status,crew,cast.fish,cast.length,
    crew,cast.fish,cast.id,cast.seq,uid,crew);
  return response(await find());
}

