import {one,rows,query,now,id,fail,json,rate} from './db.js';
import {FREE_GIFT,FREE_GIFT_REWARDS,giftDay} from '../shared/gifts.js';

export async function freeGiftBalance(env,userId){return (await one(env,'SELECT balance FROM free_gift_wallets WHERE user_id=?',userId))?.balance||0;}
export async function freeGiftState(env,userId,at=now()){
 const day=giftDay(at),start=Date.parse(day+'T00:00:00+09:00')/1000;
 const claimed=await rows(env,'SELECT kind FROM free_gift_claims WHERE user_id=? AND day=?',userId,day);
 // Five distinct songs with 60% server-validated listening; repeated plays of one song do not fill the mission.
 const listened=(await one(env,'SELECT count(DISTINCT l.track_id) n FROM listens l JOIN tracks t ON t.id=l.track_id WHERE l.user_id=? AND l.started>=? AND l.started<? AND t.duration>0 AND l.seconds>=t.duration*.6',userId,start,start+86400)).n;
 const covers=(await one(env,"SELECT count(*) n FROM tracks WHERE user_id=? AND kind='cover' AND status='published' AND created>=? AND created<?",userId,start,start+86400)).n;
 const comments=(await one(env,"SELECT count(*) n FROM comments WHERE user_id=? AND created>=? AND created<? AND deleted_at=0 AND length(trim(body))>=3",userId,start,start+86400)).n;
 const progress={checkin:1,cover:Math.min(1,covers),listen:Math.min(5,listened),comment1:Math.min(1,comments),comment2:Math.min(2,comments),comment3:Math.min(3,comments)};
 return {balance:await freeGiftBalance(env,userId),day,gift:FREE_GIFT,rewards:Object.entries(FREE_GIFT_REWARDS).map(([kind,amount])=>{const target=kind==='listen'?5:kind.startsWith('comment')?Number(kind.slice(-1)):1;return {kind,amount,claimed:claimed.some(c=>c.kind===kind),eligible:progress[kind]>=target,progress:progress[kind],target};}),cash_value:0};
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
 if(b.gold!==undefined&&b.gold!==0)fail(400,'무료 응원에는 골드를 사용할 수 없어요.');
 if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'선물 요청을 새로 시작해주세요.');
 const replay=async()=>{const g=await one(env,'SELECT id,track_id FROM free_gifts WHERE sender_id=? AND request_id=?',user.id,b.request_id);if(!g)return null;if(g.track_id!==track.id)fail(409,'이미 사용된 선물 요청이에요.');return json({gift:{id:g.id,type:'star',name:FREE_GIFT.name,free:true,gold:0},free_balance:await freeGiftBalance(env,user.id)});};
 const old=await replay();if(old)return old;
 if(await freeGiftBalance(env,user.id)<1)fail(409,'응원별이 부족해요. 오늘의 보상을 먼저 받아주세요.');
 const gid=id();try{await env.DB.batch([
  query(env,'UPDATE free_gift_wallets SET balance=balance-1 WHERE user_id=?',user.id),
  query(env,'INSERT INTO free_gifts(id,sender_id,track_id,request_id,created) VALUES(?,?,?,?,?)',gid,user.id,track.id,b.request_id,now()),
 ]);}catch(e){if(/constraint/i.test(String(e?.message))){const duplicate=await replay();if(duplicate)return duplicate;}if(/CHECK constraint/i.test(String(e?.message)))fail(409,'응원별 잔액이 바뀌었어요. 다시 확인해주세요.');throw e;}
 return json({gift:{id:gid,type:'star',name:FREE_GIFT.name,free:true,gold:0},free_balance:await freeGiftBalance(env,user.id)},201);
}
