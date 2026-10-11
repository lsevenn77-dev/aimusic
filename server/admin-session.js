import {one,run,query,now,id,fail,json,rate} from './db.js';

const COOKIE='__Host-aifect_admin';
const SESSION_SECONDS=7200;
const ITERATIONS=100000;
const verifiedOperators=new WeakSet();
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const cookie=(value,age)=>`${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const tokenFrom=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
const config=env=>/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH||'')?env.ADMIN_PASSWORD_HASH:null;
export const isConsoleAdmin=user=>!!user&&verifiedOperators.has(user);

export async function createAdminPasswordHash(password,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:ITERATIONS,hash:'SHA-256'},key,256);
 return `pbkdf2-sha256$${ITERATIONS}$${salt}$${hex(bits)}`;
}

export async function consoleViewer(req,env){
 const token=tokenFrom(req),verifier=config(env);
 if(!verifier||! /^[a-f0-9]{64}$/.test(token))return null;
 const session=await one(env,'SELECT expires FROM admin_sessions WHERE token_hash=? AND credential_version=? AND expires>?',await digest(token),await digest(verifier),now());
 if(!session)return null;
 // A private object identity grants authority only to the verified request;
 // JSON properties or a normal AIFECT account cannot impersonate this role.
 const operator={id:'admin-console',name:'관리자',expires:session.expires};
 verifiedOperators.add(operator);
 return operator;
}

export async function adminSessionRoute(req,env,path){
 if(!['/api/admin/session','/api/admin/login','/api/admin/logout'].includes(path))return null;
 if(path==='/api/admin/session'){
  if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
  const operator=await consoleViewer(req,env);
  return json({authenticated:!!operator,expires:operator?.expires||null});
 }
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 const url=new URL(req.url);
 if(req.headers.get('origin')!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')fail(403,'관리자 페이지에서 다시 요청해주세요.');
 if(path==='/api/admin/logout'){
  const token=tokenFrom(req);
  if(/^[a-f0-9]{64}$/.test(token))await run(env,'DELETE FROM admin_sessions WHERE token_hash=?',await digest(token));
  return json({ok:true},200,{'set-cookie':cookie('',0)});
 }
 const verifier=config(env);if(!verifier)fail(503,'관리자 로그인 설정을 준비하고 있습니다.');
 const ipHash=await digest(req.headers.get('cf-connecting-ip')||'local');
 await rate(env,'admin-login:'+ipHash,5,900);
 const body=await req.json();
 if(typeof body.password!=='string'||!body.password.length||body.password.length>256)fail(401,'비밀번호가 올바르지 않습니다.');
 const actual=await createAdminPasswordHash(body.password,verifier.split('$')[2]);
 let mismatch=0;for(let i=0;i<verifier.length;i++)mismatch|=verifier.charCodeAt(i)^actual.charCodeAt(i);
 if(mismatch)fail(401,'비밀번호가 올바르지 않습니다.');
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),at=now(),oldToken=tokenFrom(req);
 await env.DB.batch([
  query(env,'DELETE FROM admin_sessions WHERE expires<=? OR credential_version!=?',at,await digest(verifier)),
  query(env,'DELETE FROM admin_sessions WHERE token_hash=?',await digest(oldToken)),
  query(env,'INSERT INTO admin_sessions(token_hash,credential_version,created,expires) VALUES(?,?,?,?)',await digest(token),await digest(verifier),at,at+SESSION_SECONDS),
  query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',id(),'admin-console','console_login','dashboard',at)
 ]);
 return json({authenticated:true,expires:at+SESSION_SECONDS},200,{'set-cookie':cookie(token,SESSION_SECONDS)});
}
