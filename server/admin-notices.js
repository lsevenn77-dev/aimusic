import {adminNoticeAssetURL,noticeAssetId,noticeImageBounds} from '../shared/official-notice-content.js';
import {isAdmin,requireUser} from './auth.js';
import {isConsoleAdmin} from './admin-session.js';
import {giftDispatchPermissions} from './gift-dispatch-permissions.js';
import {fail,id,json,now,one,query,rate,rows,run} from './db.js';
import {readImage} from './images.js';
import {audiencePage,countNoticeAudience,createAudienceCheck,exportSelectedMembers,getNoticeRoster,listNoticeRosters,mutateNoticeRoster,readAudience,resolveNoticeMembers,searchNoticeMembers} from './notice-audience.js';
import {checkedNoticeContent,mutateNoticeCampaign,noticeDetail,noticeHistory,noticeRecipientList,
 configuredNoticeTester,noticeConfirmation,noticePush,noticeWelcome,publishOfficialNotice,readNoticeVersion,saveNoticeWelcome,setNoticeTester} from './notice-campaigns.js';
import {continueNoticeJob,noticeDeliveryStatus,retryNoticeFailures} from './notice-delivery.js';

const base='/api/admin/notices';
const assetRoute=/^\/api\/admin\/notices\/images\/([0-9a-f-]{36})$/i;
export const canManageNotices=(env,user)=>env.AIFECT_NOTICE_READ_ONLY!=='true'&&(isConsoleAdmin(user)||
 isAdmin(env,user)&&(env.AIFECT_NOTICE_OPERATOR_IDS||'').split(',').map(x=>x.trim()).includes(user.id));
const draftPageSize=30;
const allowedMethods=new Map([
 ['',['GET','POST']],['/settings',['GET','PUT']],['/targets',['POST']],['/targets/count',['POST']],
 ['/members',['GET']],['/members/resolve',['POST']],['/export',['POST']],
 ['/test',['POST']],['/images',['POST']],['/drafts',['GET']],['/rosters',['GET','POST']],['/welcome',['GET','PUT']]
]);

async function uploadNoticeImage(req,env,actor){
 await rate(env,'notice-image:'+actor,60,3600);
 const {type,data}=await readImage(req);
 if(type!=='image/webp')fail(400,'이미지를 WebP로 변환한 뒤 업로드해 주세요.');
 const size=noticeWebpSize(data);
 if(!size||size.width>noticeImageBounds.width||size.height>noticeImageBounds.height)fail(400,'WebP 이미지의 크기를 가로 1200px, 세로 2400px 이하로 맞춰 주세요.');
 if(!env.BUCKET)fail(503,'공지 이미지 저장소 연결을 확인해 주세요.');
 const key=id(),objectKey='private/official-notices/'+key+'.webp';
 await env.BUCKET.put(objectKey,data,{httpMetadata:{contentType:type}});
 try{
  await run(env,'INSERT INTO notice_assets(id,owner_id,object_key,content_type,created) VALUES(?,?,?,?,?)',key,actor,objectKey,type,now());
 }catch(error){
  await env.BUCKET.delete(objectKey).catch(()=>{});
  throw error;
 }
 return json({id:key,url:adminNoticeAssetURL(key),...size,bytes:data.byteLength},201);
}

function noticeWebpSize(data){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 if(data.length<25)return null;
 const length=view.getUint32(16,true);
 if(length+(length%2)>data.length-20)return null;
 const type=String.fromCharCode(...data.subarray(12,16));
 if(type==='VP8X'&&length===10&&(data[20]&2)===0){
  return {width:1+data[24]+data[25]*256+data[26]*65536,height:1+data[27]+data[28]*256+data[29]*65536};
 }
 if(type==='VP8L'&&length>=5&&data[20]===0x2f){
  const shape=view.getUint32(21,true);
  return {width:(shape&0x3fff)+1,height:((shape>>>14)&0x3fff)+1};
 }
 if(type==='VP8 '&&length>=10&&data[23]===0x9d&&data[24]===1&&data[25]===0x2a){
  const width=view.getUint16(26,true)&0x3fff,height=view.getUint16(28,true)&0x3fff;
  return width&&height?{width,height}:null;
 }
 return null;
}
export async function noticeImageResponse(req,env,item){
 if(!item||!env.BUCKET)fail(404,'공지 이미지를 찾을 수 없습니다.');
 const object=req.method==='HEAD'?await env.BUCKET.head(item.object_key):await env.BUCKET.get(item.object_key);
 if(!object)fail(404,'공지 이미지를 찾을 수 없습니다.');
 return new Response(req.method==='HEAD'?null:object.body,{headers:{'content-type':item.content_type,
  'cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'}});
}

function draftResult(row){
 return {id:row.id,version:row.version,updated:row.updated,...JSON.parse(row.data_json)};
}

async function noticeDraftList(env,actor,params){
 const cursor=params.get('after'),match=cursor===null?null:/^(\d{1,12})\|([0-9a-f-]{36})$/i.exec(cursor);
 if(cursor!==null&&!match)fail(400,'초안 목록 위치를 확인해 주세요.');
 const list=await rows(env,`SELECT id,version,updated,json_extract(data_json,'$.content.title') title
  FROM notice_drafts WHERE owner_id=? ${match?'AND (updated,id)<(?,?)':''} ORDER BY updated DESC,id DESC LIMIT ?`,
  actor,...(match?[Number(match[1]),match[2]]:[]),draftPageSize+1);
 const drafts=list.slice(0,draftPageSize),last=drafts.at(-1);
 return json({drafts,next:list.length>draftPageSize?last.updated+'|'+last.id:null});
}

async function noticeDraft(env,actor,key){
 const row=await one(env,'SELECT * FROM notice_drafts WHERE id=? AND owner_id=?',key,actor);
 if(!row)fail(404,'임시 저장한 공지를 찾을 수 없습니다.');
 return row;
}

async function changeNoticeDraft(env,actor,key,input,remove){
 const expected=readNoticeVersion(input.version,remove?1:0),at=now();
 if(remove){
  const result=await run(env,'DELETE FROM notice_drafts WHERE id=? AND owner_id=? AND version=?',key,actor,expected);
  if(!result.meta.changes)fail(409,'초안이 변경되었습니다. 최신 초안을 불러와 주세요.');
  return json({ok:true});
 }
 const content=await checkedNoticeContent(env,input.content);
 const audience=readAudience(input.audience,{draft:true});
 const data=JSON.stringify({content,audience,push:input.push===true});
 const result=expected===0?
  await run(env,'INSERT INTO notice_drafts(id,owner_id,data_json,version,updated) VALUES(?,?,?,1,?) ON CONFLICT(id) DO NOTHING',key,actor,data,at):
  await run(env,'UPDATE notice_drafts SET data_json=?,version=version+1,updated=? WHERE id=? AND owner_id=? AND version=?',data,at,key,actor,expected);
 const row=await noticeDraft(env,actor,key);
 if(!result.meta.changes&&!(row.version===expected+1&&row.data_json===data))fail(409,'초안이 변경되었습니다. 최신 초안을 불러와 주세요.');
 return json(draftResult(row),expected?200:201);
}

async function jsonInput(req){
 const data=await req.json().catch(()=>null);
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'공지 요청 내용을 확인해 주세요.');
 return data;
}

export async function adminNoticeRoute(req,env,path,user,ctx){
 if(path!==base&&!path.startsWith(base+'/'))return null;
 requireUser(user);
 if(!isAdmin(env,user))fail(403,'관리자만 공지 채팅을 확인할 수 있습니다.');
 const section=path.slice(base.length),method=req.method,params=new URL(req.url).searchParams,manage=canManageNotices(env,user);
 const asset=assetRoute.exec(path),draft=/^\/drafts\/([0-9a-f-]{36})$/i.exec(section),
  roster=/^\/rosters\/([0-9a-f-]{36})$/i.exec(section),check=/^\/targets\/([0-9a-f-]{36})$/i.exec(section),
  campaign=/^\/history\/([\w-]{1,100})(?:\/(recipients|withdraw|delivery|retry))?$/.exec(section);
 const allowed=allowedMethods.get(section)??(asset?['GET','HEAD']:draft||roster?['GET','PUT','DELETE']:
  check?['GET']:campaign?(['withdraw','retry'].includes(campaign[2])?['POST']:campaign[2]?['GET']:['GET','PATCH']):null);
 if(!allowed)fail(404,'공지 채팅 메뉴를 찾을 수 없습니다.');
 if(!allowed.includes(method))fail(405,'지원하지 않는 요청입니다.');
 const reading=['GET','HEAD'].includes(method);
 if(!reading&&section!=='/export'){
  const dispatchLookup=['/members/resolve','/targets/count'].includes(section)&&giftDispatchPermissions(env,user).grant;
  if(!manage&&!dispatchLookup)fail(403,'공지 채팅을 변경할 권한을 확인해 주세요.');
  const url=new URL(req.url);
  if(req.headers.get('origin')!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')fail(403,'관리자 페이지에서 다시 요청해 주세요.');
 }
 const actor=user.id;
 if(section==='/settings'){
  if(!reading)return setNoticeTester(env,actor,await jsonInput(req));
  const test=manage?await configuredNoticeTester(env):null,available=!!env.FCM_SERVICE_ACCOUNT;
  return json({operator:actor,manage,test,push:{available,reason:available?'':'공지 채팅용 앱 푸시가 연결되지 않았습니다.'}});
 }
 if(section==='/members')return json(await searchNoticeMembers(env,params));
 if(section==='/members/resolve')return json(await resolveNoticeMembers(env,await jsonInput(req)));
 if(section==='/export')return exportSelectedMembers(env,actor,await jsonInput(req));
 if(section==='/images')return uploadNoticeImage(req,env,actor);
 if(asset){
  if(!noticeAssetId.test(asset[1]))fail(404,'공지 이미지를 찾을 수 없습니다.');
  return noticeImageResponse(req,env,await one(env,'SELECT object_key,content_type FROM notice_assets WHERE id=?',asset[1]));
 }
 if(section==='/targets'){
  await rate(env,'notice-targets:'+actor,60,300);
  const input=await jsonInput(req),audience=readAudience(input.audience);
  const duplicates=audience.type==='specific'?input.audience.ids.length-audience.ids.length:0;
  const push=noticePush(env,input);
  if(push&&!input.content)fail(400,'앱 푸시를 발송할 공지 내용을 확인해 주세요.');
  const confirmation=input.content?await noticeConfirmation(await checkedNoticeContent(env,input.content,{required:true}),push):undefined;
  return json(await createAudienceCheck(env,actor,audience,{duplicates,confirmation}),201);
 }
 if(section==='/targets/count')return json(await countNoticeAudience(env,readAudience((await jsonInput(req)).audience,{draft:true})));
 if(check)return json(await audiencePage(env,actor,check[1],params));
 if(section==='/welcome')return reading?noticeWelcome(env):saveNoticeWelcome(env,actor,await jsonInput(req));
 if(section==='/drafts')return noticeDraftList(env,actor,params);
 if(draft)return reading?json(draftResult(await noticeDraft(env,actor,draft[1]))):
  changeNoticeDraft(env,actor,draft[1],await jsonInput(req),method==='DELETE');
 if(section==='/rosters')return reading?json(await listNoticeRosters(env,actor,params)):
  mutateNoticeRoster(env,actor,null,await jsonInput(req),false);
 if(roster)return reading?json(await getNoticeRoster(env,actor,roster[1])):
  mutateNoticeRoster(env,actor,roster[1],await jsonInput(req),method==='DELETE');
 if(section==='/test')return publishOfficialNotice(env,actor,await jsonInput(req),{test:true});
 if(section==='')return reading?noticeHistory(env,params):publishOfficialNotice(env,actor,await jsonInput(req),{ctx});
 if(campaign[2]==='recipients')return noticeRecipientList(env,actor,campaign[1],params);
 if(campaign[2]==='delivery'||campaign[2]==='retry'){
  const result=reading?await noticeDeliveryStatus(env,campaign[1]):await retryNoticeFailures(env,actor,campaign[1],(await jsonInput(req)).revision);
  if(!result)fail(404,'발송 결과를 찾을 수 없습니다.');
  if(result.status==='processing')continueNoticeJob(env,ctx,campaign[1]);
  return json(result);
 }
 return reading?noticeDetail(env,campaign[1]):
  mutateNoticeCampaign(env,actor,campaign[1],await jsonInput(req),campaign[2]==='withdraw');
}
