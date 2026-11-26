import {giftArrivalContent} from '../shared/gift-arrival.js';
import {rows} from './db.js';
import {dispatchRights} from './gift-dispatch-rights.js';

export async function withGiftArrivalDetails(env,uid,records){
 const keys=records.filter(record=>(record.campaign_kind??record.kind)==='gift')
  .map(r=>r.legacy_id??r.campaign_id);
 if(!keys.length)return records;
 const scope=`i.user_id=? AND i.dispatch_id IN (SELECT a.dispatch_id FROM gift_dispatch_items a
  JOIN welcome_receipts w ON w.campaign_id='gift-'||a.id AND w.user_id=a.user_id
  WHERE a.line=0 AND a.user_id=? AND w.campaign_id IN (SELECT value FROM json_each(?)))`;
 const matches=await rows(env,`${dispatchRights(scope)}
  SELECT 'gift-'||a.id campaign_id,d.message,
   json_extract(d.plan,'$['||i.line||']') product,i.expires_at issued_expiry,
   r.state,r.expires_at,r.active_until,r.season_ends_at,COUNT(r.inventory_id) quantity
  FROM gift_dispatch_items a JOIN gift_dispatches d ON d.id=a.dispatch_id
  JOIN gift_dispatch_items i INDEXED BY gift_dispatch_member_line
   ON i.dispatch_id=a.dispatch_id AND i.user_id=a.user_id AND i.state='granted'
  LEFT JOIN rights r ON r.item_id=i.id
  WHERE a.line=0 AND a.user_id=? AND a.id IN (SELECT substr(value,6) FROM json_each(?))
  GROUP BY a.id,i.line,r.state,r.expires_at,r.active_until,r.season_ends_at
  ORDER BY a.id,i.line,r.state,r.expires_at`,uid,uid,JSON.stringify(keys),uid,JSON.stringify(keys));
 const grouped=Map.groupBy(matches,row=>row.campaign_id);
 return records.map(record=>{
  const details=grouped.get(record.legacy_id??record.campaign_id);
  if(!details)return record;
  const products=details.map(row=>{
   const product=JSON.parse(row.product);
   return {...product,quantity:row.quantity||product.quantity,state:row.state??'unavailable',
    expires_at:row.state?row.expires_at:row.issued_expiry,active_until:row.active_until,season_ends_at:row.season_ends_at};
  });
  return {...record,gift_content:giftArrivalContent(details[0].message,products)};
 });
}
