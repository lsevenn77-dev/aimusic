import {isAdmin,requireUser} from './auth.js';
import {fail,json,one} from './db.js';
import {giftArrivalContent} from '../shared/gift-arrival.js';
import {canManageNotices} from './admin-notices.js';
import {readMemberIds} from './notice-audience.js';
import {catalog,grantable,PRODUCT_ID,sold} from './product-catalog.js';
import {configuredGiftTestMember,confirmGiftDispatch,giftDispatch,issueGiftDispatchBatch,prepareGiftDispatch,retryGiftDispatch} from './gift-dispatch.js';
import {dispatchProgress,giftDispatchCsv,giftDispatchDetail,giftDispatchHistory,giftDispatchMembers,previewGiftAdjustment,confirmGiftAdjustment} from './gift-dispatch-ledger.js';
import {sendGiftArrivalBatch} from './gift-dispatch-notices.js';
import {giftDispatchPermissions,requireGiftDispatchOrigin} from './gift-dispatch-permissions.js';

const base='/api/admin/gift-dispatch';
async function giftCatalog(env,params){
 const key=params.get('id'),q=(params.get('q')??'').trim().toLowerCase().slice(0,80),
  type=params.get('type'),currency=params.get('currency'),distribution=params.get('distribution');
 if(key&&!PRODUCT_ID.test(key))fail(400,'상품 ID를 다시 확인해 주세요.');
 const products=[...(await catalog(env,key?[key]:undefined)).values()]
  .filter(p=>p.listed||!p.legacy||p.revision>0)
  .filter(p=>(!q||(p.name+' '+p.id).toLowerCase().includes(q))&&(!type||p.type===type)&&(!currency||p.currency===currency)&&
   (!distribution||p.distribution===distribution));
 const offset=Math.max(0,Number.parseInt(params.get('offset')??'0',10)||0);
 return {products:products.slice(offset,offset+24).map(p=>({
  id:p.id,type:p.type,name:p.name,thumbnail:p.asset?.files.thumbnail??'',currency:p.currency,
  sale:sold(p),grant:grantable(p)&&!!p.asset,distribution:p.distribution,options:p.options,
  revision:p.revision,value:p.value,deadline:p.grantDeadline,event_only:p.eventOnly
 })),next:offset+24<products.length?offset+24:null};
}

async function body(req){
 const input=await req.json().catch(()=>null);
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'선물 요청 내용을 확인해 주세요.');
 return input;
}

async function authorizeTest(env,actor,job){
 if(!job.test)return;
 const test=job.admin_id===actor?await configuredGiftTestMember(env,actor):null;
 if(!test||!await one(env,'SELECT 1 FROM gift_dispatch_items WHERE dispatch_id=? AND user_id=? AND line=0',job.id,test.id))
  fail(403,'격리 검증 계정 연결을 다시 확인해 주세요.');
}

export async function adminGiftDispatchRoute(req,env,path,user){
 if(path!==base&&!path.startsWith(base+'/'))return null;
 requireUser(user);
 if(!isAdmin(env,user))fail(403,'관리자만 선물 발송 내역을 확인할 수 있습니다.');
 const action=path.slice(base.length),params=new URL(req.url).searchParams,permissions=giftDispatchPermissions(env,user);
 const {method}=req;
 if(method==='GET'){
  if(action==='/catalog')return json(await giftCatalog(env,params));
  if(action==='/settings')return json({...permissions,rosters:canManageNotices(env,user),push:false,
   test_member:permissions.grant?await configuredGiftTestMember(env,user.id):null});
  if(action==='')return json(await giftDispatchHistory(env,params));
 }
 if(action==='/preview'&&method==='POST'){
  requireGiftDispatchOrigin(req);
  if(!permissions.grant)fail(403,'상품 지급 권한이 필요합니다.');
  const input=await body(req),result=await prepareGiftDispatch(env,user.id,input);
  const products=result.products.filter(p=>p.units>0).map(p=>({...p,expires_at:p.season_ends_at?
   Math.min(p.preview_until??p.season_ends_at,p.season_ends_at):p.preview_until}));
  return json({...result,notice:giftArrivalContent(result.message,products)},201);
 }
 const match=/^\/([0-9a-f-]{36})(?:\/(members|preview-members|csv|confirm|process|retry|notify|adjustments)(?:\/([0-9a-f-]{36}))?)?$/.exec(action);
 if(!match||match[3]&&match[2]!=='adjustments')fail(404,'선물 발송 메뉴를 찾을 수 없습니다.');
 const [,key,part,operation]=match;
 if(method==='GET'){
  const job=await giftDispatch(env,key,{preview:part==='preview-members'});
  if(part==='preview-members'){
   if(job.admin_id!==user.id||job.confirmed_at)fail(403,'본인이 확인 중인 지급 대상만 볼 수 있습니다.');
   await authorizeTest(env,user.id,job);
  }
  if(part==='members'||part==='preview-members')return json(await giftDispatchMembers(env,job,params));
  if(part==='csv')return giftDispatchCsv(env,user.id,job);
  if(!part)return json(await giftDispatchDetail(env,job));
 }
 if(method!=='POST'||!['confirm','process','retry','notify','adjustments'].includes(part))fail(405,'지원하지 않는 요청입니다.');
 requireGiftDispatchOrigin(req);
 if(part==='adjustments'?!permissions.adjust:!permissions.grant)
  fail(403,part==='adjustments'?'지급 회수 또는 연장 권한이 필요합니다.':'상품 지급 권한이 필요합니다.');
 if(part==='confirm'){
  const job=await confirmGiftDispatch(env,user.id,key);
  return json({id:job.id,...await dispatchProgress(env,job.id)});
 }
 const job=await giftDispatch(env,key);
 await authorizeTest(env,user.id,job);
 if(part==='adjustments')return json(operation?await confirmGiftAdjustment(env,user.id,job,operation):
  await previewGiftAdjustment(env,user.id,job,await body(req)));
 if(part==='retry'){
  const input=await body(req);
  await retryGiftDispatch(env,user.id,job,input.request_id,input.ids===null?null:readMemberIds(input.ids));
 }
 if(part==='process'){
  await issueGiftDispatchBatch(env,job);
  await sendGiftArrivalBatch(env,job);
 }
 if(part==='notify')await sendGiftArrivalBatch(env,job,{retry:true});
 return json(await dispatchProgress(env,key));
}
