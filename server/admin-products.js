import {isAdmin,requireUser} from './auth.js';
import {isConsoleAdmin} from './admin-session.js';
import {one,rows,query,run,now,id,fail,json,str} from './db.js';
import {
 catalog,productById,legacyProduct,sold,grantable,PRODUCT_TYPES,PRODUCT_ID,VERSION_ID,PERIODS,GIFT_OPTION
} from './product-catalog.js';
import {parseProductDeadline} from './product-deadline.js';
import {activeDecorationSQL,stockDecorationSQL} from './decorations.js';
import {PERMANENT_PERIOD} from '../shared/decorations.js';
import {checkedProductBytes,inspectPackageUpload,parseProductAssets,productForm,describeProductVersion,sha256} from './product-assets.js';
import {PRODUCT_ARCHIVE_MAX} from './product-zip.js';
import {bulkOriginalDownload,operatingDownload} from './product-downloads.js';
import {registry} from '../shared/product-asset-contract.js';
import {measureProductReview,productReviewStatus,reviewBuilds} from './product-reviews.js';
import {giftDispatchPermissions} from './gift-dispatch-permissions.js';
import {claimPermanentDeletion,deletionDetails,queueDeletion,refreshDeletionStatement,requiredProductReason} from './product-deletion-policy.js';
import {previewProductPurge,runProductPurgeJobs} from './product-purge.js';

const ROOT='/api/admin/products';
const writable=(env,user)=>isConsoleAdmin(user)||(env.AIFECT_PRODUCT_EDITOR_IDS||'').split(',').some(v=>v.trim()===user.id);
const versionRow=(env,product,version)=>one(env,'SELECT * FROM product_asset_versions WHERE product_id=? AND id=?',product,version);
const auditId=request=>'product-management:'+request;
const requestKey=key=>{
 if(typeof key!=='string'||!VERSION_ID.test(key))fail(400,'작업 요청 번호를 확인해 주세요.');
 return key;
};
const checkedRevision=value=>{
 if(!Number.isSafeInteger(value)||value<0)fail(400,'상품의 조회 버전을 확인해 주세요.');
 return value;
};
const ensureCurrent=(product,expected)=>{
 if(product.revision!==checkedRevision(expected))fail(409,'다른 곳에서 상품을 변경했습니다. 최신 상품 정보를 확인해 주세요.');
};
const shape=product=>{
 const {original,...p}=product;
 return {...p,grant_executor:'gift_dispatch',dispatch_available:grantable(p)&&!!p.asset};
};

function normalizeDefinition(body,previous){
 const type=previous?.type??body.type,currency=previous?.currency??body.currency;
 if(!PRODUCT_TYPES.includes(type)||!['G','S'].includes(currency)||(type!=='gift'&&currency!=='G')||
  (previous&&(body.type!==undefined&&body.type!==type||body.currency!==undefined&&body.currency!==currency)))
  fail(400,'상품 유형과 통화를 확인해 주세요. 저장된 상품의 유형과 통화는 고정됩니다.');
 const distribution=body.distribution;
 if(!['shop','grant'].includes(distribution)||typeof body.eventOnly!=='boolean')fail(400,'상품 구분과 이벤트 표시 상태를 확인해 주세요.');
 if(!body.options||typeof body.options!=='object'||Array.isArray(body.options))fail(400,'가격과 이용 기간 옵션을 확인해 주세요.');
 const allowed=type==='gift'?[GIFT_OPTION]:PERIODS.filter(period=>distribution==='grant'||period!==PERMANENT_PERIOD);
 const value=distribution==='grant'&&body.value!=null?body.value:null;
 if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>100000))fail(400,'발송 상품의 표시 가치를 확인해 주세요.');
 const inputOptions=type==='gift'&&distribution==='grant'&&!Object.keys(body.options).length?
  {[GIFT_OPTION]:value??0}:body.options;
 const prices=Object.keys(inputOptions);
 if(!prices.length||prices.some(key=>!allowed.includes(key)))fail(400,'현재 서비스에서 지원하는 이용 기간을 선택해 주세요.');
 const options=Object.fromEntries(allowed.filter(key=>prices.includes(key)).map(key=>{
  const price=inputOptions[key];
  if(!Number.isSafeInteger(price)||price<(distribution==='shop'?1:0)||price>100000)fail(400,'가격 또는 표시 가치를 확인해 주세요.');
  return [key,price];
 }));
 const uiMode=type==='theme'?body.uiMode:null;
 if(type==='theme'&&!['dark','light'].includes(uiMode))fail(400,'방 패널 모드를 선택해 주세요.');
 return {type,currency,distribution,options,value,uiMode,name:str(body.name,80),description:str(body.description??'',400,false),eventOnly:body.eventOnly,
  grantDeadline:Object.hasOwn(body,'grantDeadline')?parseProductDeadline(body.grantDeadline):previous?.grantDeadline??null,
  sale:distribution==='shop'&&!!previous?.sale,grant:!!previous?.grant,
  dispatchOnActivation:previous?!!previous.dispatchOnActivation:true,
 archived:!!previous?.archived,listed:true,legacy:!!previous?.legacy,...(previous?.deletePendingAt?{deletePendingAt:previous.deletePendingAt}:{})};
}

async function operation(env,actor,action,key,input){
 const request=requestKey(key),hash=await sha256(JSON.stringify([action,input]));
 const replay=async()=>{
  const old=await one(env,'SELECT admin_id,action,target FROM admin_audit WHERE id=?',auditId(request));
  if(!old)return null;
  const data=JSON.parse(old.target);
  if(old.admin_id!==actor.id||old.action!==action||data.hash!==hash)fail(409,'다른 상품 작업에 사용된 요청 번호입니다.');
  return {id:data.product_id,...data.result,replayed:true};
 };
 const write=(productId,result,guard='1',args=[])=>{
  const target=JSON.stringify({product_id:productId,request_id:request,hash,result});
  return query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,CASE WHEN ${guard} THEN ? END,?)`,
   auditId(request),actor.id,action,...args,target,now());
 };
 const batch=async(statements,result)=>{
  try{await env.DB.batch(statements);return result;}
  catch(error){
   const old=await replay();if(old)return old;
   if(/constraint|product_asset_version_label/i.test(error.message))fail(409,'상품, 에셋 버전 또는 검수 상태가 변경되었습니다. 최신 정보를 확인해 주세요.');
   throw error;
  }
 };
 const applied=action==='product_purge'?"d.purge_request=? AND d.state='purging'":
  "p.last_request=? AND p.revision=json_extract(item.value,'$.revision')+1";
 const writePlan=items=>query(env,"INSERT INTO admin_audit(id,admin_id,action,target,created) "+
  "SELECT ?,?,?,json_object('request_id',?,'hash',?,'result',json_object('items',json_group_array(json("+
  "CASE WHEN json_extract(item.value,'$.status')<>'eligible' THEN item.value "+
  "WHEN "+applied+" THEN json_set(item.value,'$.status','success','$.outcome',d.state) "+
  "ELSE json_set(item.value,'$.status','failed','$.reason','상품 상태 또는 보유·거래 조건이 변경되었습니다. 다시 확인해 주세요.') END"+
  ")))),? FROM json_each(?) item LEFT JOIN product_catalog p ON p.product_id=json_extract(item.value,'$.id') "+
  "LEFT JOIN product_deletions d ON d.product_id=p.product_id",
  auditId(request),actor.id,action,request,hash,request,now(),JSON.stringify(items));
 return {key:request,actor:actor.id,replay,write,writePlan,batch};
}

function writeDefinition(env,op,product,definition,active,review=null){
 const gate=review?` AND NOT EXISTS(SELECT 1 FROM json_each(?) needed WHERE NOT EXISTS (
  SELECT 1 FROM product_asset_reviews r WHERE r.product_id=? AND r.version_id=? AND r.platform=json_extract(needed.value,'$.platform')
  AND r.surface=json_extract(needed.value,'$.surface') AND r.build=json_extract(needed.value,'$.build') AND r.passed=1
  AND json_extract(r.report,'$.presentation')=?
 ))`:'';
 const expected=review?.items.map(({platform,surface,build})=>({platform,surface,build}));
 return query(env,`INSERT INTO product_catalog(product_id,definition,revision,active_version,last_request,updated)
   SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM product_catalog WHERE product_id=?),0)=?
   AND NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=?)${gate}
   ON CONFLICT(product_id) DO UPDATE SET definition=excluded.definition,revision=excluded.revision,
   active_version=excluded.active_version,last_request=excluded.last_request,updated=excluded.updated`,
  product.id,JSON.stringify(definition),product.revision+1,active,op.key,now(),product.id,product.revision,product.id,
  ...(review?[JSON.stringify(expected),product.id,active,review.presentation]:[]));
}

function commitDefinition(env,op,product,definition,active,review=null,other=[],extra={}){
 const revision=product.revision+1,result={id:product.id,revision,active_version:active,...extra};
 return op.batch([
  writeDefinition(env,op,product,definition,active,review),
  op.write(product.id,{...result,sale:definition.sale,grant:definition.grant,archived:definition.archived},
   'EXISTS(SELECT 1 FROM product_catalog WHERE product_id=? AND last_request=? AND revision=?)',[product.id,op.key,revision]),
  ...other
 ],result);
}

function asDefinition(p){
 const {id,original,asset,revision,activeVersion,deletionState,...definition}=p;
 return definition;
}

const operations=['sale_resume','sale_stop','archive','unarchive','delete','check_deletion','purge'];
async function classifyOperation(env,action,product){
 if(product.deletionState||product.deletePendingAt)return {reason:'삭제 대기 중인 상품은 판매, 발송 또는 보관 상태를 변경할 수 없습니다.'};
 if(action==='archive'||action==='unarchive'){
  return {reason:action==='archive'&&product.archived?'이미 보관된 상품입니다.':
   action==='unarchive'&&!product.archived?'보관된 상품만 해제할 수 있습니다.':null};
 }
 if(product.archived)return {reason:'먼저 상품의 보관을 해제해 주세요.'};
 if(product.distribution!=='shop')return {reason:'상점 판매 상품에만 적용할 수 있습니다.'};
 if(product.sale===(action==='sale_resume'))return {reason:product.sale?'이미 판매 중입니다.':'이미 판매가 중지되었습니다.'};
 if(action==='sale_resume'&&!product.legacy){
  try{
   const active=product.activeVersion?await versionRow(env,product.id,product.activeVersion):null;
   return {review:await readyReview(env,product,active)};
  }catch(error){
   if(error.status===409)return {reason:error.message};
   throw error;
  }
 }
 return {};
}

function deletionSnapshot(product){
 const bundled=Object.values(product.original?.assetPaths||{}).concat(Object.values(product.asset?.files||{}))
  .filter(path=>path.startsWith('/assets/'));
 return {previous:product.archived?'archived':sold(product)?'selling':'stopped',
  currency:product.currency,bundled:[...new Set(bundled)]};
}

const withDeletion=(product,job,detail)=>({
 ...shape(product),
 deletion:{...detail,state:['purging','failed'].includes(job.state)?job.state:detail.ready?'ready':'pending',
  requested_at:job.requested_at,error:job.last_error}
});

function trackPurge(env,ctx,products=null){
 ctx?.waitUntil(runProductPurgeJobs(env,products).catch(error=>console.error('Product cleanup delayed',error.message)));
}

async function productOperation(req,env,user,ctx){
 const input=await req.json().catch(()=>null);
 const action=input?.action,items=input?.items;
 if(!operations.includes(action)||!Array.isArray(items)||items.length<1||items.length>30||
    items.some(item=>!item||typeof item.id!=='string'||!PRODUCT_ID.test(item.id))||
    new Set(items.map(item=>item.id)).size!==items.length)fail(400,'상품과 작업을 확인해 주세요.');
 const targets=items.map(item=>({id:item.id,revision:checkedRevision(item.revision)}));
 const preview=input.preview===true||action==='check_deletion';
 const deleting=action==='delete',purging=action==='purge',checking=action==='check_deletion';
 const confirmed=input.confirmed_ids;
 if(!preview&&(!Array.isArray(confirmed)||!confirmed.length||
    confirmed.some(key=>!targets.some(item=>item.id===key))))fail(400,'확인한 실행 대상을 선택해 주세요.');
 const op=preview?null:await operation(env,user,'product_'+action,input.request_id,[targets,confirmed]);
 const replay=await op?.replay();
 if(replay){
  if(purging)trackPurge(env,ctx,replay.items.filter(item=>item.status==='success').map(item=>item.id));
  return json(replay);
 }
 const products=await catalog(env,targets.map(item=>item.id));
 const checks=deleting||purging||checking?await deletionDetails(env,[...products.values()]):null;
 if(checking)await refreshDeletionStatement(env,[...products.values()].filter(product=>product.deletionState))?.run();
 const statements=[];
 const report=await Promise.all(targets.map(async item=>{
  const product=products.get(item.id),display={...item,name:product?.name??item.id};
  const system=(deleting||purging)&&requiredProductReason(item.id);
  if(system)return {...display,status:'excluded',reason:system};
  if(!product?.listed)return {...display,status:'excluded',reason:'상품을 찾을 수 없습니다.'};
  if(product.revision!==item.revision)return {...display,status:'failed',reason:'상품 정보가 변경되었습니다. 목록을 다시 확인해 주세요.'};
  if(deleting&&product.deletionState)return {...display,status:'excluded',reason:'이미 삭제를 요청한 상품입니다.'};
  const details=checks?.get(item.id);
  if(purging||checking){
   if(!product.deletionState)return {...display,status:'excluded',reason:'삭제 요청을 먼저 진행해 주세요.'};
   if(product.deletionState==='purging')return {...display,status:'excluded',reason:'상품을 정리하고 있습니다.'};
   if(!details.ready)return {...display,status:!preview&&confirmed.includes(item.id)?'failed':'excluded',outcome:'pending',
    reason:details.reasons.map(reason=>reason.text).join(' · '),details};
  }
  const {reason,review}=checks?{}:await classifyOperation(env,action,product);
  if(reason)return {...display,status:'excluded',reason};
  if(!preview&&!confirmed.includes(item.id))return {...display,status:'excluded',reason:'이번 확인에서 실행 대상으로 선택되지 않았습니다.'};
  const outcome=checks?(details.ready?'ready':'pending'):undefined;
  if(preview&&checks){
   const assets=purging?await previewProductPurge(env,product):undefined;
   return {...display,status:'eligible',outcome,details,type:product.type,thumbnail:product.asset?.files.thumbnail,assets};
  }
  if(op){
   if(purging)return {...display,status:'eligible',type:product.type};
   const definition=asDefinition(product);
   if(action==='archive'||action==='unarchive')definition.archived=action==='archive';
   if(action==='sale_resume'||action==='sale_stop')definition.sale=action==='sale_resume';
   if(deleting)Object.assign(definition,{sale:false,grant:false,archived:false,dispatchOnActivation:false});
   return {...display,status:'eligible',type:product.type,statement:writeDefinition(env,op,product,definition,product.activeVersion,review)};
  }
  return {...display,status:'eligible'};
 }));
 const summary=report.map(({statement,...item})=>{
  if(statement)statements.push(statement);
  return item;
 });
 if(preview)return json({items:summary});
 const eligible=summary.filter(item=>item.status==='eligible');
 if(deleting&&eligible.length){
  statements.push(queueDeletion(env,op,eligible.map(item=>({...item,snapshot:deletionSnapshot(products.get(item.id))}))));
  statements.push(refreshDeletionStatement(env,eligible));
 }
 if(purging&&eligible.length)statements.push(claimPermanentDeletion(env,op,eligible));
 const retried=await op.batch([...statements,op.writePlan(summary)],null);
 if(retried)return json(retried);
 const result=await op.replay();
 if(purging){
  trackPurge(env,ctx,result.items.filter(item=>item.status==='success').map(item=>item.id));
  const failed=result.items.filter(item=>item.status==='failed');
  if(failed.length){
   const current=await deletionDetails(env,failed.map(item=>products.get(item.id)).filter(Boolean));
   for(const item of failed){
    const fresh=current.get(item.id);
    if(fresh?.reasons.length)item.reason=fresh.reasons.map(reason=>reason.text).join(' · ');
   }
  }
 }
 return json({...result,replayed:false});
}

async function readyReview(env,product,version){
 if(!version)fail(409,'검수를 통과한 에셋 버전을 선택해 주세요.');
 if(version.package_metadata&&JSON.parse(version.package_metadata).reviewOnly)fail(409,'검토 전용 ZIP은 운영에 적용할 수 없습니다.');
 const review=await productReviewStatus(env,product,version);
 if(!review.ready)fail(409,'PC웹, 모바일웹, Android, iOS의 해당 화면 검수를 완료해 주세요.');
 return review;
}

async function requireStoredFiles(env,version){
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const objects=Object.values(JSON.parse(version.files));
 const existing=await Promise.all(objects.map(file=>env.BUCKET.head(file.key)));
 if(!objects.length||existing.some((file,i)=>!file||file.size!==objects[i].size))fail(409,'저장된 서비스 파일을 확인해 주세요.');
 if(version.package_metadata){
  const unique=new Map(objects.map(file=>[file.key,file]));
  for(const file of unique.values())await checkedProductBytes(await env.BUCKET.get(file.key),file);
 }
}

async function mutateDefinition(req,env,actor,productId){
 const form=req.headers.get('content-type')?.startsWith('multipart/form-data;')?await productForm(req):null;
 let body;try{body=form?JSON.parse(form.get('definition')):await req.json();}catch{fail(400,'상품 요청 형식을 확인해 주세요.');}
 const action=body?.action;
 if(!['create','edit','copy','status','archive','activate','rollback','link'].includes(action)||(!productId)!==(action==='create'))
  fail(400,'상품 작업을 확인해 주세요.');
 if(form&&!['create','edit','copy'].includes(action))fail(400,'상품과 함께 등록할 에셋을 확인해 주세요.');
 if(form&&form.getAll('definition').length!==1)fail(400,'상품 정보는 한 번에 하나만 등록해 주세요.');
 if(form)form.delete('definition');
 const parsed=form?await parseProductAssets(env,{id:action==='copy'?null:productId,type:body.type},form):null;
 const input=parsed?[productId,body,parsed.label,parsed.mode,parsed.renderer,parsed.fingerprint]:[productId,body];
 const op=await operation(env,actor,'product_'+action,form?form.get('request_id'):body.request_id,input);
 const existing=await op.replay();if(existing)return json(existing);
 if(action==='create'){
  const draft={id:id(),revision:0};
  return json(await saveDefinition(env,op,draft,normalizeDefinition(body),null,parsed),201);
 }
 const product=await productById(env,productId);
 if(!product?.listed)fail(404,'상품을 찾을 수 없습니다.');
 if(parsed?.manifest&&parsed.manifest.productType!==product.type)fail(400,'상품 유형이 ZIP 매니페스트와 다릅니다.');
 if(product.deletionState)fail(409,'삭제 대기 중인 상품은 변경할 수 없습니다.');
 ensureCurrent(product,body.revision);
 const active=product.activeVersion;
 const definition=asDefinition(product);
 if(action==='edit'){
  if((product.archived||product.deletePendingAt)&&parsed)fail(409,'에셋을 등록하려면 보관 또는 삭제 대기를 해제해 주세요.');
  return json(await saveDefinition(env,op,product,normalizeDefinition(body,product),active,parsed));
 }
 if(action==='copy'){
  const copy={id:id(),revision:0};
  const settings=body.options?normalizeDefinition(body):definition;
  const data={...settings,name:str(body.name??product.name.slice(0,77)+' 복제',80),sale:false,grant:false,
   dispatchOnActivation:true,archived:false,legacy:false,grantDeadline:null};
  const version=active?await versionRow(env,product.id,active):null;
  const link=!parsed&&version&&data.type===product.type?[linkedVersion(env,copy,op,version,'1.0.0-copy')]:[];
  return json(await saveDefinition(env,op,copy,data,null,parsed,link),201);
 }
 if(action==='archive')return json(await commitDefinition(env,op,product,{...definition,archived:true},active));
 if(action==='status'){
  const {sale,grant}=body;
  if(typeof sale!=='boolean'||typeof grant!=='boolean'||sale&&product.distribution!=='shop'||product.archived||product.deletePendingAt)fail(400,'판매 및 발송 상태를 확인해 주세요.');
  const review=!product.legacy&&(sale&&!product.sale||grant&&!product.grant)?
   await readyReview(env,product,active?await versionRow(env,product.id,active):null):null;
  return json(await commitDefinition(env,op,product,{...definition,sale,grant,dispatchOnActivation:false},active,review));
 }
 if(product.archived||product.deletePendingAt)fail(409,'에셋을 변경하려면 먼저 보관 또는 삭제 대기를 해제해 주세요.');
 if(action==='link'){
  const source=await productById(env,body.source_id);
  const row=source?.type===product.type&&VERSION_ID.test(body.version_id||'')?await versionRow(env,source.id,body.version_id):null;
  if(!row?.published_at||source.deletionState||product.id==='theme_christmas')fail(409,'같은 유형의 공개 검수 버전을 선택해 주세요.');
  const label=str(body.asset_version,42);
  if(!/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-z0-9.-]{1,24})?$/.test(label))fail(400,'에셋 버전 이름을 확인해 주세요.');
  return json(await commitDefinition(env,op,product,definition,active,null,[linkedVersion(env,product,op,row,label)]),201);
 }
 if(action==='rollback'&&body.version_id===null&&legacyProduct(product.id))
  return json(await commitDefinition(env,op,product,definition,null));
 if(!VERSION_ID.test(body.version_id||''))fail(400,'에셋 버전을 선택해 주세요.');
 const row=await versionRow(env,product.id,body.version_id);
 if(!row)fail(404,'상품 에셋 버전을 찾을 수 없습니다.');
 if(action==='rollback'){
  if(!row.published_at)fail(409,'이미 사용한 에셋 버전만 복원할 수 있습니다.');
  const review=row.package_metadata?await readyReview(env,product,row):null;
  await requireStoredFiles(env,row);
  return json(await commitDefinition(env,op,product,definition,row.id,review));
 }
 const review=await readyReview(env,product,row);
 await requireStoredFiles(env,row);
 const publish=query(env,'UPDATE product_asset_versions SET published_at=COALESCE(published_at,?) WHERE product_id=? AND id=?',now(),product.id,row.id);
 const flags=row.package_metadata?{dispatchOnActivation:false}:definition.dispatchOnActivation?{grant:true,dispatchOnActivation:false}:{};
 return json(await commitDefinition(env,op,product,{...definition,...flags},row.id,review,[publish]));
}

function linkedVersion(env,product,op,row,label){
 return query(env,`INSERT INTO product_asset_versions(product_id,id,label,mode,renderer,files,originals,hash,created,package_metadata,registered_by)
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=v.product_id) THEN ? END,
  ?,?,v.mode,v.renderer,v.files,v.originals,v.hash,?,v.package_metadata,?
 FROM (SELECT 1) LEFT JOIN product_asset_versions v ON v.product_id=? AND v.id=?`,
 product.id,op.key,label,now(),op.actor,row.product_id,row.id);
}

async function stage(env,prefix,groups,commit,committed){
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const staged=[];
 try{
  const result={};
  for(const [group,files] of Object.entries(groups)){
   result[group]={};
   const stored=new Map();
   for(const [role,file] of files){
    const ref=file.ref??role;
    let key=stored.get(ref);
    if(!key){
     key=prefix+'/'+group+'/'+role+'-'+file.info.sha256+'.'+file.info.extension;
     staged.push(key);
     await env.BUCKET.put(key,file.data??await file.read());
     stored.set(ref,key);
    }
    result[group][role]={...file.info,key};
   }
  }
  const response=await commit(result);
  if(response.replayed)await Promise.allSettled(staged.map(key=>env.BUCKET.delete(key)));
  return response;
 }catch(error){
  // An ambiguous D1 failure must not delete a successfully committed file.
  let saved=true;
  try{saved=await committed();}catch{}
  if(!saved)await Promise.allSettled(staged.map(key=>env.BUCKET.delete(key)));
  throw error;
 }
}

async function saveAssetVersion(env,op,product,parsed,commit){
 const versionId=parsed.packageMetadata?id():op.key;
 const upload=id(),prefix='product-media/'+product.id+'/'+versionId+'/'+upload;
 const roles=[...parsed.files].map(([role,file])=>[role,file.info.sha256]).sort();
 const hash=await sha256(JSON.stringify(parsed.packageMetadata?[roles,parsed.animation,parsed.manifest.layout??null]:roles));
 const claim=await run(env,`INSERT INTO product_asset_uploads(upload_id,product_id,expires_at)
  SELECT ?,?,unixepoch()+1800 WHERE NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=?)
  AND COALESCE((SELECT revision FROM product_catalog WHERE product_id=?),0)=?`,
  upload,product.id,product.id,product.id,product.revision);
 if(!claim.meta.changes)fail(409,'상품 상태가 변경되었습니다. 목록을 다시 확인해 주세요.');
 try{
  return await stage(env,prefix,{files:parsed.files,originals:parsed.originals},files=>commit(
  query(env,`INSERT INTO product_asset_versions(product_id,id,label,mode,renderer,files,originals,hash,created,package_metadata,upload_sha256,registered_by)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,product.id,versionId,parsed.label,parsed.mode,parsed.renderer,JSON.stringify(files.files),JSON.stringify(files.originals),hash,now(),
   parsed.packageMetadata?JSON.stringify(parsed.packageMetadata):null,parsed.uploadHash??null,op.actor),
  hash,versionId),async()=>!!(await versionRow(env,product.id,versionId))?.files.includes(prefix+'/'));
 }finally{
  await run(env,'DELETE FROM product_asset_uploads WHERE upload_id=?',upload).catch(error=>console.error('Product upload cleanup delayed',error.message));
 }
}

const findSameUpload=(env,productId,hash)=>hash?one(env,'SELECT id,hash FROM product_asset_versions WHERE product_id=? AND upload_sha256=?',productId,hash):null;

async function saveDefinition(env,op,product,definition,active,parsed,other=[]){
 if(!parsed)return commitDefinition(env,op,product,definition,active,null,other);
 const same=await findSameUpload(env,product.id,parsed.uploadHash);
 if(same)return commitDefinition(env,op,product,definition,active,null,other,{version_id:same.id});
 return saveAssetVersion(env,op,product,parsed,(write,hash,versionId)=>
  commitDefinition(env,op,product,definition,active,null,[write],{version_id:versionId}));
}

async function registerVersion(req,env,actor,product){
 if(product.archived||product.deletePendingAt)fail(409,'보관 또는 삭제 대기 상품의 에셋은 변경할 수 없습니다.');
 const form=await productForm(req),parsed=await parseProductAssets(env,product,form);
 const input=[product.id,parsed.label,parsed.mode,parsed.renderer,parsed.fingerprint];
 const op=await operation(env,actor,'product_asset_upload',form.get('request_id'),input);
 const old=await op.replay();if(old)return json(old);
 const prior=()=>findSameUpload(env,product.id,parsed.uploadHash);
 const guard='COALESCE((SELECT revision FROM product_catalog WHERE product_id=?),0)=?';
 const audit=(versionId,hash)=>op.write(product.id,{version_id:versionId,hash},guard,[product.id,product.revision]);
 const reuse=version=>op.batch([audit(version.id,version.hash)],{id:product.id,version_id:version.id,reused:true});
 let same=await prior();if(same)return json(await reuse(same));
 try{
  const saved=await saveAssetVersion(env,op,product,parsed,(write,hash,versionId)=>op.batch([
   audit(versionId,hash),write
  ],{id:product.id,version_id:versionId}));
  return json(saved,saved.replayed?200:201);
 }catch(error){
  if(error.status!==409||!(same=await prior()))throw error;
  return json(await reuse(same));
 }
}

async function recordReview(req,env,actor,product,version){
 const measured=await measureProductReview(req,env,product,version);
 const op=await operation(env,actor,'product_review',measured.requestId,[product.id,version.id,measured.input]);
 const old=await op.replay();if(old)return json(old);
 ensureCurrent(product,measured.revision);
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const evidence=id(),prefix=['product-evidence',product.id,version.id,evidence].join('/'),written=[];
 try{
  const samples=[];
  for(const [i,pair] of measured.pairs.entries()){
   const sample={ms:pair.ms,...pair.score};
   for(const kind of ['actual','preview']){
    const image=pair[kind],name=kind+i+'.'+image.ext,key=prefix+'/'+name;
    written.push(key);await env.BUCKET.put(key,image.data);
    sample[kind]={sha256:image.sha256,url:'/api/admin/'+key};
   }
   samples.push(sample);
  }
  const {platform,surface,build}=measured.data,report={...measured.data,samples},result={id:product.id,version_id:version.id,passed:measured.passed};
  const guard='COALESCE((SELECT revision FROM product_catalog WHERE product_id=?),0)=?';
  const response=await op.batch([
   op.write(product.id,{version_id:version.id,platform,surface,build,passed:measured.passed,evidence},guard,[product.id,product.revision]),
   query(env,`INSERT INTO product_asset_reviews(product_id,version_id,platform,surface,build,report,passed,created) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(product_id,version_id,platform,surface) DO UPDATE SET build=excluded.build,report=excluded.report,passed=excluded.passed,created=excluded.created`,
   product.id,version.id,platform,surface,build,JSON.stringify(report),Number(measured.passed),now())
  ],result);
  if(response.replayed)await Promise.allSettled(written.map(key=>env.BUCKET.delete(key)));
  return json(response,201);
 }catch(error){
  let saved=true;
  try{saved=!!await one(env,'SELECT id FROM admin_audit WHERE id=?',auditId(op.key));}catch{}
  if(!saved)await Promise.allSettled(written.map(key=>env.BUCKET.delete(key)));
  throw error;
 }
}

async function holdingCounts(env,products){
 const gifts=products.filter(p=>p.type==='gift').map(p=>p.id),decorations=products.filter(p=>p.type!=='gift').map(p=>p.id);
 const [gift,decoration]=await Promise.all([
  gifts.length?rows(env,`SELECT gift_type product_id,COUNT(DISTINCT CASE WHEN used_at=0 AND recalled_at IS NULL AND (expires_at IS NULL OR expires_at>unixepoch()) THEN user_id END) holders,
   SUM(source IN ('reward','reward_locked')) granted FROM gift_inventory WHERE gift_type IN (SELECT value FROM json_each(?)) GROUP BY gift_type`,JSON.stringify(gifts)):[],
  decorations.length?rows(env,`SELECT item_key product_id,
   COUNT(DISTINCT CASE WHEN (${stockDecorationSQL('pi')}) OR (${activeDecorationSQL('pi')}) THEN user_id END) holders,
   SUM(pi.dispatch_item IS NOT NULL) granted FROM player_inventory pi
   WHERE item_key IN (SELECT value FROM json_each(?))
   GROUP BY item_key`,JSON.stringify(decorations)):[]
 ]);
 const counts=new Map([...gift,...decoration].map(row=>[row.product_id,row]));
 return products.map(p=>({...shape(p),holders:counts.get(p.id)?.holders??0,granted:counts.get(p.id)?.granted??0}));
}

async function listProducts(req,env,user){
 const params=new URL(req.url).searchParams;
 const q=(params.get('q')||'').trim().toLocaleLowerCase('ko-KR').slice(0,100);
 const type=params.get('type'),currency=params.get('currency'),distribution=params.get('distribution'),sale=params.get('sale'),grant=params.get('grant');
 const pending=params.get('deletion')==='1';
 const archived=!pending&&(params.get('archived')==='1'||sale==='archived');
 const size=Math.min(30,Math.max(1,Math.floor(Number(params.get('size'))||12)));
 const all=[...(await catalog(env)).values()];
 const deleting=all.filter(product=>product.listed&&product.deletionState);
 if(pending)await refreshDeletionStatement(env,deleting.filter(product=>['pending','ready'].includes(product.deletionState)))?.run();
 let products=all.filter(p=>
  p.listed&&!!p.deletionState===pending&&(pending||!!p.archived===archived)&&(!type||type===p.type)&&(!currency||currency===p.currency)&&(!distribution||distribution===p.distribution)&&
  (!sale||sale==='archived'||p.distribution==='shop'&&String(Number(sold(p)))===sale)&&
  (!grant||String(Number(grantable(p)))===grant)&&(!q||[p.name,p.id].some(value=>value.toLocaleLowerCase('ko-KR').includes(q))));
 const jobs=await rows(env,`SELECT product_id,state,requested_at,last_error FROM product_deletions WHERE state<>'deleted'`);
 const counts={deletion:jobs.length,ready:jobs.filter(job=>job.state==='ready').length,
  purging:jobs.filter(job=>job.state==='purging').length};
 const readyFirst={ready:0,failed:1,purging:2,pending:3};
 let shaped;
 if(pending){
  const byId=new Map(jobs.map(job=>[job.product_id,job]));
  const details=await deletionDetails(env,products);
  const filter=params.get('deletion_state'),sort=params.get('sort');
  products=products.filter(product=>byId.has(product.id));
  shaped=products.map(product=>withDeletion(product,byId.get(product.id),details.get(product.id)))
   .filter(product=>!filter||product.deletion.state===filter)
   .sort((a,b)=>(sort==='requested'?0:readyFirst[a.deletion.state]-readyFirst[b.deletion.state])||
    b.deletion.requested_at-a.deletion.requested_at||a.id.localeCompare(b.id));
 }
 const total=(shaped||products).length;
 const pages=Math.max(1,Math.ceil(total/size));
 const page=Math.min(pages,Math.max(1,Math.floor(Number(params.get('page'))||1)));
 const start=(page-1)*size,end=page*size;
 return json({products:shaped?shaped.slice(start,end):await holdingCounts(env,products.slice(start,end)),total,page,pages,counts,
  can_edit:writable(env,user),can_dispatch:giftDispatchPermissions(env,user).grant});
}

async function productDetail(env,user,product){
 if(product.deletionState){
  const job=await one(env,'SELECT state,requested_at,last_error FROM product_deletions WHERE product_id=?',product.id);
  if(!job||job.state==='deleted')fail(404,'상품을 찾을 수 없습니다.');
  const detail=(await deletionDetails(env,[product])).get(product.id);
  return json({product:withDeletion(product,job,detail),versions:[],can_edit:writable(env,user)});
 }
 const versions=await rows(env,'SELECT * FROM product_asset_versions WHERE product_id=? ORDER BY created DESC,id',product.id);
 const active=versions.find(row=>row.id===product.activeVersion),builds=reviewBuilds(env);
 const [item]=await holdingCounts(env,[product]);
 return json({product:item,versions:versions.map(row=>describeProductVersion(row)),builds,can_edit:writable(env,user),
  active_review:active?await productReviewStatus(env,product,active):null});
}

async function deletionHistory(req,env){
 const params=new URL(req.url).searchParams,productId=params.get('product_id');
 if(productId&&!PRODUCT_ID.test(productId))fail(400,'상품 ID를 확인해 주세요.');
 const offset=Math.min(10000,Math.max(0,Math.floor(Number(params.get('offset'))||0)));
 const logs=await rows(env,`SELECT id,admin_id,action,target,created FROM admin_audit
  WHERE (action GLOB 'product_delete_*' OR action IN ('product_delete','product_purge'))
  AND (? IS NULL OR json_extract(target,'$.product_id')=? OR EXISTS (
   SELECT 1 FROM json_each(target,'$.result.items') item WHERE json_extract(item.value,'$.id')=?))
  ORDER BY created DESC,rowid DESC LIMIT 31 OFFSET ?`,productId,productId,productId,offset);
 return json({events:logs.slice(0,30).map(({target,...log})=>({...log,data:JSON.parse(target)})),
  next_offset:logs.length>30?offset+30:null});
}

export async function adminProductRoute(req,env,path,user,ctx){
 if(path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
 requireUser(user);
 if(!isAdmin(env,user))fail(403,'상품 관리 조회 권한이 필요합니다.');
 if(req.method!=='GET'&&path!==ROOT+'/originals.zip'&&!writable(env,user))fail(403,'상품 등록 및 변경 권한이 필요합니다.');
 if(path===ROOT){
  if(req.method==='GET'){
   if(new URL(req.url).searchParams.get('deletion')==='1')trackPurge(env,ctx);
   return listProducts(req,env,user);
  }
  if(req.method==='POST')return mutateDefinition(req,env,user,null);
 }
 if(path===ROOT+'/grantable'&&req.method==='GET'){
  const products=[...(await catalog(env)).values()].filter(grantable);
  return json({products:products.map(shape)});
 }
 if(path===ROOT+'/operations'&&req.method==='POST')return productOperation(req,env,user,ctx);
 if(path===ROOT+'/deletion-history'&&req.method==='GET')return deletionHistory(req,env);
 if(path===ROOT+'/inspect-package'&&req.method==='POST'){
  const form=await productForm(req,PRODUCT_ARCHIVE_MAX+8192);
  if([...form.keys()].some(key=>key!=='package'||form.getAll(key).length!==1))fail(400,'검사할 상품 ZIP을 하나 선택해 주세요.');
  const parsed=await inspectPackageUpload(env,form.get('package'));
  return json({standard:registry.standard,upload_sha256:parsed.uploadHash,size:parsed.originals.get('package').info.size,
   ...parsed.packageMetadata,files:Object.fromEntries([...parsed.files].map(([role,file])=>[role,file.info]))});
 }
 if(path===ROOT+'/originals.zip'&&req.method==='POST')return bulkOriginalDownload(req,env,user);
 const [productId,collection,versionId,action,...rest]=path.slice(ROOT.length+1).split('/');
 if(rest.length||!PRODUCT_ID.test(productId))fail(404,'상품을 찾을 수 없습니다.');
 if(!collection&&req.method==='POST')return mutateDefinition(req,env,user,productId);
 const product=await productById(env,productId);
 if(!product?.listed)fail(404,'상품을 찾을 수 없습니다.');
 if(!collection&&req.method==='GET')return productDetail(env,user,product);
 if(product.deletionState)fail(409,'삭제 대기 중인 상품의 에셋은 변경할 수 없습니다.');
 if(collection==='versions'&&!versionId&&req.method==='POST')return registerVersion(req,env,user,product);
 if(collection==='versions'&&VERSION_ID.test(versionId||'')){
  const version=await versionRow(env,product.id,versionId);
  if(!version)fail(404,'상품 에셋 버전을 찾을 수 없습니다.');
  if(action==='operating.zip'&&req.method==='GET')return operatingDownload(env,user,version);
  if(action==='review'&&req.method==='POST')return recordReview(req,env,user,product,version);
  if(!action&&req.method==='GET')return json({version:describeProductVersion(version),review:await productReviewStatus(env,product,version)});
 }
 fail(405,'지원하지 않는 상품 관리 요청입니다.');
}
