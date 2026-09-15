import {fail,id} from './db.js';

const MAX_IMAGE=5*1024*1024;
// Read a bounded body before storing it; a forged Content-Length cannot bypass the limit.
export async function readImage(req){
 const type=req.headers.get('content-type')?.split(';')[0];
 if(!['image/jpeg','image/png','image/webp'].includes(type))fail(400,'JPG·PNG·WebP 이미지를 선택해주세요.');
 if(Number(req.headers.get('content-length'))>MAX_IMAGE)fail(413,'이미지는 5MB 이하로 업로드해주세요.');
 if(!req.body)fail(400,'이미지 파일을 선택해주세요.');
 const reader=req.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE){await reader.cancel();fail(413,'이미지는 5MB 이하로 업로드해주세요.');}chunks.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
 const starts=(bytes,pos=0)=>bytes.every((b,i)=>data[pos+i]===b);
 const valid=type==='image/jpeg'?size>4&&starts([255,216,255])&&starts([255,217],size-2):type==='image/png'?size>=45&&starts([137,80,78,71,13,10,26,10])&&starts([73,72,68,82],12)&&starts([73,69,78,68],size-8):size>=20&&starts([82,73,70,70])&&starts([87,69,66,80],8)&&new DataView(data.buffer).getUint32(4,true)===size-8;
 if(!valid)fail(400,'이미지 파일 형식이 올바르지 않습니다. JPG·PNG·WebP 파일을 다시 선택해주세요.');
 return {data,type};
}
export async function storeImage(req,env,kind,entityId){
 const {data,type}=await readImage(req),version=id(),key=`images/${kind}/${entityId}/${version}`;
 await env.BUCKET.put(key,data,{httpMetadata:{contentType:type}});
 return {version,type};
}
