import {originRequest,release} from './cafe24-origin.js';
import {fail,id} from './db.js';

const MAX_IMAGE=5*1024*1024;
// Read a bounded body before storing it; a forged Content-Length cannot bypass the limit.
export async function readImage(req){
 const type=req.headers.get('content-type')?.split(';')[0];
 if(!['image/jpeg','image/png','image/webp'].includes(type))fail(400,'JPG·PNG·WebP 이미지를 선택해 주세요.');
 if(Number(req.headers.get('content-length'))>MAX_IMAGE)fail(413,'이미지는 5MB 이하로 업로드해 주세요.');
 if(!req.body)fail(400,'이미지 파일을 선택해 주세요.');
 const reader=req.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE){await reader.cancel();fail(413,'이미지는 5MB 이하로 업로드해 주세요.');}chunks.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
 const starts=(bytes,pos=0)=>bytes.every((b,i)=>data[pos+i]===b);
 const valid=type==='image/jpeg'?size>4&&starts([255,216,255])&&starts([255,217],size-2):type==='image/png'?size>=45&&starts([137,80,78,71,13,10,26,10])&&starts([73,72,68,82],12)&&starts([73,69,78,68],size-8):size>=20&&starts([82,73,70,70])&&starts([87,69,66,80],8)&&new DataView(data.buffer).getUint32(4,true)===size-8;
 if(!valid)fail(400,'이미지 파일 형식이 올바르지 않습니다. JPG·PNG·WebP 파일을 다시 선택해 주세요.');
 return {data,type};
}
// APNG declares its animation before the first IDAT. Walk PNG chunks, never pixel data.
function animatedPNG(data){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 for(let offset=8;offset+12<=data.length;){
  const size=view.getUint32(offset),tag=view.getUint32(offset+4);
  if(size>data.length-offset-12||tag===0x49444154)return false;
  if(tag===0x6163544c)return true;
  offset+=size+12;
 }
 return false;
}
export async function encodeStaticImage(env,image){
 if(image.type==='image/webp'||(image.type==='image/png'&&animatedPNG(image.data)))return image;
 const response=await originRequest(env,'webp',image.data,image.type,7000).catch(()=>null);
 if(!response?.ok||response.headers.get('content-type')!=='image/webp')fail(503,'이미지 변환을 완료하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
 return readImage(response);
}
export async function storeImage(req,env,kind,entityId,validate){
 let {data,type}=await readImage(req);const version=id(),key=`images/${kind}/${entityId}/${version}`;
 if(validate)validate(data,type);
 // A published build must never silently save a static PNG/JPEG if the encoder is unavailable.
 if(env.CAFE24_ORIGIN_KEY||release){
  ({data,type}=await encodeStaticImage(env,{data,type}));
 }
 await env.BUCKET.put(key,data,{httpMetadata:{contentType:type}});
 return {version,type};
}
