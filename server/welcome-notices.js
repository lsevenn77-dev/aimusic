import * as AifectMessages from '../shared/system-messages.js';
import {one,rows,query,run,now,json,fail} from './db.js';
import {publicNameSQL} from './identity.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_PREVIEW,WELCOME_GUIDE,updateWelcomeCopy} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID,PREMIUM_OPEN_NOTICE_SENDER,PREMIUM_OPEN_NOTICE_TYPE} from '../shared/premium-open-notice.js';
import {eventEnd,eventUntilSQL} from './premium-event.js';

const eligible = "u.account_type='human' AND u.provider!='deleted'";
const peer = receipt => ({id:WELCOME_PEER_ID,name:'아이팩트 안내',chat_nickname:'아이팩트 안내',is_notice:true,notice_type:'welcome',read_only:true,last_message:WELCOME_PREVIEW,updated:receipt.created,unread:receipt.read_at?0:1});
const premiumOpenPeer = receipt => ({id:PREMIUM_OPEN_NOTICE_ID,name:PREMIUM_OPEN_NOTICE_SENDER,chat_nickname:PREMIUM_OPEN_NOTICE_SENDER,is_notice:true,notice_type:PREMIUM_OPEN_NOTICE_TYPE,read_only:true,last_message:PREMIUM_OPEN_NOTICE.title,updated:receipt.created,unread:receipt.read_at?0:1});
const premiumAuditId = 'notice:'+PREMIUM_OPEN_NOTICE_ID;

async function premiumBroadcastReport(env) {
 const record=await one(env,'SELECT target,created FROM admin_audit WHERE id=?',premiumAuditId);
 return record?{campaign_id:PREMIUM_OPEN_NOTICE_ID,active:true,activated_at:record.created,...JSON.parse(record.target)}:null;
}

export async function premiumOpenNoticeStatus(env) {
 const report=await premiumBroadcastReport(env);
 if(report)return report;
 const counts=await one(env,`SELECT COUNT(*) target_members,COUNT(*) FILTER (WHERE (${eventUntilSQL})>?) active_event_members
   FROM users u WHERE ${eligible}`,now());
 return {campaign_id:PREMIUM_OPEN_NOTICE_ID,active:false,...counts};
}

// Eligibility, receipt creation and the report share one batch.
async function broadcastPremiumOpenNotice(env,expectedTargets) {
 const previous=await premiumBroadcastReport(env);
 if(previous)return previous;
 const at=now();
 if(at>=eventEnd)fail(409,'프리미엄 이벤트가 종료되었습니다.');
 await env.DB.batch([
  query(env,`INSERT OR IGNORE INTO welcome_campaigns(id,content_json,created,recipient_max_rowid)
   SELECT ?,?,?,COALESCE(MAX(u.rowid),0) FROM users u WHERE ${eligible}
   HAVING COUNT(*)=? AND COUNT(*) FILTER (WHERE (${eventUntilSQL})>?)=?`,
   PREMIUM_OPEN_NOTICE_ID,JSON.stringify(PREMIUM_OPEN_NOTICE),at,expectedTargets,at,expectedTargets),
  query(env,`INSERT OR IGNORE INTO welcome_receipts(campaign_id,user_id,created,source)
   SELECT c.id,u.id,c.created,'broadcast' FROM welcome_campaigns c JOIN users u ON u.rowid<=c.recipient_max_rowid
   WHERE c.id=? AND ${eligible} AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`,PREMIUM_OPEN_NOTICE_ID,premiumAuditId),
  query(env,`INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,'system:premium-open-event','notice:premium_open_broadcast',json_object('target_members',?,'active_event_members',?,'delivered',totals.delivered,'failed',?-totals.delivered,'channel','notice'),c.created
   FROM welcome_campaigns c CROSS JOIN (SELECT COUNT(*) delivered FROM welcome_receipts WHERE campaign_id=? AND source='broadcast') totals
   WHERE c.id=?`,premiumAuditId,expectedTargets,expectedTargets,expectedTargets,PREMIUM_OPEN_NOTICE_ID,PREMIUM_OPEN_NOTICE_ID)
 ]);
 const report=await premiumBroadcastReport(env);
 if(!report)fail(409,'발송 인원 또는 이벤트 권한이 달라졌습니다. 운영 집계를 다시 확인해 주세요.');
 return report;
}

let premiumActivationPending=null,premiumActivationDone=false,premiumRetryAt=0;
// Like the welcome campaign, this fixed operation is authorized by the production publication.
// Ordinary traffic cannot choose the content or recipients, and a preview cannot activate it.
export function queuePremiumOpenNotice(req,env,ctx) {
 const at=now();
 if(premiumActivationDone||premiumActivationPending||at<premiumRetryAt||at>=eventEnd||!env.DB||!env.ASSETS||!ctx?.waitUntil||req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!=='https://aifect.co.kr'||url.pathname!=='/')return;
 premiumActivationPending=(async()=>{
  const status=await premiumOpenNoticeStatus(env);
  if(!status.active){
   if(!status.target_members||status.active_event_members!==status.target_members)throw new Error('Event coverage incomplete');
   const banner=await env.ASSETS.fetch(new Request(new URL(PREMIUM_OPEN_NOTICE.banner,url),{method:'HEAD'}));
   if(!banner.ok||!banner.headers.get('content-type')?.startsWith('image/webp'))throw new Error('Notice banner unavailable');
   await broadcastPremiumOpenNotice(env,status.target_members);
  }
  premiumActivationDone=true;
 })().catch(()=>{premiumRetryAt=now()+60;console.error('Premium open notice activation pending');}).finally(()=>{premiumActivationPending=null;});
 ctx.waitUntil(premiumActivationPending);
}

// This fixed deployment activation is the owner's requested one-time broadcast.
// No public request may choose recipients, content, or a new campaign identifier.
// All inserts and the audit entry commit together, outside schema migrations.
export async function activateWelcomeCampaign(env) {
 if(await one(env,'SELECT id FROM welcome_campaigns WHERE id=?',WELCOME_CAMPAIGN_ID))return;
 const at=now();
 await env.DB.batch([
  query(env,`INSERT OR IGNORE INTO welcome_campaigns(id,content_json,created,recipient_max_rowid)
   SELECT ?,?,?,COALESCE(MAX(rowid),0) FROM users`,WELCOME_CAMPAIGN_ID,JSON.stringify(WELCOME_GUIDE),at),
  query(env,`INSERT OR IGNORE INTO welcome_receipts(campaign_id,user_id,created,source)
   SELECT c.id,u.id,c.created,'broadcast' FROM welcome_campaigns c JOIN users u ON u.rowid<=c.recipient_max_rowid
   WHERE c.id=? AND ${eligible}`,WELCOME_CAMPAIGN_ID),
  query(env,`INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,'system:welcome-guide','welcome:broadcast',json_object('campaign_id',c.id,'recipient_max_rowid',c.recipient_max_rowid,'recipients',(SELECT COUNT(*) FROM welcome_receipts r WHERE r.campaign_id=c.id AND r.source='broadcast'),'channel','notice','trigger','owner-approved deployment'),c.created FROM welcome_campaigns c WHERE c.id=?`,'welcome:'+WELCOME_CAMPAIGN_ID,WELCOME_CAMPAIGN_ID)
 ]);
}

let activationPending=null,activationDone=false,retryAt=0;
export function queueWelcomeCampaign(req,env,ctx) {
 const url=new URL(req.url);
 if(url.origin!=='https://aifect.co.kr'||!env.DB||!ctx?.waitUntil||activationDone||activationPending||now()<retryAt)return;
 // Only the live site's ordinary document/API traffic activates the approved
 // deployment. Local previews and fixture databases never broadcast implicitly.
 if(req.method!=='GET'||!(url.pathname==='/'||url.pathname.startsWith('/api/')))return;
 activationPending=activateWelcomeCampaign(env).then(()=>{activationDone=true;}).catch(()=>{retryAt=now()+60;console.error('Welcome notice activation pending');}).finally(()=>{activationPending=null;});
 ctx.waitUntil(activationPending);
}

// Called after authenticated startup. The composite primary key covers retries,
// two devices, and a signup racing the original broadcast transaction.
export async function ensureWelcomeReceipt(env,userId) {
 await run(env,`INSERT OR IGNORE INTO welcome_receipts(campaign_id,user_id,created,source)
  SELECT c.id,u.id,?,'automatic' FROM welcome_campaigns c JOIN users u ON u.id=?
  WHERE c.id=? AND ${eligible}`,now(),userId,WELCOME_CAMPAIGN_ID);
}

export async function noticeConversations(env,userId) {
 const receipts=await rows(env,`SELECT r.campaign_id,r.created,r.read_at FROM welcome_receipts r JOIN users u ON u.id=r.user_id
   WHERE r.campaign_id IN (?,?) AND r.user_id=? AND ${eligible}`,WELCOME_CAMPAIGN_ID,PREMIUM_OPEN_NOTICE_ID,userId);
 return receipts.map(receipt=>receipt.campaign_id===PREMIUM_OPEN_NOTICE_ID?premiumOpenPeer(receipt):peer(receipt));
}

export async function welcomeNoticeRoute(req,env,path,user) {
 const premium=path==='/api/notices/premium-open-event';
 if(path!=='/api/notices/welcome'&&!premium)return null;
 const campaignId=premium?PREMIUM_OPEN_NOTICE_ID:WELCOME_CAMPAIGN_ID;
 if(!user)fail(401,AifectMessages.signIn);
 if(!['GET','PATCH'].includes(req.method))fail(405,'읽기 전용 안내입니다.');
 const receipt=await one(env,`SELECT r.created,r.read_at,c.content_json,${publicNameSQL()} nickname
  FROM welcome_receipts r JOIN welcome_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=r.user_id LEFT JOIN producers p ON p.user_id=u.id
  WHERE r.campaign_id=? AND r.user_id=? AND ${eligible}`,campaignId,user.id);
 if(!receipt)fail(404,'아직 도착한 안내가 없습니다.');
 if(req.method==='PATCH'){
  let body;try{body=await req.json();}catch{fail(400,'읽은 안내를 다시 확인해 주세요.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||body.campaign_id!==campaignId||Object.keys(body).some(key=>key!=='campaign_id'))fail(400,'읽은 안내를 다시 확인해 주세요.');
  await run(env,'UPDATE welcome_receipts SET read_at=? WHERE campaign_id=? AND user_id=? AND read_at=0',now(),campaignId,user.id);
  return json({ok:true});
 }
 if(premium)return json({peer:premiumOpenPeer(receipt),campaign_id:campaignId,created:receipt.created,read_at:receipt.read_at,notice:JSON.parse(receipt.content_json)});
 return json({peer:peer(receipt),campaign_id:WELCOME_CAMPAIGN_ID,created:receipt.created,read_at:receipt.read_at,guide:formatWelcomeGuide(receipt)});
}

export function formatWelcomeGuide(receipt){
 const guide=updateWelcomeCopy(JSON.parse(receipt.content_json)),nickname=String(receipt.nickname||'').trim();
 // Apply the owner's presentation change to saved notices without redelivery.
 delete guide.stickers;
 if(!guide.sections.some(section=>section.id==='crew')){
  const after=guide.sections.findIndex(section=>section.id==='talking');
  guide.sections.splice(after<0?guide.sections.length:after+1,0,WELCOME_GUIDE.sections.find(section=>section.id==='crew'));
 }
 guide.greeting=nickname?guide.greeting.replace('{닉네임}',()=>nickname):'반갑습니다! 👋\n아이팩트에 오신 걸 환영합니다.';
 return guide;
}

// Authenticated admin statistics only; querying this does not initiate delivery.
export async function welcomeNoticeStatus(env) {
 const campaign=await one(env,'SELECT id,created,recipient_max_rowid FROM welcome_campaigns WHERE id=?',WELCOME_CAMPAIGN_ID);
 if(!campaign)return {campaign_id:WELCOME_CAMPAIGN_ID,active:false};
 const counts=await one(env,`SELECT
  (SELECT COUNT(*) FROM users u WHERE ${eligible}) eligible_members,
  (SELECT COUNT(*) FROM users u WHERE u.rowid<=? AND ${eligible}) broadcast_targets,
  (SELECT COUNT(*) FROM welcome_receipts r JOIN users u ON u.id=r.user_id WHERE r.campaign_id=? AND ${eligible}) delivered,
  (SELECT COUNT(*) FROM welcome_receipts r JOIN users u ON u.id=r.user_id WHERE r.campaign_id=? AND r.source='broadcast' AND ${eligible}) broadcast_delivered,
  (SELECT COUNT(*) FROM welcome_receipts r JOIN users u ON u.id=r.user_id WHERE r.campaign_id=? AND r.source='automatic' AND ${eligible}) automatic_delivered,
  (SELECT COUNT(*) FROM welcome_receipts r JOIN users u ON u.id=r.user_id WHERE r.campaign_id=? AND r.read_at>0 AND ${eligible}) read,
  (SELECT COUNT(*) FROM users u WHERE u.rowid<=? AND ${eligible} AND NOT EXISTS(SELECT 1 FROM welcome_receipts r WHERE r.campaign_id=? AND r.user_id=u.id)) broadcast_missing`,campaign.recipient_max_rowid,WELCOME_CAMPAIGN_ID,WELCOME_CAMPAIGN_ID,WELCOME_CAMPAIGN_ID,WELCOME_CAMPAIGN_ID,campaign.recipient_max_rowid,WELCOME_CAMPAIGN_ID);
 return {campaign_id:campaign.id,active:true,activated_at:campaign.created,...counts};
}
