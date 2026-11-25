import * as AifectMessages from '../shared/system-messages.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_PREVIEW} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {configuredAdminIds,requireUser} from './auth.js';
import {chatSummary} from './chat-features.js';
import {fail,json,now,one,query,rows} from './db.js';
import {publicNameSQL} from './identity.js';
import {formatWelcomeGuide} from './welcome-notices.js';

const channel={id:'aifect-official-notice',name:'아이팩트 안내',is_notice:true,notice_type:'official',read_only:true};
const pageSize=100;
const idPattern='(?:campaign|dm):[\\w-]{1,100}';
const validId=new RegExp('^'+idPattern+'$');
const validCursor=new RegExp('^(\\d{1,12})\\|('+idPattern+')$');

// Both sources keep their own receipt timestamps. Admin DMs retain the same
// participant, block and clear boundaries as the message workspace.
const history=`WITH official_history AS (
 SELECT 'campaign:'||r.campaign_id id,'campaign' kind,r.created,r.read_at,0 mine,0 muted,
   NULL body,NULL image_id,NULL image_expires,NULL crew_invite_id,r.campaign_id legacy_id,c.content_json,
   ${publicNameSQL()} nickname
 FROM welcome_receipts r JOIN welcome_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=r.user_id
 LEFT JOIN producers p ON p.user_id=u.id
 WHERE r.user_id=? AND r.campaign_id IN (?,?) AND u.account_type='human' AND u.provider<>'deleted'
 UNION ALL
 SELECT 'dm:'||d.id,'dm',d.created,d.read_at,d.sender_id=?,COALESCE(s.muted,0),
   d.body,d.image_id,i.expires,d.crew_invite_id,p.id,NULL,NULL
 FROM direct_messages d JOIN producers p ON p.user_id=CASE WHEN d.sender_id=? THEN d.recipient_id ELSE d.sender_id END
 LEFT JOIN dm_settings s ON s.user_id=? AND s.peer_id=p.user_id
 LEFT JOIN chat_images i ON i.id=d.image_id
 WHERE (d.recipient_id=? OR d.sender_id=?) AND p.user_id<>? AND p.user_id IN (SELECT value FROM json_each(?))
   AND d.rowid>COALESCE(s.cleared_sequence,0)
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=d.sender_id AND b.blocked_id=d.recipient_id)
     OR (b.user_id=d.recipient_id AND b.blocked_id=d.sender_id))
)`;
const scope=(env,uid)=>[uid,WELCOME_CAMPAIGN_ID,PREMIUM_OPEN_NOTICE_ID,uid,uid,uid,uid,uid,uid,JSON.stringify(configuredAdminIds(env))];

export async function officialNoticeChannel(env,uid){
 const latest=await one(env,`${history} SELECT kind,legacy_id,body,created,SUM(read_at=0 AND mine=0) OVER () unread,
  MIN(muted) OVER () muted FROM official_history ORDER BY created DESC,id DESC LIMIT 1`,...scope(env,uid));
 const preview=latest?.kind==='dm'?latest.body:latest?.legacy_id===PREMIUM_OPEN_NOTICE_ID?PREMIUM_OPEN_NOTICE.title:latest?WELCOME_PREVIEW:null;
 return {...channel,last_message:preview,updated:latest?.created??null,unread:latest?.unread??0,muted:latest?.muted??0};
}

function noticeEntry(record){
 const {id,created,read_at,legacy_id}=record;
 const base={id,created,read_at,legacy_id:legacy_id===WELCOME_CAMPAIGN_ID?WELCOME_PEER_ID:legacy_id};
 if(record.kind==='dm'){
  const {body,image_id,image_expires,crew_invite_id}=record;
  return {...base,kind:'dm',mine:!!record.mine,body,image_id,image_expires,crew_invite_id};
 }
 return legacy_id===WELCOME_CAMPAIGN_ID?{...base,guide:formatWelcomeGuide(record)}:{...base,notice:JSON.parse(record.content_json)};
}

export async function officialNoticeRoute(req,env,path,user){
 if(path!=='/api/notices/official')return null;
 requireUser(user);
 if(req.method==='GET'){
  const before=new URL(req.url).searchParams.get('before');
  const cursor=before===null?null:validCursor.exec(before);
  if(before!==null&&!cursor)fail(400,'공지 위치를 확인해 주세요.');
  const records=await rows(env,`${history} SELECT * FROM official_history${cursor?' WHERE (created,id)<(?,?)':''}
    ORDER BY created DESC,id DESC LIMIT ?`,...scope(env,user.id),...(cursor?[Number(cursor[1]),cursor[2]]:[]),pageSize+1);
  const hasEarlier=records.length>pageSize;
  const items=records.slice(0,pageSize).reverse().map(noticeEntry);
  return json({channel,items,before:hasEarlier?items[0].created+'|'+items[0].id:null});
 }
 if(req.method!=='PATCH')fail(405,AifectMessages.unsupportedRequest);
 const body=await req.json().catch(()=>null);
 if(!Array.isArray(body?.ids)||!body.ids.length||body.ids.length>pageSize||
    Object.keys(body).length!==1||body.ids.some(id=>typeof id!=='string'||!validId.test(id)))fail(400,'읽은 공지를 다시 확인해 주세요.');
 const ids=JSON.stringify(body.ids),at=now(),uid=user.id;
 await env.DB.batch([
  query(env,`UPDATE welcome_receipts SET read_at=? WHERE user_id=? AND read_at=0 AND campaign_id IN (?,?)
    AND 'campaign:'||campaign_id IN (SELECT value FROM json_each(?))`,at,uid,WELCOME_CAMPAIGN_ID,PREMIUM_OPEN_NOTICE_ID,ids),
  query(env,`${history} UPDATE direct_messages SET read_at=? WHERE recipient_id=? AND read_at=0 AND 'dm:'||id IN (
    SELECT id FROM official_history WHERE kind='dm' AND mine=0 AND id IN (SELECT value FROM json_each(?)))`,...scope(env,uid),at,uid,ids)
 ]);
 const [summary,notice]=await Promise.all([chatSummary(env,user),officialNoticeChannel(env,uid)]);
 return json({unread:summary.unread,direct_unread:summary.direct_unread,notice_unread:summary.notice_unread,notice});
}
