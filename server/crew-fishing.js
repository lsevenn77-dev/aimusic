import {gameLimits} from './crew-game-limits.js';
import {one, rows, run, json, fail, id} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {FISH} from '../dist/crew-fishing/catalog.js';
import {TIERS,SIZES,LIMITS,IDLE_MS,weighted,season} from '../dist/crew-fishing/rules.js';
import {fishingPull} from './crew-fishing-pull.js';
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
      entry.dayLimit<LIMITS.day||entry.dayLimit>1000)return LIMITS;
    return {...LIMITS,day:entry.dayLimit};
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
    return {...base,day:base.day+grant.extra};
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
  if(action==='pull'&&req.method==='POST')return respond({cast:view(await fishingPull(env,uid,await req.json(),{ms,receivedTime:clock.receivedTime}))});
  const baseLimits=fishingLimits(env,uid,day);
  const quotaLimits=['lobby','cast'].includes(action)?await gameLimits(env,uid,ms,baseLimits.day):{premiumBonus:0,dailyLimit:baseLimits.day};
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
  const active=async(readOnly=false)=>{
    const saved=await one(env,"SELECT * FROM crew_fishing_casts WHERE user_id=? AND crew_id=? AND status='active' AND (day=? OR (day=? AND COALESCE(end_ms,start_ms)>?)) ORDER BY start_ms DESC LIMIT 1",uid,crew,day,season(ms-86400000).day,clock.receivedTime-IDLE_MS);
    // A lobby refresh must not close a fish ahead of a tap already in transit.
    if(readOnly)return saved&&clock.receivedTime<idleDeadline(saved)?saved:null;
    const current=await expire(saved);
    return current?.status==='active'?current:null;
  };
  const response=cast=>respond({cast:view(cast)});
  if(req.method==='GET' && action==='lobby'){
    const [quota,mine,ours,individual,crews,current]=await Promise.all([
      one(env,'SELECT COUNT(*) AS today FROM crew_fishing_casts WHERE user_id=? AND week=? AND day=?',uid,week,day),
      one(env,`SELECT COALESCE(SUM(${FISH_VALUE_SQL}),0) AS score FROM crew_fishing_casts WHERE week=? AND user_id=? AND status='caught'`,week,uid),
      one(env,`SELECT COALESCE(SUM(${FISH_VALUE_SQL}),0) AS score FROM crew_fishing_casts WHERE week=? AND crew_id=? AND status='caught'`,week,crew),
      ranking(env,week,true,uid),ranking(env,week,false,crew),active(true)]);
    return respond({crew,name:m.name,week,day,open:true,...quotaLimits,weeklyLimit:null,weeklyRemaining:null,remaining:Math.max(0,quotaLimits.dailyLimit-quota.today),
      mine:mine.score,ours:ours.score,individual,crews,cast:view(current)});
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
    if(existing)return response(await expire(existing));
    const current=await active();
    if(current)return response(current);
    const f=encounter();
    await run(env,`INSERT INTO crew_fishing_casts
      (id,user_id,crew_id,nickname,request_id,day,week,fish,grade,length,amount,start_ms,cycle_ms,goal,target,width)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${memberGuard}
      AND (SELECT COUNT(*) FROM crew_fishing_casts WHERE user_id=? AND week=? AND day=?)<? ON CONFLICT DO NOTHING`,
      id(),uid,crew,m.nickname,body.requestId,day,week,f.fish,f.grade,f.length,f.amount,ms+biteDelay(),f.cycle,f.goal,f.target,f.width,
      uid,crew,uid,week,day,quotaLimits.dailyLimit);
    const cast=await previous()||await active();
    if(!cast || cast.day!==day)fail(409,'오늘 낚시 기회를 모두 사용했거나 도전이 만료됐어요.');
    return response(cast);
  }
  fail(404,'경로를 찾지 못했어요.');
}

