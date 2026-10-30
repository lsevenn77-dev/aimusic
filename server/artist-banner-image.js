import {fail} from './db.js';
// Inspect container dimensions before R2 storage; no image decoder or external service.
export function validateArtistBanner(data,type){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let width=0,height=0;
 const text=(offset,n)=>String.fromCharCode(...data.slice(offset,offset+n));
 if(type==='image/png'&&data.length>=24){width=view.getUint32(16);height=view.getUint32(20);}
 if(type==='image/webp'){
  for(let offset=12;offset+8<=data.length;){
   const tag=text(offset,4),size=view.getUint32(offset+4,true),p=offset+8;if(p+size>data.length)break;
   if(tag==='VP8X'&&size>=10){width=1+data[p+4]+(data[p+5]<<8)+(data[p+6]<<16);height=1+data[p+7]+(data[p+8]<<8)+(data[p+9]<<16);break;}
   if(tag==='VP8 '&&size>=10&&text(p+3,3)==='\x9d\x01\x2a'){width=view.getUint16(p+6,true)&16383;height=view.getUint16(p+8,true)&16383;break;}
   if(tag==='VP8L'&&size>=5&&data[p]===47){const bits=view.getUint32(p+1,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;break;}
   offset=p+size+(size%2);
  }
 }
 if(type==='image/jpeg'){
  for(let p=2;p+3<data.length;){
   if(data[p++]!==255)break;while(data[p]===255)p++;const marker=data[p++];if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;
   if(p+2>data.length)break;const length=view.getUint16(p);if(length<2||p+length>data.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=view.getUint16(p+3);width=view.getUint16(p+5);break;}p+=length;
  }
 }
 if(Math.min(width,height)<320||Math.max(width,height)>8000)fail(400,'배경 사진의 가로·세로는 320~8000px이어야 합니다.');
}
