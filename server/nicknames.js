import {one,query,str,fail} from './db.js';
import {publicNameSQL} from './identity.js';

export function nickname(value){
 const name=str(value,60).normalize('NFKC').replace(/\s+/gu,' ');
 if(!name||name.length>60||/[\p{Cc}\p{Cf}]/u.test(name))fail(400,'아이디는 1~60자로 입력해주세요.');
 return {name,key:name.toLowerCase()};
}
export async function requireAvailableNickname(env,userId,value){
 const chosen=nickname(value);
 const used=await one(env,`SELECT user_id FROM account_handles WHERE normalized=? AND user_id<>? UNION ALL SELECT u.id user_id FROM users u WHERE u.id<>? AND lower(trim(${publicNameSQL()}))=? LIMIT 1`,chosen.key,userId,userId,chosen.key);
 if(used)fail(409,'이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.');
 return chosen;
}
export async function nicknameBatch(env,userId,value,writes){
 const chosen=await requireAvailableNickname(env,userId,value);
 try{
  await env.DB.batch([...writes,query(env,'INSERT INTO account_handles(user_id,normalized) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET normalized=excluded.normalized',userId,chosen.key),query(env,"UPDATE users SET name=? WHERE id=? AND provider='email'",chosen.name,userId)]);
 }catch(e){if(/UNIQUE.*account_handles|account_handles.*UNIQUE/i.test(String(e.message)))fail(409,'이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.');throw e;}
 return chosen;
}
