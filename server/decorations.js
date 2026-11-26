import {appearanceDeadlineSQL,defaultFrameSQL,premiumFrameId,premiumFrameOverrideSQL} from './premium-appearance.js';
import {giftSourceEntry} from './gift-source.js';
import {one,rows,query,now,id,fail,json,rate,str} from './db.js';
import {requireUser} from './auth.js';
// Preserve the module initialization order of the installed public renderer.
import './account-safety.js';
import {inventoryTarget,recipientAllowedSQL,selectedInventoryIds,unitRequestKey} from './inventory-transfer.js';
import {giftRecipientRecommendations} from './gift-recipients.js';
import {assertDmBody} from './dm-body.js';
import {producerNameSQL} from './identity.js';
import {allocateLots} from '../shared/gifts.js';
import {PERIOD_LABELS,PERMANENT_PERIOD,decorationExpiry} from '../shared/decorations.js';
import {catalog,sold,productById,decorationRuntime,assertProductAction,productWriteGuard} from './product-catalog.js';
import {bumpGiftArrivalVersion} from './notice-visibility.js';
export const decorationSpendableSQL=`status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')`;
export const decorationFundingSQL=a=>`NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=${a}.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=${a}.id)) AND NOT (${decorationSpendableSQL}))`;
const decorationTimeSQL=a=>`(${a}.expires_at>unixepoch() OR (${a}.expires_at=0 AND COALESCE(${a}.period_code,'')='PERMANENT'))`;
export const activeDecorationSQL=a=>`${a}.source='decoration' AND ${a}.revoked=0 AND ${decorationTimeSQL(a)} AND ${decorationFundingSQL(a)}`;
const stockDeadlineSQL=a=>`(${a}.redeem_before IS NULL OR ${a}.redeem_before>unixepoch())
 AND (${a}.season_ends_at IS NULL OR ${a}.season_ends_at>unixepoch())`;
export const stockDecorationSQL=a=>`${a}.source='decoration_stock' AND ${a}.revoked=0 AND ${stockDeadlineSQL(a)} AND ${decorationFundingSQL(a)}`;
export const permanentHeldSQL=(user,sku)=>`EXISTS(SELECT 1 FROM player_inventory p
 WHERE p.user_id=${user} AND p.item_key=${sku} AND p.period_code='PERMANENT' AND
 ((${activeDecorationSQL('p')}) OR (${stockDecorationSQL('p')})))`;
const requestId=b=>{if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'요청 번호를 확인해 주세요.');return b.request_id;};
const directStockSQL=alias=>`EXISTS(SELECT 1 FROM decoration_orders own WHERE own.inventory_id=${alias}.id AND own.payer_id=${alias}.user_id AND own.recipient_id=${alias}.user_id)
 AND NOT EXISTS(SELECT 1 FROM decoration_transfers sent WHERE sent.inventory_id=${alias}.id)`;
const sourceStockSQL=column=>`(${column}=pi.id OR ${column} IN (SELECT r.inventory_id FROM decoration_redemptions r WHERE r.active_inventory_id=pi.id))`;
export async function decorationInventory(env,uid){
 const inventory=await rows(env,`SELECT pi.*,
 (EXISTS(SELECT 1 FROM decoration_transfers t WHERE t.recipient_id=pi.user_id AND ${sourceStockSQL('t.inventory_id')})
  OR EXISTS(SELECT 1 FROM decoration_orders o WHERE o.payer_id!=pi.user_id AND o.recipient_id=pi.user_id AND ${sourceStockSQL('o.inventory_id')})) received,
 EXISTS(SELECT 1 FROM decoration_orders o WHERE o.payer_id=pi.user_id AND o.recipient_id=pi.user_id AND ${sourceStockSQL('o.inventory_id')}
  AND NOT EXISTS(SELECT 1 FROM decoration_transfers t WHERE t.inventory_id=o.inventory_id)) own_purchase,
 COALESCE(pi.period_code,co.period_code,(SELECT o.period_code FROM decoration_redemptions r JOIN decoration_orders o ON o.inventory_id=r.inventory_id WHERE r.active_inventory_id=pi.id ORDER BY r.created LIMIT 1)) option_period,
 (SELECT min(created) FROM decoration_redemptions r WHERE r.active_inventory_id=pi.id) activated_at,
 ((${stockDecorationSQL('pi')}) OR (${activeDecorationSQL('pi')})) available,
 ((pe.frame_inventory_id=pi.id AND NOT ${premiumFrameOverrideSQL('pi.user_id')}) OR EXISTS(SELECT 1 FROM room_decorations rd WHERE rd.host_id=pi.user_id AND rd.inventory_id=pi.id)) selected
 FROM player_inventory pi LEFT JOIN decoration_orders co ON co.inventory_id=pi.id LEFT JOIN player_equipment pe ON pe.user_id=pi.user_id
 WHERE pi.user_id=? AND pi.revoked=0 AND ((pi.source='decoration' AND (pi.expires_at=0 OR pi.expires_at>unixepoch()))
 OR (pi.source='decoration_stock' AND ${stockDeadlineSQL('pi')})) ORDER BY activated_at DESC,
 (SELECT max(rowid) FROM decoration_redemptions r WHERE r.active_inventory_id=pi.id) DESC,pi.granted_at DESC,pi.id`,uid);
 const products=await catalog(env,inventory.map(i=>i.item_key));
 return inventory.filter(i=>decorationRuntime(products.get(i.item_key))).map(i=>{
  const {grant_terms,dispatch_item,option_period,...entry}=i,stored=i.source==='decoration_stock';
  return {...entry,period_code:option_period,reward_deadline:stored?i.redeem_before:null,
   giftable:!!i.available&&stored&&!!i.own_purchase&&!i.received,
   acquisition:grant_terms?JSON.parse(grant_terms).origin:i.received?(i.own_purchase?'mixed':'received'):i.own_purchase?'purchase':'unknown',
   product:decorationRuntime(products.get(i.item_key)),status:stored?'UNUSED':'ACTIVE',
   applied:!!i.available&&!!i.selected,available:!!i.available,equipped:!!i.available&&!!i.selected,stored};
 });
}
// New theme rentals retain one active ownership record per purchased stock item.
// Existing aggregated entitlements and profile-frame extension policy stay intact.
export function themeActivationQueries(env,uid,stock,key,at=now()){
 const activeId=(stock.grant_terms?'grant-active-':'theme-')+stock.id,baseExpiry=decorationExpiry(at,stock.period_code);
 const expires=stock.season_ends_at?Math.min(baseExpiry||stock.season_ends_at,stock.season_ends_at):baseExpiry;
 return {activeId,expires,queries:[
  query(env,`INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,period_code,season_ends_at,grant_terms)
   VALUES(?,?,?,'decoration',?,?,?,?,?)`,activeId,uid,stock.item_key,stock.id,stock.granted_at,stock.period_code,
   stock.season_ends_at??null,stock.grant_terms??null),
  query(env,'INSERT INTO decoration_redemptions(inventory_id,user_id,request_id,active_inventory_id,previous_expires,previous_revoked,expires_at,created) VALUES(?,?,?,?,0,0,?,?)',stock.id,uid,key,activeId,expires,at),
  query(env,'UPDATE player_inventory SET revoked=1 WHERE id=?',stock.id),
  query(env,'UPDATE player_inventory SET expires_at=? WHERE id=?',expires,activeId),
  ...(stock.dispatch_item?[bumpGiftArrivalVersion(env,'SELECT dispatch_id,user_id FROM gift_dispatch_items WHERE id=?',stock.dispatch_item)]:[])
 ]};
}
async function buyDecoration(env,user,b,gifting=false){
 const key=requestId(b);
 if(typeof b.sku!=='string'||!Object.hasOwn(PERIOD_LABELS,b.period)||b.period===PERMANENT_PERIOD)fail(400,'상품과 이용 기간을 확인해 주세요.');
 const quote={sku:b.sku,period:b.period};
 if(!gifting&&b.profile_id!==undefined)fail(400,'구매한 상품은 본인 인벤토리에 보관한 후 선물해 주세요.');
 const target=gifting?await inventoryTarget(env,user,b):null,receiver=target?.profile.user_id,recipient=user.id;
 const message=gifting&&b.message!==undefined?str(b.message,2000,false):'';
 if(message){if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'닉네임을 먼저 저장해 주세요.');await rate(env,'dm:'+user.id,30,60);}
 const replay=async()=>{const old=await one(env,'SELECT * FROM decoration_orders WHERE payer_id=? AND request_id=?',user.id,key);if(old&&(old.sku!==quote.sku||old.period_code!==quote.period||old.recipient_id!==recipient))fail(409,'이미 다른 구매에 사용한 요청 번호입니다.');if(old&&gifting){const sent=await one(env,'SELECT id,recipient_id FROM decoration_transfers WHERE sender_id=? AND request_id=?',user.id,key);if(sent)await validateTransferContext(env,sent.id,target.source);if(sent?.recipient_id!==receiver)fail(409,'이미 다른 선물에 사용한 요청 번호입니다.');const savedNote=await one(env,'SELECT body FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,'decoration:'+key);if((savedNote?.body||'')!==message)fail(409,'이미 다른 메시지에 사용한 선물 요청입니다.');}return old;};
 const previous=await replay();if(previous)return previous;
 const definition=await productById(env,b.sku),product=decorationRuntime(definition);
 if(!definition||definition.type==='gift')fail(400,'상품과 이용 기간을 확인해 주세요.');
 assertProductAction(definition,'sale');
 quote.gold=product?.periodPrices[b.period];
 if(!quote.gold)fail(400,'상품과 이용 기간을 확인해 주세요.');
 if(b.expected_gold!==undefined&&b.expected_gold!==quote.gold)fail(409,'가격이 바뀌었습니다. 상품을 다시 선택해 주세요.');
 const sku=productWriteGuard(definition,quote.sku);
 if(message)assertDmBody(message);await rate(env,'decoration-buy:'+user.id,30,3600);
 const at=now(),inventoryId=id(),orderId=id(),transferId=gifting?id():null,lots=await rows(env,`SELECT * FROM gold_purchases WHERE user_id=? AND used<gold AND ${decorationSpendableSQL} ORDER BY paid_at,id`,user.id);
 let spent;try{spent=allocateLots(lots,quote.gold);}catch{const saved=await replay();if(saved)return saved;fail(409,'골드가 부족합니다.');}
 // Stock grant, immutable receipt and FIFO debits commit in one D1 transaction.
 try{await env.DB.batch([
  query(env,`INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,${sku.sql},'decoration_stock',?,?)`,inventoryId,recipient,...sku.args,orderId,at),
  query(env,'INSERT INTO decoration_orders(id,payer_id,recipient_id,request_id,sku,period_code,gold,inventory_id,created) VALUES(?,?,?,?,?,?,?,?,?)',orderId,user.id,recipient,key,quote.sku,quote.period,quote.gold,inventoryId,at),
  ...spent.flatMap(l=>[query(env,`UPDATE gold_purchases SET used=CASE WHEN ${decorationSpendableSQL} THEN used+? ELSE -1 END WHERE id=? AND user_id=?`,l.gold,l.purchase_id,user.id),query(env,'INSERT INTO decoration_order_lots(order_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',orderId,l.purchase_id,l.gold,l.net_mw)]),
  ...(gifting?[
   transferReceipts(env,[{id:transferId,stock:inventoryId,key}],user.id,receiver,at),
   ...(target.source?[giftSourceEntry(env,'decoration',transferId,target.source)]:[]),
   query(env,'UPDATE player_inventory SET user_id=? WHERE id=?',receiver,inventoryId),
   query(env,"INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,gift_name,quantity,currency,amount,created) VALUES(?,?,?,'person_gift',?,?,1,'gold',?,?)",'decoration:'+orderId,receiver,user.id,b.profile_id,product.name,quote.gold,at),
   query(env,"INSERT INTO push_outbox(id,recipient,kind,target,created) VALUES(?,?,'person_gift',?,?)",'decoration:'+orderId,receiver,b.profile_id,at),
   ...(message?[query(env,'INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)',id(),user.id,receiver,message,'decoration:'+key,at)]:[])
  ]:[])
 ]);return await replay();}catch(e){const saved=await replay();if(saved)return saved;if(/constraint|decoration_|refunded/i.test(e.message))fail(409,'잔액이나 보유 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
}
async function useDecoration(env,user,inventoryId,b){
 if(b.equip!==undefined&&typeof b.equip!=='boolean')fail(400,'착용 여부를 확인해 주세요.');
 const key=requestId(b),replay=async()=>{const old=await one(env,'SELECT * FROM decoration_redemptions WHERE user_id=? AND request_id=?',user.id,key);if(old&&old.inventory_id!==inventoryId)fail(409,'이미 사용한 요청 번호입니다.');return old;};
 const saved=await replay();if(saved)return saved;await rate(env,'decoration-use:'+user.id,60,3600);
 for(let attempt=0;attempt<4;attempt++){
  const stock=await one(env,`SELECT pi.*,COALESCE(pi.period_code,co.period_code) option_period
   FROM player_inventory pi LEFT JOIN decoration_orders co ON co.inventory_id=pi.id
   WHERE pi.id=? AND pi.user_id=? AND ${stockDecorationSQL('pi')} AND (co.id IS NOT NULL OR pi.grant_terms IS NOT NULL)`,inventoryId,user.id);
  if(!stock){const old=await replay();if(old)return old;fail(409,'사용 가능한 보관 아이템이 아닙니다.');}
  const product=decorationRuntime(await productById(env,stock.item_key));
  if(!product||!Object.hasOwn(PERIOD_LABELS,stock.option_period))fail(409,'꾸미기 상품이나 이용 기간을 찾을 수 없습니다.');
  stock.period_code=stock.option_period;
  const theme=product.kind==='TALKING_ROOM_THEME';
  if(theme&&b.equip===true)fail(400,'테마는 방 테마 설정에서 적용해 주세요.');
  if(theme||stock.grant_terms){
   const activation=themeActivationQueries(env,user.id,stock,key);
   const equip=b.equip===true?[
    query(env,'INSERT INTO player_equipment(user_id,frame_inventory_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET frame_inventory_id=excluded.frame_inventory_id',user.id,activation.activeId),
    query(env,"DELETE FROM player_inventory WHERE id=? AND user_id=? AND source='premium'",premiumFrameId(user.id),user.id)
   ]:[];
   try{await env.DB.batch([...activation.queries,...equip]);return await replay();}
   catch(e){const old=await replay();if(old)return old;if(/constraint|decoration_/i.test(e.message))fail(409,'상품 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
  }
  const active=await one(env,"SELECT * FROM player_inventory WHERE user_id=? AND source='decoration' AND source_ref=?",user.id,stock.item_key);
  if(active&&!await one(env,`SELECT id FROM player_inventory pi WHERE pi.id=? AND ${decorationFundingSQL('pi')}`,active.id))fail(409,'이전 아이템의 결제를 확인 중입니다.');
  const at=now(),activeId=active?.id||id(),expires=decorationExpiry(Math.max(at,active?.revoked?0:active?.expires_at||0),stock.period_code);
  try{await env.DB.batch([
   query(env,"INSERT OR IGNORE INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,?,'decoration',?,?)",activeId,user.id,stock.item_key,stock.item_key,at),
   query(env,'INSERT INTO decoration_redemptions(inventory_id,user_id,request_id,active_inventory_id,previous_expires,previous_revoked,expires_at,created) VALUES(?,?,?,?,?,?,?,?)',inventoryId,user.id,key,activeId,active?.expires_at||0,active?.revoked||0,expires,at),
   query(env,'UPDATE player_inventory SET revoked=1 WHERE id=?',inventoryId),
   query(env,'UPDATE player_equipment SET frame_inventory_id=NULL WHERE frame_inventory_id=? AND EXISTS(SELECT 1 FROM player_inventory WHERE id=? AND (expires_at<=? OR revoked!=0))',activeId,activeId,at),
   query(env,'UPDATE player_inventory SET expires_at=?,revoked=0 WHERE id=?',expires,activeId),
   ...(b.equip===true?[
    query(env,'INSERT INTO player_equipment(user_id,frame_inventory_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET frame_inventory_id=excluded.frame_inventory_id',user.id,activeId),
    query(env,"DELETE FROM player_inventory WHERE id=? AND user_id=? AND source='premium'",premiumFrameId(user.id),user.id)
   ]:[])
  ]);return await replay();}catch(e){const old=await replay();if(old)return old;if(/decoration_inventory_changed/i.test(e.message)&&attempt<3)continue;if(/constraint|decoration_/i.test(e.message))fail(409,'아이템 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
 }
}
async function validateTransferContext(env,transferId,expected){
 const source=await one(env,"SELECT source_type,source_id FROM gift_sources WHERE currency='decoration' AND gift_id=?",transferId);
 if((source?.source_type??null)!==(expected?.type??null)||(source?.source_id??null)!==(expected?.id??null))fail(409,'이미 다른 대상에게 사용한 요청입니다.');
}
function transferReceipts(env,units,sender,receiver,at){
 return query(env,`INSERT INTO decoration_transfers(id,inventory_id,sender_id,recipient_id,request_id,created)
  SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.stock'),
  CASE WHEN ${recipientAllowedSQL} AND EXISTS(SELECT 1 FROM player_inventory pi WHERE pi.id=json_extract(j.value,'$.stock') AND pi.user_id=? AND ${directStockSQL('pi')}) THEN ? END,
  ?,json_extract(j.value,'$.key'),? FROM json_each(?) j`,receiver,sender,sender,sender,sender,receiver,at,JSON.stringify(units));
}
async function sendDecoration(env,user,inventoryId,b){
 const key=requestId(b),ids=selectedInventoryIds(inventoryId,b),selection=JSON.stringify(ids);
 const {profile,source}=await inventoryTarget(env,user,b);
 const replay=async()=>{
  const previous=await rows(env,'SELECT * FROM decoration_transfers WHERE sender_id=? AND (request_id=? OR request_id GLOB ?)',user.id,key,key+':*');
  if(!previous.length)return;
  const saved=new Map(previous.map(r=>[r.request_id,r]));
  if(previous.length!==ids.length||ids.some((id,index)=>{const row=saved.get(unitRequestKey(key,index));return row?.inventory_id!==id||row.recipient_id!==profile.user_id;}))fail(409,'이미 다른 선물에 사용한 요청입니다.');
  const first=saved.get(key);await validateTransferContext(env,first.id,source);return first;
 };
 const prior=await replay();if(prior)return prior;
 const stock=await rows(env,`SELECT pi.id,pi.item_key,o.period_code FROM json_each(?) j JOIN player_inventory pi ON pi.id=j.value
  JOIN decoration_orders o ON o.inventory_id=pi.id WHERE pi.user_id=? AND pi.source='decoration_stock' AND pi.revoked=0
  AND ${directStockSQL('pi')} AND ${decorationFundingSQL('pi')} ORDER BY j.key`,selection,user.id);
 if(stock.length!==ids.length||stock.some(i=>i.item_key!==stock[0].item_key||i.period_code!==stock[0].period_code)){
  const old=await replay();if(old)return old;fail(409,'직접 구매한 동일 기간의 미사용 상품만 선물할 수 있습니다.');
 }
 await rate(env,'decoration-send:'+user.id,60,3600);
 const at=now(),units=ids.map((stock,index)=>({id:id(),stock,key:unitRequestKey(key,index)})),firstTransfer=units[0].id;
 const writes=[transferReceipts(env,units,user.id,profile.user_id,at)];
 if(source)writes.push(query(env,`INSERT INTO gift_sources(currency,gift_id,source_type,source_id,source_title,work_kind)
  SELECT 'decoration',json_extract(j.value,'$.id'),?,?,?,? FROM json_each(?) j`,source.type,source.id,source.title,source.workKind??null,JSON.stringify(units)));
 writes.push(query(env,'UPDATE player_inventory SET user_id=? WHERE user_id=? AND id IN (SELECT value FROM json_each(?))',profile.user_id,user.id,selection),
  query(env,"INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,gift_name,quantity,currency,amount,created) VALUES(?,?,?,'person_gift',?,?,?,'',0,?)",'decoration:'+firstTransfer,profile.user_id,user.id,profile.id,decorationRuntime(await productById(env,stock[0].item_key))?.name||'꾸미기 상품',ids.length,at),
  query(env,"INSERT INTO push_outbox(id,recipient,kind,target,created) VALUES(?,?,'person_gift',?,?)",'decoration:'+firstTransfer,profile.user_id,profile.id,at));
 try{await env.DB.batch(writes);return await replay();}catch(e){const old=await replay();if(old)return old;if(/constraint|decoration_/i.test(e.message))fail(409,'이미 사용했거나 선물할 수 없는 아이템입니다.');throw e;}
}
export async function decorationRoute(req,env,path,user){
 if(!path.startsWith('/api/decorations'))return null;
 if(path==='/api/decorations'&&req.method==='GET'){
  const products=[...(await catalog(env)).values()].filter(sold).map(decorationRuntime).filter(Boolean);
  const periods=Object.fromEntries(Object.entries(PERIOD_LABELS).filter(([key])=>key!==PERMANENT_PERIOD));
  return json({products,periods,inventory:user?await decorationInventory(env,user.id):[],server_now:now()});
 }
 if(path==='/api/decorations/avatars'&&req.method==='GET'){
  const ids=[...new Set((new URL(req.url).searchParams.get('profiles')||'').split(','))];
  if(ids.length>80||ids.some(key=>!/^(?:member:)?[-\w]{1,100}$/.test(key)))fail(400,'프로필을 확인해 주세요.');
  // Reuse the bounded decoration lookup for both producer IDs and members without a producer profile.
  const avatars=await rows(env,`WITH requested AS (SELECT value key FROM json_each(?)),
   resolved AS (
    SELECT r.key,p.id profile_id,p.user_id uid FROM requested r JOIN producers p ON p.id=r.key
    UNION ALL
    SELECT r.key,p.id,u.id FROM requested r JOIN users u ON u.id=substr(r.key,8)
     LEFT JOIN producers p ON p.user_id=u.id WHERE substr(r.key,1,7)='member:'
   )
   SELECT r.key lookup_key,r.profile_id,pi.item_key,pi.expires_at,
    ${appearanceDeadlineSQL('u')} premium_style_until,${defaultFrameSQL('u.id')} premium_default_frame
   FROM resolved r JOIN users u ON u.id=r.uid AND u.provider!='deleted'
   LEFT JOIN player_equipment pe ON pe.user_id=u.id
   LEFT JOIN player_inventory pi ON pi.id=pe.frame_inventory_id AND pi.user_id=u.id AND ${activeDecorationSQL('pi')}`,JSON.stringify(ids));
  const products=await catalog(env,avatars.map(p=>p.item_key));
  return json({avatars:avatars.map(p=>{
   const product=p.premium_default_frame&&p.premium_style_until>now()?null:decorationRuntime(products.get(p.item_key)),assets=product?.kind==='PROFILE_FRAME'?product.assetPaths:null;
   return {...p,item_key:assets?p.item_key:null,expires_at:assets?p.expires_at:null,artwork:assets?.overlay||null,...(assets?.effect?{effect:assets.effect}:{})};
  }),server_now:now()});
 }
 requireUser(user);
 if(path==='/api/decorations/recipients'&&req.method==='GET'){
  const params=new URL(req.url).searchParams;
  const q=(params.get('q')||'').trim().slice(0,60);
  await rate(env,'decoration-recipients:'+user.id,120,60);
  if(!q&&params.get('scope')==='gift')return json({profiles:await giftRecipientRecommendations(env,user.id)});
  const name=producerNameSQL();
  const follow=(from,toUser,toProfile)=>`EXISTS(SELECT 1 FROM follows f WHERE f.user_id=${from} AND ((f.kind='producer' AND f.target_id=${toProfile}) OR (f.kind='member' AND f.target_id=${toUser})))`;
  const following=follow('viewer.id','p.user_id','p.id'),followed=follow('p.user_id','viewer.id','viewer.profile_id');
  const suggestions=`(${following} OR EXISTS(SELECT 1 FROM direct_messages d WHERE (d.sender_id=viewer.id AND d.recipient_id=p.user_id) OR (d.recipient_id=viewer.id AND d.sender_id=p.user_id)))`;
  const profiles=await rows(env,`WITH viewer AS (SELECT ? id,(SELECT id FROM producers WHERE user_id=?) profile_id)
   SELECT p.id,${name} name,p.image_version,m.number public_number,ids.code public_id,
    ${appearanceDeadlineSQL('u')} premium_style_until,${defaultFrameSQL('u.id')} premium_default_frame
   FROM producers p JOIN users u ON u.id=p.user_id CROSS JOIN viewer LEFT JOIN public_member_ids m ON m.user_id=u.id
   LEFT JOIN public_profile_ids ids ON ids.user_id=u.id WHERE p.user_id!=viewer.id AND u.provider!='deleted' AND u.account_type='human'
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=viewer.id AND b.blocked_id=p.user_id) OR (b.blocked_id=viewer.id AND b.user_id=p.user_id))
   AND ${q?`(m.number=? OR ids.code=? OR instr(lower(${name}),lower(?))>0)`:suggestions}
   ORDER BY ${q?'CASE WHEN m.number=? OR ids.code=? THEN 0 ELSE 1 END':`(${following} AND ${followed}) DESC`},name,p.id LIMIT 20`,
   user.id,user.id,...(q?[/^\d+$/.test(q)?Number(q):-1,q.toUpperCase(),q,/^\d+$/.test(q)?Number(q):-1,q.toUpperCase()]:[]));
  return json({profiles});
 }
 if(path==='/api/decorations/gift'&&req.method==='POST')return json({order:await buyDecoration(env,user,await req.json(),true)},201);
 if(path==='/api/decorations/buy'&&req.method==='POST')return json({order:await buyDecoration(env,user,await req.json()),inventory:await decorationInventory(env,user.id),server_now:now()},201);
 const match=path.match(/^\/api\/decorations\/inventory\/([\w-]+)\/(use|send)$/);
 if(match&&req.method==='POST')return json({receipt:await (match[2]==='use'?useDecoration:sendDecoration)(env,user,match[1],await req.json()),inventory:await decorationInventory(env,user.id),server_now:now()});
 fail(404,'꾸미기 상품을 찾을 수 없습니다.');
}
