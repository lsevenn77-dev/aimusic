import {WELCOME_CAMPAIGN_ID,WELCOME_GUIDE,WELCOME_PREVIEW} from '../shared/welcome-guide.js';
import {PREMIUM_OPEN_NOTICE,PREMIUM_OPEN_NOTICE_ID} from '../shared/premium-open-notice.js';
import {cleanNoticeContent,legacyNoticeContent,noticeFormat,noticeAssetId,noticeAssetsIn,noticeSongsIn} from '../shared/official-notice-content.js';
import {hash} from './auth.js';
import {fail,id,json,now,one,query,rows,str} from './db.js';
import {publicNameSQL} from './identity.js';
import {activeAudienceCheck,audienceCandidates,createAudienceCheck,eligibleNoticeMember,memberCsv,readMemberIds,recordNoticeAudit} from './notice-audience.js';
import {formatWelcomeGuide} from './welcome-notices.js';
import {noticeScope} from './notice-visibility.js';

const pageSize=30;
const welcomeSetting='signup';
const selectCampaignContent='COALESCE(c.edit_json,c.content_json)';
const knownId=/^[\w-]{1,100}$/;
const stateTitle=`COALESCE(NULLIF(c.title,''),CASE c.id WHEN '${PREMIUM_OPEN_NOTICE_ID}' THEN '${PREMIUM_OPEN_NOTICE.title.replaceAll("'","''")}'
 WHEN '${WELCOME_CAMPAIGN_ID}' THEN '${WELCOME_PREVIEW.replaceAll("'","''")}' ELSE '' END)`;

export async function checkedNoticeContent(env,input,{required=false,verifyLinks=required}={}){
 let content;
 try{content=cleanNoticeContent(input,{required});}catch(error){fail(400,error.message);}
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
 return {id:campaignId,created:saved.created,recipients:await receiptCount(env,campaignId),status:'sent'};
}

export async function noticeTestMember(env,actor){
 let provisioned;
 try{provisioned=JSON.parse(env.AIFECT_NOTICE_TEST_ACCOUNTS||'{}');}catch{return null;}
 const uid=provisioned&&Object.hasOwn(provisioned,actor)?provisioned[actor]:null;
 if(typeof uid!=='string'||!uid)return null;
 const member=await one(env,`SELECT u.id,${publicNameSQL()} name FROM users u WHERE ${eligibleNoticeMember} AND u.id=?`,uid);
 return member??null;
}

// The approved receipt snapshot and audit commit in the same D1 transaction as
// the message. Callers may reuse a stable request UUID after an ambiguous reply.
export async function publishOfficialNotice(env,actor,input,{test=false}={}){
 const action=operationKey(input,'notice:send');
 const campaignId='notice-'+action.split(':').at(-1);
 const content=await checkedNoticeContent(env,input.content,{required:true});
 const draftId=input.draft?.id?verifyId(input.draft.id):'';
 const draftVersion=draftId?readNoticeVersion(input.draft.version):0;
 if(input.push===true)fail(409,'공지 채팅의 앱 푸시 연결을 확인해 주세요.');
 const requestHash=await hash(JSON.stringify({content,test,draftId,draftVersion,check:input.check_id}));
 const previous=await existingSend(env,actor,campaignId,requestHash);
 if(previous)return json(previous);
 const testMember=test?await noticeTestMember(env,actor):null;
 if(test&&!testMember)fail(403,'연결된 테스트 회원 계정을 확인해 주세요.');
 const check=test?null:await activeAudienceCheck(env,actor,input.check_id);
 const audience=test?{type:'test',ids:[testMember.id]}:check.audience;
 const at=now(),current=audienceCandidates(audience,at);
 const planned='SELECT user_id AS id FROM notice_target_members WHERE check_id=?';
 const selectionGuard=test?'EXISTS (SELECT 1 FROM candidates)':`EXISTS (SELECT 1 FROM notice_target_checks WHERE id=? AND owner_id=? AND expires>?)
  AND EXISTS (${planned}) AND NOT EXISTS (SELECT id FROM candidates EXCEPT ${planned})
  AND NOT EXISTS (${planned} EXCEPT SELECT id FROM candidates)`;
 const guardArgs=test?[]:[check.id,actor,at,check.id,check.id,check.id];
 const receiptSource=test?current.sql:planned;
 const memberArgs=test?current.params:[check.id];
 await env.DB.batch([
  query(env,`WITH candidates AS (${current.sql}) INSERT INTO welcome_campaigns
   (id,content_json,created,recipient_max_rowid,kind,title,author_id,audience,request_hash,test)
   SELECT ?,?,?,0,'announcement',?,?,?,?,? WHERE ${selectionGuard}
   AND (?='' OR EXISTS(SELECT 1 FROM notice_drafts WHERE id=? AND owner_id=? AND version=?))
   ON CONFLICT(id) DO NOTHING`,
   ...current.params,campaignId,JSON.stringify(content),at,content.title,actor,audience.type,requestHash,Number(test),
   ...guardArgs,draftId,draftId,actor,draftVersion),
  query(env,`INSERT INTO welcome_receipts(campaign_id,user_id,created,source)
   SELECT ?,members.id,?,'broadcast' FROM (${receiptSource}) members
   WHERE EXISTS(SELECT 1 FROM welcome_campaigns WHERE id=? AND author_id=? AND request_hash=?)
   AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`,
   campaignId,at,...memberArgs,campaignId,actor,requestHash,action),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,?,?,json_object('id',id,'audience',audience,'recipients',(SELECT COUNT(*) FROM welcome_receipts WHERE campaign_id=welcome_campaigns.id),
    'test',test,'push','unavailable'),created FROM welcome_campaigns
   WHERE id=? AND author_id=? AND request_hash=? ON CONFLICT(id) DO NOTHING`,
   action,actor,test?'notice:test':'notice:send',campaignId,actor,requestHash),
  query(env,`DELETE FROM notice_drafts WHERE id=? AND owner_id=? AND version=? AND ?=0
   AND EXISTS (SELECT 1 FROM welcome_campaigns WHERE id=? AND request_hash=? AND author_id=?)`,
   draftId,actor,draftVersion,Number(test),campaignId,requestHash,actor)
 ]);
 const saved=await existingSend(env,actor,campaignId,requestHash);
 if(saved)return json(saved,201);
 if(draftId&&!await one(env,'SELECT 1 FROM notice_drafts WHERE id=? AND owner_id=? AND version=?',draftId,actor,draftVersion)){
  fail(409,'초안이 다른 화면에서 변경되었습니다. 초안을 다시 불러와 주세요.');
 }
 if(test)fail(409,'테스트 회원의 상태가 변경되었습니다. 다시 확인해 주세요.');
 return json({error:'발송 대상이 변경되었습니다. 변경된 명단을 다시 확인해 주세요.',
  check:await createAudienceCheck(env,actor,audience,{oldId:check.id})},409);
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
 ${stateTitle} display_title,${counts}`;
function campaignReport(row){
 const {display_title,original,active,read,selective,...rest}=row;
 const status=row.withdrawn_at?'withdrawn':selective?'partially_withdrawn':'sent';
 const audience=row.audience||(row.id===WELCOME_CAMPAIGN_ID?'welcome':'all');
 return {...rest,title:display_title,audience,original,active,read,unread:active-read,read_rate:active?Math.round(1000*read/active)/10:null,status};
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
 if(end<=start||!['','sent','withdrawn','partially_withdrawn'].includes(status)||!['production','test','all'].includes(test))fail(400,'내역 필터를 확인해 주세요.');
 const after=params.get('after'),cursor=after===null?null:/^(\d{1,12})\|([\w-]{1,100})$/.exec(after);
 if(after!==null&&!cursor)fail(400,'내역 위치를 확인해 주세요.');
 const result=await rows(env,`WITH entries AS (SELECT ${historyRow} FROM welcome_campaigns c
  WHERE ${noticeScope} AND c.created>=? AND c.created<? AND
  (c.kind<>'welcome' OR EXISTS(SELECT 1 FROM welcome_receipts r WHERE r.campaign_id=c.id))
  ${cursor?'AND (c.created,c.id)<(?,?)':''})
  SELECT * FROM entries WHERE (?='' OR instr(lower(display_title),lower(?))>0)
  AND (?='' OR instr(lower(COALESCE(author_id,'')),lower(?))>0)
  AND (?='' OR COALESCE(audience,CASE WHEN id=? THEN 'welcome' ELSE 'all' END)=?)
  AND (?='all' OR test=(?='test'))
  AND (?='' OR (CASE WHEN withdrawn_at>0 THEN 'withdrawn' WHEN selective>0 THEN 'partially_withdrawn' ELSE 'sent' END)=?)
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
 const audit=await rows(env,`SELECT id,admin_id,action,target,created FROM admin_audit
  WHERE action IN ('notice:send','notice:test','notice:edit','notice:withdraw','notice:welcome')
  AND CASE WHEN json_valid(target) THEN json_extract(target,'$.id') END=?
  ORDER BY rowid DESC LIMIT 100`,campaignId);
 return json({...campaignReport(row),content:managedContent({...row,content_json,edit_json}),
  push:'unavailable',history:audit.map(({id:audit_id,target,...entry})=>({audit_id,...entry,details:JSON.parse(target)}))});
}

export async function noticeRecipientList(env,actor,campaignId,params){
 await getNoticeCampaign(env,campaignId);
 const q=str(params.get('q')??'',128,false),after=str(params.get('after')??'',128,false),filter=params.get('status')??'all';
 if(!['all','read','unread','withdrawn'].includes(filter))fail(400,'수신 상태를 확인해 주세요.');
 const name=publicNameSQL(),withdrawn='(r.withdrawn_at>0 OR c.withdrawn_at>0)';
 const conditions=filter==='withdrawn'?withdrawn:filter==='read'?'NOT '+withdrawn+' AND r.read_at>0':
  filter==='unread'?'NOT '+withdrawn+' AND r.read_at=0':'1';
 const csv=params.get('format')==='csv';
 const sql=`SELECT r.user_id id,CASE WHEN u.id IS NOT NULL THEN ${name} END name,r.read_at,
  MAX(r.withdrawn_at,c.withdrawn_at) withdrawn_at FROM welcome_receipts r
  JOIN welcome_campaigns c ON c.id=r.campaign_id LEFT JOIN users u ON u.id=r.user_id
  WHERE r.campaign_id=? AND ${conditions} AND (?='' OR instr(lower(r.user_id),lower(?))>0 OR instr(lower(${name}),lower(?))>0)
  ${csv?'':'AND r.user_id>?'} ORDER BY r.user_id${csv?'':' LIMIT ?'}`;
 const result=await rows(env,sql,campaignId,q,q,q,...(csv?[]:[after,pageSize+1]));
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
 const current=await currentWelcome(env);
 const settingsVersion=current?.settings_version??0;
 const content=current?managedContent({...current,edit_json:null}):
  legacyNoticeContent(formatWelcomeGuide({nickname:'{닉네임}',content_json:JSON.stringify(WELCOME_GUIDE)}),{welcome:true});
 return json({version:settingsVersion,enabled:current?.enabled!==0,updated:current?.settings_updated??null,content});
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
