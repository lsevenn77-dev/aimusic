import * as AifectMessages from '../shared/system-messages.js';
import {PREMIUM} from '../shared/site-info.js';
import {fail,json,now} from './db.js';

const ROOT='/api/payments/toss-test',COOKIE='__Host-aifect_toss_test';
const FLOW='billing_auth_preview',ORDER_SECONDS=1200,COOKIE_SECONDS=1800,MAX_BODY=4096;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const ready=env=>env.TOSS_TEST_CHECKOUT_ENABLED==='true'&&/^test_ck_[A-Za-z0-9_-]{1,200}$/.test(env.TOSS_TEST_CLIENT_KEY||'')&&typeof env.TOSS_TEST_MID==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(env.TOSS_TEST_MID)&&typeof env.AUTH_PEPPER==='string'&&env.AUTH_PEPPER.length>=16;
const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function unbase64url(value){
 if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value)||value.length%4===1)throw new Error('Invalid token');
 const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
 if(base64url(bytes)!==value)throw new Error('Invalid token');
 return bytes;
}
async function signingKey(env){
 const master=await crypto.subtle.importKey('raw',encoder.encode(env.AUTH_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const derived=await crypto.subtle.sign('HMAC',master,encoder.encode('AIFECT:TOSS-TEST:BILLING-AUTH-PREVIEW:SIGNING:v1'));
 return crypto.subtle.importKey('raw',derived,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const sign=async(key,value)=>base64url(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
const binding=(key,session)=>sign(key,'AIFECT:TOSS-TEST:BILLING-AUTH-PREVIEW:BROWSER:v1:'+session);
function sessionCookie(req){
 const matches=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(matches.length!==1)return null;
 const value=matches[0].slice(COOKIE.length+1);
 return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
async function boundedText(req){
 if(Number(req.headers.get('content-length')||0)>MAX_BODY)fail(413,AifectMessages.requestTooLarge);
 if(!req.body)return '';
 const reader=req.body.getReader(),chunks=[];let length=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>MAX_BODY){await reader.cancel().catch(()=>{});fail(413,AifectMessages.requestTooLarge);}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return decoder.decode(bytes);
}
async function mutationBody(req){
 const origin=new URL(req.url).origin,site=req.headers.get('sec-fetch-site');
 if(req.headers.get('origin')!==origin||(site&&site!=='same-origin'))fail(403,'사이트에서 다시 요청해 주세요.');
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))fail(415,'JSON 요청이 필요합니다.');
 let body;
 try{body=JSON.parse(await boundedText(req));}catch(e){if(e.status)throw e;fail(400,'요청 내용을 확인해 주세요.');}
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'요청 내용을 확인해 주세요.');
 return body;
}
function orderSummary(order){return {id:order.orderId,amount:order.amount,currency:order.currency,interval:order.interval,expires_at:order.expiresAt};}
async function createOrder(req,env,body){
 if(body.consent!==true||Object.keys(body).some(k=>k!=='consent'))fail(400,'Premium 월 이용료와 심사용 카드 등록 화면 안내를 확인해 주세요.');
 const key=await signingKey(env),session=sessionCookie(req)||base64url(crypto.getRandomValues(new Uint8Array(32))),created=now();
 const order={v:1,test_only:true,flow:FLOW,merchantId:env.TOSS_TEST_MID,orderId:'abt_'+crypto.randomUUID().replaceAll('-',''),amount:PREMIUM.price,currency:'KRW',interval:'month',customerKey:'abp_'+crypto.randomUUID().replaceAll('-',''),issuedAt:created,expiresAt:created+ORDER_SECONDS,origin:new URL(req.url).origin,binding:await binding(key,session)};
 const payload=base64url(encoder.encode(JSON.stringify(order))),order_token=payload+'.'+await sign(key,'AIFECT:TOSS-TEST:BILLING-AUTH-PREVIEW:ORDER:v1:'+payload);
 const payment={clientKey:env.TOSS_TEST_CLIENT_KEY,customerKey:order.customerKey,method:'CARD',successUrl:order.origin+'/checkout/toss/success',failUrl:order.origin+'/checkout/toss/fail'};
 return json({test_only:true,flow:FLOW,order:orderSummary(order),order_token,payment},201,{'set-cookie':`${COOKIE}=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_SECONDS}`,'referrer-policy':'no-referrer'});
}
async function boundOrder(req,env,body){
 const session=sessionCookie(req);
 if(!session||typeof body.order_token!=='string'||body.order_token.length>3000)fail(403,'심사용 카드 등록 화면을 다시 열어 주세요.');
 let order,key;
 try{
  const parts=body.order_token.split('.');if(parts.length!==2)throw new Error('Invalid token');
  key=await signingKey(env);
  if(!await crypto.subtle.verify('HMAC',key,unbase64url(parts[1]),encoder.encode('AIFECT:TOSS-TEST:BILLING-AUTH-PREVIEW:ORDER:v1:'+parts[0])))throw new Error('Invalid token');
  order=JSON.parse(decoder.decode(unbase64url(parts[0])));
 }catch{fail(403,'심사용 카드 등록 화면을 다시 열어 주세요.');}
 const at=now();
 if(!order||order.v!==1||order.test_only!==true||order.flow!==FLOW||order.merchantId!==env.TOSS_TEST_MID||order.origin!==new URL(req.url).origin||order.binding!==await binding(key,session)||!Number.isSafeInteger(order.issuedAt)||!Number.isSafeInteger(order.expiresAt)||order.issuedAt>at||order.expiresAt<=at||order.expiresAt-order.issuedAt!==ORDER_SECONDS||order.amount!==PREMIUM.price||order.currency!=='KRW'||order.interval!=='month'||!/^abt_[a-f0-9]{32}$/.test(order.orderId)||!/^abp_[a-f0-9]{32}$/.test(order.customerKey))fail(403,'심사용 요청이 만료되었거나 일치하지 않습니다.');
 if(body.customerKey!==order.customerKey||typeof body.authKey!=='string'||!body.authKey||body.authKey.length>200||/[\u0000-\u0020\u007f]/.test(body.authKey)||Object.keys(body).some(k=>!['order_token','customerKey','authKey'].includes(k)))fail(400,'카드 등록 화면의 반환 요청이 일치하지 않습니다.');
 return order;
}
async function authReturn(req,env,body){
 const order=await boundOrder(req,env,body);
 // SCREEN PREVIEW ONLY: this confirms our signed same-browser return state.
 // authKey is opaque, unverified and discarded. There is deliberately no Toss
 // secret, provider API, billing-key issuance/storage, charge, database access
 // or entitlement path here. Even a plausible forged authKey never proves card
 // registration; provider_verified must remain false on every accepted return.
 return json({test_only:true,flow:FLOW,status:'AUTH_RETURNED',provider_verified:false,entitlements_granted:false,order:orderSummary(order)},200,{'referrer-policy':'no-referrer'});
}
export async function tossTestCheckoutRoute(req,env,path=new URL(req.url).pathname){
 if(path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
 try{
  if(path===ROOT+'/config'){
   if(req.method!=='GET')fail(405,'GET 요청만 지원합니다.');
   return json({available:ready(env),test_only:true,flow:FLOW,price:PREMIUM.price,currency:'KRW',interval:'month',client_key:ready(env)?env.TOSS_TEST_CLIENT_KEY:null});
  }
  if(![ROOT+'/orders',ROOT+'/auth-return'].includes(path))fail(404,AifectMessages.notFound);
  if(req.method!=='POST')fail(405,'POST 요청만 지원합니다.');
  if(!ready(env))fail(503,'심사용 카드 등록 화면 연결을 준비하고 있습니다.');
  const body=await mutationBody(req);
  return path===ROOT+'/orders'?await createOrder(req,env,body):await authReturn(req,env,body);
 }catch(e){return json({error:e.status?e.message:'심사용 요청을 처리하지 못했습니다.'},e.status||503);}
}
