import * as AifectMessages from '../shared/system-messages.js';
import {giftSettlement} from './gift-settlement.js';
import {giftSourceEntry} from './gift-source.js';
import {inventoryTarget,recipientAllowedSQL,selectedInventoryIds,unitRequestKey} from './inventory-transfer.js';
import {one,rows,query,now,id,fail,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {giftById,silverGiftById,allocateLots,giftMonth} from '../shared/gifts.js';
import {producerNameSQL} from './identity.js';

const requestId=b=>{if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'요청 번호를 다시 확인해 주세요.');return b.request_id;};
// Codes are allocated and reserved by public_profile_ids; a lookup never
// generates or rewrites identity. Older clients can still send numeric IDs.
const publicIdentity=(value,legacy=false)=>{
 const text=String(value??'').trim().toUpperCase();
 if(/^[A-Z]{3}\d{4}$/.test(text))return {code:text};
 if(legacy&&/^\d+$/.test(text)&&Number.isSafeInteger(Number(text))&&Number(text)>0)return {number:Number(text)};
 fail(400,'회원 ID를 확인해 주세요. 영문 3자리와 숫자 4자리로 입력해 주세요.');
};
const paid=`status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')`;
export async function giftInventoryList(env,uid){
 const items=await rows(env,`SELECT i.id,i.gift_type,i.gift_name,i.currency,i.value,i.source,i.created,
  (i.currency!='gold' OR COALESCE((SELECT sum(l.gold) FROM gift_inventory_lots l WHERE l.inventory_id=i.id),0)=i.value) AND NOT EXISTS(SELECT 1 FROM gift_inventory_lots l JOIN gold_purchases ON gold_purchases.id=l.purchase_id WHERE l.inventory_id=i.id AND NOT (${paid})) available
  FROM gift_inventory i WHERE i.user_id=? AND i.used_at=0 ORDER BY i.created DESC,i.id`,uid);
 return items.map(i=>({...i,acquisition:i.source==='purchase'?'purchase':['reward','reward_locked'].includes(i.source)?'admin':'unknown',giftable:!!i.available&&['purchase','reward'].includes(i.source),image:(giftById(i.gift_type)||silverGiftById(i.gift_type))?.image||'',available:!!i.available}));
}
async function acquire(env,uid,b,operator=null){
 const key=requestId(b),gift=giftById(b.gift_type)||silverGiftById(b.gift_type),quantity=b.quantity??1;
 if(!gift||!Number.isInteger(quantity)||quantity<1||quantity>100)fail(400,'선물 종류와 수량(1~100개)을 확인해 주세요.');
 if(operator&&b.giftable!==undefined&&typeof b.giftable!=='boolean')fail(400,'선물 가능 여부를 확인해 주세요.');
 const currency=operator?'reward':gift.gold?'gold':'silver',value=operator?0:gift.gold||gift.silver,source=operator?(b.giftable===false?'reward_locked':'reward'):'purchase';
 const replay=async()=>{
  const old=await rows(env,'SELECT gift_type,currency,source,count(*) quantity FROM gift_inventory WHERE user_id=? AND request_id=? GROUP BY gift_type,currency,source',uid,key);
  if(!old.length)return false;
  if(old.length!==1||old[0].gift_type!==gift.id||old[0].currency!==currency||old[0].source!==source||old[0].quantity!==quantity)fail(409,'이미 사용된 요청 번호입니다.');
  if(operator){
   const audit=await one(env,`SELECT admin_id,json_extract(target,'$.reason') reason FROM admin_audit WHERE action='gift_inventory_grant'
    AND json_valid(target) AND json_extract(target,'$.user_id')=? AND json_extract(target,'$.request_id')=? LIMIT 1`,uid,key);
   if(!audit||audit.admin_id!==operator.id||audit.reason?.trim()!==b.reason.trim())fail(409,'이미 다른 지급에 사용된 요청 번호입니다.');
  }
  return true;
 };
 if(await replay())return;
 await rate(env,'inventory-acquire:'+uid,30,3600);
 const lots=currency==='gold'?await rows(env,`SELECT id,gold,used,price_krw,fee_krw,tax_krw FROM gold_purchases WHERE user_id=? AND used<gold AND ${paid} ORDER BY paid_at,id`,uid):[];
 if(currency==='silver'&&Number((await one(env,'SELECT balance FROM free_gift_wallets WHERE user_id=?',uid))?.balance||0)<value*quantity){if(await replay())return;fail(409,'실버가 부족합니다.');}
 const statements=[];
 if(currency==='silver')statements.push(query(env,'UPDATE free_gift_wallets SET balance=balance-? WHERE user_id=?',value*quantity,uid));
 for(let n=0;n<quantity;n++){
  const item=id();let spent=[];
  if(currency==='gold'){try{spent=allocateLots(lots,value);}catch{if(await replay())return;fail(409,'골드가 부족합니다.');}for(const l of spent)lots.find(x=>x.id===l.purchase_id).used+=l.gold;}
  statements.push(...spent.map(l=>query(env,'UPDATE gold_purchases SET used=used+? WHERE id=?',l.gold,l.purchase_id)));
  statements.push(query(env,'INSERT INTO gift_inventory(id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created) VALUES(?,?,?,?,?,?,?,?,?,?)',item,uid,gift.id,gift.name,currency,value,source,key,n,now()));
  statements.push(...spent.map(l=>query(env,'INSERT INTO gift_inventory_lots(inventory_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',item,l.purchase_id,l.gold,l.net_mw)));
 }
 if(operator)statements.push(query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',id(),operator.id,'gift_inventory_grant',JSON.stringify({user_id:uid,gift_type:gift.id,quantity,source,giftable:b.giftable!==false,request_id:key,reason:b.reason.trim()}),now()));
 try{await env.DB.batch(statements);}catch(e){if(/constraint/i.test(e.message)&&await replay())return;if(/constraint|refunded/i.test(e.message))fail(409,'잔액 또는 결제 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
}
export async function sendInventoryGift(env,user,itemId,b){
 const key=requestId(b),ids=selectedInventoryIds(itemId,b),selection=JSON.stringify(ids);
 const {profile,track,source:context}=await inventoryTarget(env,user,b);
 const units=await rows(env,`SELECT i.*,j.key position FROM json_each(?) j JOIN gift_inventory i ON i.id=j.value AND i.user_id=? ORDER BY j.key`,selection,user.id);
 if(units.length!==ids.length)fail(404,'보관 선물을 찾을 수 없습니다.');
 const first=units[0],source=context||{type:'inventory',id:first.id,title:first.gift_name};
 if(units.some(i=>i.gift_type!==first.gift_type||!['purchase','reward'].includes(i.source)))fail(409,'선물 가능한 동일 상품만 선택해 주세요.');
 const replay=async()=>{
  const sent=await rows(env,'SELECT id,recipient_id,send_request_id FROM gift_inventory WHERE user_id=? AND (send_request_id=? OR send_request_id GLOB ?)',user.id,key,key+':*');
  if(!sent.length)return false;
  const saved=new Map(sent.map(r=>[r.send_request_id,r]));
  if(sent.length!==ids.length||ids.some((id,index)=>{const r=saved.get(unitRequestKey(key,index));return r?.id!==id||r.recipient_id!==profile.id;}))fail(409,'이미 다른 선물에 사용한 요청입니다.');
  const stored=await one(env,'SELECT source_type,source_id FROM gift_sources WHERE gift_id=? AND currency=?',first.id,first.currency==='gold'?'gold':'silver');
  if(stored?.source_type!==source.type||stored?.source_id!==source.id)fail(409,'이미 다른 대상에게 사용한 요청입니다.');
  return true;
 };
 if(await replay())return;
 if(units.some(i=>i.used_at))fail(409,'이미 다른 대상에게 사용한 선물입니다.');
 const consumedCount=`(SELECT count(*) FROM gift_inventory i JOIN json_each(?) j ON i.id=j.value WHERE i.user_id=? AND i.recipient_id=? AND i.used_at>0 AND i.send_request_id=CASE WHEN j.key=0 THEN ? ELSE ?||':'||j.key END)`;
 const at=now(),writes=[query(env,`UPDATE gift_inventory SET used_at=?,recipient_id=CASE WHEN ${recipientAllowedSQL} AND source IN ('purchase','reward') THEN ? END,
  send_request_id=CASE WHEN j.key=0 THEN ? ELSE ?||':'||j.key END FROM json_each(?) j
  WHERE gift_inventory.user_id=? AND gift_inventory.id=j.value`,at,profile.user_id,user.id,user.id,profile.id,key,key,selection,user.id)];
 // Promotional units retain their zero monetary value, even when the same
 // product was bought with gold. Each ledger emits its ordinary receipt/reward.
 for(const currency of ['gold','silver']){
  const group=units.filter(i=>(i.currency==='gold'?'gold':'silver')===currency);if(!group.length)continue;
  const item=group[0],request=unitRequestKey(key,item.position),amount=group.reduce((sum,i)=>sum+i.value,0);
  if(currency==='gold'){
   const lots=await rows(env,`SELECT purchase_id,sum(gold) gold,sum(net_mw) net_mw FROM gift_inventory_lots
    WHERE inventory_id IN (SELECT value FROM json_each(?)) GROUP BY purchase_id`,JSON.stringify(group.map(i=>i.id)));
   const net=lots.reduce((n,l)=>n+l.net_mw,0),share=await giftSettlement(env,track||{producer_id:profile.id,user_id:profile.user_id,kind:'original'},net);
   writes.push(query(env,`INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,singer_profile_id,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created,gift_type,gift_name,request_id,quantity) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ${consumedCount}=? THEN ? END)`,item.id,user.id,track?.id??null,amount,net,share.singerProfile,share.creatorProfile,share.singer,share.creator,share.platform,giftMonth(at),at,item.gift_type,item.gift_name,request,selection,user.id,profile.id,key,key,ids.length,group.length));
   writes.push(query(env,`INSERT INTO gift_lots(gift_id,purchase_id,gold,net_mw) SELECT ?,purchase_id,sum(gold),sum(net_mw) FROM gift_inventory_lots WHERE inventory_id IN (SELECT value FROM json_each(?)) GROUP BY purchase_id`,item.id,JSON.stringify(group.map(i=>i.id))));
  }else{
   writes.push(query(env,`INSERT INTO free_gifts(id,sender_id,track_id,recipient_profile_id,request_id,created,gift_type,gift_name,silver,quantity) VALUES(?,?,?,?,?,?,?,?,?,CASE WHEN ${consumedCount}=? THEN ? END)`,item.id,user.id,track?.id??null,track?null:profile.id,request,at,item.gift_type,item.gift_name,amount,selection,user.id,profile.id,key,key,ids.length,group.length));
  }
  writes.push(giftSourceEntry(env,currency,item.id,source));
 }
 try{await env.DB.batch(writes);}catch(e){if(await replay())return;if(/constraint|inventory/i.test(e.message))fail(409,'선물이나 결제 상태가 바뀌었습니다. 다시 확인해 주세요.');throw e;}
}
export async function giftInventoryRoute(req,env,path,user){
 if(path==='/api/admin/gift-inventory/grant'){
  requireUser(user);if(!isAdmin(env,user))fail(403,'관리자 권한이 필요합니다.');if(req.method!=='POST')fail(405,AifectMessages.unsupportedRequest);
  const b=await req.json();if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>300)fail(400,'지급 사유를 입력해 주세요.');
  const identity=b.public_id!==undefined?publicIdentity(b.public_id):b.public_number!==undefined?publicIdentity(b.public_number,true):null;
  const recipient=identity?.code?await one(env,"SELECT u.id FROM users u JOIN public_profile_ids m ON m.user_id=u.id WHERE m.code=? AND u.provider!='deleted'",identity.code):identity?await one(env,"SELECT u.id FROM users u JOIN public_member_ids m ON m.user_id=u.id WHERE m.number=? AND u.provider!='deleted'",identity.number):await one(env,"SELECT id FROM users WHERE id=? AND provider!='deleted'",b.user_id||'');
  if(!recipient)fail(404,'회원을 찾을 수 없습니다.');await acquire(env,recipient.id,b,user);return json({ok:true});
 }
 if(!path.startsWith('/api/me/gift-inventory'))return null;requireUser(user);
 if(path==='/api/me/gift-inventory/recipient'&&req.method==='GET'){
  const params=new URL(req.url).searchParams,identity=params.has('public_id')?publicIdentity(params.get('public_id')):publicIdentity(params.get('number'),true);
  const p=await one(env,`SELECT p.id,p.user_id,${producerNameSQL()} name,m.number public_number,ids.code public_id FROM public_member_ids m JOIN users u ON u.id=m.user_id JOIN public_profile_ids ids ON ids.user_id=u.id JOIN producers p ON p.user_id=u.id WHERE ${identity.code?'ids.code':'m.number'}=? AND u.provider!='deleted'`,identity.code??identity.number);
  if(!p||p.user_id===user.id)fail(404,'선물할 다른 회원의 프로필을 찾을 수 없습니다.');assertUnblocked(env,p.user_id);const {user_id,...profile}=p;return json({profile});
 }
 if(path==='/api/me/gift-inventory'&&req.method==='GET')return json({items:await giftInventoryList(env,user.id)});
 if(path==='/api/me/gift-inventory/buy'&&req.method==='POST'){await acquire(env,user.id,await req.json());return json({items:await giftInventoryList(env,user.id)},201);}
 const m=path.match(/^\/api\/me\/gift-inventory\/([\w-]+)\/send$/);
 if(m&&req.method==='POST'){await sendInventoryGift(env,user,m[1],await req.json());return json({items:await giftInventoryList(env,user.id)});}
 fail(404,'보관 선물을 찾을 수 없습니다.');
}
