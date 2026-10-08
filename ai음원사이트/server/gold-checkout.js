import {one,rows,query,run,now,id,fail,json,rate} from './db.js';
import {WEB_GOLD_PACKS} from '../shared/gifts.js';
import {includedKoreanVat} from '../shared/gifts.js';
import {niceRequest,digest,equalSecret,verifyNiceSignature,findPayment} from './nicepay.js';
import {reviewAccount,reviewAvailable} from './billing-review.js';

const SELECT='SELECT o.*,p.gold,p.price_krw,p.fee_krw,p.used,p.status purchase_status FROM gold_orders o JOIN gold_purchases p ON p.id=o.id';
const readOrder=(env,oid)=>one(env,SELECT+' WHERE o.id=?',oid);
const ACK=()=>new Response('OK',{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
const feeBasis=env=>/^\d{1,4}$/.test(env.GOLD_WEB_FEE_BP||'')?Number(env.GOLD_WEB_FEE_BP):null;
export const goldCheckoutEnabled=env=>env.GOLD_CHECKOUT_ENABLED==='true'&&!!env.NICEPAY_CLIENT_ID&&!!env.NICEPAY_SECRET_KEY&&feeBasis(env)!==null;
export const goldCheckoutStatus=(env,user)=>({checkout_available:!reviewAccount(env,user)&&goldCheckoutEnabled(env),review_only:reviewAvailable(env,user),payment_type:'one_time'});
const stateFor=(env,oid)=>digest('aifect-gold-callback:'+oid+':'+env.NICEPAY_SECRET_KEY);
const safeOrder=o=>({id:o.id,gold:o.gold,price:o.price_krw,state:o.state,review_only:!!o.review_only,created:o.created});

export async function createGoldCheckout(req,env,user){
 const review=reviewAvailable(env,user);
 if(!review&&(!goldCheckoutEnabled(env)||reviewAccount(env,user)))fail(409,'골드 충전은 결제 준비가 끝나면 열려요.');
 if(!env.NICEPAY_CLIENT_ID||!env.NICEPAY_SECRET_KEY)fail(503,'결제 연결을 준비하고 있어요.');
 await rate(env,'gold-checkout:'+user.id,20,3600);
 const b=await req.json(),pack=WEB_GOLD_PACKS.find(p=>p.gold===b.gold);
 if(!pack||typeof b.request_id!=='string'||!/^[\w-]{16,64}$/.test(b.request_id))fail(400,'충전할 골드 상품을 다시 선택해주세요.');
 if(!review&&b.consent!==true)fail(400,'골드 구매 및 환불 안내를 확인해주세요.');
 // Retries preserve the quantity recorded on the original order, including pre-promotion orders.
 let order=await one(env,SELECT+' WHERE o.user_id=? AND o.request_id=?',user.id,b.request_id);
 if(order&&(order.price_krw!==pack.price||![pack.gold,pack.total_gold].includes(order.gold)||!!order.review_only!==review))fail(409,'새 결제 요청으로 다시 선택해주세요.');
 if(!order){
  const oid='ag_'+id().replaceAll('-',''),at=now(),fee=review?0:Math.ceil(pack.price*feeBasis(env)/10000);
  try{await env.DB.batch([
   query(env,"INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,created) VALUES(?,?,'nicepay',?,?,?,?,'pending',?)",oid,user.id,pack.total_gold,pack.price,fee,review?0:includedKoreanVat(pack.price),at),
   query(env,'INSERT INTO gold_orders(id,user_id,request_id,review_only,created,expires,updated) VALUES(?,?,?,?,?,?,?)',oid,user.id,b.request_id,review?1:0,at,at+1800,at),
  ]);}catch(e){if(!/UNIQUE constraint/i.test(String(e.message)))throw e;}
  order=await one(env,SELECT+' WHERE o.user_id=? AND o.request_id=?',user.id,b.request_id);
 }
 if(order&&(order.price_krw!==pack.price||![pack.gold,pack.total_gold].includes(order.gold)||!!order.review_only!==review))fail(409,'새 결제 요청으로 다시 선택해주세요.');
 if(!order||order.state!=='created'||order.expires<=now())fail(409,'결제 내역을 확인한 뒤 새로 시도해주세요.');
 const origin=new URL(req.url).origin;
 return json({order:safeOrder(order),payment:{clientId:env.NICEPAY_CLIENT_ID,method:'card',orderId:order.id,amount:order.price_krw,goodsName:`AIFECT 골드 ${order.gold}G`,returnUrl:origin+'/api/gold/nicepay/callback?state='+await stateFor(env,order.id),mallReserved:order.id,currency:'KRW',cardQuota:'0',skinType:'purple'}},201);
}

// Always re-query NICE. A browser callback or webhook alone never credits gold.
async function reconcile(env,order){
 if(order.review_only)return;
 const p=await findPayment(env,{id:order.id,created:order.created});
 await run(env,'UPDATE gold_orders SET last_checked=? WHERE id=?',now(),order.id);
 if(p.resultCode!=='0000')return;
 if(p.orderId!==order.id||p.amount!==order.price_krw||p.currency!=='KRW'||p.payMethod!=='card'||typeof p.tid!=='string'||!p.tid||(order.tid&&order.tid!==p.tid)||!Number.isInteger(p.balanceAmt)||p.balanceAmt<0||p.balanceAmt>p.amount||(p.signature&&!await verifyNiceSignature(env,p)))fail(502,'골드 결제 확인이 필요합니다. 고객센터로 문의해주세요.');
 const at=now();
 if(p.status==='paid'&&p.balanceAmt===p.amount){
  // Terminal refunds/holds cannot be undone by a delayed success notification.
  if(!['created','approving','checking','paid'].includes(order.state))return;
  await env.DB.batch([
   query(env,"UPDATE gold_purchases SET status='paid',provider_ref=?,paid_at=CASE WHEN paid_at=0 THEN ? ELSE paid_at END WHERE id=? AND status='pending'",p.tid,at,order.id),
   query(env,"UPDATE gold_orders SET state='paid',tid=?,lease_until=0,updated=? WHERE id=? AND state IN ('created','approving','checking','paid')",p.tid,at,order.id),
  ]);
 }else if(['cancelled','partialCancelled'].includes(p.status)){
  // An unused full refund removes the lot. Other refunds freeze its remaining
  // balance and creator settlement until an operator reconciles the allocation.
  const full=p.status==='cancelled'&&p.balanceAmt===0;
  await env.DB.batch([
   query(env,"UPDATE gold_orders SET state=CASE WHEN ?=1 AND (SELECT used FROM gold_purchases WHERE id=gold_orders.id)=0 THEN 'cancelled' ELSE 'refund_review' END,refunded=?,tid=?,lease_until=0,updated=? WHERE id=?",full?1:0,p.amount-p.balanceAmt,p.tid,at,order.id),
   query(env,"UPDATE gold_purchases SET status=CASE WHEN used=0 THEN 'refunded' ELSE status END WHERE id=?",order.id),
  ]);
 }else if(['failed','expired'].includes(p.status)&&order.purchase_status!=='paid'){
  await env.DB.batch([query(env,"UPDATE gold_orders SET state=?,lease_until=0,updated=? WHERE id=?",p.status,at,order.id),query(env,"UPDATE gold_purchases SET status='failed' WHERE id=? AND status='pending'",order.id)]);
 }
}
export async function syncGoldOrder(env,oid){
 const held=await query(env,'UPDATE gold_orders SET lease_until=? WHERE id=? AND lease_until<? RETURNING id',now()+180,oid,now()).first();
 if(!held)return false;
 try{await reconcile(env,await readOrder(env,oid));return true;}finally{await run(env,'UPDATE gold_orders SET lease_until=0 WHERE id=?',oid);}
}
export async function goldCallback(req,env){
 if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 const text=await req.text();if(text.length>16384)fail(413,'요청이 너무 큽니다.');
 const b=Object.fromEntries(new URLSearchParams(text)),order=await readOrder(env,String(b.orderId||''));
 if(!order||!equalSecret(new URL(req.url).searchParams.get('state')||'',await stateFor(env,order.id)))fail(403,'결제 요청을 확인할 수 없습니다.');
 const done=()=>new Response(null,{status:303,headers:{Location:'/#gold?order='+encodeURIComponent(order.id),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 if(order.review_only)return done(); // Review sessions can NEVER approve or credit.
 if(b.authResultCode!=='0000')return done();
 if(b.clientId!==env.NICEPAY_CLIENT_ID||String(order.price_krw)!==b.amount||b.mallReserved!==order.id||typeof b.tid!=='string'||!/^[\w-]{1,64}$/.test(b.tid)||!b.authToken||!equalSecret((b.signature||'').toLowerCase(),await digest(b.authToken+b.clientId+b.amount+env.NICEPAY_SECRET_KEY)))fail(403,'결제 인증 정보가 일치하지 않습니다.');
 if(order.state!=='created'){if(order.tid&&order.tid!==b.tid)fail(403,'결제 정보가 일치하지 않습니다.');return done();}
 if(!goldCheckoutEnabled(env)||order.expires<=now())fail(409,'결제 요청이 만료되었거나 현재 충전할 수 없습니다.');
 const held=await query(env,"UPDATE gold_orders SET state='approving',tid=?,lease_until=?,updated=? WHERE id=? AND state='created' AND lease_until<? RETURNING id",b.tid,now()+180,now(),order.id,now()).first();
 if(!held)return done();
 try{
  const ediDate=new Date().toISOString();
  try{await niceRequest(env,'/v1/payments/'+encodeURIComponent(b.tid),{amount:order.price_krw,ediDate,signData:await digest(b.tid+order.price_krw+ediDate+env.NICEPAY_SECRET_KEY)});}
  catch{
   // NICE requires a network cancel for an ambiguous approval timeout.
   await run(env,"UPDATE gold_orders SET state='checking',updated=? WHERE id=?",now(),order.id);
   try{const at=new Date().toISOString();await niceRequest(env,'/v1/payments/netcancel',{orderId:order.id,ediDate:at,signData:await digest(order.id+at+env.NICEPAY_SECRET_KEY)});}catch{}
  }
  await reconcile(env,await readOrder(env,order.id));
 }catch{await run(env,"UPDATE gold_orders SET state='checking',updated=? WHERE id=? AND state='approving'",now(),order.id);}
 finally{await run(env,'UPDATE gold_orders SET lease_until=0 WHERE id=?',order.id);}
 return done();
}
export async function goldWebhook(env,body){
 const o=await readOrder(env,String(body.orderId||''));if(!o||o.review_only)return ACK();
 if(body.amount!==o.price_krw||!await verifyNiceSignature(env,body))fail(403,'결제 알림을 확인할 수 없습니다.');
 // Let NICE retry if a callback owns the lease; do not acknowledge an unprocessed refund.
 if(o.lease_until>=now())fail(503,'결제를 확인하고 있습니다.');
 if(!await syncGoldOrder(env,o.id))fail(503,'결제를 확인하고 있습니다.');return ACK();
}
export async function goldTick(env){
 const pending=await rows(env,"SELECT id FROM gold_orders WHERE review_only=0 AND state IN ('approving','checking') AND lease_until<? AND last_checked<? ORDER BY last_checked LIMIT 10",now(),now()-60);
 for(const o of pending)try{await syncGoldOrder(env,o.id);}catch{}
}
export async function goldOrderRoute(req,env,path,user){
 const m=path.match(/^\/api\/gold\/orders\/(ag_[\w-]+)$/);if(!m)return null;
 if(!user)fail(401,'로그인 후 이용해주세요.');
 const o=await readOrder(env,m[1]);if(!o||o.user_id!==user.id)fail(404,'내 결제 내역을 찾을 수 없습니다.');
 if(req.method==='POST'){await rate(env,'gold-sync:'+user.id,20,300);if(o.last_checked<now()-10)await syncGoldOrder(env,o.id);}
 else if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 return json({order:safeOrder(await readOrder(env,o.id))});
}
