import {one,query,fail} from './db.js';
import {publicNameSQL} from './identity.js';
import {nicknamePolicy} from '../shared/nickname-policy.js';
export function nickname(value){const result=nicknamePolicy(value);if(result.error)fail(400,result.error);return result;}
export async function requireAvailableNickname(env,userId,value){
 const chosen=nickname(value);
 const used=await one(env,`SELECT user_id FROM account_handles WHERE normalized=? AND user_id<>? UNION ALL SELECT u.id user_id FROM users u WHERE u.id<>? AND lower(trim(${publicNameSQL()}))=? LIMIT 1`,chosen.key,userId,userId,chosen.key);
 if(used)fail(409,'이미 사용 중인 닉네임입니다');
 return chosen;
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
