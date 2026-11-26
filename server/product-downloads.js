import {fail,one} from './db.js';
import {auditAssetDownload,checkedProductBytes} from './product-assets.js';
import {PRODUCT_ID} from './product-catalog.js';
import {PRODUCT_ARCHIVE_MAX} from './product-zip.js';
import {zipJson,zipStream} from './product-zip-write.js';
import {operatingManifest} from '../shared/product-asset-contract.js';

function downloadZip(entries,name){
 return new Response(zipStream(entries),{headers:{
  'content-type':'application/zip','content-disposition':'attachment; filename="'+name+'"',
  'cache-control':'private, no-store','x-content-type-options':'nosniff'
 }});
}

export async function operatingDownload(env,actor,row){
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 if(!row.package_metadata)fail(409,'이전 규격의 에셋은 운영 ZIP으로 재등록할 수 없습니다. 버전의 파일 목록을 확인해 주세요.');
 const {manifest,animation}=JSON.parse(row.package_metadata);
 const exported=operatingManifest(manifest);
 const stored=JSON.parse(row.files),entries=new Map();
 const plain=value=>new TextEncoder().encode(JSON.stringify(value));
 for(const [role,path] of Object.entries(exported.assets)){
  if(entries.has(path))continue;
  const file=stored[role];
  if(!file)fail(409,'운영 ZIP에 필요한 파일이 빠져 있습니다.');
  entries.set(path,await checkedProductBytes(await env.BUCKET.get(file.key),file));
 }
 if(animation)entries.set('animation.json',plain(animation));
 entries.set('manifest.json',plain(exported));
 if(22+[...entries].reduce((size,[path,data])=>size+76+2*path.length+data.length,0)>PRODUCT_ARCHIVE_MAX)fail(413,'운영 ZIP이 8 MiB를 초과했습니다.');
 await auditAssetDownload(env,actor,row.product_id,row.id,'operating',row.hash);
 return downloadZip(entries,row.product_id+'-'+row.label+'-operating.zip');
}

export async function bulkOriginalDownload(req,env,actor){
 if(!env.BUCKET)fail(503,'상품 저장소에 연결할 수 없습니다.');
 const data=await req.json().catch(()=>null),ids=data?.products;
 if(!Array.isArray(ids)||ids.length<1||ids.length>10||ids.some(key=>typeof key!=='string'||!PRODUCT_ID.test(key))||new Set(ids).size!==ids.length)
  fail(400,'다운로드할 상품을 최대 10개 선택해 주세요.');
 const entries=new Map(),results=[];
 let total=0;
 for(const product of ids){
  if(req.signal.aborted)fail(400,'다운로드 요청이 취소되었습니다.');
  const row=await one(env,`SELECT v.id,v.originals FROM product_catalog p JOIN product_asset_versions v
   ON v.product_id=p.product_id AND v.id=p.active_version WHERE p.product_id=? AND json_extract(p.definition,'$.deletedAt') IS NULL`,product);
  const file=row?JSON.parse(row.originals).package:null;
  if(!file){results.push({product,status:'excluded',reason:'현재 적용 버전의 업로드 ZIP이 없습니다.'});continue;}
  if(total+file.size>16*1024*1024){results.push({product,status:'excluded',reason:'묶음 용량 16 MiB 한도에 도달했습니다.'});continue;}
  let bytes;
  try{bytes=await checkedProductBytes(await env.BUCKET.get(file.key),file);}
  catch{results.push({product,version:row.id,status:'failed',reason:'업로드 ZIP을 읽거나 무결성을 확인할 수 없습니다.'});continue;}
  const name=product+'-'+row.id+'.zip';
  total+=file.size;
  await auditAssetDownload(env,actor,product,row.id,'bulk_original',file.sha256);
  entries.set(name,bytes);
  results.push({product,version:row.id,name,sha256:file.sha256,status:'included'});
 }
 entries.set('download-report.json',zipJson({schemaVersion:1,results}));
 return downloadZip(entries,'aifect-product-originals.zip');
}
