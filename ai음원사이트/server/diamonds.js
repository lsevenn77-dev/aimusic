import {one,rows,query,run,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {DIAMOND_KRW,DIAMOND_GOLD,PARTNER_MIN_KRW,MIN_PAYOUT_KRW,PAYOUT_DAY,giftMonth,withholding,diamondsFromMw} from '../shared/gifts.js';
import {allocateSubscriptionRevenue} from '../shared/subscription-revenue.js';

const totalSQL="SELECT COALESCE(sum(amount_mw),0) balance,COALESCE(sum(eligible_mw),0) eligible FROM diamond_ledger WHERE user_id=?";
export async function partnerState(env,uid){
 const [totals,partner,legacy]=await Promise.all([one(env,totalSQL,uid),one(env,'SELECT * FROM creator_partners WHERE user_id=?',uid),one(env,"SELECT COALESCE(sum(gross_krw),0) krw FROM payout_statements s WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM diamond_ledger d WHERE d.id=s.id AND d.kind='payout')",uid)]);
 const eligible=Math.max(0,totals.eligible+(legacy?.krw||0)*1000),qualified=eligible>=PARTNER_MIN_KRW*1000;
 const active=!!(partner?.active&&(partner.basis==='special'||qualified));
 return {tier:active?'partner':'general',badge:active?'공식 파트너':null,basis:active?partner.basis:null,activated:active?partner.activated:null,qualified,review_required:qualified&&!active,eligible_krw:Math.floor(eligible/1000),threshold_krw:PARTNER_MIN_KRW};
}
export async function assertDiamondReady(env){
 if(await one(env,"SELECT 1 FROM gold_orders WHERE state='refund_review' UNION ALL SELECT 1 FROM apple_transactions WHERE refund_review=1 UNION ALL SELECT 1 FROM play_purchases WHERE state='refunded' AND EXISTS(SELECT 1 FROM gift_lots WHERE purchase_id='play_'||play_purchases.token_hash AND NOT EXISTS(SELECT 1 FROM gift_exclusions WHERE gift_id=gift_lots.gift_id)) LIMIT 1"))fail(409,'환불 수익을 검토 중이에요. 확인 후 다이아를 사용할 수 있어요.');
}
export async function diamondWallet(env,uid){
 const [t,history,partner]=await Promise.all([one(env,totalSQL,uid),rows(env,'SELECT id,kind,amount_mw,gold,period,detail,created FROM diamond_ledger WHERE user_id=? ORDER BY created DESC,id DESC LIMIT 50',uid),partnerState(env,uid)]);
 return {balance:diamondsFromMw(t.balance),balance_mw:t.balance,available:diamondsFromMw(Math.max(0,t.balance)),cash_value_krw:Math.floor(Math.max(0,t.balance)/1000),diamond_krw:DIAMOND_KRW,gold_per_diamond:DIAMOND_GOLD,min_payout_diamonds:MIN_PAYOUT_KRW/DIAMOND_KRW,partner,history:history.map(r=>({...r,diamonds:diamondsFromMw(r.amount_mw)}))};
}
const entry=(env,uid,kind,key,mw,eligible,period,detail='',gold=0,eid=id())=>query(env,'INSERT INTO diamond_ledger(id,user_id,kind,source_key,amount_mw,eligible_mw,period,detail,gold,created) VALUES(?,?,?,?,?,?,?,?,?,?)',eid,uid,kind,key,mw,eligible,period,detail,gold,now());
const audit=(env,user,action,target)=>query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',id(),user.id,action,target,now());
const requestKey=b=>{if(typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'요청을 새로 시작해주세요.');return 'request:'+b.request_id;};

// Only operator-confirmed finished months become spendable. Legacy statements are already reserved/paid.
export async function finalizeGiftDiamonds(env,admin,period){
 await assertDiamondReady(env);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period>=giftMonth(now()))fail(400,'끝난 달만 마감할 수 있어요.');
 const latest=(await one(env,'SELECT max(period) p FROM payout_periods')).p;
 if(latest&&period<=latest)fail(409,`${latest}까지 이미 마감했어요.`);
 const shares=await rows(env,`WITH shares AS (
 SELECT id,month,sender_id,singer_profile_id pid,singer_mw mw FROM gifts WHERE singer_mw>0
 UNION ALL SELECT id,month,sender_id,creator_profile_id,creator_mw FROM gifts WHERE creator_mw>0)
 SELECT s.id,s.month,sum(s.mw) mw,p.user_id FROM shares s JOIN producers p ON p.id=s.pid
 WHERE s.month<=? AND p.user_id!=s.sender_id
 AND NOT EXISTS(SELECT 1 FROM gift_exclusions x WHERE x.gift_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM payout_statements ps WHERE ps.user_id=p.user_id AND ps.period>=s.month AND NOT EXISTS(SELECT 1 FROM diamond_ledger d WHERE d.id=ps.id AND d.kind='payout'))
 AND NOT EXISTS(SELECT 1 FROM diamond_ledger d WHERE d.user_id=p.user_id AND d.source_key='gift:'||s.id) GROUP BY s.id,s.month,p.user_id`,period);
 const writes=[query(env,'INSERT INTO payout_periods(period,closed_at,closed_by) VALUES(?,?,?)',period,now(),admin.id)];
 for(const s of shares)writes.push(entry(env,s.user_id,'gift','gift:'+s.id,s.mw,s.mw,s.month,'골드 선물 수익 확정'));
 writes.push(audit(env,admin,'diamond_close',period));
 await env.DB.batch(writes);
 return {period,issued:0,carried:0,credited:shares.length};
}

async function useDiamonds(req,env,user,kind){
 const b=await req.json(),key=requestKey(b),diamonds=b.diamonds;
 if(!Number.isSafeInteger(diamonds)||diamonds<=0||diamonds>1000000)fail(400,'사용할 다이아를 정수로 입력해주세요.');
 const mw=diamonds*DIAMOND_KRW*1000,gold=kind==='exchange'?diamonds*DIAMOND_GOLD:0;
 const replay=async()=>{const old=await one(env,'SELECT id,kind,amount_mw,gold FROM diamond_ledger WHERE user_id=? AND source_key=?',user.id,key);if(!old)return null;if(old.kind!==kind||old.amount_mw!==-mw||old.gold!==gold)fail(409,'이미 다른 내용으로 사용한 요청이에요.');return json({ok:true,id:old.id,gold,wallet:await diamondWallet(env,user.id)});};
 const previous=await replay();if(previous)return previous;
 await assertDiamondReady(env);await rate(env,'diamond:'+user.id,20,3600);
 const eid=id(),period=giftMonth(now()),writes=[entry(env,user.id,kind,key,-mw,0,period,kind==='exchange'?'골드 전환':'현금 정산 신청',gold,eid)];
 if(kind==='exchange'){
  // No payment/VAT/fee is booked again: the lot carries exactly the surrendered earnings value.
  writes.push(query(env,"INSERT INTO gold_purchases(id,user_id,channel,gold,price_krw,fee_krw,tax_krw,status,provider_ref,created,paid_at) VALUES(?,?,'diamond',?,?,0,0,'paid',?,?,?)",'diamond_'+eid,user.id,gold,mw/1000,eid,now(),now()));
 }else{
  if(mw/1000<MIN_PAYOUT_KRW)fail(400,`${MIN_PAYOUT_KRW/DIAMOND_KRW}다이아부터 현금 정산할 수 있어요.`);
  const p=await one(env,'SELECT id FROM producers WHERE user_id=?',user.id),account=await one(env,'SELECT user_id FROM payout_accounts WHERE user_id=?',user.id);
  if(!p||!account)fail(409,'정산 계좌를 먼저 등록해주세요.');
  if(await one(env,'SELECT 1 FROM payout_statements WHERE user_id=? AND period=?',user.id,period))fail(409,'이번 달 정산 신청이 있어요. 다음 달에 신청해주세요.');
  const gross=mw/1000,tax=withholding(gross),[y,m]=period.split('-').map(Number),due=new Date(Date.UTC(y,m,PAYOUT_DAY)).toISOString().slice(0,10);
  writes.push(query(env,'INSERT INTO payout_statements(id,profile_id,user_id,period,from_month,gross_krw,income_tax_krw,local_tax_krw,net_krw,status,due_on,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',eid,p.id,user.id,period,period,gross,tax.income,tax.local,tax.net,'scheduled',due,now()));
  // The source key links the reserved diamonds to the monthly statement, including older clients.
  writes[0]=entry(env,user.id,kind,key,-mw,0,period,'현금 정산 신청',0,eid);
 }
 try{await env.DB.batch(writes);}catch(e){const duplicate=await replay();if(duplicate)return duplicate;if(/diamond_insufficient|constraint/i.test(String(e)))fail(409,'사용 가능한 다이아 잔액 또는 정산 신청이 바뀌었어요. 다시 확인해주세요.');throw e;}
 return json({ok:true,id:eid,gold,wallet:await diamondWallet(env,user.id)},201);
}

async function finalizeStreams(req,env,user){
 const b=await req.json(),period=String(b.period||''),evidence=str(b.evidence,500);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period>=giftMonth(now())||b.verified!==true)fail(400,'끝난 달의 결제·환불·수수료·세금 증빙을 검증한 후 확정해주세요.');
 let allocation;try{allocation=allocateSubscriptionRevenue(b);}catch(e){fail(400,e.message);}
 if(await one(env,'SELECT 1 FROM stream_settlements WHERE period=?',period))fail(409,'이미 확정한 구독 정산 기간이에요.');
 // The original owner receives qualified plays of both the original and its covers, never the cover gift.
 const plays=await rows(env,`SELECT producer_id,user_id,count(*) plays FROM (
 SELECT t.id,l.listener,l.day,COALESCE(o.producer_id,t.producer_id) producer_id,COALESCE(o.user_id,t.user_id) user_id
 FROM listens l JOIN tracks t ON t.id=l.track_id LEFT JOIN tracks o ON t.kind='cover' AND o.id=t.original_id
 WHERE l.qualified=1 AND substr(l.day,1,7)=? AND (l.user_id IS NULL OR (l.user_id!=t.user_id AND l.user_id!=COALESCE(o.user_id,t.user_id)))
 GROUP BY t.id,l.listener,l.day) GROUP BY producer_id,user_id`,period);
 const total=plays.reduce((s,p)=>s+p.plays,0);if(!total)fail(409,'이 기간에 수익을 배분할 유효 재생이 없어요.');
 const earnings=plays.map(p=>({...p,mw:Number(BigInt(allocation.creatorMW)*BigInt(p.plays)/BigInt(total))})),allocated=earnings.reduce((s,p)=>s+p.mw,0);
 await env.DB.batch([
 query(env,'INSERT INTO stream_settlements(period,paid_krw,refunded_krw,fee_krw,tax_krw,pool_mw,allocated_mw,evidence,reviewed_by,created) VALUES(?,?,?,?,?,?,?,?,?,?)',period,b.paidKRW,b.refundedKRW,b.paymentFeeKRW,b.taxKRW,allocation.creatorMW,allocated,evidence,user.id,now()),
 ...earnings.filter(p=>p.mw>0).map(p=>entry(env,p.user_id,'stream','stream:'+period,p.mw,p.mw,period,'원곡·커버 유효 재생 수익 확정')),audit(env,user,'stream_close',period)]);
 return json({period,creators:earnings.length,allocated_mw:allocated},201);
}

export async function diamondRoute(req,env,path,user){
 if(!path.startsWith('/api/diamonds')&&!path.startsWith('/api/admin/diamonds'))return null;
 requireUser(user);const method=req.method;
 if(path==='/api/diamonds'&&method==='GET')return json(await diamondWallet(env,user.id));
 if(path==='/api/diamonds/exchange'&&method==='POST')return useDiamonds(req,env,user,'exchange');
 if(path==='/api/diamonds/payout'&&method==='POST')return useDiamonds(req,env,user,'payout');
 if(!path.startsWith('/api/admin/diamonds')||!isAdmin(env,user))fail(404,'페이지를 찾을 수 없습니다.');
 if(path==='/api/admin/diamonds'&&method==='GET'){
  const people=await rows(env,"SELECT p.user_id,p.id,p.name,u.email FROM producers p JOIN users u ON u.id=p.user_id WHERE u.provider!='deleted' ORDER BY p.created DESC LIMIT 200");
  return json({people:await Promise.all(people.map(async p=>({...p,...await partnerState(env,p.user_id)}))),streams:await rows(env,'SELECT * FROM stream_settlements ORDER BY period DESC LIMIT 12'),credits:await rows(env,"SELECT d.*,p.name FROM diamond_ledger d LEFT JOIN producers p ON p.user_id=d.user_id WHERE d.kind IN ('gift','stream') AND NOT EXISTS(SELECT 1 FROM diamond_ledger r WHERE r.source_key='reverse:'||d.id) ORDER BY d.created DESC LIMIT 50")});
 }
 if(path==='/api/admin/diamonds/streams'&&method==='POST')return finalizeStreams(req,env,user);
 if(path==='/api/admin/diamonds/exclude-gift'&&method==='POST'){
  const b=await req.json(),giftId=str(b.gift_id,100),reason=str(b.reason,500);
  if(!await one(env,'SELECT 1 FROM gifts WHERE id=?',giftId))fail(404,'선물을 찾을 수 없어요.');
  if(await one(env,'SELECT 1 FROM gift_exclusions WHERE gift_id=?',giftId))fail(409,'이미 제외한 선물이에요.');
  const credits=await rows(env,"SELECT * FROM diamond_ledger d WHERE kind='gift' AND source_key=? AND NOT EXISTS(SELECT 1 FROM diamond_ledger r WHERE r.user_id=d.user_id AND r.source_key='reverse:'||d.id)",'gift:'+giftId);
  await env.DB.batch([query(env,'INSERT INTO gift_exclusions(gift_id,reason,reviewed_by,created) VALUES(?,?,?,?)',giftId,reason,user.id,now()),...credits.map(c=>entry(env,c.user_id,'reverse','reverse:'+c.id,-c.amount_mw,-c.eligible_mw,c.period,reason)),audit(env,user,'gift_exclude',giftId+': '+reason)]);
  return json({ok:true,reversed:credits.length});
 }
 if(path==='/api/admin/diamonds/partner'&&method==='POST'){
  const b=await req.json(),uid=str(b.user_id,100),reason=str(b.reason,500),state=await partnerState(env,uid);
  if(!['earned','special','revoke'].includes(b.basis))fail(400,'승급 방식을 확인해주세요.');
  if(b.basis==='earned'&&(!state.qualified||b.verified!==true))fail(409,'누적 세전 정산 100만 원 및 부정 수익 제외 여부를 검증해주세요.');
  if(!await one(env,'SELECT 1 FROM producers WHERE user_id=?',uid))fail(404,'창작자를 찾을 수 없어요.');
  await env.DB.batch([query(env,'INSERT INTO creator_partners(user_id,basis,active,activated,reviewed_by,reason) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET basis=excluded.basis,active=excluded.active,activated=excluded.activated,reviewed_by=excluded.reviewed_by,reason=excluded.reason',uid,b.basis,b.basis==='revoke'?0:1,now(),user.id,reason),audit(env,user,'partner_'+b.basis,uid+': '+reason)]);
  return json(await partnerState(env,uid));
 }
 if(path==='/api/admin/diamonds/reverse'&&method==='POST'){
  const b=await req.json(),credit=await one(env,"SELECT * FROM diamond_ledger WHERE id=? AND kind IN ('gift','stream')",str(b.id,100)),reason=str(b.reason,500);
  if(!credit)fail(404,'확정 수익을 찾을 수 없어요.');
  if(await one(env,'SELECT 1 FROM diamond_ledger WHERE user_id=? AND source_key=?',credit.user_id,'reverse:'+credit.id))fail(409,'이미 제외한 수익이에요.');
  await env.DB.batch([entry(env,credit.user_id,'reverse','reverse:'+credit.id,-credit.amount_mw,-credit.eligible_mw,credit.period,reason),audit(env,user,'diamond_reverse',credit.id+': '+reason)]);
  return json({ok:true});
 }
 fail(404,'페이지를 찾을 수 없습니다.');
}
