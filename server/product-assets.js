import {fail,id,now,one,run} from './db.js';
import {originRequest} from './cafe24-origin.js';
import {PRODUCT_ID,VERSION_ID,assetUrl} from './product-catalog.js';
import {openProductZip,productZip,PRODUCT_ARCHIVE_MAX,PRODUCT_IMAGE_MAX} from './product-zip.js';
import {actualImageType,assetRoles,inspectProductPackage,packageIsReview,sha256,themeArtwork} from '../shared/product-asset-contract.js';
export {sha256};

const modes={
 gift:{static:'gift-standard',animated:'gift-standard',layered:'gift-overlay'},
 frame:{static:'frame-static',animated:'frame-overlay',layered:'frame-overlay'},
 theme:{static:'room-background',layered:'room-overlay'}
};
const roles=assetRoles;
const extensions={jpeg:'jpg',png:'png',webp:'webp',gif:'gif'};
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',zip:'application/zip'};
const filePath=/^assets\/(?:effects\/)?[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|gif)$/i;
const decoder=new TextDecoder('utf-8',{fatal:true});
export const UPLOAD_LIMIT=28*1024*1024;

export async function boundedBody(source,max){
 const h=Number(source.headers.get('content-length')||0);
 if(h>max)fail(413,'업로드 크기 제한을 초과했습니다.');
 const reader=source.body?.getReader();
 if(!reader)fail(400,'업로드할 파일을 선택해 주세요.');
 let size=0;
 const chunks=[];
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value.length;
   if(size>max){await reader.cancel().catch(()=>{});fail(413,'업로드 크기 제한을 초과했습니다.');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const data=new Uint8Array(size);
 let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 return data;
}

export async function productForm(req,max=UPLOAD_LIMIT){
 const type=req.headers.get('content-type')||'';
 if(!type.startsWith('multipart/form-data;'))fail(400,'업로드 양식을 확인해 주세요.');
 if(Number(req.headers.get('content-length')||0)>max)fail(413,'업로드 크기 제한을 초과했습니다.');
 if(!req.body)fail(400,'업로드할 파일을 선택해 주세요.');
 let size=0;
 const bytes=req.body.pipeThrough(new TransformStream({transform(chunk,controller){
  size+=chunk.length;
  if(size>max)controller.error(new Error('size'));
  else controller.enqueue(chunk);
 }}));
 try{return await new Response(bytes,{headers:{'content-type':type}}).formData();}
 catch{
  if(size>max)fail(413,'업로드 크기 제한을 초과했습니다.');
  fail(400,'업로드 양식이 손상되었습니다.');
 }
}

export async function productMedia(env,action,data,type){
 const response=await originRequest(env,action,data,type,7500).catch(()=>null);
 if(!response||response.status===404||response.status>=500)fail(503,'이미지 검사 서비스를 사용할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');
 if(!response.ok)fail(response.status===413?413:400,'이미지의 형식, 크기, 프레임 또는 투명 영역을 확인해 주세요.');
 return response;
}

async function uploaded(file,max=PRODUCT_IMAGE_MAX){
 if(!file||typeof file==='string'||!file.size)fail(400,'필수 이미지 파일을 선택해 주세요.');
 if(file.size>max)fail(413,'개별 파일 크기 제한을 초과했습니다.');
 return new Uint8Array(await file.arrayBuffer());
}
const actualType=actualImageType;

const validKeys=(object,allowed)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(k=>allowed.includes(k));
function manifestJSON(data){
 if(!data||data.length>16384)fail(400,'매니페스트 크기와 이름을 확인해 주세요.');
 try{return JSON.parse(decoder.decode(data));}
 catch{fail(400,'매니페스트 JSON을 확인해 주세요.');}
}

function productRoles(type,mode){
 if(type==='theme')return mode==='layered'?
  {required:['desktop','mobile','desktopEffect','mobileEffect'],optional:['thumbnail','roomCard','app','appEffect']}:
  {required:['desktop','mobile'],optional:['thumbnail','roomCard','app']};
 if(mode==='animated')return {required:['base','fallback'],optional:['thumbnail']};
 if(mode==='layered')return {required:['base','effect'],optional:['thumbnail']};
 return {required:['base'],optional:['thumbnail']};
}
async function manifestFiles(archive,product,label,renderer,allowed){
 const zipped=await productZip(archive),manifest=manifestJSON(zipped.get('manifest.json'));
 if(!validKeys(manifest,['schemaVersion','assetVersion','productType','renderMode','assets','renderer','hashes'])||
  manifest.schemaVersion!==1||manifest.assetVersion!==label||manifest.productType!==product.type||
  manifest.renderMode!=='layered'||!validKeys(manifest.assets,allowed)||
  !validKeys(manifest.renderer,['id','version'])||manifest.renderer.id!==renderer||String(manifest.renderer.version)!=='1')
  fail(400,'상품 유형과 버전에 맞는 매니페스트 및 등록된 렌더러를 확인해 주세요.');
 const used=new Set(['manifest.json']),images=new Map();
 for(const [role,path] of Object.entries(manifest.assets)){
  if(typeof path!=='string'||!filePath.test(path)||used.has(path)||!zipped.has(path))fail(400,'매니페스트의 에셋 경로를 확인해 주세요.');
  const data=zipped.get(path),ext=path.split('.').at(-1).toLowerCase();
  if(types[ext]!==types[actualType(data)])fail(400,'에셋 확장자와 실제 이미지 형식이 다릅니다.');
  used.add(path);images.set(role,data);
 }
 if(used.size!==zipped.size)fail(400,'매니페스트에 연결되지 않은 파일이 ZIP에 있습니다.');
 if(manifest.hashes!==undefined){
  if(!validKeys(manifest.hashes,[...used].filter(path=>path!=='manifest.json')))fail(400,'에셋 해시 경로를 확인해 주세요.');
  for(const [path,digest] of Object.entries(manifest.hashes))
   if(typeof digest!=='string'||digest!==await sha256(zipped.get(path)))fail(400,'에셋 파일의 해시가 일치하지 않습니다.');
 }
 return images;
}

function imageMetadata(meta,ext){
 if(!meta||extensions[meta.format]!==ext||!Number.isInteger(meta.width)||!Number.isInteger(meta.height)||
    meta.width<1||meta.height<1||meta.width>4096||meta.height>4096||!Number.isInteger(meta.frames)||meta.frames<1||meta.frames>120||typeof meta.alpha!=='boolean')
  fail(503,'검사 서비스의 이미지 정보가 올바르지 않습니다.');
 return meta;
}

async function imageFile(data,ext,meta){
 return {data,info:{...meta,extension:ext,size:data.length,sha256:await sha256(data)}};
}

async function inspect(env,product,mode,role,data){
 const ext=actualType(data);
 const layer=role==='effect'||role.endsWith('Effect');
 const isFrame=product.type==='frame'&&role!=='thumbnail';
 const inspected=await productMedia(env,isFrame?'product-frame':'product-inspect',data,types[ext]);
 const metadata=imageMetadata(await inspected.json(),ext);
 const animated=mode==='animated'&&role==='base';
 if(animated&&(!['webp','gif'].includes(ext)||metadata.frames<2))fail(400,'여러 프레임이 있는 Animated WebP 또는 GIF를 선택해 주세요.');
 if(!layer&&!animated&&metadata.frames!==1)fail(400,'정적 파일 역할에는 한 프레임 이미지를 선택해 주세요.');
 if(layer&&(!metadata.alpha||!['webp','png'].includes(ext)))fail(400,'효과 레이어에는 투명 WebP 또는 PNG를 사용해 주세요.');
 if(product.type!=='theme'&&role!=='thumbnail'&&metadata.width!==metadata.height)fail(400,'선물과 테두리에는 정사각형 캔버스를 사용해 주세요.');
 if(animated||layer||ext==='webp')return imageFile(data,ext,metadata);
 return encode(env,data,ext,'product-display');
}
async function encode(env,data,ext,action){
 const response=await productMedia(env,action,data,types[ext]);
 const metadata=imageMetadata(JSON.parse(response.headers.get('x-aifect-image')||'null'),'webp');
 const bytes=await boundedBody(response,PRODUCT_IMAGE_MAX);
 if(actualType(bytes)!=='webp')fail(503,'이미지 최적화 결과를 확인할 수 없습니다.');
 return imageFile(bytes,'webp',metadata);
}

export async function inspectPackageUpload(env,upload,target){
 if(upload?.type&&!['application/zip','application/x-zip-compressed','application/octet-stream'].includes(upload.type))fail(400,'ZIP 파일을 선택해 주세요.');
 const data=await uploaded(upload,PRODUCT_ARCHIVE_MAX),archive=openProductZip(data);
 const parsed=await inspectProductPackage(archive,async(bytes,ext,frame)=>{
  const response=await productMedia(env,frame?'product-frame':'product-inspect',bytes,types[ext]);
  return imageMetadata(await response.json(),ext);
 },target);
 const uploadHash=await sha256(data),{manifest,animation}=parsed;
 const originals=new Map([['package',{data,info:{extension:'zip',size:data.length,sha256:uploadHash}}]]);
 return {...parsed,originals,uploadHash,label:manifest.assetVersion,mode:manifest.renderMode,renderer:manifest.renderer.id,
  fingerprint:uploadHash,packageMetadata:{manifest,animation,archiveName:upload.name?.slice(0,180)??'',reviewOnly:packageIsReview(manifest)}};
}

export async function parseProductAssets(env,product,form){
 // Existing multipart callers remain explicit. The common ZIP carries its own version and render mode.
 if(form.has('package')&&!form.has('mode')&&!form.has('asset_version')){
  if([...form.keys()].some(key=>!['package','request_id'].includes(key)||form.getAll(key).length!==1))fail(400,'업로드 파일 역할을 확인해 주세요.');
  if(product.id==='theme_christmas')fail(409,'크리스마스 테마 패키지는 기존 전용 렌더러의 빌드와 함께 검수해야 합니다.');
  return inspectPackageUpload(env,form.get('package'),product);
 }
 const mode=form.get('mode'),label=form.get('asset_version');
 const renderer=modes[product.type]?.[mode];
 if(typeof label!=='string'||!/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-z0-9.-]{1,24})?$/.test(label)||
    typeof renderer!=='string'||!Object.hasOwn(modes[product.type],mode))fail(400,'에셋 버전과 지원하는 재생 방식을 확인해 주세요.');
 // The live Christmas engine loads a compiled, versioned atlas and timing
 // table. A generic upload cannot replace that renderer's approved package.
 if(product.id==='theme_christmas')fail(409,'크리스마스 테마 패키지는 기존 전용 렌더러의 빌드와 함께 검수해야 합니다.');
 const {required,optional}=productRoles(product.type,mode),allowed=[...required,...optional];
 const accepted=['mode','asset_version','request_id',...(mode==='layered'?['package']:allowed)];
 if([...form.keys()].some(key=>!accepted.includes(key)||form.getAll(key).length!==1))fail(400,'업로드 파일 역할을 확인해 주세요.');
 let images,originals=new Map();
 if(mode==='layered'){
  const upload=form.get('package'),archive=await uploaded(upload,PRODUCT_ARCHIVE_MAX);
  if(upload.type&&!['application/zip','application/x-zip-compressed','application/octet-stream'].includes(upload.type))
   fail(400,'ZIP 파일의 형식을 확인해 주세요.');
  images=await manifestFiles(archive,product,label,renderer,allowed);
  originals.set('package',{data:archive,info:{extension:'zip',size:archive.length,sha256:await sha256(archive)}});
 }else{
  images=new Map();
  for(const role of allowed){
   const file=form.get(role);
   if(file&&(typeof file==='string'||file.size)){
    const bytes=await uploaded(file);
    if(file.type&&file.type!=='application/octet-stream'&&file.type!==types[actualType(bytes)])
     fail(400,'선택한 파일의 MIME과 실제 이미지 형식이 다릅니다.');
    images.set(role,bytes);
   }
  }
 }
 if(required.some(role=>!images.has(role)))fail(400,'상품에 필요한 이미지가 빠져 있습니다.');
 const files=new Map();
 for(const [role,data] of images){
  if(mode!=='layered')originals.set(role,{data,info:{extension:actualType(data),size:data.length,sha256:await sha256(data)}});
  files.set(role,await inspect(env,product,mode,role,data));
 }
 for(const [effect,base] of [['effect','base'],['desktopEffect','desktop'],['mobileEffect','mobile'],['appEffect','app']]){
  if(!files.has(effect))continue;
  const fx=files.get(effect).info,bg=files.get(base)?.info;
  if(!bg||fx.width!==bg.width||fx.height!==bg.height)fail(400,'효과 레이어와 본체의 원본 캔버스 크기를 맞춰 주세요.');
 }
 if(mode==='animated'){
  const motion=files.get('base').info,fallback=files.get('fallback').info;
  if(motion.width!==fallback.width||motion.height!==fallback.height)fail(400,'애니메이션과 정적 대체 이미지의 크기를 맞춰 주세요.');
 }
 if(!files.has('thumbnail')){
  const base=files.get(product.type==='theme'?'desktop':mode==='animated'?'fallback':'base');
  files.set('thumbnail',await encode(env,base.data,base.info.extension,'product-thumbnail'));
 }
 const fingerprint=JSON.stringify([...originals].map(([role,file])=>[role,file.info.sha256]).sort());
 return {label,mode,renderer,files,originals,fingerprint};
}

export function describeProductVersion(row,privateAccess=true){
 const files=JSON.parse(row.files),originals=JSON.parse(row.originals);
 const visible=(role,file)=>{const {key,...info}=file;return {...info,url:assetUrl(row.product_id,row.id,role,file,privateAccess)};};
 const stored=row.package_metadata?JSON.parse(row.package_metadata):null;
 const displayFiles=Object.fromEntries(Object.entries(files).map(([role,file])=>[role,visible(role,file)]));
 const downloadBase='/api/admin/products/'+row.product_id+'/versions/'+row.id;
 return {id:row.id,label:row.label,mode:row.mode,renderer:row.renderer,hash:row.hash,created:row.created,published_at:row.published_at,
  files:displayFiles,originals:Object.fromEntries(Object.entries(originals).map(([role,file])=>[role,visible('original-'+role,file)])),
  ...(privateAccess?{upload_sha256:row.upload_sha256??originals.package?.sha256??null,registered_by:row.registered_by??null,
   package:stored,source_status:stored?.manifest.originals.length?'confirmed':originals.package?'upload_only':Object.keys(originals).length?'legacy_files':'missing',
   downloads:{original:originals.package?visible('original-package',originals.package).url:null,operating:stored?downloadBase+'/operating.zip':null}}:{}),
  themeArtwork:themeArtwork(stored?.manifest,Object.fromEntries(Object.entries(displayFiles).map(([role,file])=>[role,file.url])))};
}

export async function productFileRoute(req,env,path,actor){
 const admin=path.startsWith('/api/admin/product-files/');
 const base=admin?'/api/admin/product-files/':'/api/product-assets/';
 if(!path.startsWith(base))return null;
 if(admin&&!actor)fail(403,'상품 파일 조회 권한이 필요합니다.');
 if(!['GET','HEAD'].includes(req.method))fail(405,'파일 조회만 지원합니다.');
 const [product,version,name,...rest]=path.slice(base.length).split('/');
 const match=/^([a-zA-Z-]+)\.(webp|jpg|png|gif|zip)$/.exec(name||'');
 if(rest.length||!PRODUCT_ID.test(product||'')||!VERSION_ID.test(version||'')||!match)fail(404,'상품 에셋을 찾을 수 없습니다.');
 const original=match[1].startsWith('original-');
 if(original&&!admin)fail(404,'상품 에셋을 찾을 수 없습니다.');
 const role=original?match[1].slice(9):match[1];
 if(!roles.includes(role)&&!(original&&role==='package'))fail(404,'상품 에셋을 찾을 수 없습니다.');
 const row=await one(env,'SELECT files,originals,published_at FROM product_asset_versions WHERE product_id=? AND id=?',product,version);
 const historical=!row&&!original&&role==='thumbnail'?
  await one(env,'SELECT file FROM product_history_assets WHERE product_id=? AND version_id=?',product,version):null;
 if(!historical&&(!row||!admin&&!row.published_at))fail(404,'상품 에셋을 찾을 수 없습니다.');
 const file=historical?JSON.parse(historical.file):JSON.parse(original?row.originals:row.files)[role];
 if(!file||file.extension!==match[2])fail(404,'상품 에셋을 찾을 수 없습니다.');
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const headers={'content-type':types[file.extension],'content-length':String(file.size),'x-content-type-options':'nosniff',
  'cache-control':admin?'private, no-store':'public, max-age=31536000, immutable',etag:'"'+file.sha256+'"',
  ...(original?{'content-disposition':'attachment; filename="'+name+'"'}:{})};
 if(!admin&&req.headers.get('if-none-match')===headers.etag)return new Response(null,{status:304,headers});
 if(req.method==='HEAD'){
  const object=await env.BUCKET.head(file.key);
  if(!object||object.size!==file.size)fail(404,'저장된 상품 에셋 파일을 찾을 수 없습니다.');
  return new Response(null,{headers});
 }
 const object=await env.BUCKET.get(file.key);
 if(!object)fail(404,'저장된 상품 에셋 파일을 찾을 수 없습니다.');
 if(original){
  const data=await checkedProductBytes(object,file);
  await auditAssetDownload(env,actor,product,version,role,file.sha256);
  if(role==='package')headers['content-disposition']='attachment; filename="'+product+'-'+version+'.zip"';
  return new Response(data,{headers});
 }
 return new Response(object.body,{headers});
}

export async function checkedProductBytes(object,file){
 if(!object||object.size!==undefined&&object.size!==file.size)fail(409,'저장된 상품 파일의 크기가 원본 기록과 다릅니다.');
 const data=await boundedBody(new Response(object.body),file.size);
 if(data.length!==file.size||await sha256(data)!==file.sha256)fail(409,'저장된 상품 파일의 SHA-256이 원본 기록과 다릅니다.');
 return data;
}

export const auditAssetDownload=(env,actor,product,version,role,hash)=>run(env,
 'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',
 'product-download:'+id(),actor.id,'product_asset_download',JSON.stringify({product_id:product,version_id:version,role,sha256:hash}),now());
