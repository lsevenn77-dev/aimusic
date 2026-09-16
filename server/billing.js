import {one,rows,query,run,id,now,fail,json,rate} from './db.js';
import {PREMIUM,POLICY_VERSION} from '../shared/site-info.js';
import {checkoutEnabled,niceConfigured,niceRequest,cardCredentials,issueBillingKey,expireBillingKey,sealBillingKey,openBillingKey,findPayment,chargeBillingKey,verifyNiceSignature,digest,equalSecret,nextBillingMonth} from './nicepay.js';

const TERMS=['ElectronicFinancialTransactions','CollectPersonalInfo','SharingPersonalInformation'];
const ACK=()=>new Response('OK',{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
const pendingSQL="('created','processing','review')";
const subscription=async(env,user)=>one(env,'SELECT * FROM billing_subscriptions WHERE user_id=?',user.id);
async function lock(env,sid){
 const token=id();return await query(env,'UPDATE billing_subscriptions SET lease_token=?,lease_until=? WHERE id=? AND lease_until<? RETURNING *',token,now()+180,sid,now()).first();
}
async function unlock(env,s){await run(env,'UPDATE billing_subscriptions SET lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?',s.id,s.lease_token);}
async function renewLock(env,s){
 const held=await query(env,'UPDATE billing_subscriptions SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>? RETURNING id',now()+180,s.id,s.lease_token,now()).first();
 if(!held)fail(409,'결제를 확인하고 있습니다. 잠시 후 구독 내역을 확인해주세요.');
}
async function releaseCard(env,s){
 const current=await one(env,'SELECT * FROM billing_subscriptions WHERE id=?',s.id);
 if(!current.bid_cipher||!['cancelled','failed'].includes(current.state)||await one(env,`SELECT id FROM billing_payments WHERE subscription_id=? AND status IN ${pendingSQL}`,s.id))return;
 await renewLock(env,s);
 const bid=await openBillingKey(env,current.bid_cipher,s.id);
 if(await expireBillingKey(env,bid,'ax'+s.id.slice(2)+'c'+current.cycle)){
  await renewLock(env,s);
  await run(env,'UPDATE billing_subscriptions SET bid_cipher=NULL,updated=? WHERE id=? AND lease_token=?',now(),s.id,s.lease_token);
 }
}
async function readBody(req){
 const text=await req.text();if(text.length>16384)fail(413,'요청이 너무 큽니다.');
 try{return JSON.parse(text);}catch{fail(400,'요청 내용을 확인해주세요.');}
}
async function workerReady(env){return Number((await one(env,"SELECT last_seen FROM billing_worker WHERE id='runner'"))?.last_seen)>now()-180;}
export async function billingStatus(env,user){
 const s=user?await subscription(env,user):null;
 const starts=now(),day=new Date((starts+9*3600)*1000).getUTCDate();
 const payments=s?await rows(env,'SELECT id,amount,status,period_start,period_end,created,refunded FROM billing_payments WHERE subscription_id=? ORDER BY cycle DESC LIMIT 24',s.id):[];
 return {checkout_available:checkoutEnabled(env)&&await workerReady(env),price:PREMIUM.price,currency:'KRW',interval:'month',starts_at:starts,first_renewal_at:nextBillingMonth(starts,day),billing_day:day,subscription:s?{state:s.state,renewing:s.state==='active'&&!s.cancel_requested,period_end:s.period_end||null,card_name:s.card_name,payment_pending:payments.some(p=>['processing','review'].includes(p.status))}:null,payments};
}
export async function billingTerms(env){
 const terms=[];
 for(const type of TERMS){
  const data=await niceRequest(env,'/v1/terms?termsType='+type);
  if(data.resultCode!=='0000'||typeof data.content!=='string'||data.content.length>60000)fail(503,'결제 약관을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  terms.push({type,title:String(data.termsTitle),content:data.content});
 }
 const body=JSON.stringify({policy:POLICY_VERSION,price:PREMIUM.price,terms}),version=await digest(body);
 await run(env,'INSERT INTO billing_terms(version,body,created) VALUES(?,?,?) ON CONFLICT(version) DO NOTHING',version,body,now());
 return {version,terms};
}
// Called only with an exclusive subscription lease. The gateway is queried
// again even after a signed webhook: signatures do not cover every status field.
export async function reconcilePayment(env,s,p){
 await renewLock(env,s);
 p=await one(env,'SELECT * FROM billing_payments WHERE id=?',p.id);
 const data=await findPayment(env,p),checked=now();
 await renewLock(env,s);
 await run(env,'UPDATE billing_payments SET last_checked=? WHERE id=?',checked,p.id);
 if(data.resultCode!=='0000')return false;
 if(data.orderId!==p.id||data.amount!==p.amount||data.currency!=='KRW'||String(data.payMethod).toLowerCase()!=='card'||typeof data.tid!=='string'||!data.tid||data.mallReserved!==s.id||(p.tid&&p.tid!==data.tid))fail(502,'결제 내역 확인이 필요합니다. 고객센터에 문의해주세요.');
 if(data.signature&&!await verifyNiceSignature(env,data))fail(502,'결제 내역 확인이 필요합니다. 고객센터에 문의해주세요.');
 if(!['paid','failed','expired','cancelled','partialCancelled'].includes(data.status))return false;
 if(!Number.isSafeInteger(data.balanceAmt)||data.balanceAmt<0||data.balanceAmt>p.amount)fail(502,'결제 금액 확인이 필요합니다.');
 // A later refund cannot be undone by a delayed older response.
 const refunded=Math.max(p.refunded,p.amount-data.balanceAmt);
 let status=data.status,end=0;
 if(['paid','cancelled','partialCancelled'].includes(status)){
  if(!Number.isFinite(Date.parse(data.paidAt)))fail(502,'결제 일시 확인이 필요합니다.');
  end=Math.floor(p.period_start+(p.period_end-p.period_start)*(p.amount-refunded)/p.amount);
  if(refunded===p.amount)end=0;
  else if(refunded)end=Math.min(end,p.entitlement_end||end,checked);
  if(refunded)status=refunded===p.amount?'cancelled':'partialCancelled';
 }else if(p.entitlement_end){return false;}
 await env.DB.batch([
  query(env,'UPDATE billing_payments SET tid=?,status=?,refunded=?,entitlement_end=?,updated=? WHERE id=?',data.tid,status,refunded,end,checked,p.id),
  query(env,`UPDATE billing_subscriptions SET state=CASE WHEN cancel_requested=1 THEN 'cancelled' WHEN ?='paid' THEN 'active' WHEN ? IN ('cancelled','partialCancelled') THEN 'cancelled' ELSE 'failed' END,cancel_requested=CASE WHEN ? IN ('cancelled','partialCancelled') THEN 1 ELSE cancel_requested END,period_start=?,period_end=?,updated=? WHERE id=? AND last_payment_id=?`,status,status,status,p.period_start,end||p.period_start,checked,s.id,p.id),
  query(env,`UPDATE users SET premium_until=MAX(?,COALESCE((SELECT MAX(entitlement_end) FROM billing_payments WHERE subscription_id=?),0)) WHERE id=?`,s.baseline_until,s.id,s.user_id)
 ]);
 return true;
}
async function makePayment(env,s){
 await renewLock(env,s);
 const cycle=s.cycle+1,start=Math.max(now(),s.period_end),end=nextBillingMonth(start,s.anchor_day),pid='af'+id().replaceAll('-','');
 await env.DB.batch([
  query(env,"INSERT INTO billing_payments(id,subscription_id,cycle,amount,status,period_start,period_end,created,updated) VALUES(?,?,?,?,'created',?,?,?,?)",pid,s.id,cycle,s.price,start,end,now(),now()),
  query(env,"UPDATE billing_subscriptions SET cycle=?,last_payment_id=?,state='pending',updated=? WHERE id=? AND lease_token=?",cycle,pid,now(),s.id,s.lease_token)
 ]);
 return one(env,'SELECT * FROM billing_payments WHERE id=?',pid);
}
async function submitPayment(env,s,p){
 await renewLock(env,s);
 const fresh=await one(env,'SELECT cancel_requested FROM billing_subscriptions WHERE id=?',s.id);
 if(fresh.cancel_requested){await run(env,"UPDATE billing_payments SET status='failed',updated=? WHERE id=? AND status='created'",now(),p.id);return;}
 // Once marked processing, never automatically submit this order again.
 // Ambiguous outcomes are looked up, so a timeout cannot create a second charge.
 const claimed=await query(env,"UPDATE billing_payments SET status='processing',submitted_at=?,updated=? WHERE id=? AND status='created' RETURNING *",now(),now(),p.id).first();
 if(!claimed)return;
 try{
  const bid=await openBillingKey(env,s.bid_cipher,s.id);
  await renewLock(env,s);
  const response=await chargeBillingKey(env,bid,claimed);
  if(response.resultCode!=='0000'){
   if(await reconcilePayment(env,s,claimed))return;
   await run(env,"UPDATE billing_payments SET status='review',updated=? WHERE id=? AND status='processing'",now(),p.id);
   return;
  }
  await reconcilePayment(env,s,claimed);
 }catch(e){
  // Never log gateway payloads, card data, or billing keys.
  await run(env,"UPDATE billing_payments SET status='review',updated=? WHERE id=? AND status='processing'",now(),p.id);
  if(e.status&&e.status!==503)throw e;
 }
}
async function startSubscription(req,env,user){
 if(!checkoutEnabled(env)||!await workerReady(env))fail(503,'카드 정기결제를 준비 중입니다.');
 const body=await readBody(req),card=cardCredentials(body.card);
 if(body.consent!==true||typeof body.terms_version!=='string')fail(400,'이용약관과 매월 4,900원 정기결제에 동의해주세요.');
 const terms=await one(env,'SELECT body FROM billing_terms WHERE version=?',body.terms_version);
 if(!terms||JSON.parse(terms.body).policy!==POLICY_VERSION||JSON.parse(terms.body).price!==PREMIUM.price)fail(409,'약관과 이용권 정보를 새로 확인해주세요.');
 await rate(env,'billing-start:'+user.id,6,3600);
 const sid='as'+id().replaceAll('-',''),time=now(),day=new Date((time+9*3600)*1000).getUTCDate();
 await run(env,`INSERT INTO billing_subscriptions(id,user_id,state,anchor_day,consent_version,consent_at,price,baseline_until,created,updated) VALUES(?,?,'idle',?,?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING`,sid,user.id,day,body.terms_version,time,PREMIUM.price,Number(user.premium_until)||0,time,time);
 const existing=await subscription(env,user),s=await lock(env,existing.id);
 if(!s)fail(409,'구독 요청을 처리 중입니다. 잠시 후 구독 내역을 확인해주세요.');
 try{
  if(s.period_end>time||['active','pending','registering','review'].includes(s.state)||await one(env,`SELECT id FROM billing_payments WHERE subscription_id=? AND status IN ${pendingSQL}`,s.id))fail(409,'이용 중이거나 확인 중인 구독이 있습니다. 구독 내역을 확인해주세요.');
  if(s.bid_cipher){await releaseCard(env,s);if((await one(env,'SELECT bid_cipher FROM billing_subscriptions WHERE id=?',s.id)).bid_cipher)fail(503,'이전 결제 수단을 정리하고 있습니다. 잠시 후 다시 시도해주세요.');}
  await run(env,"UPDATE billing_subscriptions SET state='registering',cancel_requested=0,anchor_day=?,consent_version=?,consent_at=?,price=?,updated=? WHERE id=?",day,body.terms_version,time,PREMIUM.price,time,s.id);
  let issued;
  try{await renewLock(env,s);issued=await issueBillingKey(env,card,'ar'+id().replaceAll('-',''));await renewLock(env,s);}
  catch(e){await run(env,"UPDATE billing_subscriptions SET state='failed',updated=? WHERE id=?",now(),s.id);throw e;}
  const sealed=await sealBillingKey(env,issued.bid,s.id);
  await run(env,'UPDATE billing_subscriptions SET bid_cipher=?,card_name=?,updated=? WHERE id=?',sealed,issued.cardName,now(),s.id);
  Object.assign(s,{bid_cipher:sealed,card_name:issued.cardName,anchor_day:day,price:PREMIUM.price,cancel_requested:0});
  const payment=await makePayment(env,s);await submitPayment(env,s,payment);
 }finally{await unlock(env,s);}
 return json(await billingStatus(env,user));
}
async function cancelSubscription(env,user){
 const existing=await subscription(env,user);if(!existing)return json(await billingStatus(env,user));
 const s=await lock(env,existing.id);if(!s)fail(409,'결제를 확인하고 있습니다. 잠시 후 다시 해지해주세요.');
 try{
  await env.DB.batch([query(env,"UPDATE billing_subscriptions SET cancel_requested=1,state='cancelled',updated=? WHERE id=?",now(),s.id),query(env,"UPDATE billing_payments SET status='failed',updated=? WHERE subscription_id=? AND status='created'",now(),s.id)]);
  // Cancelling renewal takes effect even when key cleanup must be retried.
  try{await releaseCard(env,s);}catch{}
 }
 finally{await unlock(env,s);}
 return json(await billingStatus(env,user));
}
async function syncSubscription(env,user){
 const existing=await subscription(env,user);if(!existing)return;
 const s=await lock(env,existing.id);if(!s)return;
 try{const p=await one(env,'SELECT * FROM billing_payments WHERE id=?',s.last_payment_id);if(p&&p.last_checked<now()-10)await reconcilePayment(env,s,p);}
 finally{await unlock(env,s);}
}
export async function billingRoute(req,env,path,user){
 if(!path.startsWith('/api/billing/'))return null;
 if(path==='/api/billing/status'&&req.method==='GET')return json(await billingStatus(env,user));
 if(!user)fail(401,'로그인 후 이용해주세요.');
 if(path==='/api/billing/terms'&&req.method==='GET'){await rate(env,'billing-terms:'+user.id,12,300);return json(await billingTerms(env));}
 if(path==='/api/billing/subscribe'&&req.method==='POST')return startSubscription(req,env,user);
 if(path==='/api/billing/cancel'&&req.method==='POST')return cancelSubscription(env,user);
 if(path==='/api/billing/sync'&&req.method==='POST'){await rate(env,'billing-sync:'+user.id,12,300);await syncSubscription(env,user);return json(await billingStatus(env,user));}
 return null;
}
export async function billingWebhook(req,env){
 if(req.method!=='POST')fail(405,'허용되지 않는 요청입니다.');
 const body=await readBody(req);
 const p=await one(env,'SELECT * FROM billing_payments WHERE id=?',String(body.orderId||''));
 // NICE registration probes use sample orders. Unknown orders are ignored;
 // no membership or payment is created from a webhook payload.
 if(!p)return ACK();
 if(!await verifyNiceSignature(env,body))fail(401,'결제 알림 인증에 실패했습니다.');
 if(body.amount!==p.amount)fail(400,'결제 금액이 일치하지 않습니다.');
 const s=await lock(env,p.subscription_id);if(!s)fail(503,'결제 내역을 처리 중입니다.');
 try{await reconcilePayment(env,s,p);}finally{await unlock(env,s);}
 return ACK();
}
export async function billingTick(req,env){
 if(req.method!=='POST'||!env.BILLING_WORKER_TOKEN||!equalSecret(req.headers.get('Authorization')||'','Bearer '+env.BILLING_WORKER_TOKEN))fail(401,'인증이 필요합니다.');
 if(!niceConfigured(env))fail(503,'결제 설정이 필요합니다.');
 await run(env,"INSERT INTO billing_worker(id,last_seen) VALUES('runner',?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen",now());
 const todo=await rows(env,`SELECT DISTINCT s.id FROM billing_subscriptions s LEFT JOIN billing_payments p ON p.subscription_id=s.id WHERE (s.state='active' AND s.cancel_requested=0 AND s.period_end<=?) OR (p.status IN ${pendingSQL} AND p.last_checked<?) OR (p.status IN ('paid','partialCancelled') AND p.period_end>? AND p.last_checked<?) OR (s.state IN ('cancelled','failed') AND s.bid_cipher IS NOT NULL AND s.updated<?) OR (s.state='registering' AND s.updated<?) ORDER BY s.updated LIMIT 5`,now(),now()-60,now(),now()-3600,now()-300,now()-180);
 let processed=0;
 for(const item of todo){
  const s=await lock(env,item.id);if(!s)continue;
  try{
   const pending=await rows(env,`SELECT * FROM billing_payments WHERE subscription_id=? AND status IN ${pendingSQL} ORDER BY cycle`,s.id);
   for(const p of pending){if(p.status==='created')await submitPayment(env,s,p);else if(p.submitted_at)await reconcilePayment(env,s,p);}
   const paid=await rows(env,"SELECT * FROM billing_payments WHERE subscription_id=? AND status IN ('paid','partialCancelled') AND period_end>? AND last_checked<?",s.id,now(),now()-3600);
   for(const p of paid)await reconcilePayment(env,s,p);
   const current=await one(env,'SELECT * FROM billing_subscriptions WHERE id=?',s.id);
   if(current.state==='active'&&!current.cancel_requested&&current.period_end<=now()&&!await one(env,`SELECT id FROM billing_payments WHERE subscription_id=? AND status IN ${pendingSQL}`,s.id))await submitPayment(env,current,await makePayment(env,current));
   if(current.state==='registering'&&current.updated<now()-180&&!pending.length)await run(env,"UPDATE billing_subscriptions SET state='failed',updated=? WHERE id=?",now(),s.id);
   await releaseCard(env,s);
   processed++;
  }catch{console.error('Billing reconciliation needs retry');}
  finally{await unlock(env,s);}
 }
 return json({ok:true,processed});
}
