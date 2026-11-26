import * as AifectMessages from '../shared/system-messages.js';
import {one,rows,query,run,now,json,fail} from './db.js';
import {publicNameSQL} from './identity.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_PREVIEW,WELCOME_GUIDE,updateWelcomeCopy} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID,PREMIUM_OPEN_NOTICE_SENDER,PREMIUM_OPEN_NOTICE_TYPE} from '../shared/premium-open-notice.js';
import {eventEnd,eventUntilSQL} from './premium-event.js';
import {noticeAssetURL,noticePlainText} from '../shared/official-notice-content.js';
import {noticeVisible,recipientRichNotice} from './notice-visibility.js';
import {withGiftArrivalDetails} from './gift-arrival-details.js';

const eligible = "u.account_type='human' AND u.provider!='deleted'";
const premiumOpenPeer = receipt => ({id:PREMIUM_OPEN_NOTICE_ID,name:PREMIUM_OPEN_NOTICE_SENDER,chat_nickname:PREMIUM_OPEN_NOTICE_SENDER,is_notice:true,notice_type:PREMIUM_OPEN_NOTICE_TYPE,read_only:true,last_message:PREMIUM_OPEN_NOTICE.title,updated:receipt.created,unread:receipt.read_at?0:1});
const premiumAuditId = 'notice:'+PREMIUM_OPEN_NOTICE_ID;

// Campaigns are individual deliveries in one official channel, not separate
// conversation identities. Keep the published aliases for older app versions.
export function isOfficialNoticePeer(peerId) {
 return [WELCOME_PEER_ID,PREMIUM_OPEN_NOTICE_ID,'notice','aifect-official-notice'].includes(peerId);
}

function noticePreview(receipt) {
 if(receipt.title){
  const welcome=receipt.kind==='welcome'||receipt.campaign_id===WELCOME_CAMPAIGN_ID;
  return (receipt.test?'[테스트] ':'')+(welcome?receipt.title.replaceAll('{닉네임}',()=>receipt.nickname??'회원'):receipt.title);
 }
 if(receipt.campaign_id!==PREMIUM_OPEN_NOTICE_ID)return WELCOME_PREVIEW;
 try{const title=JSON.parse(receipt.content_json).title;if(typeof title==='string'&&title.trim())return title;}catch{}
 return PREMIUM_OPEN_NOTICE.title;
}

function peer(receipts) {
 const latest=receipts.at(-1);
 return {id:WELCOME_PEER_ID,name:PREMIUM_OPEN_NOTICE_SENDER,chat_nickname:PREMIUM_OPEN_NOTICE_SENDER,is_notice:true,notice_type:'welcome',read_only:true,last_message:noticePreview(latest),updated:latest.created,unread:receipts.filter(receipt=>!receipt.read_at).length};
}

async function deliveredNotices(env,userId) {
 const records=await rows(env,`SELECT r.rowid sequence,r.campaign_id,r.created,r.read_at,c.content_json,${publicNameSQL()} nickname,
  c.kind,c.title,c.edit_json,c.edited_at,c.version,c.test
  FROM welcome_receipts r JOIN welcome_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=r.user_id
  WHERE ${noticeVisible} AND r.user_id=? AND ${eligible} ORDER BY r.created,r.rowid`,userId);
 return withGiftArrivalDetails(env,userId,records);
}

function noticeEntry(receipt) {
 const entry={campaign_id:receipt.campaign_id,created:receipt.created,read_at:receipt.read_at};
 const rich=recipientRichNotice(receipt);
 if(rich)return {...entry,rich,version:receipt.version,edited_at:receipt.edited_at,test:!!receipt.test};
 if(receipt.campaign_id===PREMIUM_OPEN_NOTICE_ID)return {...entry,path:'/api/notices/premium-open-event',notice:JSON.parse(receipt.content_json)};
 return {...entry,path:'/api/notices/welcome',guide:formatWelcomeGuide(receipt)};
}

function noticeBody(entry) {
 if(entry.rich)return [(entry.test?'[테스트] ':'')+entry.rich.title,noticePlainText(entry.rich)].filter(Boolean).join('\n\n');
 if(entry.notice)return [entry.notice.title,entry.notice.body].filter(Boolean).join('\n\n');
 const guide=entry.guide;
 return [guide.greeting,...guide.intro,...guide.sections.map(section=>section.title+'\n'+section.body),...guide.closing].join('\n\n');
}

function channelResponse(receipts) {
 const notices=receipts.map(noticeEntry),welcome=notices.find(entry=>entry.guide);
 // Legacy apps only render the top-level guide. Include event text in that
 // response copy; the structured timeline keeps each original entry separate.
 const announcements=notices.filter(entry=>entry.notice||entry.rich).map(noticeBody);
 const guide=welcome?{...welcome.guide,intro:[...announcements,...welcome.guide.intro]}:{greeting:PREMIUM_OPEN_NOTICE_SENDER,intro:announcements,sections:[],closing:[]};
 return {...(welcome||notices.at(-1)),peer:peer(receipts),guide,notices};
}

function legacyHistory(req,receipts,userId) {
 const params=new URL(req.url).searchParams,before=params.get('before'),after=params.get('after');
 if((before&&after)||[before,after].some(value=>value!==null&&!/^[1-9]\d{0,14}$/.test(value)))fail(400,'대화 위치를 확인해 주세요.');
 const messages=receipts.filter(receipt=>(!before||receipt.sequence<Number(before))&&(!after||receipt.sequence>Number(after))).sort((a,b)=>a.sequence-b.sequence).map(receipt=>{
  const entry=noticeEntry(receipt);
  const image=entry.rich?.blocks.find(b=>b.type==='image');
  const banner=image?noticeAssetURL(image.asset,entry.campaign_id):entry.notice?.banner;
  return {id:'notice:'+receipt.campaign_id,request_id:'notice:'+receipt.campaign_id,sequence:receipt.sequence,sender_id:WELCOME_PEER_ID,recipient_id:userId,body:noticeBody(entry),created:receipt.created,read_at:receipt.read_at,crew_invite_id:null,image_id:null,image_expires:null,campaign_id:entry.campaign_id,...(banner?{image_url:banner,banner}:{}),...(entry.rich?{version:entry.version,edited_at:entry.edited_at}:{})};
 });
 const data=channelResponse(receipts);
 return {...data,peer:{...data.peer,user_id:WELCOME_PEER_ID,image_version:'',premium_style_until:0,premium_default_frame:0},messages,settings:{muted:0,cleared_sequence:0,read_only:true},has_more:false,read_only:true,read_receipt:{sequence:0,read_at:0}};
}

async function acknowledgeNotice(req,env,userId,receipts,{campaignId,alias}) {
 let body;try{body=await req.json();}catch{fail(400,'읽은 안내를 다시 확인해 주세요.');}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1)fail(400,'읽은 안내를 다시 확인해 주세요.');
 if(alias&&Object.hasOwn(body,'sequence')){
  // A stable receipt rowid bounds legacy DM acknowledgements to delivered
  // history. Concurrent later deliveries and other members remain unread.
  const sequence=body.sequence;
  if(!Number.isSafeInteger(sequence)||sequence<1||!receipts.some(receipt=>receipt.sequence===sequence))fail(400,'읽음 위치를 확인해 주세요.');
  await run(env,`UPDATE welcome_receipts AS r SET read_at=? WHERE r.user_id=? AND r.rowid<=? AND r.read_at=0
   AND EXISTS(SELECT 1 FROM welcome_campaigns c WHERE c.id=r.campaign_id AND ${noticeVisible})`,now(),userId,sequence);
 }else{
  const target=body.campaign_id;
  if(!Object.hasOwn(body,'campaign_id')||!receipts.some(receipt=>receipt.campaign_id===target)||(!alias&&target!==campaignId))fail(400,'읽은 안내를 다시 확인해 주세요.');
  await run(env,`UPDATE welcome_receipts AS r SET read_at=? WHERE r.campaign_id=? AND r.user_id=? AND r.read_at=0
   AND EXISTS(SELECT 1 FROM welcome_campaigns c WHERE c.id=r.campaign_id AND ${noticeVisible})`,now(),target,userId);
 }
 return json({ok:true});
}

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
  SELECT c.id,u.id,?,'automatic' FROM users u JOIN welcome_campaigns c ON c.id=COALESCE(
   (SELECT w.id FROM welcome_campaigns w WHERE w.kind='welcome' AND w.recipient_max_rowid<u.rowid
    ORDER BY w.recipient_max_rowid DESC,w.rowid DESC LIMIT 1),?)
  WHERE u.id=? AND ${eligible} AND c.withdrawn_at=0 AND COALESCE(c.audience,'welcome')<>'welcome_disabled'
  AND NOT EXISTS (SELECT 1 FROM welcome_receipts r JOIN welcome_campaigns past ON past.id=r.campaign_id
   WHERE r.user_id=u.id AND (past.kind='welcome' OR past.id=?))`,now(),WELCOME_CAMPAIGN_ID,userId,WELCOME_CAMPAIGN_ID);
}

export async function noticeConversations(env,userId) {
 const receipts=await deliveredNotices(env,userId);
 return receipts.length?[peer(receipts)]:[];
}

export async function welcomeNoticeRoute(req,env,path,user) {
 const premium=path==='/api/notices/premium-open-event';
 const legacy=path.match(/^\/api\/dm\/([\w-]+)(?:\/(settings|images))?$/),alias=!!legacy&&isOfficialNoticePeer(legacy[1]);
 if(path!=='/api/notices/welcome'&&!premium&&!alias)return null;
 const campaignId=premium?PREMIUM_OPEN_NOTICE_ID:WELCOME_CAMPAIGN_ID;
 if(!user)fail(401,AifectMessages.signIn);
 if(!['GET','PATCH'].includes(req.method)||(alias&&legacy[2]&&(legacy[2]!=='settings'||req.method!=='GET')))fail(405,'읽기 전용 안내입니다.');
 const receipts=await deliveredNotices(env,user.id),receipt=receipts.find(entry=>entry.campaign_id===campaignId);
 if(!receipts.length||(!alias&&(premium||req.method==='PATCH')&&!receipt))fail(404,'아직 도착한 안내가 없습니다.');
 if(req.method==='PATCH')return acknowledgeNotice(req,env,user.id,receipts,{campaignId,alias});
 if(alias)return json(legacy[2]==='settings'?{muted:0,cleared_sequence:0,read_only:true}:legacyHistory(req,receipts,user.id));
 if(premium){
  const entry=noticeEntry(receipt);
  const image=entry.rich?.blocks.find(b=>b.type==='image');
  const notice=entry.rich?{title:entry.rich.title,body:noticePlainText(entry.rich),banner:image?noticeAssetURL(image.asset,campaignId):null}:entry.notice;
  return json({peer:{...premiumOpenPeer(receipt),last_message:notice.title},campaign_id:campaignId,created:receipt.created,read_at:receipt.read_at,notice});
 }
 return json(channelResponse(receipts));
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
