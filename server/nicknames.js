import {one,rows,query,fail} from './db.js';
import {publicNameSQL} from './identity.js';
import {nicknamePolicy} from '../shared/nickname-policy.js';
export function nickname(value){const result=nicknamePolicy(value);if(result.error)fail(400,result.error);return result;}
export async function requireAvailableNickname(env,userId,value){
 const chosen=nickname(value);
 const used=await one(env,`SELECT h.user_id FROM account_handles h JOIN users u ON u.id=h.user_id WHERE h.normalized=? AND h.user_id<>? AND u.account_type='human' UNION ALL SELECT u.id user_id FROM users u WHERE u.id<>? AND u.account_type='human' AND lower(trim(${publicNameSQL()}))=? LIMIT 1`,chosen.key,userId,userId,chosen.key);
 if(used)fail(409,'이미 사용 중인 닉네임입니다');
 return chosen;
}
// Bots have their own namespace so they never reserve a member's display name.
export async function requireAvailableBotNickname(env,userId,value){
 const chosen=nickname(value),key='ai:'+chosen.key;
 const used=await one(env,`SELECT user_id FROM account_handles WHERE normalized=? AND user_id<>? UNION ALL SELECT u.id FROM users u JOIN ai_bots b ON b.user_id=u.id WHERE u.account_type='ai_bot' AND u.id<>? AND lower(trim(${publicNameSQL()}))=? LIMIT 1`,key,userId,userId,chosen.key);
 if(used)fail(409,'다른 봇이 사용 중인 닉네임입니다.');
 return {...chosen,key};
}
export async function botNicknameWrite(env,writes){
 try{return await env.DB.batch(writes);}catch(e){if(/UNIQUE.*account_handles|account_handles.*UNIQUE/i.test(e.message))fail(409,'다른 봇이 사용 중인 닉네임입니다.');throw e;}
}
export async function botNicknameStatus(env){
 const bots=await rows(env,`SELECT b.user_id,u.name user_name,p.name,h.normalized,a.details FROM ai_bots b JOIN users u ON u.id=b.user_id JOIN producers p ON p.user_id=b.user_id LEFT JOIN account_handles h ON h.user_id=b.user_id LEFT JOIN ai_bot_audit a ON a.id='bot-names:20261104:'||b.user_id WHERE u.account_type='ai_bot' ORDER BY b.number`);
 const keys=bots.map(b=>b.name.trim().toLowerCase());
 return {total:bots.length,audited:bots.filter(b=>b.details).length,invalid:bots.filter(b=>nicknamePolicy(b.name).error).length,duplicates:keys.length-new Set(keys).size,handle_mismatches:bots.filter((b,i)=>b.normalized!=='ai:'+keys[i]).length,profile_mismatches:bots.filter(b=>b.user_name!==b.name).length,retained_original:bots.filter(b=>b.details&&JSON.parse(b.details).old_profile_name===b.name).length,samples:bots.slice(0,12).map(b=>({user_id:b.user_id,name:b.name}))};
}
export async function nicknameBatch(env,userId,value,writes){
 const current=await one(env,`SELECT ${publicNameSQL()} name FROM users u WHERE u.id=?`,userId);
 // Grandfather unchanged legacy names, including duplicates: bio/image edits remain possible.
 if(current&&typeof value==='string'&&value.trim()===current.name){await env.DB.batch(writes);return {name:current.name,key:current.name.toLowerCase()};}
 const chosen=await requireAvailableNickname(env,userId,value);
 try{
  await env.DB.batch([
   query(env,`INSERT INTO nickname_changes(user_id,changed_at) SELECT u.id,unixepoch() FROM users u WHERE u.id=? AND (u.provider='email' OR EXISTS(SELECT 1 FROM account_handles h WHERE h.user_id=u.id) OR EXISTS(SELECT 1 FROM producers p WHERE p.user_id=u.id AND p.nickname_confirmed=1)) ON CONFLICT(user_id) DO UPDATE SET changed_at=excluded.changed_at`,userId),
   ...writes,
   query(env,'INSERT INTO account_handles(user_id,normalized) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET normalized=excluded.normalized',userId,chosen.key),
   query(env,"UPDATE users SET name=? WHERE id=? AND provider='email'",chosen.name,userId)
  ]);
 }catch(e){if(/nickname_cooldown/.test(e.message))fail(429,'닉네임은 30일에 한 번 변경할 수 있습니다.');if(/UNIQUE.*account_handles|account_handles.*UNIQUE/i.test(e.message))fail(409,'이미 사용 중인 닉네임입니다');throw e;}
 return chosen;
}
