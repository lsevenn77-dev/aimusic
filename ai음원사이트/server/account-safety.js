import {one,rows,query,run,now,id,fail,json,rate} from './db.js';
import {requireUser,appleClientSecret} from './auth.js';
import {cancelSubscription} from './billing.js';

const encoder=new TextEncoder();
const to64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function tokenKey(env){
 if(!env.AUTH_PEPPER)fail(503,'계정 보안 설정을 확인하고 있습니다.');
 return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('aifect:apple-revocation:v1:'+env.AUTH_PEPPER)),'AES-GCM',false,['encrypt','decrypt']);
}
export async function rememberAppleToken(env,uid,token){
 if(!token)return;
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(uid)},await tokenKey(env),encoder.encode(token));
 await run(env,'INSERT INTO apple_login_tokens(user_id,cipher) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET cipher=excluded.cipher',uid,to64(iv)+'.'+to64(cipher));
}
export async function revokeAppleLogin(env,uid){
 const saved=await one(env,'SELECT cipher FROM apple_login_tokens WHERE user_id=?',uid);
 if(!saved)fail(409,'Apple로 다시 로그인한 뒤 계정 삭제를 진행해주세요.');
 const [iv,cipher]=saved.cipher.split('.');
 const token=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(iv),additionalData:encoder.encode(uid)},await tokenKey(env),from64(cipher)));
 let response;try{response=await fetch('https://appleid.apple.com/auth/revoke',{method:'POST',body:new URLSearchParams({client_id:env.APPLE_CLIENT_ID,client_secret:await appleClientSecret(env),token,token_type_hint:'refresh_token'}),signal:AbortSignal.timeout(10000)});}catch{fail(502,'Apple 연결 해제를 완료하지 못했어요. 잠시 후 다시 시도해주세요.');}
 if(!response.ok)fail(502,'Apple 연결 해제를 완료하지 못했어요. 다시 로그인한 뒤 시도해주세요.');
}

export async function blockedContext(env,user){
 if(!user)return env;
 const blocked=await rows(env,'SELECT CASE WHEN user_id=? THEN blocked_id ELSE user_id END id FROM user_blocks WHERE user_id=? OR blocked_id=?',user.id,user.id,user.id);
 return {...env,AIFECT_VIEWER_ID:user.id,AIFECT_BLOCKED:blocked.map(x=>x.id)};
}
export function assertUnblocked(env,uid){if(env.AIFECT_BLOCKED?.includes(uid))fail(403,'차단된 이용자와는 소통할 수 없습니다.');}
// Apply before pagination in track and chat queries, with a final guard for nested discovery shelves.
export async function filterBlockedResponse(env,response){
 if(!env.AIFECT_BLOCKED?.length||!response.ok||!response.headers.get('content-type')?.includes('application/json'))return response;
 const ids=env.AIFECT_BLOCKED,marks=ids.map(()=>'?').join(',');
 const profiles=await rows(env,`SELECT id FROM producers WHERE user_id IN (${marks})`,...ids);
 const artists=await rows(env,`SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id IN (${marks})`,...ids);
 const all=new Set([...ids,...profiles.map(p=>p.id),...artists.map(a=>a.id)]);
 const hidden=o=>o&&typeof o==='object'&&['user_id','producer_id','artist_id','profile_id','target_id'].some(k=>all.has(o[k]));
 const clean=o=>Array.isArray(o)?o.filter(x=>!hidden(x)&&!(x&&all.has(x.id))).map(clean):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).map(([k,v])=>[k,clean(v)])):o;
 const body=await response.json();if(hidden(body.profile)||hidden(body.track))fail(403,'차단된 이용자의 콘텐츠입니다.');
 return new Response(JSON.stringify(clean(body)),{status:response.status,headers:response.headers});
}

async function storageTargets(env,uid){
 const targets=[];
 const tracks=await rows(env,'SELECT id,original_key,original_ext FROM tracks WHERE user_id=?',uid);
 for(const t of tracks){
  for(const prefix of [`original/${t.id}.`,`cover/${t.id}.`,`stream/${t.id}.`,`preview/${t.id}.`,`karaoke/${t.id}/`,`archive/${t.id}/`,`premium/${t.id}/`,`images/track/${t.id}/`])targets.push({prefix});
  targets.push({key:`cover-source/${t.id}`});if(t.original_key)targets.push({key:t.original_key});
 }
 for(const p of await rows(env,'SELECT id FROM producers WHERE user_id=?',uid)){
  targets.push({prefix:`images/producer/${p.id}/`},{prefix:`images/banner/${p.id}/`});
  for(const a of await rows(env,'SELECT id FROM artists WHERE producer_id=?',p.id))targets.push({prefix:`images/artist/${a.id}/`});
 }
 for(const image of await rows(env,'SELECT object_key FROM chat_images WHERE sender_id=? OR recipient_id=?',uid,uid))targets.push({key:image.object_key});
 return targets;
}
export async function drainDeletedFiles(env){
 if(!env.BUCKET)return;
 for(const job of await rows(env,'SELECT * FROM account_file_deletions WHERE ready_at<=? ORDER BY ready_at LIMIT 2',now())){
  try{
   const targets=JSON.parse(job.targets);
   for(const target of targets){
    if(target.key){await env.BUCKET.delete(target.key);continue;}
    // Deleting while listing always starts at the beginning, so no page cursor can skip keys.
    for(let page=0;page<10;page++){
     const result=await env.BUCKET.list({prefix:target.prefix,limit:100});
     if(result.objects.length)await env.BUCKET.delete(result.objects.map(o=>o.key));
     if(!result.truncated)break;if(page===9)throw Error('More files remain');
    }
   }
   // A second sweep also removes an upload already in flight when deletion began.
   if(job.pass===0)await run(env,'UPDATE account_file_deletions SET pass=1,ready_at=? WHERE id=?',now()+3600,job.id);
   else await run(env,'DELETE FROM account_file_deletions WHERE id=?',job.id);
  }catch{await run(env,'UPDATE account_file_deletions SET ready_at=? WHERE id=?',now()+60,job.id);}
 }
}
export async function deleteAccount(env,user){
 if(user.provider==='apple')await revokeAppleLogin(env,user.id);
 await cancelSubscription(env,user);
 const targets=await storageTargets(env,user.id),q=(sql,...args)=>query(env,sql,...args),uid=user.id;
 const writes=[];
 for(const crew of await rows(env,'SELECT id FROM crews WHERE owner_id=?',uid)){
  const next=await one(env,'SELECT user_id FROM crew_members WHERE crew_id=? AND user_id!=? ORDER BY joined,user_id LIMIT 1',crew.id,uid);
  if(next)writes.push(q('UPDATE crews SET owner_id=? WHERE id=?',next.user_id,crew.id),q("UPDATE crew_members SET role='owner' WHERE crew_id=? AND user_id=?",crew.id,next.user_id));
  else writes.push(q('DELETE FROM crews WHERE id=?',crew.id));
 }
 const ownTracks='SELECT id FROM tracks WHERE user_id=?';
 for(const table of ['lyric_jobs','karaoke_jobs','premium_audio_jobs','original_archives','track_reports','playlist_tracks','likes','free_gifts','comments'])writes.push(q(`DELETE FROM ${table} WHERE track_id IN (${ownTracks})`,uid));
 for(const table of ['sessions','account_handles','apple_login_tokens','push_devices','push_preferences','user_blocks','comment_reports','comment_likes','comments','likes','follows','playlist_saves','playlist_preferences','playlists','listens','free_gift_claims','free_gift_wallets','crew_bans','crew_xp','crew_messages','crew_members'])writes.push(q(`DELETE FROM ${table} WHERE user_id=?`,uid));
 writes.push(q('DELETE FROM user_blocks WHERE blocked_id=?',uid),q('DELETE FROM direct_messages WHERE sender_id=? OR recipient_id=?',uid,uid),q('DELETE FROM push_outbox WHERE recipient=?',uid),q('DELETE FROM free_gifts WHERE sender_id=?',uid),q("DELETE FROM oauth_states WHERE provider='mobile' AND nonce=?",uid));
 writes.push(q("DELETE FROM follows WHERE (kind='producer' AND target_id IN (SELECT id FROM producers WHERE user_id=?)) OR (kind='artist' AND target_id IN (SELECT a.id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id=?))",uid,uid));
 writes.push(q('DELETE FROM dm_settings WHERE user_id=? OR peer_id=?',uid,uid),q('DELETE FROM chat_images WHERE sender_id=? OR recipient_id=?',uid,uid));
 // Minimal anonymous keys remain only where accounting rows require stable foreign keys.
 writes.push(q("UPDATE tracks SET status='deleted',title='삭제된 음악',genre='',tags='',description='',lyrics='',lyrics_mode='none',ai_tool='',participation='',original_key='',original_bytes=0,duration=0,has_cover=0,cover_version='',cover_type='',error=NULL,lease_token=NULL,lease_until=0,karaoke_terms='',karaoke_at=0,duet_guide='' WHERE user_id=?",uid));
 writes.push(q("UPDATE artists SET name='삭제된 아티스트',bio='',genre='',image_version='',image_type='' WHERE producer_id IN (SELECT id FROM producers WHERE user_id=?)",uid));
 writes.push(q("UPDATE producers SET name='탈퇴한 회원',bio='',image_version='',image_type='',banner_version='',banner_type='',nickname_confirmed=1 WHERE user_id=?",uid));
 writes.push(q("UPDATE users SET email=?||'@deleted.aifect.invalid',name='탈퇴한 회원',password=NULL,provider='deleted',subject=NULL,premium_until=0,apple_premium_until=0,playlist_selection='[]' WHERE id=?",uid,uid));
 // Unused payout enrollment is removed; earned payout/tax records follow the published retention policy.
 writes.push(q('DELETE FROM payout_accounts WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM payout_statements WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM gifts WHERE creator_profile_id IN (SELECT id FROM producers WHERE user_id=?) OR singer_profile_id IN (SELECT id FROM producers WHERE user_id=?))',uid,uid,uid,uid));
 writes.push(q('INSERT INTO account_file_deletions(id,targets,ready_at,pass) VALUES(?,?,?,0)',id(),JSON.stringify(targets),now()));
 await env.DB.batch(writes);
}

export async function accountSafetyRoute(req,env,path,user){
 if(path==='/api/account/delete'&&req.method==='POST'){
  requireUser(user);await rate(env,'account-delete:'+user.id,5,900);
  if((await req.json()).confirmation!=='DELETE')fail(400,'계정 영구 삭제를 확인해주세요.');
  await deleteAccount(env,user);
  return json({ok:true,deleted:true},200,{'set-cookie':'aifect_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0'});
 }
 if(path==='/api/blocks'&&req.method==='GET'){
  requireUser(user);return json({blocks:await rows(env,"SELECT b.blocked_id id,COALESCE(p.name,'이용자') name,p.id profile_id FROM user_blocks b LEFT JOIN producers p ON p.user_id=b.blocked_id WHERE b.user_id=? ORDER BY b.created DESC",user.id)});
 }
 const m=path.match(/^\/api\/blocks\/([\w-]+)$/);if(!m)return null;
 requireUser(user);const target=await one(env,"SELECT id FROM users WHERE id=? AND provider!='deleted'",m[1]);
 if(!target||target.id===user.id)fail(400,'차단할 이용자를 확인해주세요.');
 if(req.method==='PUT'){
  await rate(env,'block:'+user.id,60,3600);
  await run(env,'INSERT OR IGNORE INTO user_blocks(user_id,blocked_id,created) VALUES(?,?,?)',user.id,target.id,now());
 }else if(req.method==='DELETE')await run(env,'DELETE FROM user_blocks WHERE user_id=? AND blocked_id=?',user.id,target.id);
 else fail(405,'지원하지 않는 요청입니다.');
 return json({ok:true});
}
