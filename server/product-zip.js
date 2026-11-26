import {fail} from './db.js';

export const PRODUCT_ARCHIVE_MAX=8*1024*1024;
export const PRODUCT_IMAGE_MAX=5*1024*1024;
const TOTAL_MAX=24*1024*1024;
const FILE_MAX=48;
const endRecord=0x06054b50,centralRecord=0x02014b50,localRecord=0x04034b50,descriptorRecord=0x08074b50;
const decoder=new TextDecoder('utf-8',{fatal:true});
const safeName=/^(?:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\/?$/;
const blockedName=/(?:^|\/)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[./]|$)/i;
const reject=()=>fail(400,'지원하지 않거나 손상된 상품 ZIP입니다. 패키지 경로, 크기와 파일 구성을 확인해 주세요.');
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){
 let n=i;
 for(let bit=0;bit<8;bit++)n=(n&1)?(n>>>1)^0xedb88320:n>>>1;
 crcTable[i]=n;
}
function crc32(bytes){
 let sum=0xffffffff;
 for(const byte of bytes)sum=(sum>>>8)^crcTable[(sum^byte)&255];
 return (sum^0xffffffff)>>>0;
}

async function inflate(data,size){
 const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 const reader=stream.getReader(),output=new Uint8Array(size);
 let offset=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   if(offset+value.length>size){await reader.cancel();reject();}
   output.set(value,offset);offset+=value.length;
  }
 }catch{reject();}
 finally{reader.releaseLock();}
 if(offset!==size)reject();
 return output;
}

export async function productZip(data){
 if(data.length<22||data.length>PRODUCT_ARCHIVE_MAX)reject();
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 const u16=offset=>view.getUint16(offset,true),u32=offset=>view.getUint32(offset,true);
 let end=data.length-22;
 for(;end>=Math.max(0,data.length-65557);end--){
  if(u32(end)===endRecord&&end+22+u16(end+20)===data.length)break;
 }
 if(end<Math.max(0,data.length-65557)||u16(end+4)||u16(end+6))reject();
 const count=u16(end+10),central=u32(end+16);
 if(!count||count>FILE_MAX||count!==u16(end+8)||central+u32(end+12)!==end)reject();
 const names=new Set(),entries=[];
 let next=central,total=0;
 for(let i=0;i<count;i++){
  if(next+46>end||u32(next)!==centralRecord)reject();
  const flags=u16(next+8),method=u16(next+10),crc=u32(next+16),packed=u32(next+20),size=u32(next+24);
  const nameLength=u16(next+28),mode=u32(next+38)>>>16,start=u32(next+42);
  const boundary=next+46+nameLength+u16(next+30)+u16(next+32);
  if(boundary>end||!nameLength||nameLength>160||u16(next+34)||(flags&~0x080e)||![0,8].includes(method)||size>PRODUCT_IMAGE_MAX||u16(next+6)>20)reject();
  let name;
  try{name=decoder.decode(data.subarray(next+46,next+46+nameLength));}catch{reject();}
  const directory=name.endsWith('/'),kind=mode&0xf000,key=name.toLowerCase().replace(/\/$/,'');
  if(!safeName.test(name)||blockedName.test(name)||names.has(key)||kind&&kind!==(directory?0x4000:0x8000)||
     (directory&&!['assets/','assets/effects/'].includes(name))||(directory&&(size||packed))||
     (!directory&&(!size||!packed||size>Math.max(packed*300,64*1024)))||(total+=size)>TOTAL_MAX)reject();
  names.add(key);
  if(start+30>central||u32(start)!==localRecord||flags!==u16(start+6)||method!==u16(start+8)||nameLength!==u16(start+26))reject();
  const from=start+30+nameLength+u16(start+28),until=from+packed;
  if(until>central||!data.subarray(next+46,next+46+nameLength).every((byte,j)=>byte===data[start+30+j]))reject();
  let localEnd=until;
  if(flags&8){
   if(localEnd+12>central)reject();
   if(u32(localEnd)===descriptorRecord)localEnd+=4;
   if(localEnd+12>central||u32(localEnd)!==crc||u32(localEnd+4)!==packed||u32(localEnd+8)!==size)reject();
   localEnd+=12;
  }else if(crc!==u32(start+14)||packed!==u32(start+18)||size!==u32(start+22))reject();
  if(method===0&&packed!==size)reject();
  entries.push({name,start,from,until,localEnd,size,crc,directory,method});
  next=boundary;
 }
 if(next!==end)reject();
 let offset=0;
 for(const entry of [...entries].sort((a,b)=>a.start-b.start)){
  if(entry.start!==offset)reject();
  offset=entry.localEnd;
 }
 if(offset!==central)reject();
 const files=new Map();
 for(const entry of entries){
  if(entry.directory)continue;
  const packed=data.subarray(entry.from,entry.until);
  const bytes=entry.method===0?packed:await inflate(packed,entry.size);
  if(crc32(bytes)!==entry.crc)reject();
  files.set(entry.name,bytes);
 }
 return files;
}
