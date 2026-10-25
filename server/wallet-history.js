import {rows,fail,json} from './db.js';
import {requireUser} from './auth.js';

// Account-scoped read only view of existing receipts. Never recompute balances.
export async function walletHistory(req,env,user){
 requireUser(user);
 if(req.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const currency=new URL(req.url).searchParams.get('currency');
 if(!['silver','gold'].includes(currency))fail(400,'실버 또는 골드를 선택해주세요.');
 const uid=user.id;
 let earned,spent;
 if(currency==='silver'){
  [earned,spent]=await Promise.all([
   rows(env,`SELECT 'claim:'||day||':'||kind id,kind,amount,created FROM free_gift_claims WHERE user_id=? ORDER BY created DESC,day DESC,kind LIMIT 20`,uid),
   rows(env,`SELECT id,'gift' kind,silver amount,created,gift_name title FROM free_gifts WHERE sender_id=? ORDER BY created DESC,id LIMIT 20`,uid)
  ]);
 }else{
  [earned,spent]=await Promise.all([
   rows(env,`SELECT * FROM (
    SELECT 'purchase:'||id id,'purchase' kind,gold amount,paid_at created,'' title FROM gold_purchases WHERE user_id=? AND paid_at>0 AND status='paid'
    UNION ALL SELECT 'refund:'||o.job_id,'dubbing_refund',SUM(l.refunded_gold),o.updated,'' FROM dubbing_gold_orders o JOIN dubbing_gold_lots l ON l.job_id=o.job_id WHERE o.user_id=? AND l.refunded_gold>0 GROUP BY o.job_id
   ) ORDER BY created DESC,id LIMIT 20`,uid,uid),
   rows(env,`SELECT * FROM (
    SELECT id,'gift' kind,gold amount,created,gift_name title FROM gifts WHERE sender_id=?
    UNION ALL SELECT 'dubbing:'||job_id,'dubbing',gold,created,'' FROM dubbing_gold_orders WHERE user_id=?
   ) ORDER BY created DESC,id LIMIT 20`,uid,uid)
  ]);
 }
 return json({currency,earned,spent});
}
