import {appearanceDeadlineSQL,defaultFrameSQL,premiumFrameOverrideSQL} from './premium-appearance.js';
import {artistGiftSource,checkArtistGiftReplay,giftSourceEntry} from './gift-source.js';
import {one,rows,query,now,id,fail,json,rate,str} from './db.js';
import {requireUser,viewerBlockedIds} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {assertDmBody} from './dm-body.js';
import {producerNameSQL} from './identity.js';
import {allocateLots} from '../shared/gifts.js';
import {DECORATIONS,PERIOD_LABELS,quoteDecoration,decorationExpiry} from '../shared/decorations.js';
export const decorationSpendableSQL=`status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')`;
export const decorationFundingSQL=a=>`NOT EXISTS(SELECT 1 FROM decoration_orders co JOIN decoration_order_lots cl ON cl.order_id=co.id JOIN gold_purchases ON gold_purchases.id=cl.purchase_id WHERE (co.inventory_id=${a}.id OR co.inventory_id IN (SELECT inventory_id FROM decoration_redemptions WHERE active_inventory_id=${a}.id)) AND NOT (${decorationSpendableSQL}))`;
export const activeDecorationSQL=a=>`${a}.source='decoration' AND ${a}.revoked=0 AND ${a}.expires_at>unixepoch() AND ${decorationFundingSQL(a)}`;
const requestId=b=>{if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'요청 번호를 확인해 주세요.');return b.request_id;};
async function recipientUser(env,user,profile){
 if(typeof profile!=='string')fail(400,'받는 회원을 확인해 주세요.');
 const p=await one(env,"SELECT p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted' AND u.account_type='human'",profile);
 if(!p||p.user_id===user.id)fail(400,'선물할 다른 회원을 선택해 주세요.');
 assertUnblocked(env,p.user_id);if(viewerBlockedIds(user)?.includes(p.user_id))fail(403,'차단한 관계의 회원에게 선물할 수 없습니다.');return p.user_id;
}
export async function decorationInventory(env,uid){
 const inventory=await rows(env,`SELECT pi.*,COALESCE(co.period_code,(SELECT o.period_code FROM decoration_redemptions r JOIN decoration_orders o ON o.inventory_id=r.inventory_id WHERE r.active_inventory_id=pi.id ORDER BY r.created LIMIT 1)) period_code,
 (SELECT min(created) FROM decoration_redemptions r WHERE r.active_inventory_id=pi.id) activated_at,
 ((pi.source='decoration_stock' AND pi.revoked=0 AND ${decorationFundingSQL('pi')}) OR (${activeDecorationSQL('pi')})) available,
 ((pe.frame_inventory_id=pi.id AND NOT ${premiumFrameOverrideSQL('pi.user_id')}) OR EXISTS(SELECT 1 FROM room_decorations rd WHERE rd.host_id=pi.user_id AND rd.inventory_id=pi.id)) selected
 FROM player_inventory pi LEFT JOIN decoration_orders co ON co.inventory_id=pi.id LEFT JOIN player_equipment pe ON pe.user_id=pi.user_id
 WHERE pi.user_id=? AND ((pi.source='decoration' AND pi.revoked=0 AND (pi.expires_at=0 OR pi.expires_at>unixepoch())) OR (pi.source='decoration_stock' AND pi.revoked=0)) ORDER BY activated_at DESC,(SELECT max(rowid) FROM decoration_redemptions r WHERE r.active_inventory_id=pi.id) DESC,pi.granted_at DESC,pi.id`,uid);
 return inventory.filter(i=>Object.hasOwn(DECORATIONS,i.item_key)).map(i=>({...i,product:DECORATIONS[i.item_key],status:i.source==='decoration_stock'?'UNUSED':'ACTIVE',applied:!!i.available&&!!i.selected,available:!!i.available,equipped:!!i.available&&!!i.selected,stored:i.source==='decoration_stock'}));
}
// New theme rentals retain one active ownership record per purchased stock item.
// Existing aggregated entitlements and profile-frame extension policy stay intact.
export function themeActivationQueries(env,uid,stock,key,at=now()){
 const activeId='theme-'+stock.id,expires=decorationExpiry(at,stock.period_code);
 return {activeId,expires,queries:[
  query(env,"INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,?,'decoration',?,?)",activeId,uid,stock.item_key,stock.id,stock.granted_at),
  query(env,'INSERT INTO decoration_redemptions(inventory_id,user_id,request_id,active_inventory_id,previous_expires,previous_revoked,expires_at,created) VALUES(?,?,?,?,0,0,?,?)',stock.id,uid,key,activeId,expires,at),
  query(env,'UPDATE player_inventory SET revoked=1 WHERE id=?',stock.id),
  query(env,'UPDATE player_inventory SET expires_at=? WHERE id=?',expires,activeId)
 ]};
}
async function buyDecoration(env,user,b,gifting=false){
 const key=requestId(b);let quote;try{quote=quoteDecoration(b.sku,b.period);}catch(e){fail(400,e.message);}
 if(!gifting&&b.profile_id!==undefined)fail(400,'구매한 상품은 본인 인벤토리에 보관한 후 선물해 주세요.');
 const receiver=gifting?await recipientUser(env,user,b.profile_id):null,recipient=user.id;
 const message=gifting&&b.message!==undefined?str(b.message,2000,false):'';
 if(message){if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'닉네임을 먼저 저장해 주세요.');await rate(env,'dm:'+user.id,30,60);}
 const replay=async()=>{const old=await one(env,'SELECT * FROM decoration_orders WHERE payer_id=? AND request_id=?',user.id,key);if(old&&(old.sku!==quote.sku||old.period_code!==quote.period||old.recipient_id!==recipient))fail(409,'이미 다른 구매에 사용한 요청 번호입니다.');if(old&&gifting){const sent=await one(env,'SELECT recipient_id FROM decoration_transfers WHERE sender_id=? AND request_id=?',user.id,key);if(sent?.recipient_id!==receiver)fail(409,'이미 다른 선물에 사용한 요청 번호입니다.');const savedNote=await one(env,'SELECT body FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,'decoration:'+key);if((savedNote?.body||'')!==message)fail(409,'이미 다른 메시지에 사용한 선물 요청입니다.');}return old;};
 const previous=await replay();if(previous)return previous;if(message)assertDmBody(message);await rate(env,'decoration-buy:'+user.id,30,3600);
 const at=now(),inventoryId=id(),orderId=id(),lots=await rows(env,`SELECT * FROM gold_purchases WHERE user_id=? AND used<gold AND ${decorationSpendableSQL} ORDER BY paid_at,id`,user.id);
 let spent;try{spent=allocateLots(lots,quote.gold);}catch{const saved=await replay();if(saved)return saved;fail(409,'골드가 부족합니다.');}
 // Stock grant, immutable receipt and FIFO debits commit in one D1 transaction.
 try{await env.DB.batch([
  query(env,"INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,?,'decoration_stock',?,?)",inventoryId,recipient,quote.sku,orderId,at),
  query(env,'INSERT INTO decoration_orders(id,payer_id,recipient_id,request_id,sku,period_code,gold,inventory_id,created) VALUES(?,?,?,?,?,?,?,?,?)',orderId,user.id,recipient,key,quote.sku,quote.period,quote.gold,inventoryId,at),
  ...spent.flatMap(l=>[query(env,`UPDATE gold_purchases SET used=CASE WHEN ${decorationSpendableSQL} THEN used+? ELSE -1 END WHERE id=? AND user_id=?`,l.gold,l.purchase_id,user.id),query(env,'INSERT INTO decoration_order_lots(order_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',orderId,l.purchase_id,l.gold,l.net_mw)]),
  ...(gifting?[
   query(env,'INSERT INTO decoration_transfers(id,inventory_id,sender_id,recipient_id,request_id,created) VALUES(?,?,?,?,?,?)',id(),inventoryId,user.id,receiver,key,at),
   query(env,'UPDATE player_inventory SET user_id=? WHERE id=?',receiver,inventoryId),
   query(env,"INSERT INTO activity_notifications(id,recipient,actor_id,kind,target,gift_name,quantity,currency,amount,created) VALUES(?,?,?,'person_gift',?,?,1,'gold',?,?)",'decoration:'+orderId,receiver,user.id,b.profile_id,DECORATIONS[quote.sku].name,quote.gold,at),
   query(env,"INSERT INTO push_outbox(id,recipient,kind,target,created) VALUES(?,?,'person_gift',?,?)",'decoration:'+orderId,receiver,b.profile_id,at),
   ...(message?[query(env,'INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)',id(),user.id,receiver,message,'decoration:'+key,at)]:[])
  ]:[])
 ]);return await replay();}catch(e){const saved=await replay();if(saved)return saved;if(/constraint|decoration_|refunded/i.test(e.message))fail(409,'잔액이나 보유 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
}
async function useDecoration(env,user,inventoryId,b){
 const key=requestId(b),replay=async()=>{const old=await one(env,'SELECT * FROM decoration_redemptions WHERE user_id=? AND request_id=?',user.id,key);if(old&&old.inventory_id!==inventoryId)fail(409,'이미 사용한 요청 번호입니다.');return old;};
 const saved=await replay();if(saved)return saved;await rate(env,'decoration-use:'+user.id,60,3600);
 for(let attempt=0;attempt<4;attempt++){
  const stock=await one(env,`SELECT pi.*,co.period_code FROM player_inventory pi JOIN decoration_orders co ON co.inventory_id=pi.id WHERE pi.id=? AND pi.user_id=? AND pi.source='decoration_stock' AND pi.revoked=0 AND ${decorationFundingSQL('pi')}`,inventoryId,user.id);
  if(!stock){const old=await replay();if(old)return old;fail(409,'사용 가능한 보관 아이템이 아닙니다.');}
  if(DECORATIONS[stock.item_key]?.kind==='TALKING_ROOM_THEME'){
   try{await env.DB.batch(themeActivationQueries(env,user.id,stock,key).queries);return await replay();}
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
   query(env,'UPDATE player_inventory SET expires_at=?,revoked=0 WHERE id=?',expires,activeId)
  ]);return await replay();}catch(e){const old=await replay();if(old)return old;if(/decoration_inventory_changed/i.test(e.message)&&attempt<3)continue;if(/constraint|decoration_/i.test(e.message))fail(409,'아이템 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
 }
}
async function sendDecoration(env,user,inventoryId,b){
 const key=requestId(b),recipient=await recipientUser(env,user,b.profile_id);
 const source=await artistGiftSource(env,b.artist_id,b.profile_id,user.id);
 const replay=async()=>{const old=await one(env,'SELECT * FROM decoration_transfers WHERE sender_id=? AND request_id=?',user.id,key);if(old)await checkArtistGiftReplay(env,'decoration',old.id,source);if(old&&(old.inventory_id!==inventoryId||old.recipient_id!==recipient))fail(409,'이미 사용한 요청 번호입니다.');return old;};
 const prior=await replay();if(prior)return prior;
 if(!await one(env,`SELECT id FROM player_inventory pi WHERE pi.id=? AND pi.user_id=? AND pi.source='decoration_stock' AND pi.revoked=0 AND ${decorationFundingSQL('pi')}`,inventoryId,user.id))fail(409,'사용 전 보관 아이템만 선물할 수 있습니다.');
 await rate(env,'decoration-send:'+user.id,60,3600);
 const transferId=id();
 try{await env.DB.batch([query(env,'INSERT INTO decoration_transfers(id,inventory_id,sender_id,recipient_id,request_id,created) VALUES(?,?,?,?,?,?)',transferId,inventoryId,user.id,recipient,key,now()),query(env,'UPDATE player_inventory SET user_id=? WHERE id=?',recipient,inventoryId),...(source?[giftSourceEntry(env,'decoration',transferId,source)]:[])]);return await replay();}catch(e){const old=await replay();if(old)return old;if(/constraint|decoration_/i.test(e.message))fail(409,'이미 사용했거나 선물한 아이템입니다.');throw e;}
}
export async function decorationRoute(req,env,path,user){
 if(!path.startsWith('/api/decorations'))return null;
 if(path==='/api/decorations'&&req.method==='GET')return json({products:Object.values(DECORATIONS),periods:PERIOD_LABELS,inventory:user?await decorationInventory(env,user.id):[],server_now:now()});
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
  return json({avatars:avatars.map(p=>{
   const product=p.premium_default_frame&&p.premium_style_until>now()?null:DECORATIONS[p.item_key],assets=product?.kind==='PROFILE_FRAME'?product.assetPaths:null;
   return {...p,item_key:assets?p.item_key:null,expires_at:assets?p.expires_at:null,artwork:assets?.overlay||null,...(assets?.effect?{effect:assets.effect}:{})};
  }),server_now:now()});
 }
 requireUser(user);
 if(path==='/api/decorations/recipients'&&req.method==='GET'){
  const q=(new URL(req.url).searchParams.get('q')||'').trim().slice(0,60);
  await rate(env,'decoration-recipients:'+user.id,120,60);
  const name=producerNameSQL();
  const profiles=await rows(env,`SELECT p.id,${name} name,p.image_version,m.number public_number FROM producers p JOIN users u ON u.id=p.user_id LEFT JOIN public_member_ids m ON m.user_id=u.id WHERE p.user_id!=? AND u.provider!='deleted' AND u.account_type='human' AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=? AND b.blocked_id=p.user_id) OR (b.blocked_id=? AND b.user_id=p.user_id)) AND ${q?`(m.number=? OR instr(lower(${name}),lower(?))>0)`:`(EXISTS(SELECT 1 FROM follows f WHERE f.user_id=? AND f.kind='producer' AND f.target_id=p.id) OR EXISTS(SELECT 1 FROM direct_messages d WHERE (d.sender_id=? AND d.recipient_id=p.user_id) OR (d.recipient_id=? AND d.sender_id=p.user_id)))`} ORDER BY ${q?'CASE WHEN m.number=? THEN 0 ELSE 1 END,':''} name,p.id LIMIT 20`,user.id,user.id,user.id,...(q?[/^\d+$/.test(q)?Number(q):-1,q,/^\d+$/.test(q)?Number(q):-1]:[user.id,user.id,user.id]));
  return json({profiles});
 }
 if(path==='/api/decorations/gift'&&req.method==='POST')return json({order:await buyDecoration(env,user,await req.json(),true)},201);
 if(path==='/api/decorations/buy'&&req.method==='POST')return json({order:await buyDecoration(env,user,await req.json()),inventory:await decorationInventory(env,user.id),server_now:now()},201);
 const match=path.match(/^\/api\/decorations\/inventory\/([\w-]+)\/(use|send)$/);
 if(match&&req.method==='POST')return json({receipt:await (match[2]==='use'?useDecoration:sendDecoration)(env,user,match[1],await req.json()),inventory:await decorationInventory(env,user.id),server_now:now()});
 fail(404,'꾸미기 상품을 찾을 수 없습니다.');
}
