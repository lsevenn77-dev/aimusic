import {one,rows,run,query,now,id,fail,str,json,rate} from './db.js';
import {requireUser,isAdmin} from './auth.js';
import {MIN_PAYOUT_KRW,PAYOUT_DAY,BANKS,withholding,giftMonth,wonFromMw} from '../shared/gifts.js';

const encoder=new TextEncoder();
async function payoutKey(env,usage){
 if(!env.PAYOUT_ENCRYPTION_KEY)fail(503,'정산 정보 등록을 준비 중입니다.');
 const raw=Uint8Array.from(atob(env.PAYOUT_ENCRYPTION_KEY),c=>c.charCodeAt(0));
 if(raw.length!==32)throw new Error('Invalid payout encryption key');
 return crypto.subtle.importKey('raw',raw,'AES-GCM',false,[usage]);
}
// The owner and field are bound as associated data, so a ciphertext cannot be moved to another user or field.
async function seal(env,value,binding){
 const key=await payoutKey(env,'encrypt'),iv=crypto.getRandomValues(new Uint8Array(12));
 const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(binding)},key,encoder.encode(value)));
 return btoa(String.fromCharCode(...iv,...data));
}
async function unseal(env,sealed,binding){
 const key=await payoutKey(env,'decrypt'),data=Uint8Array.from(atob(sealed),c=>c.charCodeAt(0));
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:encoder.encode(binding)},key,data.slice(12)));
}

export function residentNumber(value,today=new Date()){
 const d=String(value||'').replace(/[\s-]/g,'');
 if(!/^\d{13}$/.test(d))fail(400,'주민등록번호 13자리를 확인해주세요.');
 const g=Number(d[6]);if(g<1||g>8)fail(400,'주민등록번호를 확인해주세요.');
 const year=([1,2,5,6].includes(g)?1900:2000)+Number(d.slice(0,2)),month=Number(d.slice(2,4)),day=Number(d.slice(4,6)),birth=new Date(Date.UTC(year,month-1,day));
 if(birth.getUTCFullYear()!==year||birth.getUTCMonth()!==month-1||birth.getUTCDate()!==day)fail(400,'주민등록번호를 확인해주세요.');
 const local=new Date(today.getTime()+9*3600*1000);
 let age=local.getUTCFullYear()-year;if(local.getUTCMonth()+1<month||(local.getUTCMonth()+1===month&&local.getUTCDate()<day))age--;
 // Minors need a legal guardian's consent to receive payouts; that is handled with customer support.
 if(age<19)fail(400,'만 19세 미만은 법정대리인 동의 확인이 필요해요. 고객센터로 문의해주세요.');
 return d;
}

const nextMonthDay=(month,day)=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,day)).toISOString().slice(0,10);};
const accountSummary=row=>row?{holder:row.holder,bank:row.bank,account:'****'+row.account_last4,resident:row.resident_hint,updated:row.updated}:null;
async function profileOf(env,userId){return one(env,'SELECT id FROM producers WHERE user_id=?',userId);}
async function hasEarnings(env,userId){const p=await profileOf(env,userId);return !!p&&!!await one(env,'SELECT 1 FROM gifts WHERE (singer_profile_id=? AND singer_mw>0) OR (creator_profile_id=? AND creator_mw>0) LIMIT 1',p.id,p.id);}

// What the studio shows: statements already issued, the account on file, and whether registration is open yet.
export async function creatorPayouts(env,userId){
 const [account,statements,earning]=await Promise.all([
  one(env,'SELECT * FROM payout_accounts WHERE user_id=?',userId),
  rows(env,'SELECT id,period,from_month,gross_krw,income_tax_krw,local_tax_krw,net_krw,status,due_on,paid_at FROM payout_statements WHERE user_id=? ORDER BY period DESC LIMIT 36',userId),
  hasEarnings(env,userId)]);
 return {account:accountSummary(account),can_register:earning,statements,banks:BANKS,last_period:statements[0]?.period||null};
}

async function audit(env,admin,action,target){await run(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',id(),admin.id,action,target,now());}

// Closing a finished month issues one statement per person whose unpaid earnings since their last statement
// reach the minimum; smaller totals stay unpaid and are picked up by a later close.
export async function closePeriod(env,admin,period){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period>=giftMonth(now()))fail(400,'끝난 달만 마감할 수 있어요.');
 const latest=(await one(env,'SELECT max(period) p FROM payout_periods')).p;
 if(latest&&period<=latest)fail(409,`${latest}까지 이미 마감했어요.`);
 const due=nextMonthDay(period,PAYOUT_DAY);
 const earnings=await rows(env,`WITH shares AS (
   SELECT singer_profile_id pid,month,singer_mw mw FROM gifts WHERE singer_profile_id IS NOT NULL AND singer_mw>0
   UNION ALL SELECT creator_profile_id,month,creator_mw FROM gifts WHERE creator_mw>0),
  last AS (SELECT profile_id pid,max(period) period FROM payout_statements GROUP BY profile_id)
  SELECT s.pid,p.user_id,min(s.month) from_month,sum(s.mw) mw,(a.user_id IS NOT NULL) has_account
  FROM shares s JOIN producers p ON p.id=s.pid LEFT JOIN last l ON l.pid=s.pid LEFT JOIN payout_accounts a ON a.user_id=p.user_id
  WHERE s.month<=? AND (l.period IS NULL OR s.month>l.period) GROUP BY s.pid,p.user_id,a.user_id`,period);
 const writes=[query(env,'INSERT INTO payout_periods(period,closed_at,closed_by) VALUES(?,?,?)',period,now(),admin.id)];
 let issued=0,carried=0;
 for(const e of earnings){
  const gross=wonFromMw(e.mw);if(gross<MIN_PAYOUT_KRW){carried++;continue;}
  const tax=withholding(gross);issued++;
  writes.push(query(env,'INSERT INTO payout_statements(id,profile_id,user_id,period,from_month,gross_krw,income_tax_krw,local_tax_krw,net_krw,status,due_on,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   id(),e.pid,e.user_id,period,e.from_month,gross,tax.income,tax.local,tax.net,e.has_account?'scheduled':'held',due,now()));
 }
 await env.DB.batch(writes);await audit(env,admin,'payout_close',period);
 return {period,issued,carried,due_on:due};
}

export async function payoutRoute(req,env,path,user){
 const method=req.method;
 if(path==='/api/studio/payout-account'){
  requireUser(user);
  if(method==='GET')return json(await creatorPayouts(env,user.id));
  if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  await rate(env,'payout-account:'+user.id,10,86400);
  if(!await hasEarnings(env,user.id))fail(409,'받은 선물 수익이 생기면 정산 정보를 등록할 수 있어요.');
  const b=await req.json();
  if(b.consent!==true)fail(400,'정산 정보 처리 안내를 확인하고 동의해주세요.');
  const holder=str(b.holder,40);if(holder.length<2)fail(400,'예금주 이름을 확인해주세요.');
  if(!BANKS.includes(b.bank))fail(400,'은행을 선택해주세요.');
  const account=String(b.account||'').replace(/[\s-]/g,'');if(!/^\d{10,16}$/.test(account))fail(400,'계좌번호를 숫자로 확인해주세요.');
  const resident=residentNumber(b.resident_number),at=now();
  await run(env,`INSERT INTO payout_accounts(user_id,holder,bank,account_last4,account_cipher,resident_hint,resident_cipher,consent_at,updated) VALUES(?,?,?,?,?,?,?,?,?)
   ON CONFLICT(user_id) DO UPDATE SET holder=excluded.holder,bank=excluded.bank,account_last4=excluded.account_last4,account_cipher=excluded.account_cipher,resident_hint=excluded.resident_hint,resident_cipher=excluded.resident_cipher,consent_at=excluded.consent_at,updated=excluded.updated`,
   user.id,holder,b.bank,account.slice(-4),await seal(env,account,user.id+':account'),`${resident.slice(0,6)}-${resident[6]}******`,await seal(env,resident,user.id+':resident'),at,at);
  // Statements that were only waiting for an account can now be paid.
  await run(env,"UPDATE payout_statements SET status='scheduled' WHERE user_id=? AND status='held'",user.id);
  return json(await creatorPayouts(env,user.id));
 }
 if(!path.startsWith('/api/admin/'))return null;
 requireUser(user);if(!isAdmin(env,user))fail(404,'페이지를 찾을 수 없습니다.');
 if(path==='/api/admin/payouts'&&method==='GET'){
  const periods=(await rows(env,'SELECT period,closed_at FROM payout_periods ORDER BY period DESC LIMIT 36'));
  const requested=new URL(req.url).searchParams.get('period'),period=requested||periods[0]?.period||null,current=giftMonth(now());
  const [y,m]=current.split('-').map(Number),previous=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
  return json({periods,period,closable:!periods.length||periods[0].period<previous?previous:null,
   statements:period?await rows(env,`SELECT s.id,s.period,s.from_month,s.gross_krw,s.income_tax_krw,s.local_tax_krw,s.net_krw,s.status,s.due_on,s.paid_at,s.paid_ref,s.account_snapshot,p.name profile,u.email,a.bank,a.account_last4,a.holder
    FROM payout_statements s JOIN producers p ON p.id=s.profile_id JOIN users u ON u.id=s.user_id LEFT JOIN payout_accounts a ON a.user_id=s.user_id WHERE s.period=? ORDER BY s.status,s.gross_krw DESC`,period):[],
   unpaid:(await one(env,"SELECT count(*) n,COALESCE(sum(net_krw),0) krw FROM payout_statements WHERE status IN ('scheduled','held')"))});
 }
 if(path==='/api/admin/payouts/close'&&method==='POST'){const b=await req.json();return json(await closePeriod(env,user,String(b.period||'')),201);}
 const m=path.match(/^\/api\/admin\/payouts\/([\w-]+)\/(account|paid)$/);if(!m)fail(404,'페이지를 찾을 수 없습니다.');
 const s=await one(env,'SELECT s.*,a.holder,a.bank,a.account_last4,a.account_cipher,a.resident_cipher FROM payout_statements s LEFT JOIN payout_accounts a ON a.user_id=s.user_id WHERE s.id=?',m[1]);if(!s)fail(404,'정산서를 찾을 수 없습니다.');
 if(m[2]==='account'&&method==='GET'){
  if(!s.account_cipher)fail(404,'등록된 정산 계좌가 없습니다.');
  // Every reveal of an account or resident number is recorded.
  await audit(env,user,'payout_account_view',s.id);
  return json({holder:s.holder,bank:s.bank,account:await unseal(env,s.account_cipher,s.user_id+':account'),resident_number:await unseal(env,s.resident_cipher,s.user_id+':resident')});
 }
 if(m[2]==='paid'&&method==='POST'){
  if(s.status!=='scheduled')fail(409,'지급 예정인 정산서만 지급 완료로 바꿀 수 있어요.');
  const b=await req.json(),ref=str(b.ref||'',100,false);
  await run(env,"UPDATE payout_statements SET status='paid',paid_at=?,paid_ref=?,paid_by=?,account_snapshot=? WHERE id=? AND status='scheduled'",now(),ref,user.id,`${s.bank} ****${s.account_last4} ${s.holder}`,s.id);
  await audit(env,user,'payout_paid',s.id);
  return json({ok:true});
 }
 fail(405,'지원하지 않는 요청입니다.');
}
