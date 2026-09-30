import {publicNameSQL} from './identity.js';
import {one,rows,query,now,id,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {published} from './catalog.js';
import {GOLD_KRW,GOLD_PACKS,GIFT_MIN_GOLD,GIFT_MAX_GOLD,MIN_PAYOUT_KRW,PAYOUT_DAY,EARNINGS_AVAILABLE_DAY,earningsSchedule,GIFT_SPLITS,GIFT_CATALOG,giftById,allocateLots,splitGift,giftMonth,wonFromMw} from '../shared/gifts.js';
import {creatorPayouts} from './payouts.js';
import {freeGiftState,claimFreeGift,sendFreeGift} from './free-gifts.js';
import {FREE_GIFT} from '../shared/gifts.js';

// No payment channel sells gold yet: web card checkout needs the NICEPAY one-time payment contract and
// the apps need store billing. Purchases are credited by those integrations once they exist.
import {goldCheckoutStatus,createGoldCheckout} from './gold-checkout.js';

export async function goldBalance(env,userId){return (await one(env,"SELECT COALESCE(sum(gold-used),0) n FROM gold_purchases WHERE user_id=? AND status='paid' AND NOT EXISTS(SELECT 1 FROM gold_orders o WHERE o.id=gold_purchases.id AND o.state!='paid')",userId)).n;}

const RANKING=`SELECT ${publicNameSQL()} name,sum(g.gold) gold,sum(g.stars) stars,sum(g.gold+g.stars) score,count(*) gifts,min(g.created) first FROM (SELECT sender_id,track_id,gold,0 stars,created FROM gifts UNION ALL SELECT sender_id,track_id,0 gold,1 stars,created FROM free_gifts) g JOIN users u ON u.id=g.sender_id`;
const ranked=list=>list.map((r,i)=>({rank:i+1,name:r.name,gold:r.gold,stars:r.stars,score:r.score,gifts:r.gifts}));
export async function trackGifts(env,trackId){
 const [total,free,ranking]=await Promise.all([one(env,'SELECT COALESCE(sum(gold),0) gold,count(*) gifts FROM gifts WHERE track_id=?',trackId),one(env,'SELECT count(*) n FROM free_gifts WHERE track_id=?',trackId),rows(env,`${RANKING} WHERE g.track_id=? GROUP BY g.sender_id ORDER BY score DESC,first ASC,g.sender_id ASC LIMIT 10`,trackId)]);
 return {available:true,total_gold:total.gold,gift_count:total.gifts,free_count:free.n,ranking:ranked(ranking)};
}
// A person's fans are the people who gifted what that person performs: their covers and their own originals.
// Gifts to other people's covers of their songs still pay them the creator share, but belong to the singer's fans.
export async function profileGifts(env,profileId){
 const where='(g.singer_profile_id=? OR (g.singer_profile_id IS NULL AND g.creator_profile_id=?))';
 const [total,free,ranking]=await Promise.all([one(env,`SELECT COALESCE(sum(g.gold),0) gold,count(*) gifts FROM gifts g WHERE ${where}`,profileId,profileId),one(env,'SELECT count(*) n FROM free_gifts f JOIN tracks t ON t.id=f.track_id WHERE t.producer_id=?',profileId),rows(env,`${RANKING} JOIN tracks t ON t.id=g.track_id WHERE t.producer_id=? GROUP BY g.sender_id ORDER BY score DESC,first ASC,g.sender_id ASC LIMIT 10`,profileId)]);
 return {available:true,total_gold:total.gold,gift_count:total.gifts,free_count:free.n,ranking:ranked(ranking)};
}

const nextMonthDay=(month,day)=>{const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m,day));return d.toISOString().slice(0,10);};
// Earnings of each calendar month are paid on the 25th of the next month once the unpaid total reaches the minimum;
// smaller amounts carry over to the following month.
export function settlementMonths(months,current){
 let carry=0;
 return months.map(m=>{
  const total=wonFromMw(m.singer_mw+m.creator_mw),base={month:m.month,gifts:m.gifts,singer_krw:wonFromMw(m.singer_mw),creator_krw:wonFromMw(m.creator_mw),total_krw:total};
  if(m.month>=current)return {...base,status:'accruing',payout_on:nextMonthDay(m.month,PAYOUT_DAY)};
  carry+=total;
  if(carry>=MIN_PAYOUT_KRW){const due=carry;carry=0;return {...base,status:'payable',payable_krw:due,payout_on:nextMonthDay(m.month,PAYOUT_DAY)};}
  return {...base,status:'carried',carried_krw:carry};
 });
}

export async function giftRoute(req,env,path,user){
 const method=req.method;
 if(path==='/api/gifts/catalog'&&method==='GET')return json({gifts:GIFT_CATALOG,free_gift:FREE_GIFT,gold_krw:GOLD_KRW,...goldCheckoutStatus(env,user)});
 if(path==='/api/gifts/free'&&method==='GET'){requireUser(user);return json(await freeGiftState(env,user.id));}
 if(path==='/api/gifts/free/claim'&&method==='POST'){requireUser(user);return claimFreeGift(req,env,user);}
 if(path==='/api/gold'&&method==='GET'){
  requireUser(user);
  const [balance,purchases,orders,free,free_sent,sent]=await Promise.all([
   goldBalance(env,user.id),
   rows(env,"SELECT id,channel,gold,used,price_krw,status,created,paid_at FROM gold_purchases WHERE user_id=? AND status!='pending' ORDER BY created DESC LIMIT 20",user.id),
   rows(env,'SELECT o.id,o.state,o.review_only,o.created,p.gold,p.price_krw FROM gold_orders o JOIN gold_purchases p ON p.id=o.id WHERE o.user_id=? ORDER BY o.created DESC LIMIT 20',user.id),
   freeGiftState(env,user.id),
   rows(env,'SELECT g.id,g.created,t.id track_id,t.title FROM free_gifts g JOIN tracks t ON t.id=g.track_id WHERE g.sender_id=? ORDER BY g.created DESC LIMIT 20',user.id),
   rows(env,'SELECT g.id,g.gold,g.gift_type,g.gift_name,g.created,t.id track_id,t.title,t.kind FROM gifts g JOIN tracks t ON t.id=g.track_id WHERE g.sender_id=? ORDER BY g.created DESC LIMIT 20',user.id)]);
  return json({balance,gold_krw:GOLD_KRW,packs:GOLD_PACKS,...goldCheckoutStatus(env,user),purchases,orders,gifts:GIFT_CATALOG,free,free_sent,sent});
 }
 if(path==='/api/gold/checkout'&&method==='POST'){requireUser(user);return createGoldCheckout(req,env,user);}
 if(path==='/api/studio/earnings'&&method==='GET'){
  requireUser(user);
  const profile=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id),current=giftMonth(now());
  const months=profile?await rows(env,`SELECT month,SUM(CASE WHEN singer_profile_id=? THEN singer_mw ELSE 0 END) singer_mw,SUM(CASE WHEN creator_profile_id=? THEN creator_mw ELSE 0 END) creator_mw,count(*) gifts
   FROM gifts WHERE (singer_profile_id=? AND singer_mw>0) OR (creator_profile_id=? AND creator_mw>0) GROUP BY month ORDER BY month`,profile.id,profile.id,profile.id,profile.id):[];
  const summary=profile?await one(env,`SELECT COALESCE(sum(g.gold),0) received_gold,COALESCE(sum(g.net_mw),0) net_mw,COALESCE(sum((SELECT sum(ROUND(gl.gold*p.price_krw*1000.0/p.gold)) FROM gift_lots gl JOIN gold_purchases p ON p.id=gl.purchase_id WHERE gl.gift_id=g.id)),0) gross_mw,COALESCE(sum(CASE WHEN g.singer_profile_id=? THEN g.singer_mw ELSE 0 END)+sum(CASE WHEN g.creator_profile_id=? THEN g.creator_mw ELSE 0 END),0) earned_mw FROM gifts g WHERE g.singer_profile_id=? OR g.creator_profile_id=?`,profile.id,profile.id,profile.id,profile.id):{received_gold:0,net_mw:0,gross_mw:0,earned_mw:0};
  const streams=await one(env,`SELECT COALESCE(sum(kind='original'),0) original_streams,COALESCE(sum(kind='cover'),0) cover_streams,count(*) total_streams FROM (SELECT t.kind FROM listens l JOIN tracks t ON t.id=l.track_id WHERE t.user_id=? AND l.qualified=1 GROUP BY t.id,l.listener,l.day)`,user.id);
  const activity={received_gold:summary.received_gold,...streams};
  const breakdown={received_gold:summary.received_gold,purchase_value_krw:wonFromMw(summary.gross_mw),payment_fee_krw:wonFromMw(summary.gross_mw-summary.net_mw),after_fee_krw:wonFromMw(summary.net_mw),other_shares_krw:wonFromMw(summary.net_mw-summary.earned_mw),estimated_earnings_krw:wonFromMw(summary.earned_mw)};
  // Months up to the latest statement are settled; later months show the projected carry-over.
  const payout=await creatorPayouts(env,user.id),through=payout.last_period;
  const settled=months.filter(m=>through&&m.month<=through).map(m=>({month:m.month,gifts:m.gifts,singer_krw:wonFromMw(m.singer_mw),creator_krw:wonFromMw(m.creator_mw),total_krw:wonFromMw(m.singer_mw+m.creator_mw),status:'settled'}));
  return json({activity,breakdown,current_month:current,current_schedule:earningsSchedule(current,now()),min_payout_krw:MIN_PAYOUT_KRW,payout_day:PAYOUT_DAY,earnings_available_day:EARNINGS_AVAILABLE_DAY,splits:GIFT_SPLITS,months:[...settled,...settlementMonths(months.filter(m=>!through||m.month>through),current)].map(m=>({...m,...earningsSchedule(m.month,now()),...(m.status==='settled'?{earnings_available:true}:{})})).reverse(),payout});
 }
 const m=path.match(/^\/api\/tracks\/([\w-]+)\/gifts$/);if(!m)return null;
 const track=await published(env,m[1]);
 if(method==='GET')return json(await trackGifts(env,track.id));
 if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 requireUser(user);await rate(env,'gift:'+user.id,60,3600);
 const b=await req.json();if(b.gift_type==='star')return sendFreeGift(env,user,track,b);
 const selected=b.gift_type===undefined?null:giftById(b.gift_type);
 if(b.gift_type!==undefined&&!selected)fail(400,'선물 종류를 다시 선택해주세요.');
 if(selected&&b.gold!==undefined&&b.gold!==selected.gold)fail(400,'선물 가격이 일치하지 않아요. 다시 선택해주세요.');
 const gold=selected?.gold??b.gold,requestId=b.request_id??null;
 if((selected&&!requestId)||(requestId!==null&&(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(requestId))))fail(400,'선물 요청을 새로 시작해주세요.');
 // Catalog gifts use their server-owned price; legacy amount-only clients retain their minimum.
 if(!Number.isInteger(gold)||gold<(selected?1:GIFT_MIN_GOLD)||gold>GIFT_MAX_GOLD)fail(400,`선물은 ${GIFT_MIN_GOLD}골드부터 ${GIFT_MAX_GOLD.toLocaleString('ko-KR')}골드까지 보낼 수 있어요.`);
 if(track.user_id===user.id)fail(400,'내 곡에는 선물할 수 없어요.');
 const replay=async()=>{if(!requestId)return null;const old=await one(env,'SELECT id,track_id,gold,gift_type,gift_name FROM gifts WHERE sender_id=? AND request_id=?',user.id,requestId);if(!old)return null;if(old.track_id!==track.id||old.gold!==gold||old.gift_type!==(selected?.id??null))fail(409,'이미 사용된 선물 요청이에요. 새로 선택해주세요.');return json({gift:{id:old.id,gold:old.gold,type:old.gift_type,name:old.gift_name},balance:await goldBalance(env,user.id)});};
 const previous=await replay();if(previous)return previous;
 const creator=track.kind==='cover'?(await one(env,'SELECT producer_id FROM tracks WHERE id=?',track.original_id)).producer_id:track.producer_id;
 const lots=await rows(env,"SELECT id,gold,used,price_krw,fee_krw FROM gold_purchases WHERE user_id=? AND status='paid' AND used<gold ORDER BY paid_at,id",user.id);
 let spent;try{spent=allocateLots(lots,gold);}catch{fail(409,'골드가 부족해요. 충전한 뒤 다시 선물해주세요.');}
 const net=spent.reduce((sum,l)=>sum+l.net_mw,0),share=splitGift(track.kind,net),gid=id(),at=now();
 try{
  // The lot check constraint rejects overspending or spending a refunded lot, which rolls the whole batch back.
  await env.DB.batch([
   ...spent.map(l=>query(env,'UPDATE gold_purchases SET used=used+? WHERE id=?',l.gold,l.purchase_id)),
   query(env,'INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,singer_profile_id,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created,gift_type,gift_name,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    gid,user.id,track.id,gold,net,track.kind==='cover'?track.producer_id:null,creator,share.singer,share.creator,share.platform,giftMonth(at),at,selected?.id??null,selected?.name??null,requestId),
   ...spent.map(l=>query(env,'INSERT INTO gift_lots(gift_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',gid,l.purchase_id,l.gold,l.net_mw)),
  ]);
 }catch(e){if(/constraint/i.test(String(e?.message))){const duplicate=await replay();if(duplicate)return duplicate;}if(/CHECK constraint/i.test(String(e?.message)))fail(409,'골드 잔액이 바뀌었어요. 다시 시도해주세요.');throw e;}
 return json({gift:{id:gid,gold,type:selected?.id??null,name:selected?.name??null},balance:await goldBalance(env,user.id)},201);
}
