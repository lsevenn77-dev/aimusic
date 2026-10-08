import {Buffer} from 'node:buffer';
import {Environment} from '@apple/app-store-server-library/dist/models/Environment.js';
import {APPLE_ROOT_G3} from './apple-root.js';
import {one,query,run,now,id,json,fail,rate} from './db.js';
import {requireUser} from './auth.js';
import {APP_STORE_FEE_BP} from '../shared/gifts.js';
import {includedKoreanVat} from '../shared/gifts.js';

export const APPLE_PRODUCTS=Object.freeze({
 'kr.co.aifect.app.premium.monthly':{kind:'subscription',price:5900},
 ...Object.fromEntries([500,1000,5000,10000].map(gold=>['kr.co.aifect.app.gold.'+gold,{kind:'gold',gold,price:gold*10}]))
});
const bundle='kr.co.aifect.app',appleId=6819654764;
export async function verifyApple(signed,notification=false){
 if(typeof signed!=='string'||signed.length>30000)fail(400,'Apple 구매 내역을 확인해주세요.');
 const {SignedDataVerifier,VerificationStatus}=await import('@apple/app-store-server-library/dist/jws_verification.js');
 // Sandbox notifications omit appAppleId. Check Sandbox first so Apple's
 // production-only app ID check cannot mask INVALID_ENVIRONMENT.
 const verifiers=[Environment.SANDBOX,Environment.PRODUCTION].map(environment=>new SignedDataVerifier([Buffer.from(APPLE_ROOT_G3,'base64')],true,environment,bundle,appleId));
 for(const verifier of verifiers){
  try{return await verifier[notification?'verifyAndDecodeNotification':'verifyAndDecodeTransaction'](signed);}
  catch(e){
   if(e.status===VerificationStatus.INVALID_ENVIRONMENT)continue;
   if(e.status===VerificationStatus.RETRYABLE_VERIFICATION_FAILURE)fail(503,'Apple 구매 검증 연결이 지연되고 있습니다. 잠시 후 복원해주세요.');
   break;
  }
 }
 fail(400,'Apple 서명을 검증하지 못했습니다.');
}

// Called exclusively with a verified Apple payload, never request JSON.
export async function fulfillApple(env,t,requestUser=null,{refundReversed=false}={}){
 const product=APPLE_PRODUCTS[t.productId];
 if(!product||!['Production','Sandbox'].includes(t.environment)||t.bundleId!==bundle||!/^\d{1,40}$/.test(t.transactionId||'')||!/^\d{1,40}$/.test(t.originalTransactionId||'')||!Number.isSafeInteger(t.signedDate)||!Number.isSafeInteger(t.purchaseDate)||t.signedDate>Date.now()+60000||t.purchaseDate>t.signedDate+60000||t.inAppOwnershipType!=='PURCHASED'||(t.quantity??1)!==1)fail(400,'지원하지 않는 Apple 구매 내역입니다.');
 if(product.kind==='subscription'&&(!Number.isSafeInteger(t.expiresDate)||t.type!=='Auto-Renewable Subscription'))fail(400,'구독 기간을 확인하지 못했습니다.');
 if(product.kind==='gold'&&t.type!=='Consumable')fail(400,'골드 상품 유형이 올바르지 않습니다.');
 const account=t.appAccountToken?await one(env,'SELECT user_id FROM apple_accounts WHERE token=?',t.appAccountToken.toLowerCase()):null;
 if(!account)fail(409,'이 구매를 연결한 AIFECT 계정으로 로그인해주세요.');
 if(requestUser&&account.user_id!==requestUser.id)fail(409,'다른 AIFECT 계정에 연결된 구매입니다. 구매한 계정으로 로그인해주세요.');
 const original=await one(env,'SELECT user_id FROM apple_transactions WHERE environment=? AND original_id=? LIMIT 1',t.environment,t.originalTransactionId);
 if(original&&original.user_id!==account.user_id)fail(409,'이미 다른 계정에 연결된 구매입니다.');
 const key='apple:'+t.environment+':'+t.transactionId,uid=account.user_id,time=now(),sandbox=t.environment==='Sandbox';
 if(t.revocationDate!==undefined&&(!Number.isSafeInteger(t.revocationDate)||t.revocationDate<=0||t.revocationDate>t.signedDate+60000))fail(400,'환불 일자가 올바르지 않습니다.');
 const expires=Math.floor((t.expiresDate||0)/1000),revoked=Math.floor((t.revocationDate||0)/1000);
 const existing=await one(env,'SELECT user_id,product_id FROM apple_transactions WHERE id=?',key);
 if(existing&&(existing.user_id!==uid||existing.product_id!==t.productId))fail(409,'기존 구매 정보와 일치하지 않습니다.');
 const statements=[];
 if(revoked&&!sandbox&&product.kind==='gold')statements.push(query(env,`UPDATE apple_transactions SET refund_review=CASE WHEN COALESCE((SELECT used FROM gold_purchases WHERE id=?),0)>0 THEN 1 ELSE 0 END,refunded_used=COALESCE((SELECT used FROM gold_purchases WHERE id=?),0) WHERE id=? AND revoked=0 AND signed_date<=?`,key,key,key,t.signedDate));
 if(refundReversed&&!revoked&&!sandbox&&product.kind==='gold')statements.push(query(env,`UPDATE gold_purchases SET used=(SELECT refunded_used FROM apple_transactions WHERE id=?) WHERE id=? AND EXISTS(SELECT 1 FROM apple_transactions WHERE id=? AND revoked>0 AND signed_date<?)`,key,key,key,t.signedDate));
 statements.push(query(env,`INSERT INTO apple_transactions(id,environment,transaction_id,original_id,user_id,product_id,purchased,expires,revoked,signed_date,created)
 VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires,revoked=CASE WHEN ?=1 THEN excluded.revoked ELSE MAX(apple_transactions.revoked,excluded.revoked) END,refund_review=CASE WHEN ?=1 THEN 0 ELSE apple_transactions.refund_review END,signed_date=excluded.signed_date WHERE excluded.signed_date>=apple_transactions.signed_date`,key,t.environment,t.transactionId,t.originalTransactionId,uid,t.productId,Math.floor(t.purchaseDate/1000),expires,revoked,t.signedDate,time,refundReversed?1:0,refundReversed?1:0));
 if(!sandbox&&product.kind==='gold'){
  // StoreKit supplies milliunits of currency. Korea is the enabled storefront.
  if(t.currency!=='KRW'||!Number.isSafeInteger(t.price)||t.price<=0)fail(409,'결제 통화 및 금액을 확인하지 못했습니다. 고객 지원에 문의해주세요.');
  const amount=Math.round(t.price/1000);
  statements.push(query(env,`INSERT INTO gold_purchases(id,user_id,channel,gold,used,price_krw,fee_krw,tax_krw,status,provider_ref,created,paid_at)
 SELECT ?,?,'apple',?,0,?,?,?,'paid',?,?,? WHERE EXISTS(SELECT 1 FROM apple_transactions WHERE id=? AND revoked=0)
 ON CONFLICT(channel,provider_ref) DO NOTHING`,key,uid,product.gold,amount,Math.round((amount-includedKoreanVat(amount))*APP_STORE_FEE_BP/10000),includedKoreanVat(amount),t.transactionId,time,Math.floor(t.purchaseDate/1000),key));
  // Preserve the paid lot and its spent allocations for audit; make the remainder unavailable.
  statements.push(query(env,`UPDATE gold_purchases SET used=gold WHERE id=? AND EXISTS(SELECT 1 FROM apple_transactions WHERE id=? AND revoked>0)`,key,key));
 }
 if(!sandbox&&product.kind==='subscription')statements.push(query(env,`UPDATE users SET apple_premium_until=COALESCE((SELECT MAX(expires) FROM apple_transactions WHERE user_id=? AND environment='Production' AND product_id='kr.co.aifect.app.premium.monthly' AND revoked=0),0) WHERE id=?`,uid,uid));
 await env.DB.batch(statements);
 return {ok:true,sandbox,product_id:t.productId,transaction_id:t.transactionId};
}
export async function appleNotification(req,env){
 if(req.method!=='POST')fail(405,'POST 요청이 필요합니다.');
 const reader=req.body?.getReader();if(!reader)fail(400,'요청 본문이 없습니다.');
 const chunks=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>60000){await reader.cancel();fail(413,'요청이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const text=new TextDecoder().decode(bytes);
 let body;try{body=JSON.parse(text);}catch{fail(400,'요청 형식을 확인해주세요.');}
 const n=await verifyApple(body.signedPayload,true);
 if(n.notificationType==='TEST')return json({ok:true});
 if(n.data?.signedTransactionInfo){
  const t=await verifyApple(n.data.signedTransactionInfo);
  if(t.environment!==n.data.environment)fail(400,'결제 환경이 일치하지 않습니다.');
  await fulfillApple(env,t,null,{refundReversed:n.notificationType==='REFUND_REVERSED'});
 }
 return json({ok:true});
}
export async function applePaymentRoute(req,env,path,user){
 if(!path.startsWith('/api/apple/'))return null;
 requireUser(user);
 if(path==='/api/apple/account'&&req.method==='POST'){
  await run(env,'INSERT INTO apple_accounts(user_id,token,created) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING',user.id,id().toLowerCase(),now());
  const account=await one(env,'SELECT token FROM apple_accounts WHERE user_id=?',user.id);
  return json({app_account_token:account.token,products:Object.keys(APPLE_PRODUCTS)});
 }
 if(path==='/api/apple/transactions'&&req.method==='POST'){
  await rate(env,'apple-verify:'+user.id,60,300);
  const body=await req.json(),t=await verifyApple(body.signed_transaction);
  return json(await fulfillApple(env,t,user));
 }
 return null;
}
