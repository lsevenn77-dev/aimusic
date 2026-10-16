import {one,query,now,id,fail,json,rate} from './db.js';
import {FREE_GIFT,FREE_GIFT_REWARDS,giftDay,silverGiftById} from '../shared/gifts.js';

export async function freeGiftBalance(env,userId){return (await one(env,'SELECT balance FROM free_gift_wallets WHERE user_id=?',userId))?.balance||0;}
export async function freeGiftState(env,userId,at=now()){
 const day=giftDay(at),start=Date.parse(day+'T00:00:00+09:00')/1000;
 // Five distinct songs with 60% server-validated listening; repeated plays of one song do not fill the mission.
 const {balance,listened,covers,comments,claimed:claimedJson}=await one(env,`WITH scope AS (SELECT ? uid,? day,? start,? finish) SELECT
 COALESCE((SELECT balance FROM free_gift_wallets WHERE user_id=scope.uid),0) balance,
 (SELECT json_group_array(kind) FROM free_gift_claims WHERE user_id=scope.uid AND day=scope.day) claimed,
 (SELECT count(DISTINCT l.track_id) FROM listens l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=scope.uid AND l.started>=scope.start AND l.started<scope.finish AND t.duration>0 AND l.seconds>=t.duration*.6) listened,
 (SELECT count(*) FROM tracks WHERE user_id=scope.uid AND kind='cover' AND status='published' AND created>=scope.start AND created<scope.finish) covers,
 (SELECT count(*) FROM comments WHERE user_id=scope.uid AND created>=scope.start AND created<scope.finish AND deleted_at=0 AND length(trim(body))>=3) comments FROM scope`,userId,day,start,start+86400);
 const claimed=JSON.parse(claimedJson);
 const progress={checkin:1,cover:Math.min(1,covers),listen:Math.min(5,listened),comment1:Math.min(1,comments),comment2:Math.min(2,comments),comment3:Math.min(3,comments)};
 return {balance,day,gift:FREE_GIFT,rewards:Object.entries(FREE_GIFT_REWARDS).map(([kind,amount])=>{const target=kind==='listen'?5:kind.startsWith('comment')?Number(kind.slice(-1)):1;return {kind,amount,claimed:claimed.includes(kind),eligible:progress[kind]>=target,progress:progress[kind],target};}),cash_value:0};
}
export async function claimFreeGift(req,env,user){
 await rate(env,'free-claim:'+user.id,30,3600);const {kind}=await req.json();
 if(!Object.hasOwn(FREE_GIFT_REWARDS,kind))fail(400,'받을 보상을 선택해주세요.');
 const state=await freeGiftState(env,user.id),reward=state.rewards.find(r=>r.kind===kind);
 if(reward.claimed)return json(state);
 if(!reward.eligible)fail(409,'아직 오늘의 활동 조건을 채우지 않았어요. 활동 후 다시 확인해주세요.');
 try{await env.DB.batch([
  query(env,'INSERT INTO free_gift_claims(user_id,day,kind,amount,created) VALUES(?,?,?,?,?)',user.id,state.day,kind,reward.amount,now()),
  query(env,'INSERT INTO free_gift_wallets(user_id,balance) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance=balance+excluded.balance',user.id,reward.amount),
 ]);}catch(e){if(!/UNIQUE constraint/i.test(String(e?.message)))throw e;}
 return json(await freeGiftState(env,user.id));
}
export async function sendFreeGift(env,user,track,b){
 if(track.user_id===user.id)fail(400,'내 곡에는 선물할 수 없어요.');
 const selected=silverGiftById(b.gift_type),quantity=b.quantity===undefined?1:b.quantity;
 if(!selected)fail(400,'선물 종류를 다시 선택해주세요.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>100)fail(400,'수량은 1개부터 100개까지 선택해주세요.');
 const silver=selected.silver*quantity;
 if(b.silver!==undefined&&b.silver!==silver)fail(400,'선물 수량이 일치하지 않아요. 다시 선택해주세요.');
 if(b.gold!==undefined&&b.gold!==0)fail(400,'무료 응원에는 골드를 사용할 수 없어요.');
 if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'선물 요청을 새로 시작해주세요.');
 const replay=async()=>{const g=await one(env,'SELECT id,track_id,recipient_profile_id,gift_type,gift_name,silver,quantity FROM free_gifts WHERE sender_id=? AND request_id=?',user.id,b.request_id);if(!g)return null;if(g.track_id!==track.id||(track.personal&&g.recipient_profile_id!==track.producer_id)||g.gift_type!==selected.id||g.silver!==silver||g.quantity!==quantity)fail(409,'이미 사용된 선물 요청이에요.');return json({gift:{id:g.id,type:g.gift_type,name:g.gift_name,silver:g.silver,quantity:g.quantity,free:true,gold:0},free_balance:await freeGiftBalance(env,user.id)});};
 const old=await replay();if(old)return old;
 if(await freeGiftBalance(env,user.id)<silver)fail(409,'실버가 부족해요. 오늘의 보상을 먼저 받아주세요.');
 const gid=id();try{await env.DB.batch([
  query(env,'UPDATE free_gift_wallets SET balance=balance-? WHERE user_id=?',silver,user.id),
  query(env,'INSERT INTO free_gifts(id,sender_id,track_id,recipient_profile_id,request_id,created,gift_type,gift_name,silver,quantity) VALUES(?,?,?,?,?,?,?,?,?,?)',gid,user.id,track.id,track.personal?track.producer_id:null,b.request_id,now(),selected.id,selected.name,silver,quantity),
 ]);}catch(e){if(/constraint/i.test(String(e?.message))){const duplicate=await replay();if(duplicate)return duplicate;}if(/CHECK constraint/i.test(String(e?.message)))fail(409,'실버 잔액이 바뀌었어요. 다시 확인해주세요.');throw e;}
 return json({gift:{id:gid,type:selected.id,name:selected.name,silver,quantity,free:true,gold:0},free_balance:await freeGiftBalance(env,user.id)},201);
}
