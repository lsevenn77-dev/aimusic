import {now,one,query} from './db.js';

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
