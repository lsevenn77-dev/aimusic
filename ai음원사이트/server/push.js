import {SignJWT,importPKCS8} from 'jose';
import {one,rows,run,now,fail,json,rate} from './db.js';
import {requireUser,hash,cookies} from './auth.js';

const kinds=['dm','comment','gift'];
const eventKinds=[...kinds,'crew','person_gift'];
let credentialCache;
let retryAfter=0;
export function retryPush(env,ctx){
 if(!env.FCM_SERVICE_ACCOUNT||now()<retryAfter)return;
 retryAfter=now()+30;
 ctx.waitUntil(dispatchPush(env).catch(()=>console.error('Push retry failed')));
}
export async function pushRoute(req,env,path,user){
 if(!path.startsWith('/api/push/'))return null;
 requireUser(user);
 if(path==='/api/push/preferences'){
  if(req.method==='GET')return json(await one(env,'SELECT dm,comment,gift FROM push_preferences WHERE user_id=?',user.id)||{dm:1,comment:1,gift:1});
  if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json();
  if(b.account_id!==undefined&&b.account_id!==user.id)fail(409,'로그인 계정이 바뀌었어요.');
  delete b.account_id;
  for(const k of Object.keys(b))if(!kinds.includes(k)||typeof b[k]!=='boolean')fail(400,'알림 설정을 확인해주세요.');
  await run(env,'INSERT OR IGNORE INTO push_preferences(user_id) VALUES(?)',user.id);
  for(const k of kinds)if(Object.hasOwn(b,k))await run(env,`UPDATE push_preferences SET ${k}=? WHERE user_id=?`,Number(b[k]),user.id);
  return json({ok:true});
 }
 if(path!=='/api/push/device')fail(404,'알림 설정을 찾을 수 없어요.');
 const b=await req.json();
 if(typeof b.token!=='string'||b.token.length<30||b.token.length>4096||!/^[\w:-]+$/.test(b.token))fail(400,'알림 기기를 확인해주세요.');
 if(req.method==='DELETE'){await run(env,'DELETE FROM push_devices WHERE token=? AND user_id=?',b.token,user.id);return json({ok:true});}
 if(req.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
 if(!['android','ios'].includes(b.platform)||b.account_id!==user.id)fail(409,'로그인 계정이 바뀌었어요.');
 await rate(env,'push-device:'+user.id,60,3600);
 const sessionHash=await hash(cookies(req).aifect_session);
 await run(env,`INSERT INTO push_devices(token,user_id,session_token,updated) VALUES(?,?,?,?)
  ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,session_token=excluded.session_token,updated=excluded.updated`,b.token,user.id,sessionHash,now());
 return json({ok:true,configured:!!env.FCM_SERVICE_ACCOUNT});
}

async function accessToken(env){
 const serialized=env.FCM_SERVICE_ACCOUNT;
 if(credentialCache?.source===serialized&&credentialCache.expires>now()+90)return credentialCache;
 const account=JSON.parse(serialized);
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(account.project_id)||!account.client_email||!account.private_key)throw Error('Invalid push configuration');
 const key=await importPKCS8(account.private_key,'RS256');
 const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'})
  .setProtectedHeader({alg:'RS256'}).setIssuer(account.client_email).setAudience('https://oauth2.googleapis.com/token')
  .setIssuedAt().setExpirationTime('1h').sign(key);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Push authorization unavailable');
 const token=await response.json();
 if(!token.access_token)throw Error('Push authorization unavailable');
 return credentialCache={source:serialized,token:token.access_token,project:account.project_id,expires:now()+Number(token.expires_in||3600)};
}

export function notificationData(event){
 const title=event.kind==='crew'?'크루 새 메시지':event.kind==='dm'?'새 메시지':event.kind==='comment'?'새 댓글':'선물이 도착했어요';
 const body=event.kind==='crew'?'크루에 새 메시지가 도착했어요.':event.kind==='person_gift'?'나에게 선물이 도착했어요.':event.kind==='dm'?'새 메시지가 도착했어요.':event.kind==='comment'?'내 음악에 새로운 댓글이 달렸어요.':'내 음악에 선물이 도착했어요.';
 return {kind:event.kind,target:event.target,recipient:event.recipient,title,body};
}

export async function dispatchPush(env){
 if(!env.FCM_SERVICE_ACCOUNT)return;
 // Claims expire after a crashed worker. Event creation is atomic with the source transaction.
 const at=now();
 await run(env,'DELETE FROM push_outbox WHERE created<?',at-86400);
 const events=await rows(env,`UPDATE push_outbox SET lease_until=?,attempts=attempts+1 WHERE id IN
  (SELECT id FROM push_outbox WHERE delivered=0 AND lease_until<? AND attempts<8 ORDER BY created LIMIT 5) RETURNING *`,at+60,at);
 if(!events.length)return;
 let auth;try{auth=await accessToken(env);}catch{console.error('Push authorization failed');return;}
 await Promise.allSettled(events.map(async event=>{
  if(!eventKinds.includes(event.kind))return;
  if(event.kind==='crew'&&!await one(env,'SELECT 1 FROM crew_members WHERE user_id=? AND crew_id=? AND muted=0',event.recipient,event.target)){await run(env,'UPDATE push_outbox SET delivered=1 WHERE id=?',event.id);return;}
  if(event.kind==='person_gift'&&!await one(env,'SELECT 1 FROM producers WHERE id=? AND user_id=?',event.target,event.recipient)){await run(env,'UPDATE push_outbox SET delivered=1 WHERE id=?',event.id);return;}
  const preference=event.kind==='crew'?'dm':event.kind==='person_gift'?'gift':event.kind;
  if(event.kind==='dm'&&await one(env,'SELECT 1 FROM dm_settings s JOIN producers p ON p.user_id=s.peer_id WHERE s.user_id=? AND p.id=? AND s.muted=1',event.recipient,event.target)){
   await run(env,'UPDATE push_outbox SET delivered=1 WHERE id=?',event.id);return;
  }
  if(['comment','gift'].includes(event.kind)&&!await one(env,"SELECT id FROM tracks WHERE id=? AND status='published'",event.target)){
   await run(env,'UPDATE push_outbox SET delivered=1 WHERE id=?',event.id);return;
  }
  // A revoked/expired login can never continue receiving pushes. Preference names are server-owned.
  const devices=await rows(env,`SELECT d.token FROM push_devices d JOIN sessions s ON s.token=d.session_token AND s.user_id=d.user_id
   LEFT JOIN push_preferences p ON p.user_id=d.user_id WHERE d.user_id=? AND s.expires>? AND COALESCE(p.${preference},1)=1 LIMIT 10`,event.recipient,at);
  let retry=false;
  await Promise.allSettled(devices.map(async device=>{
   try{
    const response=await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`,{
     method:'POST',headers:{authorization:`Bearer ${auth.token}`,'content-type':'application/json'},signal:AbortSignal.timeout(8000),
     body:JSON.stringify({message:{token:device.token,data:notificationData(event),android:{priority:'high',ttl:'86400s'},apns:{headers:{'apns-priority':'10','apns-push-type':'alert','apns-expiration':String(at+86400)},payload:{aps:{alert:{title:notificationData(event).title,body:notificationData(event).body},sound:'default'}}}}})});
    if(!response.ok){
     const error=await response.json();
     if(error.error?.details?.some(d=>d.errorCode==='UNREGISTERED'))await run(env,'DELETE FROM push_devices WHERE token=? AND user_id=?',device.token,event.recipient);
     else retry=true;
    }
   }catch{retry=true;}
  }));
  if(retry)await run(env,'UPDATE push_outbox SET lease_until=? WHERE id=?',at+Math.min(3600,30*2**event.attempts),event.id);
  else await run(env,'UPDATE push_outbox SET delivered=1 WHERE id=?',event.id);
 }));
}
