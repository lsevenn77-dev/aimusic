import {gameLimits,gameDayWindow} from './crew-game-limits.js';
import {query,one,rows,run,json,fail,id,now,rate} from './db.js';
import {requireUser} from './auth.js';
import {publicNameSQL} from './identity.js';
import {allocateLots} from '../shared/gifts.js';
import {decorationSpendableSQL} from './decorations.js';
import {CARS,raceCalendar} from '../dist/crew-racing/catalog.js';
import {newRun,createRace,computeScore,STEP} from '../dist/crew-racing/physics.js';

async function garage(env,uid) {
  const records = await rows(env,`SELECT source_ref FROM player_inventory pi WHERE user_id=? AND source='race_car' AND revoked=0
    AND NOT EXISTS(SELECT 1 FROM json_each(pi.item_key,'$.lots') l LEFT JOIN gold_purchases ON gold_purchases.id=json_extract(l.value,'$.purchase_id')
    WHERE gold_purchases.id IS NULL OR NOT (${decorationSpendableSQL}))`,uid);
  const owned = ['c2',...records.map(row=>row.source_ref)];
  const selection = await one(env,"SELECT item_key FROM player_inventory WHERE user_id=? AND source='race_equip' AND source_ref='active'",uid);
  return {owned,equipped:owned.includes(selection?.item_key)?selection.item_key:'c2'};
}

async function buyCar(env,uid,car) {
  if ((await garage(env,uid)).owned.includes(car.id)) return;
  let lots=[];
  const writes=[];
  if(car.currency==='G'){
    const available=await rows(env,`SELECT * FROM gold_purchases WHERE user_id=? AND used<gold AND ${decorationSpendableSQL} ORDER BY paid_at,id`,uid);
    try{lots=allocateLots(available,car.price);}catch{if((await garage(env,uid)).owned.includes(car.id))return;fail(409,'골드가 부족해요.');}
    for(const lot of lots)writes.push(query(env,`UPDATE gold_purchases SET used=CASE WHEN ${decorationSpendableSQL} THEN used+? ELSE -1 END WHERE id=? AND user_id=?`,lot.gold,lot.purchase_id,uid));
  }else{
    writes.push(query(env,'INSERT OR IGNORE INTO free_gift_wallets(user_id,balance) VALUES(?,0)',uid),
      query(env,'UPDATE free_gift_wallets SET balance=balance-? WHERE user_id=?',car.price,uid));
  }
  const receipt=JSON.stringify({currency:car.currency,amount:car.price,lots});
  try{
    await env.DB.batch([query(env,"INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,?,'race_car',?,?)",id(),uid,receipt,car.id,now()),...writes]);
  }catch(e){
    if((await garage(env,uid)).owned.includes(car.id))return;
    if(/constraint/i.test(e.message))fail(409,'잔액 또는 기존 구매 상태를 확인해주세요.');
    throw e;
  }
}

export function validateRace(course,events,ms){
  if(!Array.isArray(events)||events.length>7700)fail(400,'올바르지 않은 입력 기록이에요.');
  let last=-1;
  for(const event of events){
    if(!Array.isArray(event)||event.length!==2)fail(400,'올바르지 않은 입력 기록이에요.');
    const [tick,mask]=event;
    if(!Number.isInteger(tick)||tick<=last||tick>=7700||!Number.isInteger(mask)||mask<0||mask>7)fail(400,'올바르지 않은 입력 기록이에요.');
    last=tick;
  }
  const race=createRace(course),state=newRun();
  let tick=0,index=0,mask=0;
  while(!state.ended&&tick<7700){
    if(events[index]?.[0]===tick)mask=events[index++][1];
    state.input.left=!!(mask&1);state.input.right=!!(mask&2);state.input.boost=!!(mask&4);
    race.step(state,STEP);tick++;
  }
  if(!state.ended||index!==events.length||ms+350<tick*STEP*1000||ms>3600000)fail(409,'주행 시간을 확인할 수 없어요.');
  return computeScore(state.finished,state.t,Math.min(1,state.z/race.TRACK_LEN));
}

export async function racingRoute(req,env,path,user,ms=Date.now()){
  const action=path.slice('/api/crew-racing/'.length),uid=user?.id||'',{week,course}=raceCalendar(ms);
  const membership=uid&&await one(env,'SELECT crew_id FROM crew_members WHERE user_id=?',uid);
  const crew=membership?.crew_id||'';
  if(action==='lobby'&&req.method==='GET'){
  const limits=await gameLimits(env,uid,ms),day=gameDayWindow(ms);
  const used=await one(env,'SELECT COUNT(*) n FROM crew_racing_runs WHERE user_id=? AND starts>=? AND starts<?',uid,day.start,day.end);
  const individualRanking=await rows(env,`WITH best AS (
    SELECT user_id,MAX(score) AS points FROM crew_racing_runs
    WHERE week=? AND score IS NOT NULL AND crew_id IS NOT NULL GROUP BY user_id
  ), ranked AS (
    SELECT user_id,points,RANK() OVER (ORDER BY points DESC) AS place FROM best
  ) SELECT ${publicNameSQL()} AS name,p.id AS profile_id,p.image_version,r.points,r.place,(r.user_id=?) AS mine
    FROM ranked r JOIN users u ON u.id=r.user_id LEFT JOIN producers p ON p.user_id=r.user_id
    WHERE r.place<=100 OR r.user_id=? ORDER BY r.place,name,r.user_id`,week,uid,uid);
  const ranking=await rows(env,`WITH best AS (
    SELECT crew_id,user_id,MAX(score) points FROM crew_racing_runs WHERE week=? AND score IS NOT NULL AND crew_id IS NOT NULL GROUP BY crew_id,user_id
  ), members AS (
    SELECT *,ROW_NUMBER() OVER(PARTITION BY crew_id ORDER BY points DESC,user_id) AS place FROM best
  ), totals AS (
    SELECT crew_id,SUM(points) points,COUNT(*) members FROM members WHERE place<=10 GROUP BY crew_id
  ), ranked AS (
    SELECT *,RANK() OVER(ORDER BY points DESC) place FROM totals
  ) SELECT c.name,c.image_version,r.* FROM ranked r JOIN crews c ON c.id=r.crew_id WHERE place<=100 OR crew_id=? ORDER BY place,c.name,r.crew_id`,week,crew);
    return json({week,course,...limits,remaining:Math.max(0,limits.dailyLimit-used.n),crew:crew||null,ranking,individualRanking,signedIn:!!uid,crewMember:!!crew,...(uid?await garage(env,uid):{owned:['c2'],equipped:'c2'})});
  }
  if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  requireUser(user);
  await rate(env,'crew-race:'+uid,40,60);
  const body=await req.json();
  if(action==='buy'||action==='equip'){
    const car=CARS.find(c=>c.id===body.car);
    if(!car)fail(400,'차량을 확인해주세요.');
    if(action==='buy')await buyCar(env,uid,car);
    else{
      if(!(await garage(env,uid)).owned.includes(car.id))fail(403,'보유한 차량만 장착할 수 있어요.');
      await run(env,`INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,?,'race_equip','active',?)
        ON CONFLICT(user_id,source,source_ref) DO UPDATE SET item_key=excluded.item_key`,id(),uid,car.id,now());
    }
    return json(await garage(env,uid));
  }
  if(!crew)fail(403,'크루에 가입하면 공식 순위에 참여할 수 있어요.');
  if(action==='start'){
    if(body.course!==course)fail(409,'이번 주 코스가 바뀌었어요. 대기실을 새로고침해주세요.');
    const key=id();
    const limits=await gameLimits(env,uid,ms),day=gameDayWindow(ms);
    await run(env,`INSERT INTO crew_racing_runs(id,user_id,crew_id,week,course,starts)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM crew_racing_runs WHERE user_id=? AND starts>=? AND starts<?)<?`,
      key,uid,crew,week,course,ms,uid,day.start,day.end,limits.dailyLimit);
    if(!await one(env,'SELECT id FROM crew_racing_runs WHERE id=?',key))fail(409,`오늘 공식 도전 ${limits.dailyLimit}회를 모두 사용했어요. 한국시간 자정에 초기화돼요.`);
    const used=await one(env,'SELECT COUNT(*) n FROM crew_racing_runs WHERE user_id=? AND starts>=? AND starts<?',uid,day.start,day.end);
    return json({id:key,...limits,remaining:Math.max(0,limits.dailyLimit-used.n)});
  }
  if(action==='finish'){
    const record=await one(env,'SELECT * FROM crew_racing_runs WHERE id=? AND user_id=?',String(body.id),uid);
    if(!record||record.crew_id!==crew)fail(404,'주행 기록을 찾지 못했어요.');
    if(record.score!==null)return json({score:record.score});
    const score=validateRace(record.course,body.events,ms-record.starts);
    await run(env,'UPDATE crew_racing_runs SET score=? WHERE id=? AND score IS NULL',score,record.id);
    return json(await one(env,'SELECT score FROM crew_racing_runs WHERE id=?',record.id));
  }
  fail(404,'경로를 찾지 못했어요.');
}
