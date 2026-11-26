import * as AifectMessages from '../shared/system-messages.js';
import {WELCOME_CAMPAIGN_ID,WELCOME_PEER_ID,WELCOME_PREVIEW} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {configuredAdminIds,requireUser} from './auth.js';
import {chatSummary} from './chat-features.js';
import {fail,json,now,one,query,rows} from './db.js';
import {publicNameSQL} from './identity.js';
import {formatWelcomeGuide} from './welcome-notices.js';
import {noticeVisible,recipientRichNotice} from './notice-visibility.js';
import {noticeImageResponse} from './admin-notices.js';
import {withGiftArrivalDetails} from './gift-arrival-details.js';
import {legacyNoticeImage,noticeAssetId} from '../shared/official-notice-content.js';

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
   ${publicNameSQL()} nickname,c.kind campaign_kind,c.title,c.edit_json,c.version,c.edited_at,c.test
 FROM welcome_receipts r JOIN welcome_campaigns c ON c.id=r.campaign_id JOIN users u ON u.id=r.user_id
 WHERE r.user_id=? AND ${noticeVisible} AND u.account_type='human' AND u.provider<>'deleted'
 UNION ALL
 SELECT 'dm:'||d.id,'dm',d.created,d.read_at,d.sender_id=?,COALESCE(s.muted,0),
   d.body,d.image_id,i.expires,d.crew_invite_id,p.id,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
 FROM direct_messages d JOIN producers p ON p.user_id=CASE WHEN d.sender_id=? THEN d.recipient_id ELSE d.sender_id END
 LEFT JOIN dm_settings s ON s.user_id=? AND s.peer_id=p.user_id
 LEFT JOIN chat_images i ON i.id=d.image_id
 WHERE (d.recipient_id=? OR d.sender_id=?) AND p.user_id<>? AND p.user_id IN (SELECT value FROM json_each(?))
   AND d.rowid>COALESCE(s.cleared_sequence,0)
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=d.sender_id AND b.blocked_id=d.recipient_id)
     OR (b.user_id=d.recipient_id AND b.blocked_id=d.sender_id))
)`;
const scope=(env,uid)=>[uid,uid,uid,uid,uid,uid,uid,JSON.stringify(configuredAdminIds(env))];

export async function officialNoticeChannel(env,uid){
 const latest=await one(env,`${history} SELECT kind,legacy_id,body,title,test,created,campaign_kind,nickname,SUM(read_at=0 AND mine=0) OVER () unread,
  MIN(muted) OVER () muted FROM official_history ORDER BY created DESC,id DESC LIMIT 1`,...scope(env,uid));
 const title=latest?.title&&(latest.campaign_kind==='welcome'||latest.legacy_id===WELCOME_CAMPAIGN_ID)?
  latest.title.replaceAll('{닉네임}',()=>latest.nickname??'회원'):latest?.title;
 const preview=latest?.kind==='dm'?latest.body:title?(latest.test?'[테스트] ':'')+title:
  latest?.legacy_id===PREMIUM_OPEN_NOTICE_ID?PREMIUM_OPEN_NOTICE.title:latest?WELCOME_PREVIEW:null;
 return {...channel,last_message:preview,updated:latest?.created??null,unread:latest?.unread??0,muted:latest?.muted??0};
}

function noticeEntry(record){
 const {id,created,read_at,legacy_id}=record;
 const base={id,created,read_at,legacy_id:legacy_id===WELCOME_CAMPAIGN_ID?WELCOME_PEER_ID:legacy_id};
 if(record.kind==='dm'){
  const {body,image_id,image_expires,crew_invite_id}=record;
  return {...base,kind:'dm',mine:!!record.mine,body,image_id,image_expires,crew_invite_id};
 }
 const rich=recipientRichNotice(record);
 if(rich)return {...base,rich,version:record.version,edited_at:record.edited_at,test:!!record.test,
  ...(record.campaign_kind==='gift'?{gift:true}:{})};
 return legacy_id===WELCOME_CAMPAIGN_ID||record.campaign_kind==='welcome'?
  {...base,guide:formatWelcomeGuide(record)}:{...base,notice:JSON.parse(record.content_json)};
}

export async function officialNoticeRoute(req,env,path,user){
 const asset=/^\/api\/notices\/official\/([\w-]{1,100})\/images\/([\w-]{1,100})$/.exec(path);
 if(path!=='/api/notices/official'&&!asset)return null;
 requireUser(user);
 if(asset){
  if(!['GET','HEAD'].includes(req.method))fail(405,AifectMessages.unsupportedRequest);
  const [,campaign,key]=asset;
  if(key!==legacyNoticeImage&&!noticeAssetId.test(key))fail(404,'공지 이미지를 찾을 수 없습니다.');
  const visible=await one(env,`SELECT 1 FROM welcome_campaigns c JOIN welcome_receipts r ON r.campaign_id=c.id
   JOIN users u ON u.id=r.user_id WHERE c.id=? AND r.user_id=? AND ${noticeVisible}
   AND u.account_type='human' AND u.provider<>'deleted' AND EXISTS(
    SELECT 1 FROM json_each(COALESCE(c.edit_json,c.content_json),'$.blocks') b
    WHERE CASE WHEN b.type='object' THEN json_extract(b.value,'$.type')='image' AND json_extract(b.value,'$.asset')=? END)`,
   campaign,user.id,key);
  if(!visible)fail(404,'공지 이미지를 찾을 수 없습니다.');
  if(key===legacyNoticeImage){
   if(!env.ASSETS)fail(404,'공지 이미지를 찾을 수 없습니다.');
   const response=await env.ASSETS.fetch(new Request(new URL(PREMIUM_OPEN_NOTICE.banner,req.url),{method:req.method}));
   if(!response.ok)fail(404,'공지 이미지를 찾을 수 없습니다.');
   return new Response(response.body,{headers:{'content-type':'image/webp','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  return noticeImageResponse(req,env,await one(env,'SELECT object_key,content_type FROM notice_assets WHERE id=?',key));
 }
 if(req.method==='GET'){
  const params=new URL(req.url).searchParams,before=params.get('before');
  const known=params.getAll('known');
  if(known.length){
   if(before!==null||known.length>pageSize||known.some(key=>!validId.test(key)))fail(400,'공지 위치를 확인해 주세요.');
   const records=await rows(env,`${history} SELECT * FROM official_history WHERE id IN (SELECT value FROM json_each(?))
    ORDER BY created,id`,...scope(env,user.id),JSON.stringify(known));
   return json({channel,items:(await withGiftArrivalDetails(env,user.id,records)).map(noticeEntry),before:null});
  }
  const cursor=before===null?null:validCursor.exec(before);
  if(before!==null&&!cursor)fail(400,'공지 위치를 확인해 주세요.');
  const records=await rows(env,`${history} SELECT * FROM official_history${cursor?' WHERE (created,id)<(?,?)':''}
    ORDER BY created DESC,id DESC LIMIT ?`,...scope(env,user.id),...(cursor?[Number(cursor[1]),cursor[2]]:[]),pageSize+1);
  const hasEarlier=records.length>pageSize;
  const items=(await withGiftArrivalDetails(env,user.id,records.slice(0,pageSize))).reverse().map(noticeEntry);
  return json({channel,items,before:hasEarlier?items[0].created+'|'+items[0].id:null});
 }
 if(req.method!=='PATCH')fail(405,AifectMessages.unsupportedRequest);
 const body=await req.json().catch(()=>null);
 if(!Array.isArray(body?.ids)||!body.ids.length||body.ids.length>pageSize||
    Object.keys(body).length!==1||body.ids.some(id=>typeof id!=='string'||!validId.test(id)))fail(400,'읽은 공지를 다시 확인해 주세요.');
 const ids=JSON.stringify(body.ids),at=now(),uid=user.id;
 await env.DB.batch([
  query(env,`UPDATE welcome_receipts AS r SET read_at=? WHERE r.user_id=? AND r.read_at=0
    AND EXISTS(SELECT 1 FROM welcome_campaigns c WHERE c.id=r.campaign_id AND ${noticeVisible})
    AND 'campaign:'||r.campaign_id IN (SELECT value FROM json_each(?))`,at,uid,ids),
  query(env,`${history} UPDATE direct_messages SET read_at=? WHERE recipient_id=? AND read_at=0 AND 'dm:'||id IN (
    SELECT id FROM official_history WHERE kind='dm' AND mine=0 AND id IN (SELECT value FROM json_each(?)))`,...scope(env,uid),at,uid,ids)
 ]);
 const [summary,notice]=await Promise.all([chatSummary(env,user),officialNoticeChannel(env,uid)]);
 return json({unread:summary.unread,direct_unread:summary.direct_unread,notice_unread:summary.notice_unread,notice});
}
