import {now,one,query,fail,json} from './db.js';

// A short-lived, server-only operator instruction. No request field can grant
// membership. The audit ID makes retries and concurrent sessions idempotent.
export async function applyPremiumGrant(env,user){
 if(!user||!env.PREMIUM_GRANT)return user;
 let g;try{g=JSON.parse(env.PREMIUM_GRANT);}catch{return user;}
 const at=now();
 if(!g||g.user_id!==user.id||typeof g.id!=='string'||!g.id||g.id.length>100||!Number.isSafeInteger(g.until)||!Number.isSafeInteger(g.expires)||g.expires<=at||g.until<=at||g.until>at+366*86400||Number(user.premium_until)>=g.until)return user;
 const audit='premium-grant:'+g.id;
 await env.DB.batch([
  query(env,'UPDATE users SET premium_until=MAX(COALESCE(premium_until,0),?) WHERE id=? AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id=?)',g.until,user.id,audit),
  // Refund reconciliation must retain an independently granted entitlement.
  query(env,'UPDATE billing_subscriptions SET baseline_until=MAX(baseline_until,?) WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id=?)',g.until,user.id,audit),
  query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,'runtime-operator','premium_grant',?,?) ON CONFLICT(id) DO NOTHING",audit,JSON.stringify({user_id:user.id,until:g.until}),at)
 ]);
 const updated=await one(env,'SELECT premium_until FROM users WHERE id=?',user.id);
 return {...user,premium_until:updated?.premium_until||user.premium_until};
}

// Called only after internal worker authentication. The operator's expiring
// configuration selects the account and entitlement; request fields cannot.
export async function premiumGrantInternalRoute(req,env,path){
 if(path!=='/internal/premium-grant'||req.method!=='POST')return null;
 let grant;try{grant=JSON.parse(env.PREMIUM_GRANT||'null');}catch{}
 const at=now();
 if(!grant||typeof grant.user_id!=='string'||typeof grant.id!=='string'||!grant.id||grant.id.length>100||!Number.isSafeInteger(grant.until)||!Number.isSafeInteger(grant.expires)||grant.expires<=at||grant.until<=at||grant.until>at+366*86400)fail(409,'적용할 운영자 이용권 설정이 없습니다.');
 const user=await one(env,'SELECT id,premium_until FROM users WHERE id=?',grant.user_id);
 if(!user)fail(404,'회원 계정을 찾을 수 없습니다.');
 const updated=await applyPremiumGrant(env,user);
 if(updated.premium_until<grant.until||grant.expires<=now())fail(409,'운영자 이용권 설정이 만료되었거나 올바르지 않습니다.');
 return json({ok:true,user_id:updated.id,premium_until:updated.premium_until});
}
