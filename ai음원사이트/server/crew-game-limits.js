import {effectiveUntilSQL} from './premium-event.js';
import {one} from './db.js';

// Resolve current entitlement on the server, including upgrades during the day.
export async function gameLimits(env,uid,ms,baseDailyLimit=3){
  const user=uid?await one(env,`SELECT ${effectiveUntilSQL} premium_until FROM users u WHERE id=?`,uid):null;
  const premiumBonus=Number((user?.premium_until||0)>ms/1000);
  return {baseDailyLimit,premiumBonus,dailyLimit:baseDailyLimit+premiumBonus};
}

export function gameDayWindow(ms){
  const offset=9*3600000,dayMs=86400000;
  const start=Math.floor((ms+offset)/dayMs)*dayMs-offset;
  return {start,end:start+dayMs};
}
