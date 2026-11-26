import {PREMIUM,PREMIUM_BENEFITS} from '../shared/site-info.js';
import {requireUser} from './auth.js';
import {webCheckoutAvailable} from './billing.js';
import {query,rows,now,fail,json} from './db.js';
import {effectiveUntilSQL,eventUntilSQL} from './premium-event.js';
import {uploadQuotaQuery,uploadQuotaResult} from './upload-limits.js';

const applePremium='kr.co.aifect.app.premium.monthly';
const pageSize=30;

function pass(source,state,until,details={}){
 return {source,state,until:until||null,amount:null,renewing:null,next_billing_at:null,...details};
}

function webPass(s,at){
 if(!s||s.state==='idle')return null;
 const renewing=s.state==='active'&&!s.cancel_requested;
 let state;
 if(['created','processing','review'].includes(s.last_status)||['pending','registering','review'].includes(s.state))state='pending';
 else if(s.last_status==='cancelled'&&s.refunded>0)state='refunded';
 else if(s.state==='failed')state='failed';
 else if(s.period_end>at)state=s.cancel_requested||s.state==='cancelled'?'expiring':'active';
 else state=renewing?'pending':'expired';
 const paidPeriod=['active','expiring','expired'].includes(state);
 return pass('web',state,paidPeriod?s.period_end:null,{amount:paidPeriod?s.price:null,renewing,next_billing_at:renewing&&s.period_end>at?s.period_end:null});
}

function playPass(row,at){
 const states={
  SUBSCRIPTION_STATE_ACTIVE:row.expiry>at?'active':'expired',
  SUBSCRIPTION_STATE_CANCELED:row.expiry>at?'expiring':'expired',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD:row.expiry>at?'grace':'expired',
  SUBSCRIPTION_STATE_ON_HOLD:'hold',SUBSCRIPTION_STATE_PAUSED:'paused',
  SUBSCRIPTION_STATE_PENDING:'pending',SUBSCRIPTION_STATE_EXPIRED:'expired',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED:'expired',refunded:'refunded'
 };
 const test=row.state.startsWith('test:');
 const state=states[test?row.state.slice(5):row.state]||'unknown';
 // A verified expiry does not say when or whether Google will charge again.
 return pass('google_play',state,row.expiry,{renewing:state==='expiring'?false:null,...(test?{test:true}:{})});
}

async function accountSummary(env,user){
 const at=now();
 const result=await env.DB.batch([
  query(env,`SELECT u.created,u.premium_until base_until,u.apple_premium_until,
   ${effectiveUntilSQL} premium_until,${eventUntilSQL} event_until FROM users u WHERE u.id=?`,user.id),
  query(env,`SELECT s.state,s.cancel_requested,s.period_end,s.price,p.status last_status,p.refunded
   FROM billing_subscriptions s LEFT JOIN billing_payments p ON p.id=s.last_payment_id AND p.subscription_id=s.id
   WHERE s.user_id=?`,user.id),
  query(env,"SELECT state,expiry FROM play_purchases WHERE user_id=? AND kind='subs' ORDER BY expiry DESC,updated DESC",user.id),
  // A reversed renewal can coexist with a still-valid previous period.
  query(env,`SELECT expires,revoked FROM (
   SELECT expires,revoked,row_number() OVER(PARTITION BY original_id ORDER BY
    CASE WHEN revoked=0 AND expires>? THEN 0 ELSE 1 END,expires DESC,purchased DESC,signed_date DESC) n
   FROM apple_transactions WHERE user_id=? AND environment='Production' AND product_id=?) WHERE n=1`,at,user.id,applePremium),
  query(env,`SELECT MAX(json_extract(target,'$.until')) until FROM admin_audit
   WHERE action='premium_grant' AND CASE WHEN json_valid(target) THEN json_extract(target,'$.user_id') END=?`,user.id),
  uploadQuotaQuery(env,user,at)
 ]);
 const [account,web,play,apple,grants,usage]=result.map(r=>r.results);
 const row=account[0],passes=[];
 const webSub=webPass(web[0],at);
 if(webSub)passes.push(webSub);
 for(const sub of play)passes.push(playPass(sub,at));
 for(const sub of apple)passes.push(pass('app_store',sub.revoked?'refunded':sub.expires>at?'active':'expired',sub.expires));
 const grantUntil=grants[0].until;
 if(grantUntil>at&&row.base_until>=grantUntil)passes.push(pass('grant','active',grantUntil,{amount:0}));
 // Some legacy entitlements predate source records. Preserve the server right
 // without inferring a payment channel or calling an unknown right a grant.
 const knownUntil=Math.max(0,...passes.filter(p=>['active','expiring','grace','pending'].includes(p.state)).map(p=>p.until||0));
 const independentUntil=Math.max(row.base_until,row.apple_premium_until);
 if(independentUntil>at&&independentUntil>knownUntil)passes.push(pass('other','active',independentUntil));
 if(row.event_until>at)passes.push(pass('event','active',row.event_until,{amount:0}));
 const plan=row.premium_until>at?'premium':'free';
 const canStart=plan==='free'&&!passes.some(p=>!['expired','failed','refunded'].includes(p.state));
 return {
  account:{id:user.id,nickname:user.display_name||user.name,email:user.email,provider:user.provider,created:row.created},
  plan,passes,benefits:PREMIUM_BENEFITS,upload_quota:uploadQuotaResult(row,usage[0].used,at),
  can_start_subscription:canStart,web_checkout_available:canStart&&PREMIUM.catalogVisible!==false&&await webCheckoutAvailable(env,user)
 };
}

// Only payment processors can contribute ledger entries. Never synthesize an
// order from a grant, a balance, a catalog price, or a Google subscription token.
const webLedger=`SELECT p.id sort_id,'premium' kind,'web' source,'프리미엄 월 이용권' product,
 CASE WHEN p.status IN ('paid','cancelled','partialCancelled') THEN p.amount END amount,
 CASE WHEN p.status IN ('cancelled','partialCancelled') THEN NULLIF(p.refunded,0) END refunded,p.created date,
 CASE WHEN p.status IN ('created','processing','review') THEN 'pending'
  WHEN p.status='partialCancelled' THEN 'partial_refund'
  WHEN p.status='cancelled' AND p.refunded>0 THEN 'refunded'
  WHEN p.status IN ('paid','failed','expired','cancelled') THEN p.status ELSE 'unknown' END state
 FROM billing_payments p JOIN billing_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=?`;
const appleLedger=`SELECT a.id sort_id,'premium' kind,'app_store' source,'프리미엄 월 이용권' product,
 NULL amount,NULL refunded,a.purchased date,CASE WHEN a.revoked>0 THEN 'refunded' ELSE 'verified' END state
 FROM apple_transactions a WHERE a.user_id=? AND a.environment='Production' AND a.product_id=?`;
const goldLedger=`SELECT g.id sort_id,'gold' kind,
 CASE g.channel WHEN 'nicepay' THEN 'web' WHEN 'apple' THEN 'app_store' ELSE 'google_play' END source,
 '골드 '||g.gold||'G' product,
 CASE WHEN g.channel='google_play' AND pp.kind!='inapp_verified' THEN NULL
  WHEN g.paid_at>0 OR g.status IN ('paid','refunded') OR o.refunded>0 THEN g.price_krw END amount,
 NULLIF(o.refunded,0) refunded,COALESCE(NULLIF(g.paid_at,0),g.created) date,
 CASE WHEN pp.state='refunded' OR a.revoked>0 THEN 'refunded'
  WHEN o.state='refund_review' THEN 'refund_review'
  WHEN o.state='cancelled' AND o.refunded>0 THEN 'refunded'
  WHEN o.state IN ('created','approving','checking') THEN 'pending'
  WHEN o.state IN ('paid','cancelled','expired','failed') THEN o.state
  WHEN g.status IN ('paid','failed','refunded') THEN g.status ELSE 'unknown' END state
 FROM gold_purchases g
 LEFT JOIN gold_orders o ON g.channel='nicepay' AND o.id=g.id AND o.user_id=g.user_id
 LEFT JOIN play_purchases pp ON g.channel='google_play' AND pp.token_hash=substr(g.id,6) AND pp.user_id=g.user_id
 LEFT JOIN apple_transactions a ON g.channel='apple' AND a.id=g.id AND a.user_id=g.user_id
 WHERE g.user_id=? AND g.channel IN ('nicepay','google_play','apple') AND g.price_krw>0
 AND COALESCE(o.review_only,0)=0 AND (o.state IS NULL OR o.state!='created' OR o.tid IS NOT NULL)
 AND (g.channel!='apple' OR a.environment='Production')
 AND (g.channel!='google_play' OR pp.kind IN ('inapp_verified','inapp_unpriced'))`;

async function accountPayments(env,user,params){
 const kind=params.get('kind')??'all',offset=Number(params.get('offset')??0);
 if(!['all','premium','gold'].includes(kind)||!Number.isSafeInteger(offset)||offset<0)fail(400,'결제 내역 조회 범위를 확인해 주세요.');
 const parts=[],bindings=[];
 if(kind!=='gold'){parts.push(webLedger,appleLedger);bindings.push(user.id,user.id,applePremium);}
 if(kind!=='premium'){parts.push(goldLedger);bindings.push(user.id);}
 const [items,storeHistory]=await Promise.all([
  rows(env,`SELECT kind,source,product,amount,refunded,state,date FROM (${parts.join(' UNION ALL ')})
   ORDER BY date DESC,source,sort_id LIMIT ? OFFSET ?`,...bindings,pageSize+1,offset),
  rows(env,`SELECT 'google_play' source WHERE EXISTS(SELECT 1 FROM play_purchases p WHERE p.user_id=?
   AND ((?!='gold' AND p.kind='subs' AND p.state NOT LIKE 'test:%') OR
   (?!='premium' AND p.kind IN ('inapp','inapp_verified','inapp_unpriced') AND EXISTS(SELECT 1 FROM gold_purchases g WHERE g.id='play_'||p.token_hash AND g.user_id=p.user_id AND g.price_krw>0))))
   UNION ALL SELECT 'app_store' WHERE EXISTS(SELECT 1 FROM apple_transactions WHERE user_id=? AND environment='Production'
   AND ((?!='gold' AND product_id=?) OR (?!='premium' AND product_id LIKE 'kr.co.aifect.app.gold.%')))`,user.id,kind,kind,user.id,kind,applePremium,kind)
 ]);
 return {account_id:user.id,payments:items.slice(0,pageSize),next_offset:items.length>pageSize?offset+pageSize:null,store_history:storeHistory.map(r=>r.source)};
}

export async function accountOverviewRoute(req,env,path,user){
 requireUser(user);
 if(req.method!=='GET')fail(405,'GET만 지원합니다.');
 if(path==='/api/account/summary')return json(await accountSummary(env,user));
 return json(await accountPayments(env,user,new URL(req.url).searchParams));
}
