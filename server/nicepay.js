import {fail} from './db.js';

const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export function equalSecret(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
export const niceConfigured=env=>!!(env.NICEPAY_CLIENT_ID&&env.NICEPAY_SECRET_KEY&&env.BILLING_ENCRYPTION_KEY&&env.BILLING_WORKER_TOKEN);
export const checkoutEnabled=env=>niceConfigured(env)&&env.BILLING_CHECKOUT_ENABLED==='true';
export function cardCredentials(input){
 const card=input||{},checks={cardNo:/^\d{14,16}$/,expYear:/^\d{2}$/,expMonth:/^(0[1-9]|1[0-2])$/,idNo:/^(\d{6}|\d{10})$/,cardPw:/^\d{2}$/};
 for(const [key,pattern] of Object.entries(checks))if(typeof card[key]!=='string'||!pattern.test(card[key]))fail(400,'카드번호, 유효기간, 생년월일 또는 사업자번호, 비밀번호 앞 2자리를 확인해주세요.');
 const expiry=new Date(Date.UTC(2000+Number(card.expYear),Number(card.expMonth),1));
 if(expiry.getTime()<=Date.now())fail(400,'카드 유효기간을 확인해주세요.');
 return Object.fromEntries(Object.keys(checks).map(key=>[key,card[key]]));
}
// NICE's documented A2 wire format. Raw card data is never persisted.
export async function encryptCard(card,secret){
 if(encoder.encode(secret).length!==32)throw new Error('Invalid NICE encryption configuration');
 const plain=['cardNo','expYear','expMonth','idNo','cardPw'].map(k=>`${k}=${card[k]}`).join('&');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),'AES-CBC',false,['encrypt']);
 return hex(await crypto.subtle.encrypt({name:'AES-CBC',iv:encoder.encode(secret.slice(0,16))},key,encoder.encode(plain)));
}
export async function sealBillingKey(env,bid,owner){
 const raw=Uint8Array.from(atob(env.BILLING_ENCRYPTION_KEY),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(owner)},key,encoder.encode(bid)));
 return btoa(String.fromCharCode(...iv,...data));
}
export async function openBillingKey(env,sealed,owner){
 const raw=Uint8Array.from(atob(env.BILLING_ENCRYPTION_KEY),c=>c.charCodeAt(0)),data=Uint8Array.from(atob(sealed),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:encoder.encode(owner)},key,data.slice(12)));
}
export async function niceRequest(env,path,body){
 if(!env.NICEPAY_CLIENT_ID||!env.NICEPAY_SECRET_KEY)fail(503,'결제 서비스를 준비 중입니다.');
 const origin=env.NICEPAY_SANDBOX==='true'?'https://sandbox-api.nicepay.co.kr':'https://api.nicepay.co.kr';
 if(!path.startsWith('/v1/')||path.includes('..'))throw new Error('Invalid NICE endpoint');
 try{
  const r=await (env.NICEPAY_HTTP||fetch)(origin+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Basic '+btoa(env.NICEPAY_CLIENT_ID+':'+env.NICEPAY_SECRET_KEY),'Content-Type':'application/json;charset=utf-8','User-Agent':'AIFECT-Billing/1.0'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw new Error('NICE unavailable');
  return await r.json();
 }catch{fail(503,'결제 결과를 확인 중입니다. 다시 결제하지 말고 잠시 후 구독 내역을 확인해주세요.');}
}
export async function issueBillingKey(env,card,orderId){
 const ediDate=new Date().toISOString(),encData=await encryptCard(card,env.NICEPAY_SECRET_KEY);
 const data=await niceRequest(env,'/v1/subscribe/regist',{orderId,encData,encMode:'A2',ediDate,signData:await digest(orderId+ediDate+env.NICEPAY_SECRET_KEY)});
 if(data.resultCode!=='0000'||typeof data.bid!=='string'||data.orderId!==orderId)fail(400,'카드를 등록하지 못했습니다. 입력 정보와 카드의 정기결제 가능 여부를 확인해주세요.');
 return {bid:data.bid,cardName:String(data.cardName||'등록한 카드').slice(0,40)};
}
export const orderDate=seconds=>new Date((seconds+9*3600)*1000).toISOString().slice(0,10).replaceAll('-','');
export const findPayment=(env,payment)=>niceRequest(env,`/v1/payments/find/${encodeURIComponent(payment.id)}?orderDate=${orderDate(payment.submitted_at||payment.created)}`);
export async function expireBillingKey(env,bid,orderId){
 const ediDate=new Date().toISOString();
 const data=await niceRequest(env,`/v1/subscribe/${encodeURIComponent(bid)}/expire`,{orderId,ediDate,signData:await digest(orderId+bid+ediDate+env.NICEPAY_SECRET_KEY)});
 return data.resultCode==='0000'&&data.bid===bid;
}
export async function chargeBillingKey(env,bid,payment){
 const ediDate=new Date().toISOString();
 return niceRequest(env,`/v1/subscribe/${encodeURIComponent(bid)}/payments`,{orderId:payment.id,amount:payment.amount,goodsName:'AIFECT Premium',cardQuota:0,useShopInterest:false,taxFreeAmt:0,mallReserved:payment.subscription_id,ediDate,signData:await digest(payment.id+bid+ediDate+env.NICEPAY_SECRET_KEY)});
}
export async function verifyNiceSignature(env,data){
 return !!env.NICEPAY_SECRET_KEY&&typeof data?.signature==='string'&&typeof data.tid==='string'&&typeof data.ediDate==='string'&&Number.isSafeInteger(data.amount)&&equalSecret(data.signature.toLowerCase(),await digest(data.tid+data.amount+data.ediDate+env.NICEPAY_SECRET_KEY));
}
export function nextBillingMonth(seconds,anchorDay){
 const local=new Date((seconds+9*3600)*1000),year=local.getUTCFullYear(),month=local.getUTCMonth()+1;
 const day=Math.min(anchorDay||local.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
 return Math.floor(Date.UTC(year,month,day,local.getUTCHours(),local.getUTCMinutes(),local.getUTCSeconds())/1000)-9*3600;
}
