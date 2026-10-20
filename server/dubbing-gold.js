import {one,rows,query,now,fail} from './db.js';
import {allocateLots} from '../shared/gifts.js';
import {dubbingVisibleSQL} from './dubbing-access.js';

export const dubbingGoldEnabled=env=>env.DUBBING_GOLD_ENABLED==='true';
// Match the existing wallet's exclusions, including store refunds awaiting review.
const spendable=`status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid')
 AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')`;

// Append to the SAME atomic batch as job creation. No output job may exist without its payment.
export async function dubbingChargeWrites(env,{jobId,userId,projectId,scriptKey,priceGold}){
 if(!dubbingGoldEnabled(env))return [];
 const lots=await rows(env,`SELECT * FROM gold_purchases WHERE user_id=? AND used<gold AND ${spendable} ORDER BY paid_at,id`,userId);
 let spent;try{spent=allocateLots(lots,priceGold);}catch{fail(409,`골드가 부족해요. ${priceGold}G가 필요합니다.`);}
 const at=now(),orderExists="EXISTS(SELECT 1 FROM dubbing_gold_orders WHERE job_id=? AND state='charged')";
 return [query(env,`INSERT INTO dubbing_gold_orders(job_id,user_id,project_id,gold,created,updated)
 SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dubbing_sound_jobs WHERE id=? AND project_id=? AND script_key=? AND mode='ai')`,jobId,userId,projectId,priceGold,at,at,jobId,projectId,scriptKey),
 ...spent.flatMap(l=>[
  query(env,`UPDATE gold_purchases SET used=CASE WHEN ${spendable} THEN used+? ELSE -1 END WHERE id=? AND ${orderExists}`,l.gold,l.purchase_id,jobId),
  query(env,`INSERT INTO dubbing_gold_lots(job_id,purchase_id,gold) SELECT ?,?,? WHERE ${orderExists}`,jobId,l.purchase_id,l.gold,jobId)
 ])];
}

export async function dubbingPayment(env,jobId){
 const order=await one(env,'SELECT gold,state FROM dubbing_gold_orders WHERE job_id=?',jobId);
 if(!order)return {chargeGold:0,paymentState:'free',refundedGold:0};
 const refund=await one(env,'SELECT COALESCE(SUM(refunded_gold),0) amount FROM dubbing_gold_lots WHERE job_id=?',jobId);
 return {chargeGold:order.gold,paymentState:order.state,refundedGold:refund.amount};
}

// Terminal work that cannot deliver an audio file is refunded, even if provider cost is uncertain.
// A store-revoked purchase must never turn back into spendable currency.
export async function refundDubbingGold(env,jobId,reason='음향 제작 미완료'){
 const charged="EXISTS(SELECT 1 FROM dubbing_gold_orders WHERE job_id=? AND state='charged')";
 await env.DB.batch([
  query(env,`UPDATE dubbing_gold_lots SET refunded_gold=CASE WHEN EXISTS(SELECT 1 FROM gold_purchases
   WHERE id=dubbing_gold_lots.purchase_id AND used>=dubbing_gold_lots.gold AND ${spendable}) THEN gold ELSE 0 END
   WHERE job_id=? AND ${charged}`,jobId,jobId),
  query(env,`UPDATE gold_purchases SET used=used-(SELECT refunded_gold FROM dubbing_gold_lots WHERE job_id=? AND purchase_id=gold_purchases.id)
   WHERE id IN (SELECT purchase_id FROM dubbing_gold_lots WHERE job_id=? AND refunded_gold>0) AND ${charged}`,jobId,jobId,jobId),
  query(env,`UPDATE dubbing_gold_orders SET state=CASE WHEN gold=(SELECT COALESCE(SUM(refunded_gold),0) FROM dubbing_gold_lots WHERE job_id=?)
   THEN 'refunded' ELSE 'refund_review' END,reason=?,updated=? WHERE job_id=? AND state='charged'`,jobId,reason,now(),jobId)
 ]);
}

export async function reconcileDubbingGold(env){
 const pending=await rows(env,`SELECT o.job_id FROM dubbing_gold_orders o LEFT JOIN dubbing_sound_jobs j ON j.id=o.job_id
 LEFT JOIN dubbing_projects p ON p.id=j.project_id LEFT JOIN users u ON u.id=o.user_id
 WHERE o.state='charged' AND (j.id IS NULL OR j.state IN ('failed','unknown') OR
 (j.state!='ready' AND (p.script_key!=j.script_key OR u.provider='deleted' OR NOT (${dubbingVisibleSQL()})))) ORDER BY o.created LIMIT 50`);
 for(const row of pending)await refundDubbingGold(env,row.job_id);
}
