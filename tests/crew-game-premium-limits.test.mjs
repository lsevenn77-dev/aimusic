import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {jumpRoute} from '../server/crew-jump.js';
import {rhythmRoute} from '../server/crew-rhythm.js';
import {fishingRoute} from '../server/crew-fishing.js';
import {racingRoute} from '../server/crew-racing.js';
import {raceCalendar} from '../dist/crew-racing/catalog.js';
import {gameLimits,gameDayWindow} from '../server/crew-game-limits.js';

const monday=Date.parse('2026-11-02T08:00:00+09:00');
const games={
  jump:{route:jumpRoute,path:'/api/crews/crew/jump',lobby:'',start:'/start',base:3,table:'crew_jump_runs',end:"inputs='null'"},
  rhythm:{route:rhythmRoute,path:'/api/crew-rhythm',lobby:'/lobby',start:'/start',base:3,table:'crew_rhythm_runs',end:"status='abandoned'"},
  fishing:{route:fishingRoute,path:'/api/crew-fishing',lobby:'/lobby',start:'/cast',base:10,table:'crew_fishing_casts',end:"status='escaped'"},
  racing:{route:racingRoute,path:'/api/crew-racing',lobby:'/lobby',start:'/start',base:3,table:'crew_racing_runs',end:'score=0'}
};
async function setup(t,name){
  const f=await fixture(t),game=games[name],env={DB:f.DB,CREW_JUMP_START_MONDAY:'2026-11-02'};
  f.sql.exec("INSERT INTO crews(id,owner_id,name,created) VALUES('crew','owner','테스트',0); INSERT INTO crew_members(crew_id,user_id,role,joined) VALUES('crew','owner','leader',0)");
  let ms=monday;
  const call=async(action,body)=>{
    const path=game.path+action;
    return (await game.route(new Request('https://aifect.test'+path,{method:body?'POST':'GET',body:body&&JSON.stringify(body)}),env,path,{id:'owner',premium_until:9999999999},ms)).json();
  };
  const lobby=()=>call(game.lobby);
  const start=()=>call(game.start,{requestId:crypto.randomUUID(),difficulty:'normal',course:raceCalendar(ms).course,premiumBonus:999,dailyLimit:999});
  const end=()=>f.sql.exec(`UPDATE ${game.table} SET ${game.end}`);
  const premium=(until,apple=false)=>f.sql.prepare(`UPDATE users SET ${apple?'apple_premium_until':'premium_until'}=? WHERE id='owner'`).run(until);
  return {...f,env,lobby,start,end,premium,setTime:value=>ms=value};
}

for(const name of Object.keys(games))test(name+': normal quota, same-day premium +1, expiry, and KST reset are enforced on the server',async t=>{
  const f=await setup(t,name),base=games[name].base;
  assert.equal((await f.lobby()).dailyLimit,base);
  for(let n=0;n<base;n++){await f.start();f.end();}
  assert.equal((await f.lobby()).remaining,0);
  await assert.rejects(f.start(),{status:409});
  f.premium(monday/1000+3*86400);
  let data=await f.lobby();assert.equal(data.dailyLimit,base+1);assert.equal(data.remaining,1);assert.equal(data.premiumBonus,1);
  if(name==='fishing')assert.equal(data.weeklyLimit,55);
  const attempts=await Promise.allSettled([f.start(),f.start()]);
  if(name==='fishing'){
    const ids=attempts.filter(x=>x.status==='fulfilled').map(x=>x.value.cast.id);
    assert.equal(new Set(ids).size,1); // Existing active-cast retries return the same cast.
  }else assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${games[name].table}`).get().n,base+1);
  f.end();await assert.rejects(f.start(),{status:409});
  f.premium(monday/1000);data=await f.lobby();assert.equal(data.dailyLimit,base);assert.equal(data.remaining,0);
  // App Store-only entitlement must receive the same benefit as a web subscription.
  f.premium(monday/1000+3*86400,true);
  f.setTime(Date.parse('2026-11-03T00:00:00+09:00')-1);assert.equal((await f.lobby()).remaining,0);
  f.setTime(Date.parse('2026-11-03T00:00:00+09:00'));assert.equal((await f.lobby()).remaining,base+1);
  await f.start();assert.equal((await f.lobby()).remaining,base);f.end();
});

for(const name of Object.keys(games))test(name+': capture window reopens only the weekly cutoff and expires without resetting records',async t=>{
  const f=await setup(t,name),weekend=Date.parse('2026-11-07T10:00:00Z');
  f.env.CREW_GAME_CAPTURE_WINDOW='2026-11-07T10:00:00Z/2026-11-07T10:30:00Z';
  f.setTime(weekend-1);
  if(name!=='racing')await assert.rejects(f.start(),{status:409});
  f.setTime(weekend);const before=await f.lobby();
  await f.start();f.end();assert.equal((await f.lobby()).remaining,before.remaining-1);
  f.setTime(weekend+1800000);
  if(name!=='racing'){assert.equal((await f.lobby()).open,false);await assert.rejects(f.start(),{status:409});}
  f.setTime(weekend+7*86400000);if(name!=='racing')assert.equal((await f.lobby()).open,false);
});

test('premium fishing can use all 55 weekly casts, while practice never uses a quota',async t=>{
  const f=await setup(t,'fishing');f.premium(monday/1000+7*86400);
  for(let day=0;day<5;day++){
    f.setTime(monday+day*86400000);
    for(let n=0;n<11;n++){await f.start();f.end();}
    assert.equal((await f.lobby()).remaining,0);
  }
  const data=await f.lobby();assert.equal(data.weeklyRemaining,0);assert.equal(data.weeklyLimit,55);
  await assert.rejects(f.start(),{status:409});
  const path='/api/crew-fishing/practice-cast';
  await fishingRoute(new Request('https://aifect.test'+path,{method:'POST'}),f.env,path,{id:'owner'},monday+4*86400000);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM crew_fishing_casts').get().n,55);
});

test('entitlement expires at its exact second and racing day boundaries use Korea time',async t=>{
  const f=await fixture(t);f.sql.prepare("UPDATE users SET premium_until=? WHERE id='owner'").run(monday/1000);
  assert.equal((await gameLimits({DB:f.DB},'owner',monday-1)).dailyLimit,4);
  assert.equal((await gameLimits({DB:f.DB},'owner',monday)).dailyLimit,3);
  const boundary=Date.parse('2026-11-03T00:00:00+09:00');
  assert.equal(gameDayWindow(boundary-1).end,boundary);assert.equal(gameDayWindow(boundary).start,boundary);
});
