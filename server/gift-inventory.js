import {one,rows,query,now,id,fail,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {giftById,silverGiftById,allocateLots,splitGift,giftMonth} from '../shared/gifts.js';
import {partnerState} from './diamonds.js';
import {producerNameSQL} from './identity.js';

const requestId=b=>{if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'요청 번호를 다시 확인해주세요.');return b.request_id;};
// Codes are allocated and reserved by public_profile_ids; a lookup never
// generates or rewrites identity. Older clients can still send numeric IDs.
const publicIdentity=(value,legacy=false)=>{
 const text=String(value??'').trim().toUpperCase();
 if(/^[A-Z]{3}\d{4}$/.test(text))return {code:text};
 if(legacy&&/^\d+$/.test(text)&&Number.isSafeInteger(Number(text))&&Number(text)>0)return {number:Number(text)};
 fail(400,'회원 ID를 확인해주세요. 영문 3자리와 숫자 4자리로 입력해주세요.');
};
const paid=`status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid') AND NOT EXISTS(SELECT 1 FROM play_purchases pp WHERE 'play_'||pp.token_hash=gold_purchases.id AND pp.state='refunded')`;
export async function giftInventoryList(env,uid){
 const items=await rows(env,`SELECT i.id,i.gift_type,i.gift_name,i.currency,i.value,i.source,i.created,
  NOT EXISTS(SELECT 1 FROM gift_inventory_lots l JOIN gold_purchases ON gold_purchases.id=l.purchase_id WHERE l.inventory_id=i.id AND NOT (${paid})) available
  FROM gift_inventory i WHERE i.user_id=? AND i.used_at=0 ORDER BY i.created DESC,i.id`,uid);
 return items.map(i=>({...i,image:(giftById(i.gift_type)||silverGiftById(i.gift_type))?.image||'',available:!!i.available}));
}
async function acquire(env,uid,b,operator=null){
 const key=requestId(b),gift=giftById(b.gift_type)||silverGiftById(b.gift_type),quantity=b.quantity??1;
 if(!gift||!Number.isInteger(quantity)||quantity<1||quantity>100)fail(400,'선물 종류와 수량(1~100개)을 확인해주세요.');
 const currency=operator?'reward':gift.gold?'gold':'silver',value=operator?0:gift.gold||gift.silver,source=operator?'reward':'purchase';
 const replay=async()=>{const old=await rows(env,'SELECT gift_type,currency,count(*) quantity FROM gift_inventory WHERE user_id=? AND request_id=? GROUP BY gift_type,currency',uid,key);if(!old.length)return false;if(old.length!==1||old[0].gift_type!==gift.id||old[0].currency!==currency||old[0].quantity!==quantity)fail(409,'이미 사용된 요청 번호예요.');return true;};
 if(await replay())return;
 await rate(env,'inventory-acquire:'+uid,30,3600);
 const lots=currency==='gold'?await rows(env,`SELECT id,gold,used,price_krw,fee_krw,tax_krw FROM gold_purchases WHERE user_id=? AND used<gold AND ${paid} ORDER BY paid_at,id`,uid):[];
 if(currency==='silver'&&Number((await one(env,'SELECT balance FROM free_gift_wallets WHERE user_id=?',uid))?.balance||0)<value*quantity)fail(409,'실버가 부족해요.');
 const statements=[];
 if(currency==='silver')statements.push(query(env,'UPDATE free_gift_wallets SET balance=balance-? WHERE user_id=?',value*quantity,uid));
 for(let n=0;n<quantity;n++){
  const item=id();let spent=[];
  if(currency==='gold'){try{spent=allocateLots(lots,value);}catch{fail(409,'골드가 부족해요.');}for(const l of spent)lots.find(x=>x.id===l.purchase_id).used+=l.gold;}
  statements.push(...spent.map(l=>query(env,'UPDATE gold_purchases SET used=used+? WHERE id=?',l.gold,l.purchase_id)));
  statements.push(query(env,'INSERT INTO gift_inventory(id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created) VALUES(?,?,?,?,?,?,?,?,?,?)',item,uid,gift.id,gift.name,currency,value,source,key,n,now()));
  statements.push(...spent.map(l=>query(env,'INSERT INTO gift_inventory_lots(inventory_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',item,l.purchase_id,l.gold,l.net_mw)));
 }
 if(operator)statements.push(query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',id(),operator.id,'gift_inventory_grant',JSON.stringify({user_id:uid,gift_type:gift.id,quantity,request_id:key,reason:b.reason}),now()));
 try{await env.DB.batch(statements);}catch(e){if(/constraint/i.test(e.message)&&await replay())return;if(/constraint|refunded/i.test(e.message))fail(409,'잔액 또는 결제 상태가 바뀌었어요. 다시 확인해주세요.');throw e;}
}
async function send(env,user,itemId,b){
 const key=requestId(b),i=await one(env,'SELECT * FROM gift_inventory WHERE id=? AND user_id=?',itemId,user.id);
 if(!i)fail(404,'보관 선물을 찾을 수 없어요.');
 if(i.used_at){if(i.send_request_id===key&&i.recipient_id===b.profile_id)return;fail(409,'이미 사용한 선물이에요.');}
 const p=await one(env,"SELECT p.id,p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted'",b.profile_id||'');
 if(!p||p.user_id===user.id)fail(400,'선물할 다른 회원을 선택해주세요.');assertUnblocked(env,p.user_id);
 const at=now(),statements=[query(env,'UPDATE gift_inventory SET used_at=?,send_request_id=?,recipient_id=? WHERE id=? AND user_id=?',at,key,p.id,i.id,user.id)];
 if(i.currency==='gold'){
  const lots=await rows(env,'SELECT purchase_id,gold,net_mw FROM gift_inventory_lots WHERE inventory_id=?',i.id),net=lots.reduce((n,l)=>n+l.net_mw,0),share=splitGift('original',net,(await partnerState(env,p.user_id)).tier==='partner');
  statements.push(query(env,'INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created,gift_type,gift_name,request_id,quantity) VALUES(?,?,NULL,?,?,?,0,?,?,?,?,?,?,?,1)',i.id,user.id,i.value,net,p.id,share.creator,share.platform,giftMonth(at),at,i.gift_type,i.gift_name,key));
  statements.push(...lots.map(l=>query(env,'INSERT INTO gift_lots(gift_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',i.id,l.purchase_id,l.gold,l.net_mw)));
 }else statements.push(query(env,'INSERT INTO free_gifts(id,sender_id,recipient_profile_id,request_id,created,gift_type,gift_name,silver,quantity) VALUES(?,?,?,?,?,?,?,?,1)',i.id,user.id,p.id,key,at,i.gift_type,i.gift_name,i.value));
 try{await env.DB.batch(statements);}catch(e){const old=await one(env,'SELECT used_at,send_request_id,recipient_id FROM gift_inventory WHERE id=?',i.id);if(old?.used_at&&old.send_request_id===key&&old.recipient_id===p.id)return;if(/constraint|inventory/i.test(e.message))fail(409,'선물이나 결제 상태가 바뀌었어요. 다시 확인해주세요.');throw e;}
}
export async function giftInventoryRoute(req,env,path,user){
 if(path==='/api/admin/gift-inventory/grant'){
  requireUser(user);if(!isAdmin(env,user))fail(403,'관리자 권한이 필요해요.');if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  const b=await req.json();if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>300)fail(400,'지급 사유를 입력해주세요.');
  const identity=b.public_id!==undefined?publicIdentity(b.public_id):b.public_number!==undefined?publicIdentity(b.public_number,true):null;
  const recipient=identity?.code?await one(env,"SELECT u.id FROM users u JOIN public_profile_ids m ON m.user_id=u.id WHERE m.code=? AND u.provider!='deleted'",identity.code):identity?await one(env,"SELECT u.id FROM users u JOIN public_member_ids m ON m.user_id=u.id WHERE m.number=? AND u.provider!='deleted'",identity.number):await one(env,"SELECT id FROM users WHERE id=? AND provider!='deleted'",b.user_id||'');
  if(!recipient)fail(404,'회원을 찾을 수 없어요.');await acquire(env,recipient.id,b,user);return json({ok:true});
 }
 if(!path.startsWith('/api/me/gift-inventory'))return null;requireUser(user);
 if(path==='/api/me/gift-inventory/recipient'&&req.method==='GET'){
  const params=new URL(req.url).searchParams,identity=params.has('public_id')?publicIdentity(params.get('public_id')):publicIdentity(params.get('number'),true);
  const p=await one(env,`SELECT p.id,p.user_id,${producerNameSQL()} name,m.number public_number,ids.code public_id FROM public_member_ids m JOIN users u ON u.id=m.user_id JOIN public_profile_ids ids ON ids.user_id=u.id JOIN producers p ON p.user_id=u.id WHERE ${identity.code?'ids.code':'m.number'}=? AND u.provider!='deleted'`,identity.code??identity.number);
  if(!p||p.user_id===user.id)fail(404,'선물할 다른 회원의 프로필을 찾을 수 없어요.');assertUnblocked(env,p.user_id);const {user_id,...profile}=p;return json({profile});
 }
 if(path==='/api/me/gift-inventory'&&req.method==='GET')return json({items:await giftInventoryList(env,user.id)});
 if(path==='/api/me/gift-inventory/buy'&&req.method==='POST'){await acquire(env,user.id,await req.json());return json({items:await giftInventoryList(env,user.id)},201);}
 const m=path.match(/^\/api\/me\/gift-inventory\/([\w-]+)\/send$/);
 if(m&&req.method==='POST'){await send(env,user,m[1],await req.json());return json({items:await giftInventoryList(env,user.id)});}
 fail(404,'보관 선물을 찾을 수 없어요.');
}
