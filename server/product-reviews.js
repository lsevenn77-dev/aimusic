import {fail,one,rows} from './db.js';
import {PRODUCT_ID,VERSION_ID} from './product-catalog.js';
import {productForm,productMedia,sha256} from './product-assets.js';

export const platforms=['desktop','mobile','android','ios'];
const surfaces={
 gift:['shop','inventory','gift-picker','talk-seated','talk-unseated','karaoke-seated','karaoke-unseated'],
 frame:['shop','inventory','my','profile','messages','talk','talk-muted','karaoke','karaoke-muted'],
 theme:['shop','inventory','talk-dark','talk-light','karaoke-dark','karaoke-light']
};
const MATCH=.99;
const formatBuild=value=>typeof value==='string'&&/^[A-Za-z0-9._+-]{1,96}$/.test(value)?value:null;
const web=typeof __PRODUCT_REVIEW_BUILD__==='string'?__PRODUCT_REVIEW_BUILD__:'local-development';
export function reviewBuilds(env){
 return {desktop:web,mobile:web,android:formatBuild(env.AIFECT_PRODUCT_ANDROID_BUILD),ios:formatBuild(env.AIFECT_PRODUCT_IOS_BUILD)};
}
export function reviewPlan(product,mode){
 return surfaces[product.type].map(surface=>({surface,frames:
  (/^(talk|karaoke)/.test(surface)&&(mode!=='static'||product.type==='gift')||mode!=='static'&&/^(my|profile|messages)$/.test(surface))?3:1}));
}
export function presentationHash(product){
 return sha256(JSON.stringify([product.type,product.name,product.description,product.currency,product.options,product.value,
  product.distribution,!!product.eventOnly,product.uiMode??null]));
}

export async function productReviewStatus(env,product,version,records){
 const builds=reviewBuilds(env),presentation=await presentationHash(product),plan=reviewPlan(product,version.mode);
 const reviews=records??await rows(env,'SELECT * FROM product_asset_reviews WHERE product_id=? AND version_id=?',product.id,version.id);
 const byKey=new Map(reviews.map(row=>[row.platform+':'+row.surface,row]));
 const expected=platforms.flatMap(platform=>plan.map(({surface})=>{
  const row=byKey.get(platform+':'+surface),report=row?JSON.parse(row.report):null;
  const status=!row?'pending':row.build!==builds[platform]||report.presentation!==presentation?'stale':row.passed?'passed':'failed';
  return {platform,surface,build:builds[platform],status,report,created:row?.created??null};
 }));
 return {ready:expected.every(r=>r.status==='passed'),items:expected,presentation,builds,plan};
}

function fileType(data){
 if(data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71)return 'png';
 if(String.fromCharCode(...data.subarray(0,4))==='RIFF'&&String.fromCharCode(...data.subarray(8,12))==='WEBP')return 'webp';
 fail(400,'전체 화면 캡처를 PNG 또는 WebP로 첨부해 주세요.');
}
async function capture(form,field){
 const part=form.get(field);
 if(!part||typeof part==='string'||!part.size||part.size>4*1024*1024)fail(400,'각 캡처는 4MB 이하로 첨부해 주세요.');
 const data=new Uint8Array(await part.arrayBuffer()),ext=fileType(data);
 return {data,ext,sha256:await sha256(data)};
}

export async function measureProductReview(req,env,product,version){
 const form=await productForm(req,18*1024*1024),platform=form.get('platform'),surface=form.get('surface');
 const plan=reviewPlan(product,version.mode).find(p=>p.surface===surface);
 if(!platforms.includes(platform)||!plan)fail(400,'검수할 플랫폼과 화면을 확인해 주세요.');
 const build=reviewBuilds(env)[platform];
 if(!build||form.get('build')!==build)fail(409,'이 플랫폼의 검수 대상 빌드와 캡처 빌드를 확인해 주세요.');
 const condition=form.get('condition'),result=form.get('visual'),revision=Number(form.get('revision'));
 if(typeof condition!=='string'||condition.trim().length<15||condition.length>1400||!['pass','fail'].includes(result)||
  !Number.isSafeInteger(revision)||!form.has('revision'))fail(400,'비교 조건과 육안·동작 검수 결과를 입력해 주세요.');
 const accepted=['request_id','platform','surface','build','condition','visual','revision'];
 const times=[];
 for(let i=0;i<plan.frames;i++){
  accepted.push('actual'+i,'preview'+i,'ms'+i);
  const ms=form.get('ms'+i);
  if(typeof ms!=='string'||!/^\d{1,6}$/.test(ms)||i>0&&Number(ms)<=times[i-1])fail(400,'서로 다른 캡처 시점을 순서대로 입력해 주세요.');
  times.push(Number(ms));
 }
 if([...form.keys()].some(key=>!accepted.includes(key)||form.getAll(key).length!==1))fail(400,'캡처 파일 역할을 확인해 주세요.');
 const pairs=[];
 for(let i=0;i<plan.frames;i++){
  const actual=await capture(form,'actual'+i),preview=await capture(form,'preview'+i);
  if(actual.data.length+preview.data.length+4>5*1024*1024)fail(413,'같은 시점의 캡처 두 장은 합계 5MB 이하여야 합니다.');
  const payload=new Uint8Array(4+actual.data.length+preview.data.length);
  new DataView(payload.buffer).setUint32(0,actual.data.length);
  payload.set(actual.data,4);payload.set(preview.data,4+actual.data.length);
  const response=await productMedia(env,'product-compare',payload,'application/octet-stream');
  const score=await response.json();
  if(!Number.isSafeInteger(score.width)||score.width<1||!Number.isSafeInteger(score.height)||score.height<1||
   !Number.isFinite(score.pixelMatch)||score.pixelMatch<0||score.pixelMatch>1||!Number.isFinite(score.ssim)||score.ssim>1||score.tolerance!==3)
   fail(503,'이미지 비교 서비스의 측정값을 확인할 수 없습니다.');
  pairs.push({ms:times[i],actual,preview,score});
 }
 const first=pairs[0].score;
 if(pairs.some(({score})=>score.width!==first.width||score.height!==first.height))fail(400,'동일한 화면 크기로 캡처해 주세요.');
 const passed=result==='pass'&&pairs.every(({score})=>score.pixelMatch>=MATCH&&score.ssim>=MATCH);
 const presentation=await presentationHash(product);
 const data={platform,surface,build,condition:condition.trim(),visual:result,presentation};
 const inputs=pairs.map(({ms,actual,preview})=>[ms,actual.sha256,preview.sha256]);
 return {requestId:form.get('request_id'),revision,data,passed,pairs,input:{...data,revision,inputs}};
}

export async function productEvidenceRoute(req,env,path,allowed){
 if(!path.startsWith('/api/admin/product-evidence/'))return null;
 if(!allowed)fail(403,'검수 캡처 조회 권한이 필요합니다.');
 if(req.method!=='GET')fail(405,'캡처 조회만 지원합니다.');
 const [product,version,record,name,...rest]=path.slice('/api/admin/product-evidence/'.length).split('/');
 const m=/^(actual|preview)([0-2])\.(png|webp)$/.exec(name||'');
 if(rest.length||!PRODUCT_ID.test(product||'')||!VERSION_ID.test(version||'')||!VERSION_ID.test(record||'')||!m||
  !await one(env,`SELECT 1 found WHERE EXISTS(SELECT 1 FROM product_asset_versions WHERE product_id=? AND id=?)
   OR EXISTS(SELECT 1 FROM admin_audit WHERE action='product_review' AND json_extract(target,'$.product_id')=?
    AND json_extract(target,'$.result.version_id')=? AND json_extract(target,'$.result.evidence')=?)`,
   product,version,product,version,record))fail(404,'검수 캡처를 찾을 수 없습니다.');
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const file=await env.BUCKET.get(['product-evidence',product,version,record,name].join('/'));
 if(!file)fail(404,'검수 캡처를 찾을 수 없습니다.');
 return new Response(file.body,{headers:{'content-type':'image/'+m[3],'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
