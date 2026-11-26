// Final delivery encoding only. Recording, drafts and offline mixing remain PCM.
export const COVER_MP3_RATE=32000;
export const COVER_MP3_KBPS=256;

export class CoverMp3Encoder{
 constructor(Encoder,frames,rate=COVER_MP3_RATE){
  if(rate!==COVER_MP3_RATE||!Number.isSafeInteger(frames)||frames<1||frames>rate*600)throw new Error('커버 녹음 길이를 확인해 주세요.');
  this.encoder=new Encoder(2,rate,COVER_MP3_KBPS);this.frames=frames;this.received=0;this.chunks=[];this.bytes=0;
 }
 push(channels){
  if(!Array.isArray(channels)||channels.length!==2||channels.some(c=>!(c instanceof Float32Array))||channels[0].length!==channels[1].length||!channels[0].length||channels[0].length>65536||this.received+channels[0].length>this.frames)throw new Error('녹음 데이터를 확인하지 못했습니다.');
  const left=new Int16Array(1152),right=new Int16Array(1152);
  for(let start=0;start<channels[0].length;start+=1152){
   const n=Math.min(1152,channels[0].length-start);
   for(let i=0;i<n;i++)for(let c=0;c<2;c++){
    const v=channels[c][start+i],sample=Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;
    (c===0?left:right)[i]=Math.round(sample<0?sample*32768:sample*32767);
   }
   this.add(this.encoder.encodeBuffer(left.subarray(0,n),right.subarray(0,n)));
  }
  this.received+=channels[0].length;
 }
 add(bytes){if(bytes.length){const copy=Uint8Array.from(bytes);this.chunks.push(copy);this.bytes+=copy.length;}}
 finish(){
  if(this.received!==this.frames)throw new Error('녹음 변환이 아직 끝나지 않았습니다.');
  this.add(this.encoder.flush());
  const data=new Uint8Array(this.bytes);let offset=0;for(const chunk of this.chunks){data.set(chunk,offset);offset+=chunk.length;}
  this.chunks=[];return gaplessMp3(data,this.frames);
 }
}

// LAMEJS emits raw frames without a Xing/LAME tag. Describe encoder delay and
// padding so Web Audio/FFmpeg do not move the vocal/backing timeline in duets.
export function gaplessMp3(data,inputFrames){
 let offset=0,frames=0;
 while(offset<data.length){
  if(data[offset]!==255||(data[offset+1]&254)!==250)throw new Error('MP3 변환 결과를 확인하지 못했습니다.');
  const bitrates=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],rate=[44100,48000,32000][data[offset+2]>>2&3],kbps=bitrates[data[offset+2]>>4];
  if(rate!==COVER_MP3_RATE||kbps!==COVER_MP3_KBPS||data[offset+3]>>6===3)throw new Error('MP3 음질 설정이 올바르지 않습니다.');
  offset+=Math.floor(144*kbps*1000/rate)+(data[offset+2]>>1&1);frames++;
 }
 const delay=576,padding=frames*1152-inputFrames-delay;
 if(offset!==data.length||padding<0||padding>4095)throw new Error('MP3 녹음 시간을 확인하지 못했습니다.');
 const tag=new Uint8Array(1152),view=new DataView(tag.buffer),text=(at,value)=>tag.set(new TextEncoder().encode(value),at);
 tag.set(data.subarray(0,4));tag[2]&=253; // one unpadded 256 kbps/32 kHz stereo frame
 text(36,'Info');view.setUint32(40,3);view.setUint32(44,frames);view.setUint32(48,data.length+tag.length);
 text(52,'LAME3.98r');tag[61]=1;tag[72]=COVER_MP3_KBPS;
 const packed=delay<<12|padding;tag[73]=packed>>>16;tag[74]=packed>>>8;tag[75]=packed;
 const out=new Uint8Array(tag.length+data.length);out.set(tag);out.set(data,tag.length);return out;
}
