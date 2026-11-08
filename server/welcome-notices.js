import {one,query,run,now,json,fail} from './db.js';
import {publicNameSQL} from './identity.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_PREVIEW,WELCOME_GUIDE} from '../shared/welcome-guide.js';

const eligible = "u.account_type='human' AND u.provider!='deleted'";
const peer = receipt => ({id:WELCOME_PEER_ID,name:'아이팩트 안내',chat_nickname:'아이팩트 안내',is_notice:true,notice_type:'welcome',read_only:true,last_message:WELCOME_PREVIEW,updated:receipt.created,unread:receipt.read_at?0:1});

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

export async function welcomeConversation(env,userId) {
 const receipt=await one(env,`SELECT r.created,r.read_at FROM welcome_receipts r JOIN users u ON u.id=r.user_id WHERE r.campaign_id=? AND r.user_id=? AND ${eligible}`,WELCOME_CAMPAIGN_ID,userId);
 return receipt?peer(receipt):null;
}

export async function welcomeNoticeRoute(req,env,path,user) {
 if(path!=='/api/notices/welcome')return null;
 if(!user)fail(401,'로그인 후 이용해주세요.');
 if(!['GET','PATCH'].includes(req.method))fail(405,'읽기 전용 안내입니다.');
 const receipt=await one(env,`SELECT r.created,r.read_at,c.content_json,${publicNameSQL()} nickname
  FROM welcome_receipts r JOIN welcome_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=r.user_id LEFT JOIN producers p ON p.user_id=u.id
  WHERE r.campaign_id=? AND r.user_id=? AND ${eligible}`,WELCOME_CAMPAIGN_ID,user.id);
 if(!receipt)fail(404,'아직 도착한 안내가 없어요.');
 if(req.method==='PATCH'){
  let body;try{body=await req.json();}catch{fail(400,'읽은 안내를 다시 확인해주세요.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||body.campaign_id!==WELCOME_CAMPAIGN_ID||Object.keys(body).some(key=>key!=='campaign_id'))fail(400,'읽은 안내를 다시 확인해주세요.');
  await run(env,'UPDATE welcome_receipts SET read_at=? WHERE campaign_id=? AND user_id=? AND read_at=0',now(),WELCOME_CAMPAIGN_ID,user.id);
  return json({ok:true});
 }
 const guide=JSON.parse(receipt.content_json),nickname=String(receipt.nickname||'').trim();
 guide.greeting=nickname?guide.greeting.replace('{닉네임}',()=>nickname):'반가워요! 👋\n아이팩트에 오신 걸 환영해요.';
 return json({peer:peer(receipt),campaign_id:WELCOME_CAMPAIGN_ID,created:receipt.created,read_at:receipt.read_at,guide});
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
