import {one,rows,query,now,id,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {published} from './catalog.js';
import {GOLD_KRW,GOLD_PACKS,GIFT_MIN_GOLD,GIFT_MAX_GOLD,MIN_PAYOUT_KRW,PAYOUT_DAY,GIFT_SPLITS,allocateLots,splitGift,giftMonth,wonFromMw} from '../shared/gifts.js';

// No payment channel sells gold yet: web card checkout needs the NICEPAY one-time payment contract and
// the apps need store billing. Purchases are credited by those integrations once they exist.
const CHECKOUT_READY=false;

export async function goldBalance(env,userId){return (await one(env,"SELECT COALESCE(sum(gold-used),0) n FROM gold_purchases WHERE user_id=? AND status='paid'",userId)).n;}

const RANKING=`SELECT u.name,sum(g.gold) gold,count(*) gifts,min(g.created) first FROM gifts g JOIN users u ON u.id=g.sender_id`;
const ranked=list=>list.map((r,i)=>({rank:i+1,name:r.name,gold:r.gold,gifts:r.gifts}));
export async function trackGifts(env,trackId){
 const total=await one(env,'SELECT COALESCE(sum(gold),0) gold,count(*) gifts FROM gifts WHERE track_id=?',trackId);
 return {available:true,total_gold:total.gold,gift_count:total.gifts,ranking:ranked(await rows(env,`${RANKING} WHERE g.track_id=? GROUP BY g.sender_id ORDER BY gold DESC,first ASC LIMIT 10`,trackId))};
}
// A person's fans are the people who gifted what that person performs: their covers and their own originals.
// Gifts to other people's covers of their songs still pay them the creator share, but belong to the singer's fans.
export async function profileGifts(env,profileId){
 const where='(g.singer_profile_id=? OR (g.singer_profile_id IS NULL AND g.creator_profile_id=?))';
 const total=await one(env,`SELECT COALESCE(sum(g.gold),0) gold,count(*) gifts FROM gifts g WHERE ${where}`,profileId,profileId);
 return {available:true,total_gold:total.gold,gift_count:total.gifts,ranking:ranked(await rows(env,`${RANKING} WHERE ${where} GROUP BY g.sender_id ORDER BY gold DESC,first ASC LIMIT 10`,profileId,profileId))};
}

const nextMonthDay=(month,day)=>{const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m,day));return d.toISOString().slice(0,10);};
// Earnings of each calendar month are paid on the 15th of the next month once the unpaid total reaches the minimum;
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
 if(path==='/api/gold'&&method==='GET'){
  requireUser(user);
  return json({balance:await goldBalance(env,user.id),gold_krw:GOLD_KRW,packs:GOLD_PACKS,checkout_available:CHECKOUT_READY,
   purchases:await rows(env,"SELECT id,channel,gold,used,price_krw,status,created,paid_at FROM gold_purchases WHERE user_id=? AND status!='pending' ORDER BY created DESC LIMIT 20",user.id),
   sent:await rows(env,'SELECT g.id,g.gold,g.created,t.id track_id,t.title,t.kind FROM gifts g JOIN tracks t ON t.id=g.track_id WHERE g.sender_id=? ORDER BY g.created DESC LIMIT 20',user.id)});
 }
 if(path==='/api/gold/checkout'&&method==='POST'){requireUser(user);fail(409,'골드 충전은 결제 준비가 끝나면 열려요.');}
 if(path==='/api/studio/earnings'&&method==='GET'){
  requireUser(user);
  const profile=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id),current=giftMonth(now());
  const months=profile?await rows(env,`SELECT month,SUM(CASE WHEN singer_profile_id=? THEN singer_mw ELSE 0 END) singer_mw,SUM(CASE WHEN creator_profile_id=? THEN creator_mw ELSE 0 END) creator_mw,count(*) gifts
   FROM gifts WHERE singer_profile_id=? OR creator_profile_id=? GROUP BY month ORDER BY month`,profile.id,profile.id,profile.id,profile.id):[];
  return json({current_month:current,min_payout_krw:MIN_PAYOUT_KRW,payout_day:PAYOUT_DAY,splits:GIFT_SPLITS,months:settlementMonths(months,current).reverse()});
 }
 const m=path.match(/^\/api\/tracks\/([\w-]+)\/gifts$/);if(!m)return null;
 const track=await published(env,m[1]);
 if(method==='GET')return json(await trackGifts(env,track.id));
 if(method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 requireUser(user);await rate(env,'gift:'+user.id,60,3600);
 const b=await req.json(),gold=b.gold;
 if(!Number.isInteger(gold)||gold<GIFT_MIN_GOLD||gold>GIFT_MAX_GOLD)fail(400,`선물은 ${GIFT_MIN_GOLD}골드부터 ${GIFT_MAX_GOLD.toLocaleString('ko-KR')}골드까지 보낼 수 있어요.`);
 if(track.user_id===user.id)fail(400,'내 곡에는 선물할 수 없어요.');
 const creator=track.kind==='cover'?(await one(env,'SELECT producer_id FROM tracks WHERE id=?',track.original_id)).producer_id:track.producer_id;
 const lots=await rows(env,"SELECT id,gold,used,price_krw,fee_krw FROM gold_purchases WHERE user_id=? AND status='paid' AND used<gold ORDER BY paid_at,id",user.id);
 let spent;try{spent=allocateLots(lots,gold);}catch{fail(409,'골드가 부족해요. 충전한 뒤 다시 선물해주세요.');}
 const net=spent.reduce((sum,l)=>sum+l.net_mw,0),share=splitGift(track.kind,net),gid=id(),at=now();
 try{
  // The lot check constraint rejects overspending or spending a refunded lot, which rolls the whole batch back.
  await env.DB.batch([
   ...spent.map(l=>query(env,'UPDATE gold_purchases SET used=used+? WHERE id=?',l.gold,l.purchase_id)),
   query(env,'INSERT INTO gifts(id,sender_id,track_id,gold,net_mw,singer_profile_id,creator_profile_id,singer_mw,creator_mw,platform_mw,month,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    gid,user.id,track.id,gold,net,track.kind==='cover'?track.producer_id:null,creator,share.singer,share.creator,share.platform,giftMonth(at),at),
   ...spent.map(l=>query(env,'INSERT INTO gift_lots(gift_id,purchase_id,gold,net_mw) VALUES(?,?,?,?)',gid,l.purchase_id,l.gold,l.net_mw)),
  ]);
 }catch(e){if(/CHECK constraint/i.test(String(e?.message)))fail(409,'골드 잔액이 바뀌었어요. 다시 시도해주세요.');throw e;}
 return json({gift:{id:gid,gold},balance:await goldBalance(env,user.id)},201);
}
