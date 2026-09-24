import {one,query,run,now,id,fail,json,str} from './db.js';
import {hash,session,cookies,providers} from './auth.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const binding=(ticket,secure)=>`aifect_mobile=${ticket}; Path=/; HttpOnly; SameSite=${secure?'None':'Lax'}; Max-Age=600${secure?'; Secure':''}`;
const page=(body)=>new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIFECT 앱 로그인</title><style>body{color:#f2f5ed;background:#101413;font:16px system-ui;margin:0;padding:28px}main{max-width:400px;margin:12vh auto}h1{color:#c6f77e;font-size:42px}button,a.button{display:block;box-sizing:border-box;width:100%;padding:18px;margin:12px 0;background:#c6f77e;color:#162019;border:0;border-radius:16px;text-align:center;text-decoration:none;font:inherit;font-weight:700}p{color:#b5bfb6;line-height:1.7}#error{color:#ffb4a5}</style><main>${body}</main></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY'}});
export async function finishMobile(req,env,user,sessionCookie,asJson=false){
 const ticket=cookies(req).aifect_mobile;if(!ticket)return null;
 const result=await query(env,"UPDATE oauth_states SET nonce=?,expires=? WHERE state=? AND provider='mobile' AND nonce='' AND expires>? RETURNING state",user.id,now()+120,await hash(ticket),now()).first();
 if(!result)fail(400,'앱 로그인 요청이 만료됐어요. 앱에서 다시 시작해주세요.');
 const target='kr.co.aifect.app://auth?ticket='+encodeURIComponent(ticket);
 const response=asJson?json({mobileRedirect:target}):page(`<h1>aifect</h1><h2>로그인이 완료됐어요</h2><p>AIFECT 앱으로 돌아가 음악을 즐겨보세요.</p><a class="button" href="${escape(target)}">AIFECT 앱 열기</a>`);
 response.headers.append('set-cookie',sessionCookie||await session(env,user,new URL(req.url).protocol==='https:'));
 response.headers.append('set-cookie',binding('',new URL(req.url).protocol==='https:').replace('Max-Age=600','Max-Age=0'));
 return response;
}
export async function mobileAuthRoute(req,env,path,user){
 if(!path.startsWith('/api/auth/mobile/'))return null;
 const url=new URL(req.url),secure=url.protocol==='https:';
 if(path==='/api/auth/mobile/start'&&req.method==='POST'){
  const b=await req.json();if(!/^[a-f0-9]{64}$/.test(b.challenge||''))fail(400,'앱 로그인 요청을 확인해주세요.');
  const ticket=id()+id();
  await run(env,"INSERT INTO oauth_states(state,provider,verifier,nonce,expires) VALUES(?,'mobile',?,'',?)",await hash(ticket),b.challenge,now()+600);
  return json({ticket,url:url.origin+'/api/auth/mobile/browser?ticket='+encodeURIComponent(ticket)});
 }
 if(path==='/api/auth/mobile/exchange'&&req.method==='POST'){
  const b=await req.json(),ticket=str(b.ticket,100),verifier=str(b.verifier,128);
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(verifier))fail(400,'앱 로그인 인증을 확인해주세요.');
  const challenge=await hash(verifier),state=await hash(ticket);
  const pending=await one(env,"SELECT nonce FROM oauth_states WHERE state=? AND provider='mobile' AND verifier=? AND expires>?",state,challenge,now());
  if(!pending)fail(401,'앱 로그인 요청이 만료됐어요. 다시 시도해주세요.');
  if(!pending.nonce)fail(409,'브라우저에서 로그인을 마쳐주세요.');
  const consumed=await query(env,"DELETE FROM oauth_states WHERE state=? AND provider='mobile' AND verifier=? AND nonce<>'' AND expires>? RETURNING nonce",state,challenge,now()).first();
  if(!consumed)fail(401,'이미 사용한 로그인 요청이에요.');
  const u=await one(env,'SELECT id,name,email,provider FROM users WHERE id=?',consumed.nonce);if(!u)fail(401,'계정을 찾을 수 없어요.');
  return json({user:u},200,{'set-cookie':await session(env,u,secure)});
 }
 if(path==='/api/auth/mobile/approve'&&req.method==='POST'){
  if(!user)fail(401,'로그인해주세요.');
  const b=await req.json();if(!b.ticket||b.ticket!==cookies(req).aifect_mobile)fail(403,'앱 로그인 요청을 확인해주세요.');
  return await finishMobile(req,env,user,await session(env,user,secure),true);
 }
 if(path==='/api/auth/mobile/browser'&&req.method==='GET'){
  const ticket=url.searchParams.get('ticket')||'';
  if(!ticket||!await one(env,"SELECT state FROM oauth_states WHERE state=? AND provider='mobile' AND nonce='' AND expires>?",await hash(ticket),now()))fail(400,'앱에서 로그인을 다시 시작해주세요.');
  const enabled=providers(env);
  const response=page(`<h1>aifect</h1><h2>음악으로 이어지는 우리</h2><p>AIFECT 앱에 로그인합니다. 인증이 끝나면 앱으로 돌아가요.</p>
  ${user?`<p>${escape(user.name)} · ${escape(user.email)}</p><button id="continue">이 계정으로 계속하기</button>`:''}
  ${enabled.includes('google')&&env.GOOGLE_CLIENT_SECRET?'<a class="button" href="/api/auth/google">Google로 계속하기</a>':''}
  ${enabled.includes('google')&&!env.GOOGLE_CLIENT_SECRET?'<div id="google"></div><script src="https://accounts.google.com/gsi/client" async defer></script>':''}
  ${enabled.includes('kakao')?'<a class="button" href="/api/auth/kakao">카카오로 계속하기</a>':''}
  ${enabled.includes('apple')?'<a class="button" href="/api/auth/apple">Apple로 계속하기</a>':''}
  <p id="error"></p><p>이메일 로그인은 앱에서 바로 이용할 수 있어요.</p>
  <script>
  async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
  function done(d){if(!d.mobileRedirect)throw Error('앱에서 다시 시도해주세요.');location.href=d.mobileRedirect;document.querySelector('main').innerHTML='<h1>aifect</h1><h2>로그인 완료</h2>';const a=document.createElement('a');a.className='button';a.textContent='AIFECT 앱 열기';a.href=d.mobileRedirect;document.querySelector('main').append(a);}
  document.getElementById('continue')?.addEventListener('click',async()=>{try{done(await call('/api/auth/mobile/approve',{ticket:new URL(location.href).searchParams.get('ticket')}));}catch(e){document.getElementById('error').textContent=e.message;}});
  ${enabled.includes('google')&&!env.GOOGLE_CLIENT_SECRET?`window.addEventListener('load',async()=>{try{const d=await call('/api/auth/google/nonce',{});google.accounts.id.initialize({client_id:${JSON.stringify(env.GOOGLE_CLIENT_ID).replaceAll('<','\\u003c')},nonce:d.nonce,callback:async r=>{try{done(await call('/api/auth/google/token',{credential:r.credential}));}catch(e){document.getElementById('error').textContent=e.message;}}});google.accounts.id.renderButton(document.getElementById('google'),{theme:'filled_black',size:'large',width:350});}catch(e){document.getElementById('error').textContent=e.message;}});`:''}
  </script>`);
  response.headers.append('set-cookie',binding(ticket,secure));return response;
 }
 fail(405,'지원하지 않는 요청입니다.');
}
