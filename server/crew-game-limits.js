import {one} from './db.js';

// Resolve current entitlement on the server, including upgrades during the day.
export async function gameLimits(env,uid,ms,baseDailyLimit=3){
  const user=uid?await one(env,'SELECT premium_until,apple_premium_until FROM users WHERE id=?',uid):null;
  const premiumBonus=Number(Math.max(user?.premium_until||0,user?.apple_premium_until||0)>ms/1000);
  return {baseDailyLimit,premiumBonus,dailyLimit:baseDailyLimit+premiumBonus};
}

// One operator-defined capture session, bounded to two hours after regular closure.
// The interval uses server time, never the device clock or request parameters.
export function officialClose(env,ms,regularClose){
  const window=env.CREW_GAME_CAPTURE_WINDOW;
  if(typeof window!=='string'||window.length>65||ms<regularClose)return regularClose;
  const match=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)\/(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)$/.exec(window);
  if(!match)return regularClose;
  const from=Date.parse(match[1]),end=Date.parse(match[2]);
  return from>=regularClose&&from<=ms&&ms<end&&end-from<=2*3600000&&end<=regularClose+50*3600000?end:regularClose;
}
export function gameDayWindow(ms){
  const offset=9*3600000,dayMs=86400000;
  const start=Math.floor((ms+offset)/dayMs)*dayMs-offset;
  return {start,end:start+dayMs};
}
