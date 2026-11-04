import {one,rows,query,json,fail,id,now,rate} from './db.js';
import {allocateLots} from '../shared/gifts.js';
import {decorationSpendableSQL} from './decorations.js';
import {JUMP_OUTFITS,DEFAULT_OUTFIT} from '../dist/crew-jump-art/outfits.js';

// Reuse the existing inventory and currency ledger; receipts remain account-wide across crews.
const usable=`pi.source='jump_outfit' AND pi.revoked=0 AND (pi.expires_at=0 OR pi.expires_at>unixepoch())
 AND NOT EXISTS(SELECT 1 FROM json_each(pi.item_key,'$.lots') l
 LEFT JOIN gold_purchases ON gold_purchases.id=json_extract(l.value,'$.purchase_id')
 WHERE gold_purchases.id IS NULL OR gold_purchases.user_id!=pi.user_id OR NOT (${decorationSpendableSQL}))`;
async function inventory(env,uid){
 const records=await rows(env,`SELECT pi.source_ref,(${usable}) available FROM player_inventory pi WHERE pi.user_id=? AND pi.source='jump_outfit'`,uid);
 const owned=[DEFAULT_OUTFIT,...records.filter(r=>r.available).map(r=>r.source_ref)];
 const selected=await one(env,"SELECT item_key FROM player_inventory WHERE user_id=? AND source='jump_outfit_equip' AND source_ref='active'",uid);
 return {owned,blocked:records.filter(r=>!r.available).map(r=>r.source_ref),equipped:owned.includes(selected?.item_key)?selected.item_key:DEFAULT_OUTFIT};
}
export async function jumpWardrobe(env,uid){
 const [wardrobe,gold,silver]=await Promise.all([
  inventory(env,uid),
  one(env,`SELECT COALESCE(SUM(gold-used),0) balance FROM gold_purchases WHERE user_id=? AND ${decorationSpendableSQL}`,uid),
  one(env,'SELECT balance FROM free_gift_wallets WHERE user_id=?',uid)
 ]);
 return {...wardrobe,balance:{G:gold.balance,S:silver?.balance??0},outfits:JUMP_OUTFITS};
}
const equipment=(env,uid,outfit)=>query(env,`INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at)
 SELECT ?,?,?,'jump_outfit_equip','active',? WHERE ?=? OR EXISTS(
 SELECT 1 FROM player_inventory pi WHERE pi.user_id=? AND pi.source_ref=? AND ${usable})
 ON CONFLICT(user_id,source,source_ref) DO UPDATE SET item_key=excluded.item_key`,id(),uid,outfit,now(),outfit,DEFAULT_OUTFIT,uid,outfit);

async function buy(env,uid,outfit){
 const current=await inventory(env,uid);
 if(current.owned.includes(outfit.id))return; // Item uniqueness is the durable purchase replay key.
 if(current.blocked.includes(outfit.id))fail(409,'이 의상의 구매 상태를 확인 중이에요.');
 let lots=[];const debits=[];
 if(outfit.unit==='G'){
  const available=await rows(env,`SELECT * FROM gold_purchases WHERE user_id=? AND used<gold AND ${decorationSpendableSQL} ORDER BY paid_at,id`,uid);
  try{lots=allocateLots(available,outfit.price);}catch{
   if((await inventory(env,uid)).owned.includes(outfit.id))return;
   fail(409,'골드가 부족해요.');
  }
  for(const lot of lots)debits.push(query(env,`UPDATE gold_purchases SET used=CASE WHEN ${decorationSpendableSQL} THEN used+? ELSE -1 END WHERE id=? AND user_id=?`,lot.gold,lot.purchase_id,uid));
 }else{
  debits.push(query(env,'INSERT OR IGNORE INTO free_gift_wallets(user_id,balance) VALUES(?,0)',uid),
   query(env,'UPDATE free_gift_wallets SET balance=balance-? WHERE user_id=?',outfit.price,uid));
 }
 const receipt=JSON.stringify({currency:outfit.unit,amount:outfit.price,lots});
 try{
  // A duplicate item or insufficient balance rolls back the receipt, debit and equipment together.
  await env.DB.batch([
   query(env,"INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at) VALUES(?,?,?,'jump_outfit',?,?)",id(),uid,receipt,outfit.id,now()),
   ...debits,equipment(env,uid,outfit.id)
  ]);
 }catch(error){
  if((await inventory(env,uid)).owned.includes(outfit.id))return;
  if(/constraint/i.test(error.message))fail(409,'잔액 또는 구매 상태가 바뀌었어요. 다시 확인해주세요.');
  throw error;
 }
}
export async function jumpOutfitsRoute(req,env,action,uid){
 if(action==='outfits'&&req.method==='GET')return json(await jumpWardrobe(env,uid));
 if(req.method!=='POST'||!['outfits/buy','outfits/equip'].includes(action))fail(405,'지원하지 않는 요청입니다.');
 await rate(env,'jump-outfit:'+uid,30,60);
 const body=await req.json(),outfit=JUMP_OUTFITS.find(item=>item.id===body?.outfit);
 if(!outfit)fail(400,'의상을 확인해주세요.');
 if(action==='outfits/buy')await buy(env,uid,outfit);
 else{
  if(!(await inventory(env,uid)).owned.includes(outfit.id))fail(403,'보유한 의상만 착용할 수 있어요.');
  await equipment(env,uid,outfit.id).run();
  if((await inventory(env,uid)).equipped!==outfit.id)fail(409,'의상 상태가 바뀌었어요. 다시 확인해주세요.');
 }
 return json(await jumpWardrobe(env,uid));
}
