import {one,query,now,fail} from './db.js';

export function dubbingDay(at=now()){
 const start=Math.floor((at+9*3600)/86400)*86400-9*3600;
 return {start,end:start+86400,day:new Date((start+9*3600)*1000).toISOString().slice(0,10)};
}
const counted="input_hash NOT LIKE 'sound-plan:%' AND state IN ('running','ready','unknown') AND COALESCE(json_extract(result_json,'$.quotaRestored'),0)=0";
const freeDailySQL="CASE WHEN MAX(premium_until,apple_premium_until)>? THEN 3 ELSE 1 END";
export async function dubbingQuota(env,userId,at=now()){
 const day=dubbingDay(at);
 const member=await one(env,`SELECT ${freeDailySQL} freeDaily FROM users WHERE id=? AND provider!='deleted'`,at,userId);
 const freeDaily=member?.freeDaily||1;
 const used=await one(env,`SELECT COUNT(*) n FROM dubbing_generations WHERE user_id=? AND created>=? AND created<? AND ${counted}`,userId,day.start,day.end);
 const earned=await one(env,'SELECT COUNT(*) n FROM dubbing_script_rewards WHERE user_id=? AND day=?',userId,day.day);
 const ads=Math.min(4,earned.n),total=freeDaily+ads;
 return {day:day.day,resetsAt:day.end,freeDaily,adLimit:4,adsEarned:ads,used:used.n,remaining:Math.max(0,total-used.n),
  adRemaining:4-ads,rewardedAdAvailable:false}; // Route adds provider/region availability.
}
export async function reserveDubbingGeneration(env,userId,gid,inputHash,at=now()){
 const day=dubbingDay(at);
 return query(env,`INSERT INTO dubbing_generations(id,user_id,input_hash,state,created,updated)
 SELECT ?,?,?,'running',?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted')
 AND (SELECT COUNT(*) FROM dubbing_generations WHERE user_id=? AND created>=? AND created<? AND ${counted})
 < (SELECT ${freeDailySQL} FROM users WHERE id=?)+MIN(4,(SELECT COUNT(*) FROM dubbing_script_rewards WHERE user_id=? AND day=?))
 ON CONFLICT(id) DO NOTHING RETURNING id`,gid,userId,inputHash,at,at,userId,userId,day.start,day.end,at,userId,userId,day.day).first();
}
// Server-only entry point for a provider-authenticated callback, never a browser
// endpoint. A timer or client "ad watched" event cannot grant a generation.
export async function creditVerifiedDubbingAd(env,{userId,transactionId,completedAt},at=now()){
 if(typeof transactionId!=='string'||!transactionId||transactionId.length>200||!Number.isSafeInteger(completedAt)||completedAt>at+30||at-completedAt>3600)fail(400,'광고 완료 기록을 확인해주세요.');
 const day=dubbingDay(completedAt),current=dubbingDay(at);
 if(day.day!==current.day)fail(409,'지난 날짜의 광고 보상은 받을 수 없습니다.');
 const old=await one(env,'SELECT user_id,day FROM dubbing_script_rewards WHERE transaction_id=?',transactionId);
 if(old){if(old.user_id!==userId||old.day!==day.day)fail(409,'이미 처리된 광고 보상입니다.');return dubbingQuota(env,userId,at);}
 await query(env,`INSERT INTO dubbing_script_rewards(transaction_id,user_id,day,completed_at)
 SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted')
 AND (SELECT COUNT(*) FROM dubbing_script_rewards WHERE user_id=? AND day=?)<4
 ON CONFLICT(transaction_id) DO NOTHING`,transactionId,userId,day.day,completedAt,userId,userId,day.day).run();
 return dubbingQuota(env,userId,at);
}
