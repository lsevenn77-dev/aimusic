import {mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {processProductImage} from '../ops/cafe24/product-media.mjs';
import {actualImageType,imageMime,inspectProductPackage,manifestSchema,registry,sha256} from '../shared/product-asset-contract.js';
import {openProductZip,PRODUCT_ARCHIVE_MAX,PRODUCT_IMAGE_MAX} from '../server/product-zip.js';
import {zipJson,zipParts} from '../server/product-zip-write.js';

const sharp=createRequire(new URL('../ops/cafe24/package.json',import.meta.url))('sharp');
const pathRule=new RegExp(manifestSchema.$defs.path.pattern);
const within=(root,path)=>{const name=relative(root,path);return name&&!isAbsolute(name)&&name.split(sep)[0]!=='..';};
function imagePath(name){
 if(typeof name!=='string'||pathRule.exec(name)?.[0]!==name)throw Error('파일 경로를 확인해 주세요. '+name);
 return name;
}
async function imageBytes(root,name){
 const path=await realpath(resolve(root,imagePath(name)));
 if(!within(root,path))throw Error('작업 폴더 내부의 이미지를 사용해 주세요. '+name);
 const info=await stat(path);
 if(!info.isFile()||info.size<1||info.size>PRODUCT_IMAGE_MAX)throw Error('개별 파일은 5 MiB 이하여야 합니다. '+name);
 return readFile(path);
}
export async function inspectLocal(bytes,ext,frame){
 try{return JSON.parse((await processProductImage(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),frame?'product-frame':'product-inspect')).body);}
 catch(error){throw new Error('이미지 디코딩, 픽셀·프레임 또는 투명 중심을 확인해 주세요. '+(error.message||ext));}
}

async function derivative(root,operation){
 const {from,to,width,height,quality=88}=operation;
 if(!imagePath(from).startsWith('originals/')||!imagePath(to).startsWith('assets/')||!to.endsWith('.webp')||
  ![width,height].every(x=>Number.isInteger(x)&&x>0&&x<=4096)||!Number.isInteger(quality)||quality<1||quality>100)
  throw Error('파생본은 originals/의 정적 이미지에서 assets/의 WebP로 지정해 주세요.');
 const input=await imageBytes(root,from);
 const meta=await inspectLocal(input,actualImageType(input),false);
 if(meta.frames!==1)throw Error('움직이는 원본은 편집 도구에서 Animated WebP로 내보내 주세요. '+from);
 const dest=resolve(root,to);
 await mkdir(dirname(dest),{recursive:true});
 if(!within(root,await realpath(dirname(dest))))throw Error('파생본 폴더를 확인해 주세요. '+to);
 const result=await sharp(input,{limitInputPixels:registry.limits.pixelsAcrossFrames}).rotate().toColourspace('srgb')
  .resize(width,height,{fit:'inside',withoutEnlargement:true}).webp({quality,alphaQuality:100}).toBuffer();
 // Write only a derived output. This also avoids writing through a symlink.
 try{await writeFile(dest,result,{flag:'wx'});}
 catch(error){if(error.code!=='EEXIST'||!result.equals(await imageBytes(root,to)))throw new Error('파생본 파일이 이미 있거나 내용이 다릅니다. '+to);}
}

export async function verifyProductZip(input){
 const archive=openProductZip(input);
 return inspectProductPackage(archive,inspectLocal);
}

export async function packProductDirectory(directory){
 const root=await realpath(directory);
 const config=JSON.parse(await readFile(resolve(root,'product.json'),'utf8'));
 const {derive=[],...manifest}=config;
 for(const operation of derive)await derivative(root,operation);
 const entries=new Map();
 const files=[];
 for(const path of new Set([...Object.values(manifest.assets),...manifest.originals])){
  const bytes=await imageBytes(root,path);
  const ext=actualImageType(bytes),meta=await inspectLocal(bytes,ext,false);
  files.push({path,mime:imageMime[ext],width:meta.width,height:meta.height,frames:meta.frames,bytes:bytes.length,sha256:await sha256(bytes)});
  entries.set(path,bytes);
 }
 if(manifest.animation==='animation.json')entries.set('animation.json',await readFile(resolve(root,'animation.json')));
 entries.set('manifest.json',zipJson({...manifest,files}));
 const zip=Buffer.concat(zipParts(entries));
 if(zip.length>PRODUCT_ARCHIVE_MAX)throw Error('ZIP이 8 MiB를 초과했습니다. 작업 폴더의 이미지 크기와 압축 품질을 확인해 주세요.');
 await verifyProductZip(zip);
 return zip;
}

async function main(){
 const [action,input,output]=process.argv.slice(2);
 let bytes;
 if(action==='pack'&&input&&output){
  bytes=await packProductDirectory(input);await writeFile(output,bytes,{flag:'wx'});
 }else if(action==='verify'&&input&&!output){
  if((await stat(input)).size>PRODUCT_ARCHIVE_MAX)throw Error('ZIP이 8 MiB를 초과했습니다.');
  bytes=await readFile(input);
 }else throw Error('사용법  node authoring/product-assets.mjs pack <제작 폴더> <출력.zip>  또는  verify <상품.zip>');
 const result=await verifyProductZip(bytes);
 process.stdout.write(JSON.stringify({valid:true,standard:registry.standard,sha256:await sha256(bytes),manifest:result.manifest},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
 process.stderr.write(error.message+'\n');process.exitCode=1;
});
