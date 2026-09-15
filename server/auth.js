import {createRemoteJWKSet,jwtVerify,SignJWT,importPKCS8} from 'jose';
import {one,run,query,now,id,fail,str,json,rate} from './db.js';
const enc=new TextEncoder();
export const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(name,value,age,secure=true)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
export function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')));}
export async function viewer(req,env){const token=cookies(req).aifect_session;if(!token)return null;return one(env,'SELECT u.id,u.name,u.email,u.provider FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',await hash(token),now());}
export const requireUser=u=>{if(!u)fail(401,'로그인 후 이용해주세요.');return u;};
async function passwordHash(password,salt,env){
 if(!env.AUTH_PEPPER)fail(503,'로그인 설정을 준비하고 있습니다.');
 const key=await crypto.subtle.importKey('raw',enc.encode(password+env.AUTH_PEPPER),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');
}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function session(env,user,secure=true){const token=id()+id();await run(env,'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await hash(token),user.id,now()+86400*30);return cookie('aifect_session',token,86400*30,secure);}
export function providers(env){return ['google','kakao','apple'].filter(p=>env[`${p.toUpperCase()}_CLIENT_ID`]&&(p==='google'||p==='kakao'||env.APPLE_CLIENT_SECRET));}
export async function authRoute(req,env,path,user){
 const url=new URL(req.url),secure=url.protocol==='https:';
 if(path==='/api/me')return json({user,providers:providers(env),googleClientId:env.GOOGLE_CLIENT_ID||null,emailEnabled:!!env.AUTH_PEPPER});
 if(path==='/api/auth/google/nonce'&&req.method==='POST'){
  if(!env.GOOGLE_CLIENT_ID)fail(503,'Google 로그인을 준비하고 있습니다.');
  const state=id()+id(),nonce=id();
  await run(env,'INSERT INTO oauth_states(state,provider,verifier,nonce,expires) VALUES(?,?,?,?,?)',await hash(state),'google-id','',nonce,now()+600);
  return json({nonce},200,{'set-cookie':cookie('aifect_oauth',state,600,secure)});
 }
 if(path==='/api/auth/google/token'&&req.method==='POST'){
  const state=cookies(req).aifect_oauth||'';
  const st=await query(env,"DELETE FROM oauth_states WHERE state=? AND provider='google-id' AND expires>? RETURNING *",await hash(state),now()).first();
  if(!st||!env.GOOGLE_CLIENT_ID)fail(400,'로그인 요청이 만료됐습니다.');
  const b=await req.json();const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  let payload;try{({payload}=await jwtVerify(str(b.credential,10000),jwks,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID}));}catch{fail(401,'Google 인증을 확인할 수 없습니다.');}
  if(payload.nonce!==st.nonce||!payload.email_verified||!payload.sub)fail(401,'Google 인증 정보가 일치하지 않습니다.');
  let u=await one(env,"SELECT id,name,email,provider FROM users WHERE provider='google' AND subject=?",payload.sub);
  if(!u){u={id:id(),name:String(payload.name||'AIFECT 리스너').slice(0,40),email:payload.email,provider:'google'};await run(env,'INSERT INTO users(id,email,name,provider,subject,created) VALUES(?,?,?,?,?,?)',u.id,u.email,u.name,'google',payload.sub,now());}
  return json({user:u},200,{'set-cookie':await session(env,u,secure)});
 }
 if(path==='/api/auth/logout'&&req.method==='POST'){
  const token=cookies(req).aifect_session;if(token)await run(env,'DELETE FROM sessions WHERE token=?',await hash(token));
  return json({ok:true},200,{'set-cookie':cookie('aifect_session','',0,secure)});
 }
 if(['/api/auth/register','/api/auth/login'].includes(path)&&req.method==='POST'){
  const body=await req.json(),email=str(body.email,254).toLowerCase(),password=str(body.password,128);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)fail(400,'이메일과 12자 이상의 비밀번호를 입력해주세요.');
  await rate(env,'auth-email:'+await hash(email),12,900);
  let u=await one(env,"SELECT * FROM users WHERE email=? AND provider='email'",email);
  if(path.endsWith('/register')){
   if(u)fail(409,'이미 가입된 이메일입니다. 로그인해주세요.');
   const salt=id(),name=str(body.name,40),uid=id();
   await run(env,'INSERT INTO users(id,email,name,password,provider,subject,created) VALUES(?,?,?,?,?,?,?)',uid,email,name,salt+':'+await passwordHash(password,salt,env),'email',email,now());
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
 if(!client||(p!=='kakao'&&!secret))fail(503,'이 로그인 서비스의 AIFECT 주소 등록을 준비하고 있습니다.');
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
 const response=await fetch(tokenURL,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code,client_id:client,...(secret?{client_secret:secret}:{}),redirect_uri:redirect})});
 if(!response.ok)fail(502,'로그인 제공자 인증에 실패했습니다.');
 const token=await response.json();let identity;
 if(p==='kakao'){
  const r=await fetch('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:`Bearer ${token.access_token}`}});if(!r.ok)fail(502,'카카오 프로필을 불러올 수 없습니다.');
  const v=await r.json();identity={sub:String(v.id),name:v.kakao_account?.profile?.nickname||'AIFECT 리스너',email:v.kakao_account?.is_email_verified?v.kakao_account?.email:null};
 }else{
  const jwks=createRemoteJWKSet(new URL(p==='google'?'https://www.googleapis.com/oauth2/v3/certs':'https://appleid.apple.com/auth/keys'));
  const {payload}=await jwtVerify(token.id_token,jwks,{issuer:p==='google'?['https://accounts.google.com','accounts.google.com']:'https://appleid.apple.com',audience:client});
  if(payload.nonce!==st.nonce)fail(400,'로그인 인증 정보가 일치하지 않습니다.');
  identity={sub:payload.sub,name:payload.name||'AIFECT 리스너',email:payload.email_verified?payload.email:null};
 }
 let u=await one(env,'SELECT id FROM users WHERE provider=? AND subject=?',p,identity.sub);
 if(!u){u={id:id()};await run(env,'INSERT INTO users(id,email,name,provider,subject,created) VALUES(?,?,?,?,?,?)',u.id,identity.email||`${p}-${identity.sub}@identity.aifect.invalid`,String(identity.name).slice(0,40),p,identity.sub,now());}
 return new Response(null,{status:303,headers:{location:'/#account?welcome=1','set-cookie':await session(env,u,secure),'cache-control':'no-store'}});
}
