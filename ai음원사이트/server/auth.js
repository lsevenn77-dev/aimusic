import {rememberAppleToken} from './account-safety.js';
import {nickname,nicknameBatch} from './nicknames.js';
import {publicUser,producerNameSQL} from './identity.js';
import {createRemoteJWKSet,jwtVerify,SignJWT,importPKCS8} from 'jose';
import {one,run,query,now,id,fail,str,json,rate} from './db.js';
import {membership} from './membership.js';
import {applyPremiumGrant} from './premium-grant.js';
import {mobileAuthRoute,finishMobile} from './mobile-auth.js';
import {nativeAuthRoute} from './native-auth.js';
const enc=new TextEncoder();
export const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(name,value,age,secure=true)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
export function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')));}
// Operators are listed by user id in ADMIN_USER_IDS; there is no self-service admin role.
export const isAdmin=(env,user)=>!!user&&(env.ADMIN_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(user.id);
// Moderation operators have no access to payout accounts or other administrator data.
export const isTrackModerator=(env,user)=>isAdmin(env,user)||!!user&&(env.TRACK_REVIEW_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(user.id);
export async function viewer(req,env){
 const token=cookies(req).aifect_session;if(!token)return null;
 // Resolve the session and public nickname together on every request; no auth cache.
 const user=await one(env,`SELECT u.id,u.email,u.provider,u.premium_until,u.apple_premium_until,COALESCE(${producerNameSQL()},CASE WHEN u.provider='email' THEN u.name ELSE '리스너 '||substr(u.id,1,8) END) name,p.id profile_id,COALESCE(p.image_version,'') image_version FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN producers p ON p.user_id=u.id WHERE s.token=? AND s.expires>? AND u.provider!='deleted'`,await hash(token),now());
 const granted=await applyPremiumGrant(env,user);
 return granted?{...granted,base_premium_until:granted.premium_until,premium_until:Math.max(granted.premium_until,granted.apple_premium_until||0)}:null;
}
export const requireUser=u=>{if(!u)fail(401,'로그인 후 이용해주세요.');return u;};
async function passwordHash(password,salt,env){
 if(!env.AUTH_PEPPER)fail(503,'로그인 설정을 준비하고 있습니다.');
 const key=await crypto.subtle.importKey('raw',enc.encode(password+env.AUTH_PEPPER),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');
}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function session(env,user,secure=true){const token=id()+id();await run(env,'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await hash(token),user.id,now()+86400*30);return cookie('aifect_session',token,86400*30,secure);}
const appleKeyReady=env=>!!(env.APPLE_PRIVATE_KEY&&env.APPLE_KEY_ID&&env.APPLE_TEAM_ID);
export async function appleClientSecret(env){
 if(!appleKeyReady(env))return env.APPLE_CLIENT_SECRET;
 // Issue a short-lived server token per exchange, avoiding a six-month login outage.
 const key=await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g,'\n'),'ES256');
 return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:env.APPLE_KEY_ID}).setIssuer(env.APPLE_TEAM_ID)
  .setSubject(env.APPLE_CLIENT_ID).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);
}
export function providers(env){return ['google','kakao','apple'].filter(p=>env[`${p.toUpperCase()}_CLIENT_ID`]&&(p==='google'||p==='kakao'||env.APPLE_CLIENT_SECRET||appleKeyReady(env)));}
export async function authRoute(req,env,path,user){
 const url=new URL(req.url),secure=url.protocol==='https:';
 const mobile=await mobileAuthRoute(req,env,path,user);if(mobile)return mobile;
 const native=await nativeAuthRoute(req,env,path);if(native)return native;
 if(path==='/api/me'){
  const [plan,state]=await Promise.all([membership(env,user),user&&url.searchParams.get('state')==='1'?one(env,`SELECT (SELECT json_group_array(track_id) FROM likes WHERE user_id=?) likes,(SELECT json_group_array(json_object('kind',kind,'target_id',target_id)) FROM follows WHERE user_id=?) follows`,user.id,user.id):null]);
  return json({user,admin:isAdmin(env,user),track_moderator:isTrackModerator(env,user),membership:plan,providers:providers(env),googleClientId:env.GOOGLE_CLIENT_ID||null,emailEnabled:!!env.AUTH_PEPPER,...(state?{interaction_state:{likes:JSON.parse(state.likes).map(id=>({id})),follows:JSON.parse(state.follows)}}:{})});
 }
 if(path==='/api/auth/google/nonce'&&req.method==='POST'){
  if(!env.GOOGLE_CLIENT_ID)fail(503,'Google 로그인을 준비하고 있습니다.');
  const state=id()+id(),nonce=id();
  await run(env,'INSERT INTO oauth_states(state,provider,verifier,nonce,expires) VALUES(?,?,?,?,?)',await hash(state),'google-id','',nonce,now()+600);
  // Google returns credentials with a cross-site POST in redirect mode.
  const binding=secure?`aifect_google_oauth=${state}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=600`:cookie('aifect_google_oauth',state,600,false);
  return json({nonce},200,{'set-cookie':binding});
 }
 if((path==='/api/auth/google/token'||path==='/api/auth/google/callback')&&req.method==='POST'){
  const isRedirect=path.endsWith('/callback'),jar=cookies(req);
  const b=isRedirect?Object.fromEntries(new URLSearchParams(await req.text())):await req.json();
  if(isRedirect&&(!jar.g_csrf_token||!b.g_csrf_token||!equal(jar.g_csrf_token,b.g_csrf_token)))fail(403,'로그인 요청을 확인할 수 없습니다. 다시 시도해주세요.');
  const state=jar.aifect_google_oauth||'';
  const st=await query(env,"DELETE FROM oauth_states WHERE state=? AND provider='google-id' AND expires>? RETURNING *",await hash(state),now()).first();
  if(!st||!env.GOOGLE_CLIENT_ID)fail(400,'로그인 요청이 만료됐습니다.');
  const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  let payload;try{({payload}=await jwtVerify(str(b.credential,10000),jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID}));}catch{fail(401,'Google 인증을 확인할 수 없습니다.');}
  if(payload.nonce!==st.nonce||payload.email_verified!==true||!payload.email||!payload.sub)fail(401,'Google 인증 정보가 일치하지 않습니다.');
  let u=await one(env,"SELECT id,name,email,provider FROM users WHERE provider='google' AND subject=?",payload.sub);
  if(!u){u={id:id(),name:String(payload.name||'AIFECT 리스너').slice(0,40),email:payload.email,provider:'google'};await run(env,'INSERT INTO users(id,email,name,provider,subject,created) VALUES(?,?,?,?,?,?)',u.id,u.email,u.name,'google',payload.sub,now());}
  const appResult=await finishMobile(req,env,u,null,!isRedirect);if(appResult)return appResult;
  const headers=new Headers({'cache-control':'no-store'});
  headers.append('set-cookie',await session(env,u,secure));
  headers.append('set-cookie',cookie('aifect_google_oauth','',0,secure));
  if(isRedirect){headers.set('location','/#account?welcome=1');return new Response(null,{status:303,headers});}
  headers.set('content-type','application/json; charset=utf-8');
  return new Response(JSON.stringify({user:u}),{headers});
 }
 if(path==='/api/auth/logout'&&req.method==='POST'){
  const token=cookies(req).aifect_session;if(token)await run(env,'DELETE FROM sessions WHERE token=?',await hash(token));
  return json({ok:true},200,{'set-cookie':cookie('aifect_session','',0,secure)});
 }
 if(path==='/api/account/password'&&req.method==='PUT'){
  requireUser(user);if(user.provider!=='email')fail(400,'소셜 로그인 비밀번호는 해당 서비스에서 변경해주세요.');
  await rate(env,'password-change:'+user.id,8,900);const b=await req.json(),current=str(b.current_password,128),next=str(b.new_password,128);
  if(next.length<12||next===current)fail(400,'현재 비밀번호와 다른 12자 이상의 새 비밀번호를 입력해주세요.');
  const stored=await one(env,"SELECT password FROM users WHERE id=? AND provider='email'",user.id),[salt,saved]=(stored?.password||'invalid:invalid').split(':');
  if(!saved||!equal(await passwordHash(current,salt,env),saved))fail(403,'현재 비밀번호가 올바르지 않습니다.');
  const newSalt=id(),encoded=newSalt+':'+await passwordHash(next,newSalt,env),token=id()+id();
  await env.DB.batch([
   query(env,'UPDATE users SET password=? WHERE id=? AND password=?',encoded,user.id,stored.password),
   query(env,'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)',user.id,user.id,encoded),
   query(env,'INSERT INTO sessions(token,user_id,expires) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND password=?)',await hash(token),user.id,now()+86400*30,user.id,encoded)
  ]);
  if(!await one(env,'SELECT token FROM sessions WHERE token=?',await hash(token)))fail(409,'계정 정보가 변경됐습니다. 다시 로그인해주세요.');
  return json({ok:true},200,{'set-cookie':cookie('aifect_session',token,86400*30,secure)});
 }
 if(['/api/auth/register','/api/auth/login'].includes(path)&&req.method==='POST'){
  const body=await req.json(),email=str(body.email,254).toLowerCase(),password=str(body.password,128);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)fail(400,'이메일과 12자 이상의 비밀번호를 입력해주세요.');
  await rate(env,'auth-email:'+await hash(email),12,900);
  let u=await one(env,"SELECT * FROM users WHERE email=? AND provider='email'",email);
  if(path.endsWith('/register')){
   if(u)fail(409,'이미 가입된 이메일입니다. 로그인해주세요.');
   const salt=id(),name=nickname(str(body.name,40)).name,uid=id();
   await nicknameBatch(env,uid,name,[query(env,'INSERT INTO users(id,email,name,password,provider,subject,created) VALUES(?,?,?,?,?,?,?)',uid,email,name,salt+':'+await passwordHash(password,salt,env),'email',email,now())]);
   u={id:uid,email,name,provider:'email'};
  }else{
   const [salt,saved]=(u?.password||'invalid:invalid').split(':');
   const actual=await passwordHash(password,salt,env);
   if(!u||!equal(actual,saved))fail(401,'이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  return json({user:{id:u.id,email:u.email,name:u.name,provider:u.provider}},200,{'set-cookie':await session(env,u,secure)});
 }
 const match=path.match(/^\/api\/auth\/(google|kakao|apple)(\/callback)?$/);
 if(!match)return null;
 const p=match[1],client=env[`${p.toUpperCase()}_CLIENT_ID`],secret=env[`${p.toUpperCase()}_CLIENT_SECRET`];
 if(!client||(p==='google'&&!secret)||(p==='apple'&&!secret&&!appleKeyReady(env)))fail(503,'이 로그인 서비스의 AIFECT 주소 등록을 준비하고 있습니다.');
 const redirect=`${url.origin}/api/auth/${p}/callback`;
 if(!match[2]){
  const state=id()+id(),verifier=id()+id(),nonce=id();
  await run(env,'INSERT INTO oauth_states(state,provider,verifier,nonce,expires) VALUES(?,?,?,?,?)',await hash(state),p,verifier,nonce,now()+600);
  const endpoint={google:'https://accounts.google.com/o/oauth2/v2/auth',kakao:'https://kauth.kakao.com/oauth/authorize',apple:'https://appleid.apple.com/auth/authorize'}[p];
  const dest=new URL(endpoint);dest.search=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',state,nonce,scope:p==='google'?'openid email profile':p==='apple'?'email name':'profile_nickname'});
  // Apple's form_post requires SameSite=None for the short-lived browser binding.
  if(p==='apple')dest.searchParams.set('response_mode','form_post');
  const binding=p==='apple'?`aifect_oauth=${state}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=600`:cookie('aifect_oauth',state,600,secure);
  return new Response(null,{status:302,headers:{location:dest.href,'set-cookie':binding,'cache-control':'no-store'}});
 }
 const params=req.method==='POST'?new URLSearchParams(await req.text()):url.searchParams;
 const state=params.get('state')||'',code=params.get('code');
 if(!state||cookies(req).aifect_oauth!==state||!code)fail(400,'로그인이 취소되었거나 만료됐습니다. 다시 시도해주세요.');
 const st=await query(env,'DELETE FROM oauth_states WHERE state=? AND provider=? AND expires>? RETURNING *',await hash(state),p,now()).first();
 if(!st)fail(400,'로그인 요청이 만료됐습니다.');
 const tokenURL={google:'https://oauth2.googleapis.com/token',kakao:'https://kauth.kakao.com/oauth/token',apple:'https://appleid.apple.com/auth/token'}[p];
 const exchangeSecret=p==='apple'?await appleClientSecret(env):secret;
 const response=await fetch(tokenURL,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code,client_id:client,...(exchangeSecret?{client_secret:exchangeSecret}:{}),redirect_uri:redirect})});
 if(!response.ok)fail(502,'로그인 제공자 인증에 실패했습니다.');
 const token=await response.json();let identity;
 if(p==='kakao'){
  const r=await fetch('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:`Bearer ${token.access_token}`}});if(!r.ok)fail(502,'카카오 프로필을 불러올 수 없습니다.');
  const v=await r.json();identity={sub:String(v.id),name:v.kakao_account?.profile?.nickname||'AIFECT 리스너',email:v.kakao_account?.is_email_verified?v.kakao_account?.email:null};
 }else{
  const jwks=createRemoteJWKSet(new URL(p==='google'?'https://www.googleapis.com/oauth2/v3/certs':'https://appleid.apple.com/auth/keys'));
  const {payload}=await jwtVerify(token.id_token,jwks,{issuer:p==='google'?['https://accounts.google.com','accounts.google.com']:'https://appleid.apple.com',audience:client});
  if(payload.nonce!==st.nonce||!payload.sub)fail(400,'로그인 인증 정보가 일치하지 않습니다.');
  let name=payload.name;
  if(p==='apple'&&params.get('user')){try{const v=JSON.parse(params.get('user'));name=[v.name?.firstName,v.name?.lastName].filter(x=>typeof x==='string').join(' ');}catch{}}
  identity={sub:payload.sub,name:name||'AIFECT 리스너',email:[true,'true'].includes(payload.email_verified)?payload.email:null};
 }
 let u=await one(env,'SELECT id FROM users WHERE provider=? AND subject=?',p,identity.sub);
 if(!u){u={id:id()};await run(env,'INSERT INTO users(id,email,name,provider,subject,created) VALUES(?,?,?,?,?,?)',u.id,identity.email||`${p}-${identity.sub}@identity.aifect.invalid`,String(identity.name).slice(0,40),p,identity.sub,now());}
 if(p==='apple')await rememberAppleToken(env,u.id,token.refresh_token);
 const appResult=await finishMobile(req,env,u,null);if(appResult)return appResult;
 return new Response(null,{status:303,headers:{location:'/#account?welcome=1','set-cookie':await session(env,u,secure),'cache-control':'no-store'}});
}
