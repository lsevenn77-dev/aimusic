import {FREE_ROOM_THEMES,PREMIUM_APPEARANCE} from '../shared/decorations.js';
import {FREE_GIFT} from '../shared/gifts.js';
import {now,query,rows} from './db.js';
import {decorationTimeSQL,giftStockSQL,stockDeadlineSQL} from './product-rights.js';

export function requiredProductReason(id) {
  if (id===FREE_GIFT.id) return '일일 보상과 기본 실버 선물 기능에서 사용하는 상품입니다.';
  if (FREE_ROOM_THEMES.some(theme=>theme.sku===id)) return '토킹룸과 노래방에서 기본으로 제공하는 테마입니다.';
  if (id===PREMIUM_APPEARANCE.frameKey) return '프리미엄 회원에게 기본으로 제공하는 테두리입니다.';
  return null;
}

// Count usable time and stock independently of funding holds: a pending refund
// or its reversal can change availability without extending the item's clock.
const active = `pi.source='decoration' AND ${decorationTimeSQL('pi')}`;
const unused = `pi.source='decoration_stock' AND ${stockDeadlineSQL('pi')}`;
const unsettledLot = `EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=l.purchase_id AND o.state='refund_review')
 OR EXISTS(SELECT 1 FROM apple_transactions a WHERE a.id=l.purchase_id AND a.refund_review=1)`;

const eligibilitySQL = `WITH subjects AS (
  SELECT json_extract(value,'$.id') id, json_extract(value,'$.type') type FROM json_each(?)
), decoration AS (
  SELECT s.id, COUNT(DISTINCT CASE WHEN ${unused} THEN pi.user_id END) unused_users,
   COUNT(DISTINCT CASE WHEN ${active} THEN pi.user_id END) active_users,
   COUNT(DISTINCT CASE WHEN pi.period_code='PERMANENT'
    AND ((${active} AND pi.expires_at=0) OR (${unused})) THEN pi.user_id END) permanent_users,
   MAX(CASE WHEN pi.source='decoration' AND pi.expires_at>0 THEN pi.expires_at END) last_end
  FROM subjects s JOIN player_inventory pi ON pi.item_key=s.id
  WHERE s.type IN ('frame','theme') AND pi.revoked=0 AND pi.source IN ('decoration','decoration_stock')
  GROUP BY s.id
), gifts_in_stock AS (
  SELECT s.id, COUNT(DISTINCT g.user_id) unused_users, COUNT(*) units,
   CASE WHEN COUNT(g.expires_at)=COUNT(*) THEN MAX(g.expires_at) END last_end
  FROM subjects s JOIN gift_inventory g ON g.gift_type=s.id
  WHERE s.type='gift' AND ${giftStockSQL('g')} GROUP BY s.id
), dispatch_items AS (
  SELECT dispatch_id,line,COUNT(*) pending FROM gift_dispatch_items WHERE state='pending' GROUP BY dispatch_id,line
), dispatch AS (
  SELECT s.id,SUM(i.pending) pending FROM dispatch_items i JOIN gift_dispatches d ON d.id=i.dispatch_id
  JOIN subjects s ON s.id=json_extract(d.plan,'$['||i.line||'].product_id')
  WHERE d.confirmed_at IS NOT NULL GROUP BY s.id
), counts AS (
  SELECT s.id, COALESCE(decoration.unused_users,gifts_in_stock.unused_users,0) unused_users,
   COALESCE(decoration.active_users,0) active_users, COALESCE(decoration.permanent_users,0) permanent_users,
   COALESCE(gifts_in_stock.units,0) gift_units,
   CASE WHEN COALESCE(decoration.unused_users,0)=0 AND COALESCE(decoration.permanent_users,0)=0
    THEN COALESCE(decoration.last_end,gifts_in_stock.last_end) END last_end,
   CASE s.type
    WHEN 'frame' THEN (SELECT COUNT(*) FROM player_inventory pi JOIN player_equipment e
      ON e.frame_inventory_id=pi.id AND e.user_id=pi.user_id
      WHERE pi.item_key=s.id AND pi.revoked=0 AND ${active})
    WHEN 'theme' THEN (SELECT COUNT(*) FROM room_decorations r WHERE r.sku=s.id AND EXISTS (
      SELECT 1 FROM player_inventory pi WHERE pi.user_id=r.host_id AND pi.item_key=r.sku
       AND (pi.id=r.inventory_id OR (r.inventory_id IS NULL AND pi.source_ref=pi.item_key))
       AND pi.revoked=0 AND ${active}))
    ELSE 0 END service_refs,
   COALESCE(dispatch.pending,0) pending_dispatches,
   CASE WHEN s.type='gift' THEN (
    EXISTS(SELECT 1 FROM gift_inventory g JOIN gift_inventory_lots l ON l.inventory_id=g.id
     WHERE g.gift_type=s.id AND (${unsettledLot}))
    OR EXISTS(SELECT 1 FROM gifts g JOIN gift_lots l ON l.gift_id=g.id
     WHERE g.gift_type=s.id AND (${unsettledLot}))
   ) ELSE EXISTS(SELECT 1 FROM decoration_orders o JOIN decoration_order_lots l ON l.order_id=o.id
    WHERE o.sku=s.id AND (${unsettledLot})) END refund_pending,
   EXISTS(SELECT 1 FROM product_asset_uploads u WHERE u.product_id=s.id AND u.expires_at>unixepoch()) asset_uploading
  FROM subjects s LEFT JOIN decoration USING(id) LEFT JOIN gifts_in_stock USING(id) LEFT JOIN dispatch USING(id)
), eligibility AS (
  SELECT *, (unused_users=0 AND active_users=0 AND permanent_users=0 AND gift_units=0
   AND service_refs=0 AND pending_dispatches=0 AND refund_pending=0 AND asset_uploading=0) ready
  FROM counts
)`;

function scopes(products) {
  return JSON.stringify(products.map(({id,type})=>({id,type})));
}

export async function deletionDetails(env,products) {
  if (!products.length) return new Map();
  const checks = await rows(env,eligibilitySQL+' SELECT * FROM eligibility',scopes(products));
  const types=new Map(products.map(({id,type})=>[id,type]));
  return new Map(checks.map(check=>{
    const type = types.get(check.id);
    const system = requiredProductReason(check.id);
    const {unused_users,active_users,permanent_users,gift_units,service_refs,pending_dispatches,refund_pending,asset_uploading}=check;
    const reasons = [
      system&&{code:'system',text:system},
      permanent_users&&{code:'permanent',text:'무제한 보유권 존재'},
      gift_units&&{code:'unused_gifts',text:'미사용 선물 존재'},
      type!=='gift'&&unused_users&&{code:'unused',text:'사용 시작 대기'},
      active_users&&{code:'active',text:'이용 종료 대기'},
      service_refs&&{code:'service',text:type==='frame'?'서비스 참조 존재 · 장착 중인 프로필 테두리':'서비스 참조 존재 · 적용 중인 방 테마'},
      pending_dispatches&&{code:'dispatch',text:'거래 처리 중 · 확정된 발송이 남아 있습니다.'},
      refund_pending&&{code:'refund',text:'거래 처리 중 · 연결된 결제의 환불을 확인하고 있습니다.'},
      asset_uploading&&{code:'upload',text:'서비스 참조 존재 · 상품 에셋 등록을 처리 중입니다.'}
    ].filter(Boolean);
    return [check.id,{...check,ready:!!check.ready&&!system,reasons}];
  }));
}

export function queueDeletion(env,op,targets) {
  return query(env,`INSERT INTO product_deletions(product_id,name,type,snapshot,state,requested_by,requested_at,request_id)
   SELECT p.product_id,json_extract(p.definition,'$.name'),json_extract(p.definition,'$.type'),
    json_extract(item.value,'$.snapshot'),'pending',?,?,?
   FROM json_each(?) item JOIN product_catalog p ON p.product_id=json_extract(item.value,'$.id')
   WHERE p.last_request=? AND p.revision=json_extract(item.value,'$.revision')+1
   ON CONFLICT(product_id) DO NOTHING`,op.actor,now(),op.key,JSON.stringify(targets),op.key);
}

export function refreshDeletionStatement(env,products) {
  const safe = products.filter(product=>!requiredProductReason(product.id));
  if (!safe.length) return;
  return query(env,eligibilitySQL+`
   UPDATE product_deletions AS d SET state=CASE WHEN e.ready=1 THEN 'ready' ELSE 'pending' END, checked_at=unixepoch()
   FROM eligibility e WHERE d.product_id=e.id AND d.state IN ('pending','ready')`,scopes(safe));
}

export function claimPermanentDeletion(env,op,targets) {
  return query(env,eligibilitySQL+`
   UPDATE product_deletions AS d SET state='purging',purge_request=?,purge_actor=?,last_error=NULL,
    checked_at=unixepoch(),lease=NULL,lease_until=0
   FROM eligibility e JOIN product_catalog p ON p.product_id=e.id
   JOIN json_each(?) target ON json_extract(target.value,'$.id')=e.id
   WHERE d.product_id=e.id AND d.state IN ('pending','ready','failed') AND e.ready=1
    AND p.revision=json_extract(target.value,'$.revision')`,
   scopes(targets),op.key,op.actor,JSON.stringify(targets));
}

export async function checkPendingDeletions(env,{limit=24,age=60}={}) {
  const products = await rows(env,`SELECT product_id id,type FROM product_deletions
   WHERE state IN ('pending','ready') AND checked_at<=? ORDER BY checked_at,product_id LIMIT ?`,now()-age,limit);
  await refreshDeletionStatement(env,products)?.run();
}

export async function checkDeletionAfterInventory(env,kind,inventoryId) {
  const lookup=kind==='gift'?'gift_inventory i ON i.gift_type=d.product_id':'player_inventory i ON i.item_key=d.product_id';
  const products=await rows(env,`SELECT d.product_id id,d.type FROM product_deletions d JOIN ${lookup}
   WHERE i.id=? AND d.state IN ('pending','ready')`,inventoryId);
  await refreshDeletionStatement(env,products)?.run();
}
