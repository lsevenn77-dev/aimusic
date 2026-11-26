import {crc32} from './product-zip.js';

const encoder=new TextEncoder();
export const zipJson=value=>encoder.encode(JSON.stringify(value,null,2)+'\n');

// Stored ZIPs keep optimized files and included product ZIPs byte-for-byte intact.
export function zipParts(entries){
 const data=[],directory=[];
 let offset=0,directorySize=0;
 for(const [name,file] of entries){
  const label=encoder.encode(name),crc=crc32(file);
  const header=new Uint8Array(30+label.length),h=new DataView(header.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);
  h.setUint32(14,crc,true);h.setUint32(18,file.length,true);h.setUint32(22,file.length,true);h.setUint16(26,label.length,true);
  header.set(label,30);
  const record=new Uint8Array(46+label.length),r=new DataView(record.buffer);
  r.setUint32(0,0x02014b50,true);r.setUint16(4,20,true);r.setUint16(6,20,true);r.setUint16(8,0x800,true);r.setUint16(14,33,true);
  r.setUint32(16,crc,true);r.setUint32(20,file.length,true);r.setUint32(24,file.length,true);r.setUint16(28,label.length,true);
  r.setUint32(42,offset,true);record.set(label,46);
  data.push(header,file);directory.push(record);
  offset+=header.length+file.length;directorySize+=record.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,directory.length,true);e.setUint16(10,directory.length,true);
 e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
 return [...data,...directory,end];
}

export function zipStream(entries){
 const parts=zipParts(entries);
 let index=0;
 return new ReadableStream({pull(controller){
  if(index===parts.length)controller.close();
  else controller.enqueue(parts[index++]);
 }});
}
