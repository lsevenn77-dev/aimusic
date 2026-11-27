import * as AifectMessages from '../shared/system-messages.js';
import {rows,fail,json} from './db.js';
import {requireUser} from './auth.js';
import {DECORATIONS,PERIOD_LABELS} from '../shared/decorations.js';
import {JUMP_OUTFITS} from '../dist/crew-jump-art/outfits.js';

// Account-scoped read only view of existing receipts. Never recompute balances.
export async function walletHistory(req,env,user){
 requireUser(user);
 if(req.method!=='GET')fail(405,AifectMessages.unsupportedRequest);
 const currency=new URL(req.url).searchParams.get('currency');
 if(!['silver','gold'].includes(currency))fail(400,'실버 또는 골드를 선택해 주세요.');
 const uid=user.id;
 let earned,spent;
 if(currency==='silver'){
  [earned,spent]=await Promise.all([
   rows(env,`SELECT 'claim:'||day||':'||kind id,kind,amount,created FROM free_gift_claims WHERE user_id=? ORDER BY created DESC,day DESC,kind LIMIT 20`,uid),
   rows(env,`SELECT * FROM (
    SELECT f.id,'gift' kind,f.silver amount,f.created,f.gift_name title FROM free_gifts f WHERE f.sender_id=? AND f.silver>0 AND NOT EXISTS(SELECT 1 FROM gift_inventory i WHERE i.id=f.id)
    UNION ALL SELECT 'inventory:'||request_id,'inventory',SUM(value),created,gift_name||' 구매' FROM gift_inventory WHERE user_id=? AND currency='silver' AND source='purchase' GROUP BY request_id
    UNION ALL SELECT 'jump-outfit:'||id,'jump_outfit',json_extract(item_key,'$.amount'),granted_at,source_ref FROM player_inventory WHERE user_id=? AND source='jump_outfit' AND json_extract(item_key,'$.currency')='S'
   ) ORDER BY created DESC,id LIMIT 20`,uid,uid,uid)
  ]);
 }else{
  [earned,spent]=await Promise.all([
   rows(env,`SELECT * FROM (
    SELECT 'purchase:'||id id,'purchase' kind,gold amount,paid_at created,'' title FROM gold_purchases WHERE user_id=? AND paid_at>0 AND status='paid'
    UNION ALL SELECT 'refund:'||o.job_id,'dubbing_refund',SUM(l.refunded_gold),o.updated,'' FROM dubbing_gold_orders o JOIN dubbing_gold_lots l ON l.job_id=o.job_id WHERE o.user_id=? AND l.refunded_gold>0 GROUP BY o.job_id
   ) ORDER BY created DESC,id LIMIT 20`,uid,uid),
   rows(env,`SELECT * FROM (
    SELECT g.id,'gift' kind,g.gold amount,g.created,g.gift_name title FROM gifts g WHERE g.sender_id=? AND NOT EXISTS(SELECT 1 FROM gift_inventory i WHERE i.id=g.id)
    UNION ALL SELECT 'inventory:'||request_id,'inventory',SUM(value),created,gift_name||' 구매' FROM gift_inventory WHERE user_id=? AND currency='gold' AND source='purchase' GROUP BY request_id
    UNION ALL SELECT 'decoration:'||o.id,'decoration',o.gold,o.created,json_array(coalesce(o.product_name,
      (SELECT n.gift_name FROM activity_notifications n WHERE n.id='decoration:'||o.id AND n.gift_name<>''),d.name),o.sku,o.period_code)
      FROM decoration_orders o LEFT JOIN product_deletions d ON d.product_id=o.sku WHERE o.payer_id=?
    UNION ALL SELECT 'dubbing:'||job_id,'dubbing',gold,created,'' FROM dubbing_gold_orders WHERE user_id=?
    UNION ALL SELECT 'jump-outfit:'||id,'jump_outfit',json_extract(item_key,'$.amount'),granted_at,source_ref FROM player_inventory WHERE user_id=? AND source='jump_outfit' AND json_extract(item_key,'$.currency')='G'
   ) ORDER BY created DESC,id LIMIT 20`,uid,uid,uid,uid,uid)
  ]);
 }
 return json({currency,earned,spent:spent.map(row=>{
  if(row.kind==='jump_outfit')return {...row,title:(JUMP_OUTFITS.find(item=>item.id===row.title)?.name||'점프게임 의상')+' 구매'};
  if(row.kind!=='decoration')return row;
  const [name,sku,period]=JSON.parse(row.title);
  return {...row,title:(name||DECORATIONS[sku]?.name||sku||'꾸미기 상품')+' · '+(PERIOD_LABELS[period]||'')+' 구매'};
 })});
}
