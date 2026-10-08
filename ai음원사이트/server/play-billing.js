import {SignJWT,importPKCS8,createRemoteJWKSet,jwtVerify} from 'jose';
import {one,query,run,now,fail,json,rate} from './db.js';
import {requireUser,hash} from './auth.js';
import {PLAY_PRODUCTS,PLAY_PACKAGE,playProduct} from '../shared/play-products.js';
import {APP_STORE_FEE_BP} from '../shared/gifts.js';
import {includedKoreanVat} from '../shared/gifts.js';

let authCache;
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const configured=env=>env.PLAY_BILLING_ENABLED==='true'&&!!env.PLAY_SERVICE_ACCOUNT&&!!env.PLAY_NOTIFICATION_AUDIENCE&&!!env.PLAY_NOTIFICATION_EMAIL;
async function google(env,path,method='GET',body){
 if(!env.PLAY_SERVICE_ACCOUNT)fail(503,'Google Play 결제 연결을 준비하고 있어요.');
 if(authCache?.source!==env.PLAY_SERVICE_ACCOUNT||authCache.expires<now()+90){
  const account=JSON.parse(env.PLAY_SERVICE_ACCOUNT);
  const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/androidpublisher'}).setProtectedHeader({alg:'RS256'})
   .setIssuer(account.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h')
   .sign(await importPKCS8(account.private_key,'RS256'));
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)fail(503,'결제 확인 연결이 지연되고 있어요. 구매 복원으로 다시 확인해주세요.');
  const data=await r.json();if(!data.access_token)fail(503,'결제 확인을 다시 시도해주세요.');
  authCache={source:env.PLAY_SERVICE_ACCOUNT,token:data.access_token,expires:now()+Number(data.expires_in||3600)};
 }
 const r=await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/${path}`,{
  method,headers:{authorization:`Bearer ${authCache.token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 if(!r.ok){if([400,404,410].includes(r.status))fail(400,'유효한 Google Play 구매를 확인하지 못했어요.');fail(503,'결제 확인이 지연되고 있어요. 구매 복원으로 다시 확인해주세요.');}
 return r.status===204?{}:await r.text().then(t=>t?JSON.parse(t):{});
}
export async function playAccountId(userId){return hash('aifect-play:'+userId);}
export function verifiedSubscription(data,product,accountId){
 if(data.externalAccountIdentifiers?.obfuscatedExternalAccountId!==accountId)fail(403,'이 구매는 다른 AIFECT 계정에 연결되어 있어요.');
 const item=data.lineItems?.find(i=>i.productId===product.id&&i.offerDetails?.basePlanId===product.basePlan);
 if(!item)fail(400,'구독 상품을 확인해주세요.');
 const expires=Math.floor(Date.parse(item.expiryTime)/1000);
 if(!Number.isSafeInteger(expires))fail(400,'구독 기간을 확인해주세요.');
 const entitled=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(data.subscriptionState)&&expires>now();
 return {expiry:entitled?expires:0,state:data.subscriptionState,order:item.latestSuccessfulOrderId||data.latestOrderId||'',ack:data.acknowledgementState==='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'};
}
export function verifiedGold(data,product,accountId){
 if(data.obfuscatedExternalAccountId!==accountId)fail(403,'이 구매는 다른 AIFECT 계정에 연결되어 있어요.');
 const item=data.productLineItem?.find(i=>i.productId===product.id);
 if(!item||Number(item.productOfferDetails?.quantity)!==1)fail(400,'골드 상품 수량을 확인해주세요.');
 if(data.purchaseStateContext?.purchaseState!=='PURCHASED')fail(409,'결제 완료 후 골드가 지급돼요.');
 if(Number(item.productOfferDetails?.refundableQuantity)!==1)fail(409,'환불된 구매입니다.');
 if(!data.orderId)fail(400,'구매 내역을 확인해주세요.');
 return {order:data.orderId,consumed:item.productOfferDetails?.consumptionState==='CONSUMPTION_STATE_CONSUMED',test:data.testPurchaseContext!=null};
}
async function applySubscription(env,user,token,product,data){
 const verified=verifiedSubscription(data,product,await playAccountId(user.id));
 const tokenHash=await hash(token),at=now();
 const existing=await one(env,'SELECT * FROM play_purchases WHERE token_hash=?',tokenHash);
 if(existing&&existing.user_id!==user.id)fail(403,'다른 계정에서 처리한 구매입니다.');
 if(existing?.state==='refunded')fail(409,'환불된 구매입니다.');
 const latest=await one(env,'SELECT MAX(last_granted) amount,MAX(baseline_until) baseline FROM play_purchases WHERE user_id=? AND kind=?',user.id,'subs');
 const fresh=await one(env,'SELECT premium_until FROM users WHERE id=?',user.id);
 const baseline=Math.max(Number(latest?.baseline||0),Number(fresh.premium_until)!==Number(latest?.amount||0)?Number(fresh.premium_until||0):0);
 await env.DB.batch([
  query(env,`INSERT INTO play_purchases(token_hash,purchase_token,user_id,product_id,kind,state,expiry,baseline_until,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(token_hash) DO UPDATE SET state=excluded.state,expiry=excluded.expiry,baseline_until=MAX(play_purchases.baseline_until,excluded.baseline_until),updated=excluded.updated WHERE play_purchases.state!='refunded'`,tokenHash,token,user.id,product.id,'subs',verified.state,verified.expiry,baseline,at,at),
  query(env,`UPDATE users SET premium_until=MAX(?,COALESCE((SELECT MAX(expiry) FROM play_purchases WHERE user_id=? AND kind='subs'),0),COALESCE((SELECT MAX(p.entitlement_end) FROM billing_payments p JOIN billing_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=?),0)) WHERE id=?`,baseline,user.id,user.id,user.id),
  query(env,"UPDATE play_purchases SET last_granted=(SELECT premium_until FROM users WHERE id=?) WHERE user_id=? AND kind='subs'",user.id,user.id),
 ]);
 if(!verified.ack&&verified.expiry)await google(env,`purchases/subscriptions/${encodeURIComponent(product.id)}/tokens/${encodeURIComponent(token)}:acknowledge`,'POST',{});
 return {ok:true,kind:'subs',premium_until:(await one(env,'SELECT premium_until FROM users WHERE id=?',user.id)).premium_until};
}
async function applyGold(env,user,token,product,data){
 const v=verifiedGold(data,product,await playAccountId(user.id)),tokenHash=await hash(token),at=now();
 const existing=await one(env,'SELECT * FROM play_purchases WHERE token_hash=?',tokenHash);
 if(existing&&existing.user_id!==user.id)fail(403,'다른 계정에서 처리한 구매입니다.');
 if(existing?.state==='refunded')fail(409,'환불된 구매입니다.');
 if(v.consumed&&!existing)fail(409,'이미 사용 처리된 구매입니다. 고객센터로 문의해주세요.');
 const purchaseId='play_'+tokenHash;
 // Only Google's verified receipt can identify a test payment. Test gold stays
 // usable, but has no paid value to distribute to creators or the platform.
 const price=v.test?0:product.price,fee=Math.ceil(price*APP_STORE_FEE_BP/10000);
 if(v.test&&existing){
  const lot=await one(env,'SELECT used,price_krw FROM gold_purchases WHERE id=?',purchaseId);
  if(lot?.used>0&&lot.price_krw>0)fail(409,'이미 사용한 테스트 결제의 정산을 운영자가 확인해야 해요.');
 }
 await env.DB.batch([
  query(env,"INSERT OR IGNORE INTO play_purchases(token_hash,purchase_token,user_id,product_id,kind,state,created,updated) VALUES(?,?,?,?,?,'paid',?,?)",tokenHash,token,user.id,product.id,'inapp',at,at),
  query(env,"INSERT OR IGNORE INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,created,paid_at,provider_ref) VALUES(?,?,'google_play',?,?,?,?,'paid',?,?,?)",purchaseId,user.id,product.gold,price,fee,includedKoreanVat(price),at,at,v.order),
  ...(v.test?[query(env,"UPDATE gold_purchases SET price_krw=0,fee_krw=0,tax_krw=0 WHERE id=? AND used=0",purchaseId)]:[]),
 ]);
 if(!v.consumed)await google(env,`purchases/products/${encodeURIComponent(product.id)}/tokens/${encodeURIComponent(token)}:consume`,'POST');
 return {ok:true,kind:'inapp',gold:product.gold};
}
export async function verifyPlay(env,user,token,product){
 if(product.type==='subs')return applySubscription(env,user,token,product,await google(env,`purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`));
 return applyGold(env,user,token,product,await google(env,`purchases/productsv2/tokens/${encodeURIComponent(token)}`));
}
export async function playBillingRoute(req,env,path,user){
 if(!path.startsWith('/api/play/'))return null;
 requireUser(user);
 if(path==='/api/play/catalog'&&req.method==='GET')return json({available:configured(env),products:PLAY_PRODUCTS,account_id:await playAccountId(user.id)});
 if(path!=='/api/play/verify'||req.method!=='POST')fail(404,'결제 요청을 찾을 수 없어요.');
 if(!configured(env))fail(503,'Google Play 결제 연결을 준비하고 있어요.');
 await rate(env,'play-verify:'+user.id,60,3600);
 const b=await req.json(),product=playProduct(b.product_id);
 if(!product||typeof b.purchase_token!=='string'||b.purchase_token.length<10||b.purchase_token.length>4096)fail(400,'구매 정보를 확인해주세요.');
 if(b.account_id!==user.id)fail(409,'구매한 AIFECT 계정으로 로그인해주세요.');
 return json(await verifyPlay(env,user,b.purchase_token,product));
}
export async function playWebhook(req,env){
 if(req.method!=='POST')fail(405,'허용되지 않는 요청입니다.');
 if(!env.PLAY_NOTIFICATION_AUDIENCE||!env.PLAY_NOTIFICATION_EMAIL)fail(503,'알림 연결을 준비하고 있어요.');
 const bearer=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!bearer)fail(401,'인증이 필요합니다.');
 let payload;try{payload=(await jwtVerify(bearer,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.PLAY_NOTIFICATION_AUDIENCE})).payload;}catch{fail(401,'인증이 필요합니다.');}
 if(payload.email!==env.PLAY_NOTIFICATION_EMAIL||payload.email_verified!==true)fail(403,'인증을 확인해주세요.');
 const text=await req.text();if(text.length>32768)fail(413,'요청이 너무 큽니다.');
 let notification;try{const envelope=JSON.parse(text);notification=JSON.parse(atob(envelope.message.data));}catch{fail(400,'알림 내용을 확인해주세요.');}
 if(notification.testNotification)return json({ok:true});
 if(notification.packageName!==PLAY_PACKAGE)fail(400,'앱을 확인해주세요.');
 const event=notification.subscriptionNotification||notification.oneTimeProductNotification||notification.voidedPurchaseNotification;
 if(!event?.purchaseToken)return json({ok:true});
 const saved=await one(env,'SELECT * FROM play_purchases WHERE token_hash=?',await hash(event.purchaseToken));
 if(!saved)return json({ok:true}); // Client restore binds an initial purchase; callbacks never guess an owner.
 if(notification.voidedPurchaseNotification){
  await run(env,"UPDATE play_purchases SET state='refunded',expiry=0,updated=? WHERE token_hash=?",now(),saved.token_hash);
  if(saved.kind==='subs')await env.DB.batch([
   query(env,`UPDATE users SET premium_until=MAX(?,COALESCE((SELECT MAX(expiry) FROM play_purchases WHERE user_id=? AND kind='subs'),0),COALESCE((SELECT MAX(p.entitlement_end) FROM billing_payments p JOIN billing_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=?),0)) WHERE id=?`,saved.baseline_until,saved.user_id,saved.user_id,saved.user_id),
   query(env,"UPDATE play_purchases SET last_granted=(SELECT premium_until FROM users WHERE id=?) WHERE user_id=? AND kind='subs'",saved.user_id,saved.user_id),
  ]);
  return json({ok:true});
 }
 const product=playProduct(saved.product_id),user=await one(env,'SELECT * FROM users WHERE id=?',saved.user_id);
 if(product&&user){try{await verifyPlay(env,user,saved.purchase_token,product);}catch(e){if(![400,409].includes(e.status))throw e;}}
 return json({ok:true});
}
