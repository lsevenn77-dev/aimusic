import {effectiveUntilSQL} from './premium-event.js';
import {publicNameSQL} from './identity.js';
import {fail,id,json,now,one,query,rows,run,str} from './db.js';

export const eligibleNoticeMember="u.account_type='human' AND u.provider<>'deleted'";
export const audienceTypes=['all','normal','premium','paid','specific'];
const publicCode=/^[A-Z]{3}[0-9]{4}$/;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const normalizePublicCode=value=>typeof value==='string'?value.replace(/\s/gu,'').toUpperCase():'';
const idLimit=10000;
const memberId=/^[^\s,\u0000-\u001f\u007f]{1,128}$/u;
const pageSize=50;
const lifetime=15*60;

export function readMemberIds(input,{allowEmpty=false}={}){
 if(!Array.isArray(input)||input.length>idLimit||input.some(uid=>typeof uid!=='string'||!memberId.test(uid))){
  fail(400,'회원 ID를 '+idLimit.toLocaleString('ko-KR')+'개 이하로 입력해 주세요.');
 }
 const ids=[...new Set(input)].sort();
 if(!allowEmpty&&!ids.length)fail(400,'회원 ID를 한 개 이상 선택해 주세요.');
 return ids;
}

export function readAudience(input,{draft=false}={}){
 const type=input?.type||'';
 if(draft&&!type)return {type:'',ids:[]};
 if(!audienceTypes.includes(type))fail(400,'발송 대상을 선택해 주세요.');
 return {type,ids:type==='specific'?readMemberIds(input.ids,{allowEmpty:draft}):[]};
}

function membershipCondition(audience,at){
 if(audience.type==='specific'||audience.type==='test'){
  return {sql:'u.id IN (SELECT value FROM json_each(?))',params:[JSON.stringify(audience.ids)]};
 }
 if(audience.type==='normal'||audience.type==='premium'){
  return {sql:effectiveUntilSQL+(audience.type==='normal'?'<=?':'>?'),params:[at]};
 }
 if(audience.type==='paid'){
  // Free grants write entitlement fields on users and never qualify here.
  return {sql:`(EXISTS(SELECT 1 FROM billing_subscriptions s JOIN billing_payments p ON p.subscription_id=s.id
     WHERE s.user_id=u.id AND p.status IN ('paid','partialCancelled') AND p.amount>p.refunded AND p.entitlement_end>?)
    OR EXISTS(SELECT 1 FROM apple_transactions a WHERE a.user_id=u.id AND a.environment='Production'
     AND a.product_id='kr.co.aifect.app.premium.monthly' AND a.revoked=0 AND a.expires>?)
    OR EXISTS(SELECT 1 FROM play_purchases p WHERE p.user_id=u.id AND p.kind='subs' AND p.expiry>?
     AND p.state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD')))`,
   params:[at,at,at]};
 }
 if(audience.type!=='all')fail(400,'발송 대상을 선택해 주세요.');
 return {sql:'1',params:[]};
}

export function audienceCandidates(audience,at){
 const {sql,params}=membershipCondition(audience,at);
 return {sql:'SELECT u.id FROM users u WHERE '+eligibleNoticeMember+' AND '+sql,params};
}

export async function countNoticeAudience(env,audience){
 const candidates=audienceCandidates(audience,now());
 return one(env,'SELECT COUNT(*) count FROM ('+candidates.sql+')',...candidates.params);
}

export async function activeAudienceCheck(env,owner,checkId){
 if(typeof checkId!=='string'||!/^[0-9a-f-]{36}$/i.test(checkId))fail(400,'발송 대상을 다시 확인해 주세요.');
 const check=await one(env,'SELECT * FROM notice_target_checks WHERE id=? AND owner_id=? AND expires>?',checkId,owner,now());
 if(!check)fail(409,'대상 확인이 만료되었습니다. 다시 확인해 주세요.');
 return {...check,audience:JSON.parse(check.audience_json)};
}

const snapshotMembers='SELECT user_id FROM notice_target_members WHERE check_id=?';
async function changeSummary(env,oldId,newId){
 if(!oldId)return null;
 const [added,removed]=await Promise.all([[newId,oldId],[oldId,newId]].map(async ([from,to])=>{
  const changed=await rows(env,`SELECT user_id,COUNT(*) OVER() total FROM
   (${snapshotMembers} EXCEPT ${snapshotMembers}) ORDER BY user_id LIMIT 50`,from,to);
  return {count:changed[0]?.total??0,ids:changed.map(r=>r.user_id)};
 }));
 return {added,removed};
}

export async function createAudienceCheck(env,owner,audience,{oldId=null,duplicates=0,confirmation}={}){
 const at=now(),checkId=id(),expires=at+lifetime;
 const previous=oldId?await activeAudienceCheck(env,owner,oldId):null;
 if(previous&&previous.audience_json!==JSON.stringify(audience))fail(400,'같은 발송 대상을 다시 확인해 주세요.');
 const candidates=audienceCandidates(audience,at);
 await env.DB.batch([
  query(env,'DELETE FROM notice_target_checks WHERE id IN (SELECT id FROM notice_target_checks WHERE expires<=? LIMIT 8)',at),
  query(env,'INSERT INTO notice_target_checks(id,owner_id,audience_json,expires) VALUES(?,?,?,?)',checkId,owner,
   JSON.stringify({...audience,...(confirmation?{confirmation}:{})}),expires),
  query(env,'INSERT INTO notice_target_members(check_id,user_id) SELECT ?,id FROM ('+candidates.sql+')',checkId,...candidates.params)
 ]);
 const [count,invalid,change,members]=await Promise.all([
  one(env,'SELECT COUNT(*) count FROM notice_target_members WHERE check_id=?',checkId),
  audience.ids.length?rows(env,`SELECT x.value id,m.code public_id,${memberExclusion} reason
   FROM json_each(?) x LEFT JOIN users u ON u.id=x.value LEFT JOIN public_profile_ids m ON m.user_id=x.value
   WHERE x.value NOT IN (${snapshotMembers}) ORDER BY x.value`,JSON.stringify(audience.ids),checkId):[],
  changeSummary(env,oldId,checkId),audiencePage(env,owner,checkId,new URLSearchParams())
 ]);
 return {id:checkId,expires,audience:audience.type,count:count.count,invalid:invalid.map(r=>r.id),excluded:invalid,duplicates,change,...members};
}

const memberName=publicNameSQL();
export const noticeMemberColumns=`u.id,${memberName} name,m.code public_id,p.id profile_id,p.image_version`;
export const noticeMemberJoins='LEFT JOIN public_profile_ids m ON m.user_id=u.id LEFT JOIN producers p ON p.user_id=u.id';
const memberExclusion=`CASE WHEN u.id IS NULL AND m.code IS NULL THEN 'not_found'
 WHEN u.id IS NULL OR u.provider='deleted' THEN 'withdrawn' WHEN u.account_type<>'human' THEN 'ai_account' END`;
function readCursor(params){
 const after=params.get('after');
 if(after!==null&&!memberId.test(after))fail(400,'목록 위치를 확인해 주세요.');
 return after??'';
}

export async function audiencePage(env,owner,checkId,params){
 await activeAudienceCheck(env,owner,checkId);
 const result=await rows(env,`SELECT r.user_id id,CASE WHEN u.id IS NOT NULL AND (${eligibleNoticeMember})
  THEN ${memberName} END name,m.code public_id FROM notice_target_members r
  LEFT JOIN users u ON u.id=r.user_id LEFT JOIN public_profile_ids m ON m.user_id=r.user_id
  WHERE r.check_id=? AND r.user_id>? ORDER BY r.user_id LIMIT ?`,checkId,readCursor(params),pageSize+1);
 return memberPage(result);
}

function memberPage(result){
 const members=result.slice(0,pageSize);
 return {members,next:result.length>pageSize?members.at(-1).id:null};
}

export async function searchNoticeMembers(env,params){
 const q=str(params.get('q')??'',100,false);
 const code=normalizePublicCode(q),exactCode=publicCode.test(code),exactUuid=uuid.test(q);
 const filter=exactCode?'m.code=?':exactUuid?'u.id=?':q?`instr(lower(${memberName}),lower(?))>0`:'1';
 const found=await rows(env,`SELECT ${noticeMemberColumns} FROM users u ${noticeMemberJoins}
  WHERE ${eligibleNoticeMember} AND ${filter} AND u.id>? ORDER BY u.id LIMIT ?`,
  ...(q?[exactCode?code:exactUuid?q.toLowerCase():q]:[]),readCursor(params),pageSize+1);
 return memberPage(found);
}

export async function resolveNoticeMembers(env,input){
 if(Object.hasOwn(input,'ids')){
  const ids=readMemberIds(input.ids,{allowEmpty:true});
  const members=await rows(env,`SELECT ${noticeMemberColumns} FROM users u ${noticeMemberJoins}
   WHERE ${eligibleNoticeMember} AND u.id IN (SELECT value FROM json_each(?))`,JSON.stringify(ids));
  return {members,excluded:[]};
 }
 if(!Array.isArray(input.codes)||input.codes.length>idLimit||
  input.codes.some(code=>typeof code!=='string'||code.length>100))fail(400,'회원 고유 ID 목록을 확인해 주세요.');
 const codes=[...new Set(input.codes.map(normalizePublicCode).filter(Boolean))],valid=codes.filter(code=>publicCode.test(code));
 const found=valid.length?await rows(env,`SELECT ${noticeMemberColumns},${memberExclusion} reason
  FROM public_profile_ids m LEFT JOIN users u ON u.id=m.user_id LEFT JOIN producers p ON p.user_id=u.id
  WHERE m.code IN (SELECT value FROM json_each(?))`,JSON.stringify(valid)):[];
 const byCode=new Map(found.map(row=>[row.public_id,row])),members=[],excluded=[];
 for(const code of codes){
  const result=byCode.get(code);
  if(result&&!result.reason){
   const {reason,...member}=result;
   members.push(member);
  }else excluded.push({public_id:code,reason:result?.reason??(publicCode.test(code)?'not_found':'invalid_format')});
 }
 return {members,excluded};
}

const rosterData=row=>({id:row.id,name:row.name,ids:JSON.parse(row.members_json),version:row.version,updated:row.updated});
export const recordNoticeAudit=(env,actor,action,target,auditId=id(),at=now())=>
 run(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',auditId,actor,action,JSON.stringify(target),at);

export async function listNoticeRosters(env,owner,params){
 const after=readCursor(params);
 const list=await rows(env,`SELECT id,name,version,updated,json_array_length(members_json) members
  FROM notice_rosters WHERE id>? ORDER BY id LIMIT ?`,after,pageSize+1);
 await recordNoticeAudit(env,owner,'notice_roster:list',{after});
 const rosters=list.slice(0,pageSize);
 return {rosters,next:list.length>pageSize?rosters.at(-1).id:null};
}

export async function getNoticeRoster(env,owner,rosterId){
 const saved=await one(env,'SELECT * FROM notice_rosters WHERE id=?',rosterId);
 if(!saved)fail(404,'저장 명단을 찾을 수 없습니다.');
 await recordNoticeAudit(env,owner,'notice_roster:view',{id:rosterId});
 return rosterData(saved);
}

export async function mutateNoticeRoster(env,owner,rosterId,input,remove){
 const at=now(),key=rosterId??id(),auditId=id();
 const create=!rosterId;
 if(!create&&(!Number.isInteger(input.version)||input.version<1))fail(400,'저장 명단을 다시 확인해 주세요.');
 const action=remove?'delete':create?'create':'update';
 const mutation=remove?query(env,'DELETE FROM notice_rosters WHERE id=? AND version=?',key,input.version):
  create?query(env,`INSERT INTO notice_rosters(id,name,members_json,version,updated) VALUES(?,?,?,1,?)`,
   key,str(input.name,100),JSON.stringify(readMemberIds(input.ids)),at):
  query(env,'UPDATE notice_rosters SET name=?,members_json=?,version=version+1,updated=? WHERE id=? AND version=?',
   str(input.name,100),JSON.stringify(readMemberIds(input.ids)),at,key,input.version);
 const [result]=await env.DB.batch([
  mutation,query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) SELECT ?,?,?,?,? WHERE changes()=1',
   auditId,owner,'notice_roster:'+action,JSON.stringify({id:key}),at)
 ]);
 if(!result.meta.changes)fail(409,'저장 명단이 변경되었습니다. 다시 불러와 주세요.');
 if(remove)return json({ok:true});
 return json(rosterData(await one(env,'SELECT * FROM notice_rosters WHERE id=?',key)),create?201:200);
}

function csvCell(value){
 let text=String(value??'');
 if(/^[\s=+\-@']|^0\d+$|^\d{15,}$/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function memberCsv(records,columns=['id','name']){
 const headers=columns.map(name=>name==='id'?'user_id':name);
 return new Response('\ufeff'+headers.join(',')+'\r\n'+records.map(r=>columns.map(c=>csvCell(r[c])).join(',')).join('\r\n')+'\r\n',
  {headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="aifect-members.csv"',
   'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}

export async function exportSelectedMembers(env,owner,input){
 const ids=readMemberIds(input.ids);
 const records=await rows(env,`SELECT u.id,${memberName} name FROM users u WHERE ${eligibleNoticeMember}
  AND u.id IN (SELECT value FROM json_each(?)) ORDER BY u.id`,JSON.stringify(ids));
 await recordNoticeAudit(env,owner,'notice_roster:export',{count:records.length});
 return memberCsv(records);
}
