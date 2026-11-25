import * as AifectMessages from '../shared/system-messages.js';
import {one,query,run,now,id,fail,json,str} from './db.js';
import {hash,session,cookies,providers} from './auth.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const binding=(ticket,secure)=>`aifect_mobile=${ticket}; Path=/; HttpOnly; SameSite=${secure?'None':'Lax'}; Max-Age=600${secure?'; Secure':''}`;
const page=(body)=>new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIFECT 앱 로그인</title><link rel="stylesheet" href="/focus.css"><style>*{box-sizing:border-box}html{min-height:100%;background:#0b1022;color-scheme:dark}body{color:#f4f2ff;background:radial-gradient(ellipse at 85% 8%,#8c55cc33,transparent 50%),radial-gradient(ellipse at 0% 90%,#71d9d522,transparent 50%),#0b1022;font:16px/1.6 system-ui,sans-serif;margin:0;min-height:100dvh;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));display:grid;align-content:center;gap:24px}.brand{display:block;width:180px;max-width:70vw;height:auto;margin:0 auto}main{width:100%;max-width:400px;margin:0 auto;padding:24px 20px;border:1px solid #b7b6ff55;border-radius:24px;background:#171d32dd;box-shadow:0 16px 60px #0003}h1{margin:0 0 12px;font-size:24px;line-height:1.4}button,a.button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-height:52px;padding:14px;margin:12px 0;background:linear-gradient(110deg,#d6baff,#b7b6ff,#aeebdf);color:#15152e;border:0;border-radius:16px;text-align:center;text-decoration:none;font:inherit;font-weight:700}p{color:#bdc2d9;line-height:1.7;overflow-wrap:anywhere}#google{width:100%;min-width:200px;overflow:hidden}#error{color:#ffb4c3;margin:0}#error:empty{display:none}</style><img class="brand" src="/assets/brand/20261117/aifect-wordmark-horizontal.webp" alt="AIFECT"><main>${body}</main></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY'}});
export async function finishMobile(req,env,user,sessionCookie,asJson=false){
 const ticket=cookies(req).aifect_mobile;if(!ticket)return null;
 const result=await query(env,"UPDATE oauth_states SET nonce=?,expires=? WHERE state=? AND provider='mobile' AND nonce='' AND expires>? RETURNING state",user.id,now()+120,await hash(ticket),now()).first();
 if(!result)fail(400,'앱 로그인 요청이 만료되었습니다. 앱에서 다시 시작해 주세요.');
 const target='kr.co.aifect.app://auth?ticket='+encodeURIComponent(ticket);
 const response=asJson?json({mobileRedirect:target}):page(`<h1>로그인이 완료되었습니다</h1><p>AIFECT 앱으로 돌아가 음악을 즐겨 보세요.</p><a class="button" href="${escape(target)}">AIFECT 앱 열기</a>`);
 response.headers.append('set-cookie',sessionCookie||await session(env,user,new URL(req.url).protocol==='https:'));
 response.headers.append('set-cookie',binding('',new URL(req.url).protocol==='https:').replace('Max-Age=600','Max-Age=0'));
 return response;
}
export async function mobileAuthRoute(req,env,path,user){
 if(!path.startsWith('/api/auth/mobile/'))return null;
 const url=new URL(req.url),secure=url.protocol==='https:';
 if(path==='/api/auth/mobile/start'&&req.method==='POST'){
  const b=await req.json();if(!/^[a-f0-9]{64}$/.test(b.challenge||''))fail(400,'앱 로그인 요청을 확인해 주세요.');
  const ticket=id()+id();
  await run(env,"INSERT INTO oauth_states(state,provider,verifier,nonce,expires) VALUES(?,'mobile',?,'',?)",await hash(ticket),b.challenge,now()+600);
  return json({ticket,url:url.origin+'/api/auth/mobile/browser?ticket='+encodeURIComponent(ticket)});
 }
 if(path==='/api/auth/mobile/exchange'&&req.method==='POST'){
  const b=await req.json(),ticket=str(b.ticket,100),verifier=str(b.verifier,128);
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(verifier))fail(400,'앱 로그인 인증을 확인해 주세요.');
  const challenge=await hash(verifier),state=await hash(ticket);
  const pending=await one(env,"SELECT nonce FROM oauth_states WHERE state=? AND provider='mobile' AND verifier=? AND expires>?",state,challenge,now());
  if(!pending)fail(401,'앱 로그인 요청이 만료되었습니다. 다시 시도해 주세요.');
  if(!pending.nonce)fail(409,'브라우저에서 로그인을 마쳐 주세요.');
  const consumed=await query(env,"DELETE FROM oauth_states WHERE state=? AND provider='mobile' AND verifier=? AND nonce<>'' AND expires>? RETURNING nonce",state,challenge,now()).first();
  if(!consumed)fail(401,'이미 사용한 로그인 요청입니다.');
  const u=await one(env,"SELECT id,name,email,provider FROM users WHERE id=? AND provider!='deleted'",consumed.nonce);if(!u)fail(401,'계정을 찾을 수 없습니다.');
  return json({user:u},200,{'set-cookie':await session(env,u,secure)});
 }
 if(path==='/api/auth/mobile/approve'&&req.method==='POST'){
  if(!user)fail(401,'로그인해 주세요.');
  const b=await req.json();if(!b.ticket||b.ticket!==cookies(req).aifect_mobile)fail(403,'앱 로그인 요청을 확인해 주세요.');
  return await finishMobile(req,env,user,await session(env,user,secure),true);
 }
 if(path==='/api/auth/mobile/browser'&&req.method==='GET'){
  const ticket=url.searchParams.get('ticket')||'';
  if(!ticket||!await one(env,"SELECT state FROM oauth_states WHERE state=? AND provider='mobile' AND nonce='' AND expires>?",await hash(ticket),now()))fail(400,'앱에서 로그인을 다시 시작해 주세요.');
  const enabled=providers(env);
  // Android opens only Apple's provider screen in a Custom Tab. The binding and
  // verifier-protected exchange remain the same as the existing browser handoff.
  if(url.searchParams.get('provider')==='apple'){
   if(!enabled.includes('apple'))fail(503,'Apple 로그인을 준비하고 있습니다.');
   return new Response(null,{status:302,headers:{location:'/api/auth/apple','set-cookie':binding(ticket,secure),'cache-control':'no-store'}});
  }
  const response=page(`<h1>음악으로 이어지는 우리</h1><p>AIFECT 앱에 로그인합니다. 인증이 끝나면 앱으로 돌아갑니다.</p>
  ${user?`<p>${escape(user.name)} · ${escape(user.email)}</p><button id="continue">이 계정으로 계속하기</button>`:''}
  ${enabled.includes('google')&&env.GOOGLE_CLIENT_SECRET?'<a class="button" href="/api/auth/google">Google로 계속하기</a>':''}
  ${enabled.includes('google')&&!env.GOOGLE_CLIENT_SECRET?'<div id="google"></div><script src="https://accounts.google.com/gsi/client" async defer></script>':''}
  ${enabled.includes('kakao')?'<a class="button" href="/api/auth/kakao">카카오로 계속하기</a>':''}
  ${enabled.includes('apple')?'<a class="button" href="/api/auth/apple">Apple로 계속하기</a>':''}
  <p id="error"></p><p>이메일 로그인은 앱에서 바로 이용할 수 있습니다.</p>
  <script>
  async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
  function done(d){if(!d.mobileRedirect)throw Error('앱에서 다시 시도해 주세요.');location.href=d.mobileRedirect;document.querySelector('main').innerHTML='<h1>로그인 완료</h1>';const a=document.createElement('a');a.className='button';a.textContent='AIFECT 앱 열기';a.href=d.mobileRedirect;document.querySelector('main').append(a);}
  document.getElementById('continue')?.addEventListener('click',async()=>{try{done(await call('/api/auth/mobile/approve',{ticket:new URL(location.href).searchParams.get('ticket')}));}catch(e){document.getElementById('error').textContent=e.message;}});
  ${enabled.includes('google')&&!env.GOOGLE_CLIENT_SECRET?`window.addEventListener('load',async()=>{try{const d=await call('/api/auth/google/nonce',{});google.accounts.id.initialize({client_id:${JSON.stringify(env.GOOGLE_CLIENT_ID).replaceAll('<','\\u003c')},nonce:d.nonce,callback:async r=>{try{done(await call('/api/auth/google/token',{credential:r.credential}));}catch(e){document.getElementById('error').textContent=e.message;}}});google.accounts.id.renderButton(document.getElementById('google'),{theme:'filled_black',size:'large',width:Math.min(350,document.getElementById('google').clientWidth)});}catch(e){document.getElementById('error').textContent=e.message;}});`:''}
  </script>`);
  response.headers.append('set-cookie',binding(ticket,secure));return response;
 }
 fail(405,AifectMessages.unsupportedRequest);
}
