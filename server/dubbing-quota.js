import {one,query,now,fail} from './db.js';
import {DUBBING_DAILY_AD_LIMIT} from '../shared/dubbing.js';

export function dubbingDay(at=now()){
 const start=Math.floor((at+9*3600)/86400)*86400-9*3600;
 return {start,end:start+86400,day:new Date((start+9*3600)*1000).toISOString().slice(0,10)};
}
const counted="input_hash NOT LIKE 'sound-plan:%' AND state IN ('running','ready','unknown') AND COALESCE(json_extract(result_json,'$.quotaRestored'),0)=0";
// Lifetime grants are separate from daily free/ad turns. Count reservations, not
// completed requests, so concurrent generation cannot spend the same credit twice.
const allowanceSQL=`WITH clock AS (SELECT ? user_id,? at,? start,? end,? day)
 SELECT CASE WHEN MAX(u.premium_until,u.apple_premium_until)>c.at THEN 3 ELSE 1 END freeDaily,
 MIN(${DUBBING_DAILY_AD_LIMIT},(SELECT COUNT(*) FROM dubbing_script_rewards WHERE user_id=u.id AND day=c.day)) adsEarned,
 (SELECT COUNT(*) FROM dubbing_generations WHERE user_id=u.id AND created>=c.start AND created<c.end AND quota_source='daily' AND ${counted}) dailyUsed,
 (SELECT COUNT(*) FROM dubbing_generations WHERE user_id=u.id AND created>=c.start AND created<c.end AND ${counted}) used,
 COALESCE((SELECT SUM(amount) FROM dubbing_script_credits WHERE user_id=u.id),0) bonusGranted,
 (SELECT COUNT(*) FROM dubbing_generations WHERE user_id=u.id AND quota_source='bonus' AND ${counted}) bonusUsed
 FROM users u,clock c WHERE u.id=c.user_id AND u.provider!='deleted'`;
export async function dubbingQuota(env,userId,at=now()){
 const day=dubbingDay(at);
 const q=await one(env,allowanceSQL,userId,at,day.start,day.end,day.day);
 if(!q)fail(404,'계정을 찾을 수 없습니다.');
 const dailyRemaining=Math.max(0,q.freeDaily+q.adsEarned-q.dailyUsed),bonusRemaining=Math.max(0,q.bonusGranted-q.bonusUsed);
 return {day:day.day,resetsAt:day.end,...q,dailyRemaining,bonusRemaining,adLimit:DUBBING_DAILY_AD_LIMIT,remaining:dailyRemaining+bonusRemaining,
  adRemaining:DUBBING_DAILY_AD_LIMIT-q.adsEarned,rewardedAdAvailable:false}; // Route adds provider/region availability.
}
export async function reserveDubbingGeneration(env,userId,gid,inputHash,at=now()){
 const day=dubbingDay(at);
 return query(env,`WITH allowance AS (${allowanceSQL})
 INSERT INTO dubbing_generations(id,user_id,input_hash,state,created,updated,quota_source)
 SELECT ?,?,?,'running',?,?,CASE WHEN dailyUsed<freeDaily+adsEarned THEN 'daily' ELSE 'bonus' END
 FROM allowance WHERE dailyUsed<freeDaily+adsEarned OR bonusUsed<bonusGranted
 ON CONFLICT(id) DO NOTHING RETURNING id`,userId,at,day.start,day.end,day.day,gid,userId,inputHash,at,at).first();
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
 AND (SELECT COUNT(*) FROM dubbing_script_rewards WHERE user_id=? AND day=?)<${DUBBING_DAILY_AD_LIMIT}
 ON CONFLICT(transaction_id) DO NOTHING`,transactionId,userId,day.day,completedAt,userId,userId,day.day).run();
 return dubbingQuota(env,userId,at);
}
