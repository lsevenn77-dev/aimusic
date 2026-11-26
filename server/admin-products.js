import {isAdmin,requireUser} from './auth.js';
import {isConsoleAdmin} from './admin-session.js';
import {one,rows,query,now,id,fail,json,str} from './db.js';
import {
 catalog,productById,legacyProduct,sold,grantable,PRODUCT_TYPES,PRODUCT_ID,VERSION_ID,PERIODS,GIFT_OPTION
} from './product-catalog.js';
import {parseProductDeadline} from './product-deadline.js';
import {activeDecorationSQL,decorationFundingSQL} from './decorations.js';
import {parseProductAssets,productForm,describeProductVersion,sha256} from './product-assets.js';
import {measureProductReview,productReviewStatus,reviewBuilds} from './product-reviews.js';

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
 return {...p,grant_executor:p.type==='gift'?'gift_inventory':null};
};

function normalizeDefinition(body,previous){
 const type=previous?.type??body.type,currency=previous?.currency??body.currency;
 if(!PRODUCT_TYPES.includes(type)||!['G','S'].includes(currency)||(type!=='gift'&&currency!=='G')||
  (previous&&(body.type!==undefined&&body.type!==type||body.currency!==undefined&&body.currency!==currency)))
  fail(400,'상품 유형과 통화를 확인해 주세요. 저장된 상품의 유형과 통화는 고정됩니다.');
 const distribution=body.distribution;
 if(!['shop','grant'].includes(distribution)||typeof body.eventOnly!=='boolean')fail(400,'상품 구분과 이벤트 표시 상태를 확인해 주세요.');
 if(!body.options||typeof body.options!=='object'||Array.isArray(body.options))fail(400,'가격과 이용 기간 옵션을 확인해 주세요.');
 const allowed=type==='gift'?[GIFT_OPTION]:PERIODS;
 const prices=Object.keys(body.options);
 if(!prices.length||prices.some(key=>!allowed.includes(key)))fail(400,'현재 서비스에서 지원하는 이용 기간을 선택해 주세요.');
 const options=Object.fromEntries(allowed.filter(key=>prices.includes(key)).map(key=>{
  const price=body.options[key];
  if(!Number.isSafeInteger(price)||price<1||price>100000)fail(400,'가격 또는 표시 가치는 1~100,000 사이 정수로 입력해 주세요.');
  return [key,price];
 }));
 const value=distribution==='grant'?body.value:null;
 if(distribution==='grant'&&(!Number.isSafeInteger(value)||value<1||value>100000))fail(400,'지급 상품의 표시 가치를 입력해 주세요.');
 const uiMode=type==='theme'?body.uiMode:null;
 if(type==='theme'&&!['dark','light'].includes(uiMode))fail(400,'방 패널 모드를 선택해 주세요.');
 return {type,currency,distribution,options,value,uiMode,name:str(body.name,80),description:str(body.description??'',400,false),eventOnly:body.eventOnly,
  grantDeadline:parseProductDeadline(body.grantDeadline),sale:distribution==='shop'&&!!previous?.sale,grant:!!previous?.grant,
  archived:!!previous?.archived,listed:true,legacy:!!previous?.legacy};
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
 return {key:request,replay,write,batch};
}

function commitDefinition(env,op,product,definition,active,review=null,other=[]){
 const revision=product.revision+1,result={id:product.id,revision,active_version:active};
 const gate=review?` AND NOT EXISTS(SELECT 1 FROM json_each(?) needed WHERE NOT EXISTS (
  SELECT 1 FROM product_asset_reviews r WHERE r.product_id=? AND r.version_id=? AND r.platform=json_extract(needed.value,'$.platform')
  AND r.surface=json_extract(needed.value,'$.surface') AND r.build=json_extract(needed.value,'$.build') AND r.passed=1
  AND json_extract(r.report,'$.presentation')=?
 ))`:'';
 const expected=review?.items.map(({platform,surface,build})=>({platform,surface,build}));
 return op.batch([
  query(env,`INSERT INTO product_catalog(product_id,definition,revision,active_version,last_request,updated)
   SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM product_catalog WHERE product_id=?),0)=?${gate}
   ON CONFLICT(product_id) DO UPDATE SET definition=excluded.definition,revision=excluded.revision,
   active_version=excluded.active_version,last_request=excluded.last_request,updated=excluded.updated`,
  product.id,JSON.stringify(definition),revision,active,op.key,now(),product.id,product.revision,
  ...(review?[JSON.stringify(expected),product.id,active,review.presentation]:[])),
  op.write(product.id,{revision,active_version:active,sale:definition.sale,grant:definition.grant,archived:definition.archived},
   'EXISTS(SELECT 1 FROM product_catalog WHERE product_id=? AND last_request=? AND revision=?)',[product.id,op.key,revision]),
  ...other
 ],result);
}

function asDefinition(p){
 const {id,original,asset,revision,activeVersion,...definition}=p;
 return definition;
}

async function readyReview(env,product,version){
 if(!version)fail(409,'검수를 통과한 에셋 버전을 선택해 주세요.');
 const review=await productReviewStatus(env,product,version);
 if(!review.ready)fail(409,'PC웹, 모바일웹, Android, iOS의 해당 화면 검수를 완료해 주세요.');
 return review;
}

async function mutateDefinition(req,env,actor,productId){
 let body;try{body=await req.json();}catch{fail(400,'상품 요청 형식을 확인해 주세요.');}
 const action=body?.action;
 if(!['create','edit','copy','status','archive','activate','rollback','link'].includes(action)||(!productId)!==(action==='create'))
  fail(400,'상품 작업을 확인해 주세요.');
 const op=await operation(env,actor,'product_'+action,body.request_id,[productId,body]);
 const existing=await op.replay();if(existing)return json(existing);
 if(action==='create'){
  const draft={id:id(),revision:0};
  return json(await commitDefinition(env,op,draft,normalizeDefinition(body),null),201);
 }
 const product=await productById(env,productId);
 if(!product?.listed)fail(404,'상품을 찾을 수 없습니다.');
 ensureCurrent(product,body.revision);
 const active=product.activeVersion;
 const definition=asDefinition(product);
 if(action==='edit')return json(await commitDefinition(env,op,product,normalizeDefinition(body,product),active));
 if(action==='copy'){
  const copy={id:id(),revision:0};
  const data={...definition,name:str(body.name??product.name.slice(0,77)+' 복제',80),sale:false,grant:false,archived:false,legacy:false};
  const version=active?await versionRow(env,product.id,active):null;
  return json(await commitDefinition(env,op,copy,data,null,null,version?[linkedVersion(env,copy,op,version,'1.0.0-copy')]:[]),201);
 }
 if(action==='archive')return json(await commitDefinition(env,op,product,{...definition,sale:false,grant:false,archived:true},active));
 if(action==='status'){
  const {sale,grant}=body;
  if(typeof sale!=='boolean'||typeof grant!=='boolean'||sale&&product.distribution!=='shop'||product.archived)fail(400,'판매 및 지급 상태를 확인해 주세요.');
  const review=!product.legacy&&(sale&&!product.sale||grant&&!product.grant)?
   await readyReview(env,product,active?await versionRow(env,product.id,active):null):null;
  return json(await commitDefinition(env,op,product,{...definition,sale,grant},active,review));
 }
 if(action==='link'){
  const source=await productById(env,body.source_id);
  const row=source?.type===product.type&&VERSION_ID.test(body.version_id||'')?await versionRow(env,source.id,body.version_id):null;
  if(!row?.published_at||product.id==='theme_christmas')fail(409,'같은 유형의 공개 검수 버전을 선택해 주세요.');
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
  return json(await commitDefinition(env,op,product,definition,row.id));
 }
 const review=await readyReview(env,product,row);
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const objects=Object.values(JSON.parse(row.files));
 const existingFiles=await Promise.all(objects.map(file=>env.BUCKET.head(file.key)));
 if(existingFiles.some((file,i)=>!file||file.size!==objects[i].size))fail(409,'저장된 서비스 파일을 확인해 주세요.');
 const publish=query(env,'UPDATE product_asset_versions SET published_at=COALESCE(published_at,?) WHERE product_id=? AND id=?',now(),product.id,row.id);
 return json(await commitDefinition(env,op,product,definition,row.id,review,[publish]));
}

function linkedVersion(env,product,op,row,label){
 return query(env,`INSERT INTO product_asset_versions(product_id,id,label,mode,renderer,files,originals,hash,created)
 VALUES(?,?,?,?,?,?,?,?,?)`,product.id,op.key,label,row.mode,row.renderer,row.files,row.originals,row.hash,now());
}

async function stage(env,prefix,groups,commit,committed){
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const staged=[];
 try{
  const result={};
  for(const [group,files] of Object.entries(groups)){
   result[group]={};
   for(const [role,file] of files){
    const key=prefix+'/'+group+'/'+role+'.'+file.info.extension;
    staged.push(key);
    await env.BUCKET.put(key,file.data);
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

async function registerVersion(req,env,actor,product){
 if(product.archived)fail(409,'보관된 상품의 에셋은 변경할 수 없습니다.');
 const form=await productForm(req),parsed=await parseProductAssets(env,product,form);
 const input=[product.id,parsed.label,parsed.mode,parsed.renderer,parsed.fingerprint];
 const op=await operation(env,actor,'product_asset_upload',form.get('request_id'),input);
 const old=await op.replay();if(old)return json(old);
 const prefix='product-media/'+product.id+'/'+op.key+'/'+id();
 const hash=await sha256(JSON.stringify([...parsed.files].map(([role,file])=>[role,file.info.sha256]).sort()));
 const result={id:product.id,version_id:op.key};
 const saved=await stage(env,prefix,{files:parsed.files,originals:parsed.originals},files=>op.batch([
  query(env,`INSERT INTO product_asset_versions(product_id,id,label,mode,renderer,files,originals,hash,created)
   VALUES(?,?,?,?,?,?,?,?,?)`,product.id,op.key,parsed.label,parsed.mode,parsed.renderer,JSON.stringify(files.files),JSON.stringify(files.originals),hash,now()),
  op.write(product.id,{version_id:op.key,hash})
 ],result),async()=>!!(await versionRow(env,product.id,op.key))?.files.includes(prefix+'/'));
 return json(saved,201);
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
  gifts.length?rows(env,`SELECT gift_type product_id,COUNT(DISTINCT CASE WHEN used_at=0 AND (expires_at IS NULL OR expires_at>unixepoch()) THEN user_id END) holders,
   SUM(source IN ('reward','reward_locked')) granted FROM gift_inventory WHERE gift_type IN (SELECT value FROM json_each(?)) GROUP BY gift_type`,JSON.stringify(gifts)):[],
  decorations.length?rows(env,`SELECT item_key product_id,COUNT(DISTINCT user_id) holders FROM player_inventory pi
   WHERE item_key IN (SELECT value FROM json_each(?)) AND ((pi.source='decoration_stock' AND pi.revoked=0 AND ${decorationFundingSQL('pi')}) OR (${activeDecorationSQL('pi')}))
   GROUP BY item_key`,JSON.stringify(decorations)):[]
 ]);
 const counts=new Map([...gift,...decoration].map(row=>[row.product_id,row]));
 return products.map(p=>({...shape(p),holders:counts.get(p.id)?.holders??0,granted:p.type==='gift'?counts.get(p.id)?.granted??0:null}));
}

async function listProducts(req,env,user){
 const params=new URL(req.url).searchParams;
 const q=(params.get('q')||'').trim().toLocaleLowerCase('ko-KR').slice(0,100);
 const type=params.get('type'),currency=params.get('currency'),distribution=params.get('distribution'),sale=params.get('sale'),grant=params.get('grant');
 const size=Math.min(30,Math.max(1,Math.floor(Number(params.get('size'))||12)));
 const products=[...(await catalog(env)).values()].filter(p=>
  (!type||type===p.type)&&(!currency||currency===p.currency)&&(!distribution||distribution===p.distribution)&&
  (!sale||(sale==='archived'?p.archived:p.distribution==='shop'&&String(Number(sold(p)))===sale&&!p.archived))&&
  (!grant||String(Number(grantable(p)))===grant)&&(!q||(p.name+' '+p.id).toLocaleLowerCase('ko-KR').includes(q)));
 const pages=Math.max(1,Math.ceil(products.length/size));
 const page=Math.min(pages,Math.max(1,Math.floor(Number(params.get('page'))||1)));
 return json({products:await holdingCounts(env,products.slice((page-1)*size,page*size)),total:products.length,page,pages,can_edit:writable(env,user)});
}

async function productDetail(env,user,product){
 const versions=await rows(env,'SELECT * FROM product_asset_versions WHERE product_id=? ORDER BY created DESC,id',product.id);
 const active=versions.find(row=>row.id===product.activeVersion),builds=reviewBuilds(env);
 const [item]=await holdingCounts(env,[product]);
 return json({product:item,versions:versions.map(row=>describeProductVersion(row)),builds,can_edit:writable(env,user),
  active_review:active?await productReviewStatus(env,product,active):null});
}

export async function adminProductRoute(req,env,path,user){
 if(path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
 requireUser(user);
 if(!isAdmin(env,user))fail(403,'상품 관리 조회 권한이 필요합니다.');
 if(req.method!=='GET'&&!writable(env,user))fail(403,'상품 등록 및 변경 권한이 필요합니다.');
 if(path===ROOT){
  if(req.method==='GET')return listProducts(req,env,user);
  if(req.method==='POST')return mutateDefinition(req,env,user,null);
 }
 if(path===ROOT+'/grantable'&&req.method==='GET'){
  const products=[...(await catalog(env)).values()].filter(grantable);
  return json({products:products.map(shape)});
 }
 const [productId,collection,versionId,action,...rest]=path.slice(ROOT.length+1).split('/');
 if(rest.length||!PRODUCT_ID.test(productId))fail(404,'상품을 찾을 수 없습니다.');
 if(!collection&&req.method==='POST')return mutateDefinition(req,env,user,productId);
 const product=await productById(env,productId);
 if(!product?.listed)fail(404,'상품을 찾을 수 없습니다.');
 if(!collection&&req.method==='GET')return productDetail(env,user,product);
 if(collection==='versions'&&!versionId&&req.method==='POST')return registerVersion(req,env,user,product);
 if(collection==='versions'&&VERSION_ID.test(versionId||'')){
  const version=await versionRow(env,product.id,versionId);
  if(!version)fail(404,'상품 에셋 버전을 찾을 수 없습니다.');
  if(action==='review'&&req.method==='POST')return recordReview(req,env,user,product,version);
  if(!action&&req.method==='GET')return json({version:describeProductVersion(version),review:await productReviewStatus(env,product,version)});
 }
 fail(405,'지원하지 않는 상품 관리 요청입니다.');
}
