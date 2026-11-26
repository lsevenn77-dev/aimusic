import {WELCOME_CAMPAIGN_ID,WELCOME_GUIDE,WELCOME_PREVIEW} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {cleanNoticeContent,legacyNoticeContent,noticeFormat,noticeAssetId,noticeAssetsIn,noticeForMember,noticeSongsIn} from '../shared/official-notice-content.js';
import {hash} from './auth.js';
import {fail,id,json,now,one,query,rows,str} from './db.js';
import {publicNameSQL} from './identity.js';
import {activeAudienceCheck,audienceCandidates,createAudienceCheck,eligibleNoticeMember,memberCsv,normalizePublicCode,readMemberIds,recordNoticeAudit,resolveNoticeMembers} from './notice-audience.js';
import {continueNoticeJob,noticeDeliveryStatus,processNoticeBatch} from './notice-delivery.js';
import {formatWelcomeGuide} from './welcome-notices.js';
import {noticeScope} from './notice-visibility.js';

const pageSize=30;
const welcomeSetting='signup';
const selectCampaignContent='COALESCE(c.edit_json,c.content_json)';
const knownId=/^[\w-]{1,100}$/;
const stateTitle=`COALESCE(NULLIF(c.title,''),CASE c.id WHEN '${PREMIUM_OPEN_NOTICE_ID}' THEN '${PREMIUM_OPEN_NOTICE.title.replaceAll("'","''")}'
 WHEN '${WELCOME_CAMPAIGN_ID}' THEN '${WELCOME_PREVIEW.replaceAll("'","''")}' ELSE '' END)`;

function canonicalNotice(input,required){
 try{return cleanNoticeContent(input,{required});}catch(error){fail(400,error.message);}
}

export async function checkedNoticeContent(env,input,{required=false,verifyLinks=required}={}){
 const content=canonicalNotice(input,required);
 const assets=noticeAssetsIn(content);
 if(assets.length){
  const valid=await one(env,'SELECT COUNT(*) count FROM notice_assets WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(assets));
  if(valid.count!==assets.length)fail(400,'완료된 공지 이미지를 확인해 주세요.');
 }
 if(verifyLinks){
  const songIds=noticeSongsIn(content);
  if(songIds.length){
   const valid=await one(env,`SELECT COUNT(*) count FROM tracks WHERE status='published' AND id IN (SELECT value FROM json_each(?))`,JSON.stringify(songIds));
   if(valid.count!==songIds.length)fail(400,'공개된 곡에 연결된 링크만 사용할 수 있습니다.');
  }
 }
 return content;
}

const operationKey=(input,scope)=>{
 if(typeof input?.request_id!=='string'||!noticeAssetId.test(input.request_id))fail(400,'작업 ID를 확인해 주세요.');
 return scope+':'+input.request_id.toLowerCase();
};
export const readNoticeVersion=(value,minimum=1)=>{
 if(!Number.isSafeInteger(value)||value<minimum)fail(400,'변경할 버전을 확인해 주세요.');
 return value;
};
function verifyId(value){
 if(typeof value!=='string'||!knownId.test(value))fail(400,'공지 ID를 확인해 주세요.');
 return value;
}

async function receiptCount(env,campaignId){
 return (await one(env,'SELECT COUNT(*) count FROM welcome_receipts WHERE campaign_id=?',campaignId)).count;
}

async function existingSend(env,actor,campaignId,requestHash){
 const saved=await one(env,'SELECT author_id,request_hash,created FROM welcome_campaigns WHERE id=?',campaignId);
 if(!saved)return null;
 if(saved.author_id!==actor||saved.request_hash!==requestHash)fail(409,'이미 처리된 발송 요청입니다. 발송 내역을 확인해 주세요.');
 return await noticeDeliveryStatus(env,campaignId)??{id:campaignId,created:saved.created,recipients:await receiptCount(env,campaignId),status:'sent'};
}

export async function noticeTestMember(env,actor){
 let provisioned;
 try{provisioned=JSON.parse(env.AIFECT_NOTICE_TEST_ACCOUNTS||'{}');}catch{return null;}
 const uid=provisioned&&Object.hasOwn(provisioned,actor)?provisioned[actor]:null;
 if(typeof uid!=='string'||!uid)return null;
 const member=await one(env,`SELECT u.id,${publicNameSQL()} name FROM users u WHERE ${eligibleNoticeMember} AND u.id=?`,uid);
 return member??null;
}

const defaultTestCode='RGT4228';
async function locateNoticeTester(env,publicId){
 const {members,excluded}=await resolveNoticeMembers(env,{codes:[publicId]});
 if(members.length===1)return {public_id:publicId,member:members[0],error:null};
 const reason=excluded[0]?.reason;
 return {public_id:publicId,member:null,error:reason==='withdrawn'?'탈퇴한 회원입니다.':
  reason==='ai_account'?'AI 활동 계정은 테스트 발송 대상에서 제외됩니다.':
  reason==='invalid_format'?'회원 고유 ID 형식을 확인해 주세요.':'해당 회원 고유 ID를 찾을 수 없습니다.'};
}
export async function configuredNoticeTester(env){
 const setting=await one(env,"SELECT public_id FROM notice_test_settings WHERE id='default'");
 return locateNoticeTester(env,setting?.public_id??defaultTestCode);
}

export async function setNoticeTester(env,actor,input){
 if(typeof input.public_id!=='string'||input.public_id.length>100)fail(400,'회원 고유 ID를 확인해 주세요.');
 const publicId=normalizePublicCode(input.public_id);
 if(!publicId)fail(400,'회원 고유 ID를 입력해 주세요.');
 const tester=await locateNoticeTester(env,publicId);
 if(!tester.member)fail(422,tester.error);
 const at=now();
 await env.DB.batch([
  query(env,`INSERT INTO notice_test_settings(id,public_id,updated_by,updated) VALUES('default',?,?,?)
   ON CONFLICT(id) DO UPDATE SET public_id=excluded.public_id,updated_by=excluded.updated_by,updated=excluded.updated`,publicId,actor,at),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,'notice:test_settings',?,?)`,
   id(),actor,JSON.stringify({public_id:publicId}),at)
 ]);
 return json(tester);
}

export function noticePush(env,input){
 if(input.push===undefined||input.push===false)return false;
 if(input.push!==true)fail(400,'앱 푸시 발송 여부를 확인해 주세요.');
 if(!env.FCM_SERVICE_ACCOUNT)fail(409,'공지 채팅의 앱 푸시 연결을 확인해 주세요.');
 return true;
}
export const noticeConfirmation=(content,push)=>hash(JSON.stringify([content,push]));

// The approved receipt snapshot and audit commit in the same D1 transaction as
// the message. Callers may reuse a stable request UUID after an ambiguous reply.
export async function publishOfficialNotice(env,actor,input,{test=false,ctx}={}){
 const action=operationKey(input,'notice:send');
 const campaignId='notice-'+action.split(':').at(-1);
 const content=canonicalNotice(input.content,true);
 const draftId=!test&&input.draft?.id?verifyId(input.draft.id):'';
 const draftVersion=draftId?readNoticeVersion(input.draft.version):0;
 if(input.push!==undefined&&typeof input.push!=='boolean')fail(400,'앱 푸시 발송 여부를 확인해 주세요.');
 if(test&&input.push===true)fail(409,'테스트 발송에는 앱 푸시를 사용할 수 없습니다.');
 const push=!test&&input.push===true,purpose=test?input.purpose??'announcement':null;
 if(test&&!['announcement','welcome'].includes(purpose))fail(400,'테스트 발송 유형을 확인해 주세요.');
 // Preserve the fingerprint of requests accepted by the previous client.
 const legacyHash={content,test,draftId,draftVersion,check:test?undefined:input.check_id};
 const requestHash=await hash(JSON.stringify({...legacyHash,...(push?{push}:{}),...(purpose==='welcome'?{purpose}:{})}));
 const previous=await existingSend(env,actor,campaignId,requestHash);
 if(previous){
  if(previous.status==='processing')continueNoticeJob(env,ctx,campaignId);
  return json(previous,previous.status==='processing'?202:200);
 }
 await checkedNoticeContent(env,content,{required:true});
 if(test)return publishTestNotice(env,actor,action,campaignId,requestHash,content,purpose);
 noticePush(env,input);
 const check=await activeAudienceCheck(env,actor,input.check_id);
 const {confirmation,...audience}=check.audience;
 if(confirmation&&confirmation!==await noticeConfirmation(content,push))fail(409,'제목, 본문 또는 앱 푸시 설정이 변경되었습니다. 다시 확인해 주세요.');
 if(push&&!confirmation)fail(409,'앱 푸시 발송을 다시 확인해 주세요.');
 const planned='SELECT user_id AS id FROM notice_target_members WHERE check_id=?';
 // Previously rendered admin pages may still confirm using the audience-only API.
 if(!confirmation){
  const current=audienceCandidates(audience,now());
  const change=await one(env,`WITH candidates AS (${current.sql})
   SELECT EXISTS(SELECT id FROM candidates EXCEPT ${planned}) OR EXISTS(${planned} EXCEPT SELECT id FROM candidates) changed`,
   ...current.params,check.id,check.id);
  if(change.changed)return json({error:'발송 대상이 변경되었습니다. 변경된 명단을 다시 확인해 주세요.',
   check:await createAudienceCheck(env,actor,audience,{oldId:check.id})},409);
 }
 const at=now();
 await env.DB.batch([
  query(env,`INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid,kind,title,author_id,audience,request_hash,test)
   SELECT ?,?,?,0,'announcement',?,?,?,?,0
   WHERE EXISTS(SELECT 1 FROM notice_target_checks WHERE id=? AND owner_id=? AND expires>?)
   AND EXISTS(${planned}) AND NOT EXISTS(SELECT 1 FROM notice_delivery_jobs WHERE check_id=?)
   AND (?='' OR EXISTS(SELECT 1 FROM notice_drafts WHERE id=? AND owner_id=? AND version=?))
   ON CONFLICT(id) DO NOTHING`,campaignId,JSON.stringify(content),at,content.title,actor,audience.type,requestHash,
   check.id,actor,at,check.id,check.id,draftId,draftId,actor,draftVersion),
  query(env,`INSERT INTO notice_delivery_jobs(campaign_id,check_id,requested,push,created)
   SELECT c.id,?,(SELECT COUNT(*) FROM notice_target_members WHERE check_id=?),?,c.created
   FROM welcome_campaigns c WHERE c.id=? AND c.author_id=? AND c.request_hash=? AND changes()=1`,
   check.id,check.id,Number(push),campaignId,actor,requestHash),
  query(env,`INSERT INTO notice_delivery_items(campaign_id,user_id)
   SELECT ?,r.user_id FROM notice_target_members r WHERE r.check_id=? AND changes()=1`,campaignId,check.id),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,?,'notice:send',json_object('id',c.id,'audience',c.audience,'recipients',j.requested,'test',0,'push',j.push),c.created
   FROM welcome_campaigns c JOIN notice_delivery_jobs j ON j.campaign_id=c.id
   WHERE c.id=? AND c.author_id=? AND c.request_hash=? ON CONFLICT(id) DO NOTHING`,action,actor,campaignId,actor,requestHash),
  query(env,`DELETE FROM notice_drafts WHERE id=? AND owner_id=? AND version=?
   AND EXISTS(SELECT 1 FROM notice_delivery_jobs WHERE campaign_id=? AND check_id=?)`,
   draftId,actor,draftVersion,campaignId,check.id)
 ]);
 const accepted=await existingSend(env,actor,campaignId,requestHash);
 if(!accepted)fail(409,'발송 대상 확인이 만료되었거나 이미 사용되었습니다. 작성 내용과 대상을 다시 확인해 주세요.');
 if(accepted.status!=='processing')return json(accepted);
 await processNoticeBatch(env,campaignId);
 const result=await noticeDeliveryStatus(env,campaignId);
 if(result.status==='processing')continueNoticeJob(env,ctx,campaignId);
 return json(result,result.status==='processing'?202:201);
}

async function publishTestNotice(env,actor,action,campaignId,requestHash,content,purpose){
 const tester=await configuredNoticeTester(env);
 if(!tester.member)fail(422,tester.public_id+' · '+tester.error);
 const member=tester.member,at=now();
 const message=purpose==='welcome'?noticeForMember(content,member.name):content;
 const target=`SELECT u.id FROM users u WHERE ${eligibleNoticeMember} AND u.id=? AND
  EXISTS(SELECT 1 FROM public_profile_ids m WHERE m.user_id=u.id AND m.code=?)`;
 const targetArgs=[member.id,tester.public_id];
 await env.DB.batch([
  query(env,`INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid,kind,title,author_id,audience,request_hash,test)
   SELECT ?,?,?,0,'announcement',?,?,'test',?,1 WHERE EXISTS(${target}) ON CONFLICT(id) DO NOTHING`,
   campaignId,JSON.stringify(message),at,message.title,actor,requestHash,...targetArgs),
  query(env,`INSERT INTO welcome_receipts(campaign_id,user_id,created,source)
   SELECT ?,u.id,?,'broadcast' FROM (${target}) u
   WHERE changes()=1 AND EXISTS(SELECT 1 FROM welcome_campaigns WHERE id=? AND author_id=? AND request_hash=?)`,
   campaignId,at,...targetArgs,campaignId,actor,requestHash),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,?,'notice:test',json_object('id',id,'audience',audience,'recipients',1,'test',1,'push',0,'purpose',?),created
   FROM welcome_campaigns WHERE id=? AND author_id=? AND request_hash=? AND changes()=1`,
   action,actor,purpose,campaignId,actor,requestHash)
 ]);
 const saved=await existingSend(env,actor,campaignId,requestHash);
 if(saved)return json(saved,201);
 fail(409,'테스트 회원의 상태가 변경되었습니다. 다시 확인해 주세요.');
}

export function giftArrivalNoticeQueries(env,job,anchors,content){
 const keys=JSON.stringify(anchors);
 const eligible=`FROM gift_dispatch_items a JOIN users u ON u.id=a.user_id
  WHERE a.dispatch_id=? AND a.line=0 AND a.id IN (SELECT value FROM json_each(?)) AND ${eligibleNoticeMember}
  AND NOT EXISTS(SELECT 1 FROM gift_dispatch_items p INDEXED BY gift_dispatch_member_line
   WHERE p.dispatch_id=a.dispatch_id AND p.user_id=a.user_id AND p.state='pending')
  AND EXISTS(SELECT 1 FROM gift_dispatch_items g INDEXED BY gift_dispatch_member_line
   WHERE g.dispatch_id=a.dispatch_id AND g.user_id=a.user_id AND g.state='granted')`;
 return [
  query(env,`INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid,kind,title,author_id,audience,test)
   SELECT 'gift-'||a.id,?,unixepoch(),0,'gift',?,?,'specific',? ${eligible} ON CONFLICT(id) DO NOTHING`,
   JSON.stringify(content),content.title,job.admin_id,job.test,job.id,keys),
  query(env,`INSERT INTO welcome_receipts(campaign_id,user_id,created,source)
   SELECT c.id,a.user_id,c.created,'broadcast' FROM gift_dispatch_items a JOIN welcome_campaigns c ON c.id='gift-'||a.id
   JOIN users u ON u.id=a.user_id WHERE a.dispatch_id=? AND a.line=0 AND a.id IN (SELECT value FROM json_each(?))
   AND ${eligibleNoticeMember} AND c.kind='gift' ON CONFLICT(campaign_id,user_id) DO NOTHING`,job.id,keys)
 ];
}

function managedContent(row){
 const data=JSON.parse(row.edit_json??row.content_json);
 if(data.format===noticeFormat)return data;
 if(row.id===WELCOME_CAMPAIGN_ID||row.kind==='welcome'){
  return legacyNoticeContent(formatWelcomeGuide({nickname:'{닉네임}',content_json:JSON.stringify(data)}),{welcome:true});
 }
 return legacyNoticeContent(data);
}

const counts=`COALESCE((SELECT CAST(json_extract(a.target,'$.recipients') AS INTEGER) FROM admin_audit a
  WHERE c.kind='announcement' AND a.id='notice:send:'||substr(c.id,8)),
  (SELECT COUNT(*) FROM welcome_receipts r WHERE r.campaign_id=c.id)) original,
 (SELECT COUNT(*) FROM welcome_receipts r WHERE r.campaign_id=c.id AND r.withdrawn_at=0 AND c.withdrawn_at=0) active,
 (SELECT COUNT(*) FROM welcome_receipts r WHERE r.campaign_id=c.id AND r.withdrawn_at>0) selective,
 (SELECT COUNT(*) FROM welcome_receipts r WHERE r.campaign_id=c.id AND r.withdrawn_at=0 AND c.withdrawn_at=0 AND r.read_at>0) read`;
const historyRow=`c.id,c.created,c.kind,c.title,c.author_id,c.audience,c.test,c.version,c.edited_at,c.withdrawn_at,
 ${stateTitle} display_title,${counts},
 (SELECT finished_at FROM notice_delivery_jobs j WHERE j.campaign_id=c.id) delivery_finished,
 (SELECT COUNT(*) FROM notice_delivery_items i WHERE i.campaign_id=c.id AND i.state='failed') delivery_failures,
 (SELECT COUNT(*) FROM notice_signup_deliveries s WHERE s.campaign_id=c.id AND s.state='failed') signup_failures`;
function campaignReport(row){
 const {display_title,original,active,read,selective,delivery_finished,delivery_failures,signup_failures,...rest}=row;
 const status=row.withdrawn_at?'withdrawn':selective?'partially_withdrawn':delivery_finished===0?'processing':delivery_failures?'failed':'sent';
 const audience=row.audience||(row.id===WELCOME_CAMPAIGN_ID?'welcome':'all');
 return {...rest,title:display_title,audience,original,active,read,unread:active-read,read_rate:active?Math.round(1000*read/active)/10:null,status,
  finished_at:delivery_finished||null,failed:delivery_failures||signup_failures};
}

function dateParam(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(400,'조회 기간을 확인해 주세요.');
 const day=Date.parse(value+'T00:00:00+09:00')/1000;
 if(!Number.isFinite(day)||new Date((day+32400)*1000).toISOString().slice(0,10)!==value)fail(400,'조회 기간을 확인해 주세요.');
 return day;
}
export async function noticeHistory(env,params){
 const start=params.has('from')?dateParam(params.get('from')):now()-30*86400;
 const end=params.has('to')?dateParam(params.get('to'))+86400:now()+1;
 const title=str(params.get('title')??'',200,false),actor=str(params.get('actor')??'',128,false);
 const audience=params.get('audience')??'',status=params.get('status')??'',test=params.get('test')??'production';
 if(end<=start||!['','sent','processing','failed','withdrawn','partially_withdrawn'].includes(status)||!['production','test','all'].includes(test))fail(400,'내역 필터를 확인해 주세요.');
 const after=params.get('after'),cursor=after===null?null:/^(\d{1,12})\|([\w-]{1,100})$/.exec(after);
 if(after!==null&&!cursor)fail(400,'내역 위치를 확인해 주세요.');
 const result=await rows(env,`WITH entries AS (SELECT ${historyRow} FROM welcome_campaigns c
  WHERE ${noticeScope} AND c.created>=? AND c.created<? AND
  (c.kind<>'welcome' OR EXISTS(SELECT 1 FROM welcome_receipts r WHERE r.campaign_id=c.id)
   OR EXISTS(SELECT 1 FROM notice_signup_deliveries s WHERE s.campaign_id=c.id AND s.state='failed'))
  ${cursor?'AND (c.created,c.id)<(?,?)':''})
  SELECT * FROM entries WHERE (?='' OR instr(lower(display_title),lower(?))>0)
  AND (?='' OR instr(lower(COALESCE(author_id,'')),lower(?))>0)
  AND (?='' OR COALESCE(audience,CASE WHEN id=? THEN 'welcome' ELSE 'all' END)=?)
  AND (?='all' OR test=(?='test'))
  AND (?='' OR (CASE WHEN withdrawn_at>0 THEN 'withdrawn' WHEN selective>0 THEN 'partially_withdrawn'
   WHEN delivery_finished=0 THEN 'processing' WHEN delivery_failures>0 THEN 'failed' ELSE 'sent' END)=?)
  ORDER BY created DESC,id DESC LIMIT ?`,
  start,end,...(cursor?[Number(cursor[1]),cursor[2]]:[]),title,title,actor,actor,audience,WELCOME_CAMPAIGN_ID,audience,test,test,status,status,pageSize+1);
 const items=result.slice(0,pageSize).map(campaignReport),last=items.at(-1);
 return json({items,next:result.length>pageSize?last.created+'|'+last.id:null});
}

export async function getNoticeCampaign(env,campaignId){
 const row=await one(env,`SELECT ${historyRow},c.content_json,c.edit_json FROM welcome_campaigns c
  WHERE c.id=? AND ${noticeScope}`,verifyId(campaignId));
 if(!row)fail(404,'공지 내역을 찾을 수 없습니다.');
 return row;
}

export async function noticeDetail(env,campaignId){
 const {content_json,edit_json,...row}=await getNoticeCampaign(env,campaignId);
 const [delivery,audit]=await Promise.all([noticeDeliveryStatus(env,campaignId),rows(env,`SELECT id,admin_id,action,target,created FROM admin_audit
  WHERE action IN ('notice:send','notice:test','notice:edit','notice:withdraw','notice:welcome','notice:signup_failed')
  AND CASE WHEN json_valid(target) THEN json_extract(target,'$.id') END=?
  ORDER BY rowid DESC LIMIT 100`,campaignId)]);
 return json({...campaignReport(row),content:managedContent({...row,content_json,edit_json}),
  delivery,push:delivery?.push??false,history:audit.map(({id:audit_id,target,...entry})=>({audit_id,...entry,details:JSON.parse(target)}))});
}

export async function noticeRecipientList(env,actor,campaignId,params){
 await getNoticeCampaign(env,campaignId);
 const q=str(params.get('q')??'',128,false),after=str(params.get('after')??'',128,false),filter=params.get('status')??'all';
 if(!['all','read','unread','withdrawn'].includes(filter))fail(400,'수신 상태를 확인해 주세요.');
 const name=publicNameSQL(),withdrawn='(r.withdrawn_at>0 OR c.withdrawn_at>0)';
 const conditions=filter==='withdrawn'?withdrawn:filter==='read'?'NOT '+withdrawn+' AND r.read_at>0':
  filter==='unread'?'NOT '+withdrawn+' AND r.read_at=0':'1';
 const csv=params.get('format')==='csv';
 const sql=`SELECT r.user_id id,CASE WHEN u.id IS NOT NULL AND ${eligibleNoticeMember} THEN ${name} END name,m.code public_id,r.read_at,
  MAX(r.withdrawn_at,c.withdrawn_at) withdrawn_at FROM welcome_receipts r
  JOIN welcome_campaigns c ON c.id=r.campaign_id LEFT JOIN users u ON u.id=r.user_id
  LEFT JOIN public_profile_ids m ON m.user_id=r.user_id
  WHERE r.campaign_id=? AND ${conditions} AND (?='' OR r.user_id=? OR m.code=? OR instr(lower(${name}),lower(?))>0)
  ${csv?'':'AND r.user_id>?'} ORDER BY r.user_id${csv?'':' LIMIT ?'}`;
 const result=await rows(env,sql,campaignId,q,q.toLowerCase(),normalizePublicCode(q),q,...(csv?[]:[after,pageSize+1]));
 if(csv){
  await recordNoticeAudit(env,actor,'notice_roster:export',{id:campaignId,count:result.length,filter});
  return memberCsv(result,['id','name','read_at','withdrawn_at']);
 }
 const members=result.slice(0,pageSize);
 return json({members,next:result.length>pageSize?members.at(-1).id:null});
}

function currentWelcome(env){
 return one(env,`SELECT s.version settings_version,s.enabled,s.updated settings_updated,c.*
  FROM welcome_campaigns c LEFT JOIN notice_welcome_settings s ON s.id=? WHERE c.id=COALESCE(s.campaign_id,?)`,
  welcomeSetting,WELCOME_CAMPAIGN_ID);
}

export async function noticeWelcome(env){
 const [current,delivery]=await Promise.all([currentWelcome(env),one(env,`SELECT
  COUNT(*) FILTER (WHERE state='sent') sent,COUNT(*) FILTER (WHERE state='failed') failed,
  COUNT(*) FILTER (WHERE state='pending') pending FROM notice_signup_deliveries`)]);
 const settingsVersion=current?.settings_version??0;
 const content=current?managedContent({...current,edit_json:null}):
  legacyNoticeContent(formatWelcomeGuide({nickname:'{닉네임}',content_json:JSON.stringify(WELCOME_GUIDE)}),{welcome:true});
 return json({version:settingsVersion,enabled:current?.enabled!==0,updated:current?.settings_updated??null,content,delivery});
}

function insertWelcomeSetting(env,actor,content,enabled,expected,campaignId,at,auditId,requestHash,{detachFrom=null}={}){
 // rowid is also the legacy signup/broadcast cutoff. Commit the boundary
 // and immutable template together, so concurrent signups select one version.
 const guard=`COALESCE((SELECT version FROM notice_welcome_settings WHERE id=?),0)=?${detachFrom?' AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?)':''}`;
 return [
  query(env,`INSERT INTO welcome_campaigns(id,content_json,created,recipient_max_rowid,kind,title,author_id,audience,request_hash)
   SELECT ?,?,?,(SELECT COALESCE(MAX(rowid),0) FROM users),'welcome',?,?,?,? WHERE ${guard} ON CONFLICT(id) DO NOTHING`,
   campaignId,content,at,JSON.parse(content).title??'',actor,enabled?'welcome':'welcome_disabled',requestHash,welcomeSetting,expected,...(detachFrom?[detachFrom]:[])),
  query(env,`INSERT INTO notice_welcome_settings(id,campaign_id,version,enabled,min_user_rowid,updated)
   SELECT ?,id,?,?,recipient_max_rowid,created FROM welcome_campaigns WHERE id=? AND request_hash=? AND changes()=1
   ON CONFLICT(id) DO UPDATE SET campaign_id=excluded.campaign_id,version=excluded.version,enabled=excluded.enabled,
    min_user_rowid=excluded.min_user_rowid,updated=excluded.updated`,welcomeSetting,expected+1,Number(enabled),campaignId,requestHash),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,?,'notice:welcome',json_object('id',campaign_id,'version',version,'enabled',enabled),updated
   FROM notice_welcome_settings WHERE id=? AND campaign_id=? AND changes()=1`,auditId,actor,welcomeSetting,campaignId)
 ];
}

export async function saveNoticeWelcome(env,actor,input){
 const auditId=operationKey(input,'notice:welcome'),campaignId='welcome-'+auditId.split(':').at(-1);
 const expected=readNoticeVersion(input.version,0);
 if(typeof input.enabled!=='boolean')fail(400,'환영 메시지 발송 설정을 확인해 주세요.');
 const content=await checkedNoticeContent(env,input.content,{required:input.enabled});
 const raw=JSON.stringify(content),fingerprint=await hash(JSON.stringify([raw,input.enabled,expected]));
 let saved=await one(env,'SELECT author_id,request_hash FROM welcome_campaigns WHERE id=?',campaignId);
 if(!saved){
  await env.DB.batch(insertWelcomeSetting(env,actor,raw,input.enabled,expected,campaignId,now(),auditId,fingerprint));
  saved=await one(env,'SELECT author_id,request_hash FROM welcome_campaigns WHERE id=?',campaignId);
 }
 if(saved?.author_id!==actor||saved.request_hash!==fingerprint)fail(409,'환영 메시지가 변경되었습니다. 최신 설정을 불러와 주세요.');
 return noticeWelcome(env);
}

export async function mutateNoticeCampaign(env,actor,campaignId,input,withdraw){
 const row=await getNoticeCampaign(env,campaignId),expected=readNoticeVersion(input.version);
 if(row.delivery_finished===0)fail(409,'발송 처리가 완료된 후 변경해 주세요.');
 if(!withdraw&&(row.kind==='welcome'||row.id===WELCOME_CAMPAIGN_ID))fail(409,'새로 가입할 회원의 환영 메시지는 환영 메시지 탭에서 수정해 주세요.');
 const action=withdraw?'notice:withdraw':'notice:edit',auditId=operationKey(input,action),at=now();
 const scope=withdraw?input.scope:null;
 if(withdraw&&!['all','specific'].includes(scope))fail(400,'철회 범위를 선택해 주세요.');
 const userIds=scope==='specific'?readMemberIds(input.ids):[];
 const reason=withdraw?str(input.reason,500):null;
 const content=withdraw?null:await checkedNoticeContent(env,input.content,{required:true});
 const fingerprint=await hash(JSON.stringify([campaignId,expected,scope,userIds,reason,content]));
 const previous=await one(env,'SELECT admin_id,target FROM admin_audit WHERE id=?',auditId);
 if(previous){
  if(previous.admin_id!==actor||JSON.parse(previous.target).fingerprint!==fingerprint)fail(409,'이미 처리된 작업입니다.');
  return noticeDetail(env,campaignId);
 }
 if(row.withdrawn_at||row.version!==expected)fail(409,'공지 상태가 변경되었습니다. 최신 내역을 확인해 주세요.');
 const guard=`c.id=? AND c.version=? AND c.withdrawn_at=0 AND ${noticeScope}`;
 const encodedIds=JSON.stringify(userIds),raw=content?JSON.stringify(content):null;
 const operativeWhere=scope==='specific'?`WHERE campaign_id=c.id AND withdrawn_at=0 AND user_id IN (SELECT value FROM json_each(?))`:
  'WHERE campaign_id=c.id AND withdrawn_at=0';
 const oldContent=selectCampaignContent;
 const target=scope==='specific'?
  `json_object('id',c.id,'version',c.version+1,'scope',?,'reason',?,'ids',json(?),'fingerprint',?,
    'recipients',(SELECT COUNT(*) FROM welcome_receipts ${operativeWhere}),'read',(SELECT COUNT(*) FROM welcome_receipts ${operativeWhere} AND read_at>0))`:
  scope==='all'?`json_object('id',c.id,'version',c.version+1,'scope',?,'reason',?,'fingerprint',?,
    'recipients',(SELECT COUNT(*) FROM welcome_receipts ${operativeWhere}),'read',(SELECT COUNT(*) FROM welcome_receipts ${operativeWhere} AND read_at>0))`:
   `json_object('id',c.id,'version',c.version+1,'fingerprint',?,'before',json(${oldContent}),'after',json(?))`;
 const args=scope==='specific'?[scope,reason,encodedIds,fingerprint,encodedIds,encodedIds]:scope==='all'?[scope,reason,fingerprint]:[fingerprint,raw];
 const gate='EXISTS (SELECT 1 FROM admin_audit a WHERE a.id=? AND a.admin_id=? AND json_extract(a.target,\'$.fingerprint\')=?)';
 const onlyIfSelected=scope==='specific'?` AND (SELECT COUNT(*) FROM welcome_receipts ${operativeWhere})=json_array_length(?)`:'';
 const steps=[query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
  SELECT ?,?,?,${target},? FROM welcome_campaigns c WHERE ${guard}${onlyIfSelected} ON CONFLICT(id) DO NOTHING`,
  auditId,actor,action,...args,at,campaignId,expected,...(scope==='specific'?[encodedIds,encodedIds]:[]))];
 const current=scope!=='specific'&&(row.kind==='welcome'||row.id===WELCOME_CAMPAIGN_ID)?await currentWelcome(env):null;
 if(current?.id===campaignId){
  // Detach future signups before mutating a version with existing recipients.
  const copyId='welcome-'+id();
  steps.push(...insertWelcomeSetting(env,actor,current.content_json,current.enabled!==0,current.settings_version??0,
   copyId,at,'notice:welcome:'+copyId,auditId,{detachFrom:auditId}));
 }
 if(scope==='specific'){
  // Use the campaign version as the transaction's lock before updating receipts.
  steps.push(query(env,`UPDATE welcome_receipts SET withdrawn_at=? WHERE campaign_id=? AND withdrawn_at=0
    AND user_id IN (SELECT value FROM json_each(?)) AND ${gate} AND EXISTS
    (SELECT 1 FROM welcome_campaigns WHERE id=? AND version=? AND withdrawn_at=0)`,
   at,campaignId,encodedIds,auditId,actor,fingerprint,campaignId,expected));
 }
 let mutation='version=version+1',values=[];
 if(scope==='all'){mutation+=',withdrawn_at=?';values=[at];}
 if(!withdraw){mutation+=',edit_json=?,title=?,edited_at=?';values=[raw,content.title,at];}
 steps.push(query(env,`UPDATE welcome_campaigns SET ${mutation} WHERE id=? AND version=? AND withdrawn_at=0 AND ${gate}`,
  ...values,campaignId,expected,auditId,actor,fingerprint));
 const result=await env.DB.batch(steps);
 if(!result.at(-1).meta.changes){
  const audit=await one(env,'SELECT admin_id,target FROM admin_audit WHERE id=?',auditId);
  if(audit?.admin_id!==actor||JSON.parse(audit.target).fingerprint!==fingerprint)fail(409,'공지나 수신 대상이 변경되었습니다. 다시 확인해 주세요.');
 }
 return noticeDetail(env,campaignId);
}
