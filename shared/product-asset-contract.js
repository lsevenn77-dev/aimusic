import manifestSchema from './product-assets/manifest.schema.json' with {type:'json'};
import animationSchema from './product-assets/animation.schema.json' with {type:'json'};
import registry from './product-assets/renderer-registry.json' with {type:'json'};

export {manifestSchema,animationSchema,registry};
export const assetRoles=Object.keys(manifestSchema.properties.assets.properties);
export const versionPattern=new RegExp(manifestSchema.properties.assetVersion.pattern);
export const imageMime={webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif'};
const decoder=new TextDecoder('utf-8',{fatal:true});
const encoder=new TextEncoder();
export const sha256=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof data==='string'?encoder.encode(data):data)),b=>b.toString(16).padStart(2,'0')).join('');
export function invalidPackage(message){
 throw Object.assign(new Error(message),{status:400});
}
const check=(condition,message)=>{if(!condition)invalidPackage(message);};

function validateSchema(value,node,root,path){
 if(node.$ref)return validateSchema(value,root.$defs[node.$ref.split('/').at(-1)],root,path);
 const types={object:()=>value!==null&&typeof value==='object'&&!Array.isArray(value),
  array:()=>Array.isArray(value),string:()=>typeof value==='string',number:()=>Number.isFinite(value),integer:()=>Number.isSafeInteger(value)};
 const valid=(!node.type||types[node.type]())&&(!Object.hasOwn(node,'const')||value===node.const)&&
  (!node.enum||node.enum.includes(value))&&(node.minimum===undefined||value>=node.minimum)&&(node.maximum===undefined||value<=node.maximum);
 check(valid,path+' 필드의 값 또는 형식을 확인해 주세요.');
 if(node.type==='string'){
  const match=node.pattern?new RegExp(node.pattern).exec(value):null;
  check((!node.pattern||match&&(!node.pattern.startsWith('^')||match[0]===value))&&(!node.maxLength||[...value].length<=node.maxLength),path+' 필드의 길이 또는 형식을 확인해 주세요.');
 }
 if(node.type==='array'){
  check(value.length>=node.minItems&&value.length<=node.maxItems,path+' 항목 수를 확인해 주세요.');
  value.forEach((item,index)=>validateSchema(item,node.items,root,path+'['+index+']'));
 }
 if(node.type==='object'){
  for(const key of node.required??[])check(Object.hasOwn(value,key),path+'.'+key+' 항목이 필요합니다.');
  for(const [key,item] of Object.entries(value)){
   check(Object.hasOwn(node.properties,key),path+'.'+key+' 필드는 지원하지 않습니다.');
   validateSchema(item,node.properties[key],root,path+'.'+key);
  }
 }
}

export function readPackageJson(bytes,max,name){
 check(bytes?.length&&bytes.length<=max,name+' 파일과 용량을 확인해 주세요.');
 try{return JSON.parse(decoder.decode(bytes));}
 catch{invalidPackage(name+' JSON 형식을 확인해 주세요.');}
}

export const packageIsReview=manifest=>manifest.packageKind==='review'||manifest.reviewOnly===true||manifest.releaseReady===false;
export function operatingManifest(manifest){
 const {productId,sourceException,...contract}=manifest;
 const operating=new Set(Object.values(manifest.assets));
 return {...contract,packageKind:'operating',originals:[],files:manifest.files.filter(file=>operating.has(file.path)),
  ...(packageIsReview(manifest)?{reviewOnly:true}:{})};
}
const geometryRoles=['desktop','mobile','app'];
const geometryDefault={fit:'cover',focus:[0.5,0.5],safe:[0,0,1,1]};
const effectOf=role=>role.endsWith('Low')?role.slice(0,-3)+'EffectLow':role+'Effect';

export function declarePackage(manifest,animation,archiveNames,{type,id}={}){
 validateSchema(manifest,manifestSchema,manifestSchema,'manifest');
 const {productType,productId,renderMode,assets,files,originals,layout}=manifest;
 const renderer=registry.types[productType][renderMode];
 check(renderer&&renderer.id===manifest.renderer.id,'상품 유형과 재생 방식에 맞는 렌더러를 선택해 주세요.');
 check(!type||productType===type,'상품 유형이 ZIP 매니페스트와 다릅니다.');
 check(!productId||productId===id||id===undefined,'교체할 상품 ID가 ZIP 매니페스트와 다릅니다.');
 const allowed=new Set([...renderer.required,...renderer.optional]);
 for(const role of renderer.required)check(Object.hasOwn(assets,role),role+' 역할이 필요합니다.');
 for(const role of Object.keys(assets))check(allowed.has(role),role+' 역할은 이 렌더러에서 지원하지 않습니다.');
 check(!manifest.metadata?.uiMode||productType==='theme','추천 패널은 테마에만 지정합니다.');
 const operational=new Set(Object.values(assets));
 const sources=new Set(originals);
 check(sources.size===originals.length&&originals.every(path=>path.startsWith('originals/'))&&[...operational].every(path=>path.startsWith('assets/')),'제작 원본과 운영 파일을 각각 originals/ 및 assets/에 배치해 주세요.');
 check(manifest.packageKind!=='operating'||!sources.size,'운영 ZIP에 제작 원본을 선언할 수 없습니다.');
 check(manifest.packageKind!=='author'||sources.size||manifest.sourceException?.trim(),'제작 원본 또는 미보유 사유를 입력해 주세요.');
 const expected=new Set([...operational,...sources]);
 const byPath=new Map();
 for(const file of files){
  check(expected.has(file.path)&&!byPath.has(file.path),file.path+' 파일의 선언 또는 역할을 확인해 주세요.');
  check(imageMime[file.path.split('.').at(-1)]===file.mime,file.path+'의 확장자와 선언된 MIME이 일치해야 합니다.');
  check(file.width*file.height*file.frames<=registry.limits.pixelsAcrossFrames,file.path+'의 전체 디코딩 픽셀 한도를 초과했습니다.');
  byPath.set(file.path,file);
 }
 check(byPath.size===expected.size,'모든 에셋 파일의 메타데이터를 선언해 주세요.');
 const {animation:path}=manifest;
 check((renderMode==='static')===!path,'움직이는 상품에만 animation.json을 추가해 주세요.');
 const names=new Set([...expected,'manifest.json',...(path?[path]:[])]);
 check(archiveNames.length===names.size&&archiveNames.every(name=>names.has(name)),'ZIP에 빠진 파일 또는 선언하지 않은 파일이 있습니다.');
 if(productType==='theme'){
  for(const role of Object.keys(layout??{})){
   const [left,top,right,bottom]=layout[role].safe;
   check(assets[role]&&left<right&&top<bottom,role+' 안전 영역과 배경 역할을 확인해 주세요.');
  }
  for(const role of geometryRoles){
   const low=role+'Low',fx=effectOf(role),fxLow=effectOf(low);
   if(assets[low])check(assets[role],low+'에는 기본 해상도의 배경이 필요합니다.');
   if(assets[fx])check(assets[role],fx+'에는 같은 구도의 배경이 필요합니다.');
   if(assets[fxLow])check(assets[low]&&assets[fx],fxLow+'에는 저해상도 배경과 기본 효과가 필요합니다.');
  }
 }else{
  check(!layout,'배경 구도 설정은 테마에만 사용할 수 있습니다.');
  check(renderMode!=='layered'||assets.fallback===assets.base,'분리형 정적 대체에는 본체와 같은 파일을 참조해 주세요.');
 }
 const moving=renderMode==='animated'?['base']:Object.keys(assets).filter(role=>/effect/i.test(role));
 if(path){
  validateSchema(animation,animationSchema,animationSchema,'animation');
  check(animation.playback===(productType==='gift'?'event':'visible'),'애니메이션 재생 조건이 상품 유형과 다릅니다.');
  check(animation.layers.length===moving.length&&new Set(animation.layers).size===moving.length&&animation.layers.every(role=>moving.includes(role)),
   'animation.json의 layers에 움직이는 파일 역할을 정확히 지정해 주세요.');
 }
 for(const [role,path] of Object.entries(assets)){
  const file=byPath.get(path),animated=moving.includes(role);
  check(file.mime==='image/webp',role+'의 운영 파일은 WebP로 제공해 주세요.');
  check(animated?file.frames>=2:file.frames===1,role+'의 정적·움직임 파일이 매니페스트와 다릅니다.');
  if(['base','thumbnail','fallback','effect','roomCard'].includes(role))
   check(file.width===file.height,role+'에는 정사각형을 사용해 주세요.');
 }
 if(productType==='theme'){
  for(const role of geometryRoles){
   if(!assets[role])continue;
   const bg=byPath.get(assets[role]),low=byPath.get(assets[role+'Low']);
   if(role==='desktop')check(bg.width>bg.height,'가로형 테마는 너비가 높이보다 커야 합니다.');
   if(role==='mobile')check(bg.width<bg.height,'세로형 테마는 높이가 너비보다 커야 합니다.');
   if(low)check(low.width<bg.width&&low.height<bg.height&&Math.abs(bg.width/bg.height-low.width/low.height)<0.003,'경량 배경은 기본 배경과 같은 비율을 사용해 주세요.');
  }
 }
 for(const [overlay,base] of [['effect','base'],...geometryRoles.flatMap(role=>[[effectOf(role),role],[effectOf(role+'Low'),role+'Low']]),...(renderMode==='animated'?[['fallback','base']]:[])]){
  if(!assets[overlay])continue;
  const a=byPath.get(assets[overlay]),b=byPath.get(assets[base]);
  check(a.width===b.width&&a.height===b.height,overlay+'와 '+base+' 캔버스 크기를 맞춰 주세요.');
 }
 return {byPath,operational,moving};
}

export function actualImageType(data){
 const header=String.fromCharCode(...data.subarray(0,12));
 if(header.startsWith('RIFF')&&header.slice(8,12)==='WEBP'&&data.length>12&&new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(4,true)+8===data.length)return 'webp';
 if(data[0]===0x89&&header.slice(1,4)==='PNG'&&data.length>=45&&String.fromCharCode(...data.subarray(-8,-4))==='IEND')return 'png';
 if(data[0]===0xff&&data[1]===0xd8&&data[2]===0xff&&data.at(-2)===0xff&&data.at(-1)===0xd9)return 'jpg';
 if((header.startsWith('GIF87a')||header.startsWith('GIF89a'))&&data.at(-1)===0x3b)return 'gif';
 invalidPackage('지원하는 WebP, PNG, JPG 또는 GIF 파일을 사용해 주세요.');
}

function checkTimeline(bytes,meta,productType){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let duration=0,frames=0,loops=null,offset=12;
 while(offset+8<=bytes.length){
  const type=String.fromCharCode(...bytes.subarray(offset,offset+4));
  const size=view.getUint32(offset+4,true),body=offset+8;
  offset=body+size+(size%2);
  check(offset<=bytes.length,'Animated WebP 청크 크기를 확인해 주세요.');
  if(type==='ANIM'&&size===6)loops=view.getUint16(body+4,true);
  if(type==='ANMF'&&size>=16){
   const ms=bytes[body+12]+256*bytes[body+13]+65536*bytes[body+14];
   check(ms>=(productType==='gift'?20:Math.ceil(1000/registry.limits.maxSustainedFps)),'애니메이션의 프레임 간격이 너무 짧습니다.');
   frames++;duration+=ms;
  }
 }
 check(offset===bytes.length&&frames===meta.frames&&loops!==null,'Animated WebP 프레임을 확인해 주세요.');
 check(productType==='gift'?loops===1&&duration<=registry.limits.maxGiftMs:loops===0,
  '선물은 1회 4.5초 이내, 프레임과 테마는 반복 재생으로 내보내 주세요.');
}

export async function inspectProductPackage(archive,inspect,target){
 const manifest=readPackageJson(await archive.read('manifest.json'),registry.limits.manifestBytes,'manifest.json');
 const animation=manifest.animation==='animation.json'?readPackageJson(await archive.read('animation.json'),registry.limits.animationBytes,'animation.json'):null;
 const {byPath,operational,moving}=declarePackage(manifest,animation,[...archive.files.keys()],target);
 const exported=encoder.encode(JSON.stringify(operatingManifest(manifest))).length;
 const entries=[['manifest.json',exported],...([...operational].map(path=>[path,byPath.get(path).bytes])),
  ...(animation?[['animation.json',encoder.encode(JSON.stringify(animation)).length]]:[])];
 check(exported<=registry.limits.manifestBytes&&22+entries.reduce((total,[path,bytes])=>total+76+path.length*2+bytes,0)<=registry.limits.zipBytes,
  '운영 WebP를 묶은 ZIP이 8 MiB 이하여야 합니다.');
 const verified=new Map();
 for(const [path,file] of byPath){
  const bytes=await archive.read(path);
  const extension=actualImageType(bytes);
  check(bytes.length===file.bytes&&imageMime[extension]===file.mime&&await sha256(bytes)===file.sha256,path+'의 형식, 크기 또는 SHA-256이 일치하지 않습니다.');
  const roles=Object.keys(manifest.assets).filter(role=>manifest.assets[role]===path);
  const mounted=manifest.productType==='frame'&&roles.some(r=>r!=='thumbnail');
  const meta=await inspect(bytes,extension,mounted);
  check(meta.width===file.width&&meta.height===file.height&&meta.frames===file.frames,path+'의 실제 크기 또는 프레임 수가 다릅니다.');
  if(operational.has(path)){
   const animate=roles.some(role=>moving.includes(role));
   const requiresAlpha=roles.some(role=>/effect/i.test(role)||manifest.productType!=='theme'&&role!=='thumbnail');
   check(!requiresAlpha||meta.alpha,path+'에 투명 영역이 필요합니다.');
   if(animate)checkTimeline(bytes,meta,manifest.productType);
   verified.set(path,{ref:path,read:()=>archive.read(path),info:{...meta,extension,size:file.bytes,sha256:file.sha256}});
  }
 }
 return {manifest,animation,files:new Map(Object.entries(manifest.assets).map(([role,path])=>[role,verified.get(path)]))};
}

export function themeArtwork(manifest,files){
 if(manifest?.productType!=='theme')return undefined;
 const byPath=new Map(manifest.files.map(file=>[file.path,file]));
 const result={};
 for(const role of geometryRoles){
  if(!files[role])continue;
  const file=byPath.get(manifest.assets[role]),low=byPath.get(manifest.assets[role+'Low']);
  result[role]={src:files[role],width:file.width,height:file.height,...manifest.layout?.[role]||geometryDefault,
   ...(files[effectOf(role)]?{effect:files[effectOf(role)]}:{}),
   ...(low?{low:{src:files[role+'Low'],width:low.width,height:low.height,...(files[effectOf(role+'Low')]?{effect:files[effectOf(role+'Low')]}:{})}}:{})};
 }
 return result;
}
