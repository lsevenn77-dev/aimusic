import {readImage} from './images.js';
import {fail,id} from './db.js';

// Bound encoded size with the existing reader, then reject unreasonable decoded dimensions.
export function artistImageDimensions(data,type){
 const v=new DataView(data.buffer,data.byteOffset,data.byteLength),ascii=(a,n)=>String.fromCharCode(...data.slice(a,a+n));
 if(type==='image/png'&&data.length>=24)return [v.getUint32(16),v.getUint32(20)];
 if(type==='image/webp'){
  const chunk=ascii(12,4);
  if(chunk==='VP8X'&&data.length>=30)return [1+data[24]+data[25]*256+data[26]*65536,1+data[27]+data[28]*256+data[29]*65536];
  if(chunk==='VP8L'&&data.length>=25&&data[20]===47){const bits=v.getUint32(21,true);return [(bits&16383)+1,((bits>>>14)&16383)+1];}
  if(chunk==='VP8 '&&data.length>=30&&data[23]===157&&data[24]===1&&data[25]===42)return [v.getUint16(26,true)&16383,v.getUint16(28,true)&16383];
 }
 if(type==='image/jpeg'){
  let i=2;while(i+4<data.length){if(data[i++]!==255)break;while(data[i]===255)i++;const marker=data[i++];if(marker===217||marker===218)break;if(marker===216||marker===1||marker>=208&&marker<=215)continue;if(i+2>data.length)break;const len=v.getUint16(i);if(len<2||i+len>data.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=7)return [v.getUint16(i+5),v.getUint16(i+3)];i+=len;}
 }
 fail(400,'이미지 크기를 확인할 수 없습니다. 다른 사진을 선택해주세요.');
}
export async function storeArtistImage(req,env,kind,entityId){
 const {data,type}=await readImage(req),[width,height]=artistImageDimensions(data,type);
 if(width<1||height<1||width>8192||height>8192||width*height>40000000)fail(400,'이미지는 최대 8192px, 4천만 화소 이하로 선택해주세요.');
 const version=id();await env.BUCKET.put(`images/${kind}/${entityId}/${version}`,data,{httpMetadata:{contentType:type}});return {version,type};
}
