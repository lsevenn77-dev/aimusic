import {one,query,run,now,id,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {dubbingDay,dubbingQuota} from './dubbing-quota.js';
import {dubbingRewardAvailable,dubbingRewardUnit} from './dubbing-ad-config.js';

const validId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
// GPT for web reports rewardedSlotGranted in the browser, not via a signed SSV
// receipt. These sessions bound replay/abuse; they do NOT prove an ad impression.
// Keep the source explicit and never issue transferable currency for this flow.
export async function dubbingRewardRoute(req,env,path,user){
 if(!path.startsWith('/api/dubbing/ad-sessions'))return null;
 requireUser(user);
 if(req.method!=='POST'||!['/api/dubbing/ad-sessions','/api/dubbing/ad-sessions/complete','/api/dubbing/ad-sessions/cancel'].includes(path))fail(404,'광고 요청을 찾을 수 없습니다.');
 const body=await req.json(),at=now(),day=dubbingDay(at);
 if(!validId(body.requestId))fail(400,'광고 요청 식별자를 확인해주세요.');
 if(path==='/api/dubbing/ad-sessions'){
  if(!dubbingRewardAvailable(req,env))fail(503,'보상형 광고를 준비하고 있어요. 오늘의 무료 작성이나 직접 대본 쓰기를 이용해주세요.');
  const old=await one(env,'SELECT * FROM dubbing_ad_sessions WHERE request_id=?',body.requestId);
  if(old){if(old.user_id!==user.id)fail(404,'광고 요청을 찾을 수 없습니다.');if(old.state!=='open'||old.expires_at<=at)fail(409,'종료된 광고 요청입니다. 다시 시작해주세요.');return json({sessionId:old.id,adUnit:old.ad_unit,expiresAt:old.expires_at});}
  const q=await dubbingQuota(env,user.id);
  if(!q.adRemaining)fail(429,'오늘의 광고 보상 4회를 모두 받았어요. 내일 다시 이용해주세요.');
  await rate(env,'dubbing-ad-start:'+user.id,20,86400);
  await run(env,"UPDATE dubbing_ad_sessions SET state='expired' WHERE user_id=? AND state='open' AND expires_at<=?",user.id,at);
  const sid=id(),expires=Math.min(day.end,at+900),unit=dubbingRewardUnit(env);
  const created=await query(env,`INSERT INTO dubbing_ad_sessions(id,request_id,user_id,day,ad_unit,state,created,expires_at)
   SELECT ?,?,?,?,?,'open',?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted')
   AND NOT EXISTS(SELECT 1 FROM dubbing_ad_sessions WHERE user_id=? AND state='open')
   ON CONFLICT(request_id) DO NOTHING RETURNING id`,sid,body.requestId,user.id,day.day,unit,at,expires,user.id,user.id).first();
  if(!created){const retry=await one(env,"SELECT * FROM dubbing_ad_sessions WHERE request_id=? AND user_id=? AND state='open'",body.requestId,user.id);if(retry)return json({sessionId:retry.id,adUnit:retry.ad_unit,expiresAt:retry.expires_at});fail(409,'다른 창에서 광고를 준비하고 있어요. 해당 창에서 마치거나 잠시 뒤 다시 시도해주세요.');}
  return json({sessionId:sid,adUnit:unit,expiresAt:expires},201);
 }
 if(!validId(body.sessionId))fail(400,'광고 요청을 확인해주세요.');
 const s=await one(env,'SELECT * FROM dubbing_ad_sessions WHERE id=? AND request_id=? AND user_id=?',body.sessionId,body.requestId,user.id);
 if(!s)fail(404,'광고 요청을 찾을 수 없습니다.');
 const transaction='gpt-web:'+s.id;
 const result=async()=>json({granted:!!await one(env,'SELECT transaction_id FROM dubbing_script_rewards WHERE transaction_id=? AND user_id=?',transaction,user.id),quota:await dubbingQuota(env,user.id)});
 if(s.state==='granted')return result(); // Lost acknowledgement can be retried after expiry.
 if(path.endsWith('/cancel')){await run(env,"UPDATE dubbing_ad_sessions SET state='cancelled' WHERE id=? AND state='open'",s.id);return result();}
 if(!dubbingRewardAvailable(req,env))fail(503,'현재 광고 보상을 처리할 수 없습니다. 잠시 후 다시 확인해주세요.');
 if(s.state!=='open'||s.expires_at<=at||s.day!==day.day)fail(409,'광고 요청 시간이 지났어요. 오늘의 이용 횟수를 다시 확인해주세요.');
 if(body.event!=='rewardedSlotGranted')fail(400,'광고 완료 이벤트를 확인해주세요.');
 await env.DB.batch([
  query(env,`INSERT INTO dubbing_script_rewards(transaction_id,user_id,day,completed_at)
   SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_ad_sessions WHERE id=? AND state='open' AND expires_at>?)
   AND EXISTS(SELECT 1 FROM users WHERE id=? AND provider!='deleted')
   AND (SELECT COUNT(*) FROM dubbing_script_rewards WHERE user_id=? AND day=?)<4
   ON CONFLICT(transaction_id) DO NOTHING`,transaction,user.id,day.day,at,s.id,at,user.id,user.id,day.day),
  query(env,`UPDATE dubbing_ad_sessions SET state=CASE WHEN EXISTS(SELECT 1 FROM dubbing_script_rewards WHERE transaction_id=?) THEN 'granted' ELSE 'capped' END,completed_at=?
   WHERE id=? AND state='open'`,transaction,at,s.id)
 ]);
 return result();
}
